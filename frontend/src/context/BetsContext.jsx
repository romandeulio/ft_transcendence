import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAuth } from '../hooks/useAuth'
import { authFetch } from '../services/api'
import i18n from '../i18n'

const BetsContext = createContext(null)

function formatLabel(matchType, isRanked) {
  const fmt = matchType === 'TEAM' ? '2v2' : matchType === 'TWO_V_ONE' ? '2v1' : '1v1'
  return `${fmt} · ${isRanked ? i18n.t('bets.ranked') : i18n.t('bets.free')}`
}

function mapMarketToBet(m) {
  return {
    id:          m.reservation_id,
    reservationId: m.reservation_id,
    match:       m.match,
    context:     formatLabel(m.match_type, m.is_ranked),
    status:      'open',
    p1:          m.p1,
    p2:          m.p2,
    oddsP1:      m.odds_p1,
    oddsP2:      m.odds_p2,
    probP1:      m.prob_p1 ?? 50,
    pctBets:     m.pct_bets_p1 ?? 50,
    bettable:    m.bettable !== false,
    launched:    m.launched === true,
    bettingOpen: m.open !== false,
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
  // `result` is a stable KEY (won/lost/refunded/pending) -- translated at display time.
  const result = ['won', 'lost', 'refunded'].includes(b.result) ? b.result : 'pending'
  const d = b.created_at ? new Date(b.created_at) : null
  const date = d
    ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    : ''
  return { id: b.id, match: b.match, betOn: b.bet_on, score: b.score ?? null, date, delta: b.delta ?? 0, result }
}

export function BetsProvider({ children }) {
  const { user, updateUser, refreshUser } = useAuth()
  const [markets, setMarkets] = useState({})
  const [history, setHistory] = useState([])

  const wsUrl = user?.username
    ? `/ws/bets/?username=${encodeURIComponent(user.username)}`
    : null
  const handleMessageRef = useRef(null)
  useWebSocket(wsUrl, (msg) => handleMessageRef.current?.(msg))

  const loadAvailable = useCallback(async () => {
    try {
      const res = await authFetch('/api/bets/available/')
      if (!res.ok) return
      const list = await res.json()
      const map = {}
      list.forEach(m => { map[m.reservation_id] = m })
      setMarkets(map)
    } catch {}
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const res = await authFetch('/api/bets/mine/')
      if (!res.ok) return
      const list = await res.json()
      setHistory(list.filter(b => b.result).map(mapHistory))
    } catch {}
  }, [])

  useEffect(() => {
    if (!user?.username) { setMarkets({}); setHistory([]); return }
    loadAvailable()
    loadHistory()
    refreshUser?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username, loadAvailable, loadHistory])

  // Reassigned on every render -> useWebSocket calls it for EVERY message
  // received, synchronously (no loss from batching a single `data` slot).
  handleMessageRef.current = (data) => {
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
      loadHistory()
      refreshUser?.()
    }
  }

  const bets = Object.values(markets).map(m => {
    const bet = mapMarketToBet(m)
    // Guard: if the logged-in user is one of the players, the game is never
    // bettable -- even if the market comes from an unauthenticated WS snapshot
    // where `bettable` is missing (otherwise the "Bet" button reappears and the
    // POST fails with 400 "bet on your own game").
    if (user?.username) {
      const players = `${bet.p1} & ${bet.p2}`.split(' & ').map(s => s.trim())
      if (players.includes(user.username)) bet.bettable = false
    }
    return bet
  })

  const placeBet = async (reservationId, side, amount) => {
    const res = await authFetch('/api/bets/', {
      method: 'POST',
      body: JSON.stringify({ reservation: reservationId, side, amount }),
    })
    if (!res.ok) {
      let detail = i18n.t('bets.betRejected')
      try { detail = (await res.json()).detail || detail } catch {}
      throw new Error(detail)
    }
    updateUser?.({ wallet_tokens: Math.max(0, (user?.wallet_tokens ?? 0) - amount) })
    await loadAvailable()
    await loadHistory()
    refreshUser?.()
  }

  const cancelBet = async (reservationId) => {
    const m = markets[reservationId]
    const betId = m?.my_bet?.id
    if (!betId) return
    const amount = m.my_bet.amount
    const res = await authFetch(`/api/bets/${betId}/`, { method: 'DELETE' })
    if (!res.ok) return
    updateUser?.({ wallet_tokens: (user?.wallet_tokens ?? 0) + amount })
    await loadAvailable()
    refreshUser?.()
  }

  const addBet = () => {}

  return (
    <BetsContext.Provider value={{ bets, betHistory: history, addBet, placeBet, cancelBet }}>
      {children}
    </BetsContext.Provider>
  )
}

export const useBets = () => useContext(BetsContext)
