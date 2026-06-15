import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAuth } from '../hooks/useAuth'
import { authFetch } from '../services/api'

const BetsContext = createContext(null)

function formatLabel(matchType, isRanked) {
  const fmt = matchType === 'TEAM' ? '2v2' : matchType === 'TWO_V_ONE' ? '2v1' : '1v1'
  return `${fmt} · ${isRanked ? 'classé' : 'libre'}`
}

// Marché serveur → forme attendue par Paris.jsx
function mapMarketToBet(m) {
  return {
    id:          m.reservation_id,
    reservationId: m.reservation_id,
    match:       m.match,
    context:     formatLabel(m.match_type, m.is_ranked),
    status:      'open',            // pas 'live' → Paris.jsx autorise la mise
    p1:          m.p1,
    p2:          m.p2,
    oddsP1:      m.odds_p1,
    oddsP2:      m.odds_p2,
    probP1:      m.prob_p1 ?? 50,
    pctBets:     m.pct_bets_p1 ?? 50,
    bettable:    m.bettable !== false,
    myBet: m.my_bet
      ? {
          betId:  m.my_bet.id,
          side:   m.my_bet.side,
          player: m.my_bet.side === 'p1' ? m.p1 : m.p2,
          amount: m.my_bet.amount,
          odds:   m.my_bet.odds,
        }
      : null,
  }
}

function mapHistory(b) {
  const result = b.result === 'won' ? 'gagné'
    : b.result === 'lost' ? 'perdu'
    : b.result === 'refunded' ? 'remboursé'
    : 'en cours'
  const d = b.created_at ? new Date(b.created_at) : null
  const date = d
    ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    : ''
  return { id: b.id, match: b.match, betOn: b.bet_on, date, delta: b.delta ?? 0, result }
}

export function BetsProvider({ children }) {
  const { user, updateUser, refreshUser } = useAuth()
  const [markets, setMarkets] = useState({})   // reservation_id -> payload marché
  const [history, setHistory] = useState([])

  const wsUrl = user?.username
    ? `/ws/bets/?username=${encodeURIComponent(user.username)}`
    : null
  const { data } = useWebSocket(wsUrl)

  const loadAvailable = useCallback(async () => {
    try {
      const res = await authFetch('/api/bets/available/')
      if (!res.ok) return
      const list = await res.json()
      const map = {}
      list.forEach(m => { map[m.reservation_id] = m })
      setMarkets(map)
    } catch { /* le WS reste le fallback temps réel */ }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const res = await authFetch('/api/bets/mine/')
      if (!res.ok) return
      const list = await res.json()
      setHistory(list.filter(b => b.result).map(mapHistory))
    } catch { /* ignore */ }
  }, [])

  // Chargement initial / reset à la connexion-déconnexion
  useEffect(() => {
    if (!user?.username) { setMarkets({}); setHistory([]); return }
    loadAvailable()
    loadHistory()
    refreshUser?.()   // resynchronise le solde de jetons
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username, loadAvailable, loadHistory])

  // Événements WebSocket
  useEffect(() => {
    if (!data) return
    if (data.type === 'bets_state' && Array.isArray(data.markets)) {
      const map = {}
      data.markets.forEach(m => { map[m.reservation_id] = m })
      setMarkets(map)
    } else if (data.type === 'market_update' && data.market) {
      setMarkets(prev => ({
        ...prev,
        [data.market.reservation_id]: { ...prev[data.market.reservation_id], ...data.market },
      }))
    } else if (data.type === 'market_closed' && data.reservation_id) {
      setMarkets(prev => {
        const next = { ...prev }
        delete next[data.reservation_id]
        return next
      })
      // Une partie s'est résolue → historique + solde à resynchroniser.
      loadHistory()
      refreshUser?.()
    }
  }, [data, loadHistory, refreshUser])

  const bets = Object.values(markets).map(mapMarketToBet)

  // Pose un pari. `side` = 'p1' | 'p2'. Lève en cas d'erreur (solde, fenêtre fermée…).
  const placeBet = async (reservationId, side, amount) => {
    const res = await authFetch('/api/bets/', {
      method: 'POST',
      body: JSON.stringify({ reservation: reservationId, side, amount }),
    })
    if (!res.ok) {
      let detail = 'Pari refusé.'
      try { detail = (await res.json()).detail || detail } catch { /* ignore */ }
      throw new Error(detail)
    }
    updateUser?.({ wallet_tokens: Math.max(0, (user?.wallet_tokens ?? 0) - amount) })
    await loadAvailable()
    await loadHistory()
  }

  // Annule mon pari ouvert sur cette partie (remboursement).
  const cancelBet = async (reservationId) => {
    const m = markets[reservationId]
    const betId = m?.my_bet?.id
    if (!betId) return
    const amount = m.my_bet.amount
    const res = await authFetch(`/api/bets/${betId}/`, { method: 'DELETE' })
    if (!res.ok) return
    updateUser?.({ wallet_tokens: (user?.wallet_tokens ?? 0) + amount })
    await loadAvailable()
  }

  // Conservé pour compat (Planning.jsx) : les paris viennent désormais du serveur.
  const addBet = () => {}

  return (
    <BetsContext.Provider value={{ bets, betHistory: history, addBet, placeBet, cancelBet }}>
      {children}
    </BetsContext.Provider>
  )
}

export const useBets = () => useContext(BetsContext)
