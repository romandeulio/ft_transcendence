import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAuth } from '../hooks/useAuth'

const QueueContext = createContext(null)

function loadMySlots() {
  try {
    const u = JSON.parse(localStorage.getItem('user'))
    const slots = JSON.parse(localStorage.getItem('myQueueSlots')) || []
    return slots
      .filter(s => !s.p1 || s.p1 === u?.username)
      .map(s => s._localId ? s : { ...s, _localId: crypto.randomUUID() })
  } catch { return [] }
}

export function QueueProvider({ children }) {
  const { user } = useAuth()
  const [queue, setQueue] = useState([])
  const [mySlots, setMySlots] = useState(loadMySlots)
  const [activeGame, setActiveGame] = useState(null)
  const [completedGameIds, setCompletedGameIds] = useState(() => new Set())
  const [lastGameEndedId, setLastGameEndedId] = useState(null)
  const prevConnected = useRef(false)

  const wsUrl = user?.username
    ? `/ws/queue/?username=${encodeURIComponent(user.username)}`
    : null
  const { data, connected, send } = useWebSocket(wsUrl)

  useEffect(() => {
    if (!data) return
    if (data.type === 'queue_state' && data.queue) {
      setQueue(data.queue)
    } else if (data.type === 'game_state' && data.game) {
      const g = data.game
      if (g.player1 === user?.username || g.player2 === user?.username) {
        setActiveGame(prev => ({ ...prev, ...g }))
      }
    } else if (data.type === 'game_ended' && data.gameId) {
      setActiveGame(prev => prev?.gameId === data.gameId ? null : prev)
      setLastGameEndedId(data.gameId)
      setMySlots(prev => {
        const next = prev.filter(s => s._localId !== data.gameId)
        if (next.length !== prev.length)
          localStorage.setItem('myQueueSlots', JSON.stringify(next))
        return next
      })
    }
  }, [data, user?.username])

  // Re-join our slots after a reconnect (skip already-completed slots)
  useEffect(() => {
    if (connected && !prevConnected.current && mySlots.length > 0) {
      mySlots
        .filter(s => !completedGameIds.has(s._localId))
        .forEach(slot => send({ action: 'join', slot }))
    }
    prevConnected.current = connected
  }, [connected, send, mySlots, completedGameIds])

  // Clear local slots on logout
  useEffect(() => {
    if (!user?.username) {
      setMySlots([])
      localStorage.removeItem('myQueueSlots')
      setQueue([])
    }
  }, [user?.username])

  const joinQueue = (slot) => {
    const localSlot = { ...slot, _localId: crypto.randomUUID() }
    send({ action: 'join', slot: localSlot })
    setMySlots(prev => {
      const next = [...prev, localSlot]
      localStorage.setItem('myQueueSlots', JSON.stringify(next))
      return next
    })
  }

  const leaveQueue = (localId) => {
    // _localId is used as the server-side slot id (see backend join handler)
    send({ action: 'leave', slotId: localId })
    setMySlots(prev => {
      const next = prev.filter(s => s._localId !== localId)
      localStorage.setItem('myQueueSlots', JSON.stringify(next))
      return next
    })
  }

  const updateSlot = (localId, updates) => {
    const slot = mySlots.find(s => s._localId === localId)
    if (slot) send({ action: 'update', slotId: slot.id, updates })
    setMySlots(prev => {
      const next = prev.map(s => s._localId === localId ? { ...s, ...updates } : s)
      localStorage.setItem('myQueueSlots', JSON.stringify(next))
      return next
    })
  }

  const openGame = (slot) => {
    const gameId = slot._localId || slot.id || crypto.randomUUID()
    const p1 = slot.player1 || slot.p1
    const p2 = slot.player2 || slot.p2
    if (!activeGame || activeGame.gameId !== gameId) {
      send({ action: 'game_open', gameId, player1: p1, player2: p2 })
    }
  }

  const updateScore = (gameId, scoreRed, scoreBlue) => {
    send({ action: 'score_update', gameId, scoreRed, scoreBlue })
  }

  const closeGame = (gameId) => {
    if (gameId) {
      send({ action: 'game_end', gameId })
      // Mark as completed so UI filters it even if the WS broadcast is delayed
      setCompletedGameIds(prev => new Set([...prev, gameId]))
    }
    setActiveGame(null)
  }

  // Envoie uniquement le signal WS game_end sans modifier l'état local.
  // Utilisé pour prévenir l'autre joueur immédiatement, avant les appels API.
  const signalGameEnd = (gameId) => {
    if (gameId) send({ action: 'game_end', gameId })
  }

  return (
    <QueueContext.Provider value={{
      queue,
      setQueue,
      mySlots,
      activeGame,
      completedGameIds,
      lastGameEndedId,
      joinQueue,
      leaveQueue,
      updateSlot,
      openGame,
      updateScore,
      closeGame,
      signalGameEnd,
      connected,
    }}>
      {children}
    </QueueContext.Provider>
  )
}

export const useQueue = () => {
  const context = useContext(QueueContext)
  if (!context) {
    throw new Error('useQueue must be used within QueueProvider')
  }
  return context
}
