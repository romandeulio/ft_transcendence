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

  // Invite state
  const [pendingInvites, setPendingInvites] = useState([])   // received invites (J2 side)
  const [inviteResults,  setInviteResults]  = useState([])   // accept/decline notifications (J1 side)
  const invitesSentRef = useRef([])                          // sent invites (J1 side), ref to avoid stale closures

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
        let next = prev.filter(s => s._localId !== data.gameId)
        if (data.winner) {
          next = next.map(s =>
            s.takeWin && !s.p2 ? { ...s, p2: data.winner, player2: data.winner } : s
          )
        }
        localStorage.setItem('myQueueSlots', JSON.stringify(next))
        return next
      })

    } else if (data.type === 'invite_received') {
      // J2 receives an invite from J1
      setPendingInvites(prev => {
        if (prev.find(i => i.inviteId === data.inviteId)) return prev
        return [...prev, { inviteId: data.inviteId, from: data.from, slot: data.slot }]
      })

    } else if (data.type === 'invite_response') {
      // J1 receives J2's accept/decline
      const { inviteId, accepted } = data
      const invite = invitesSentRef.current.find(i => i.inviteId === inviteId)

      if (accepted && invite) {
        // Transition slot from pending_invite → taken, then officially join the queue
        setMySlots(prev => {
          const next = prev.map(s =>
            s._localId === inviteId ? { ...s, type: 'taken' } : s
          )
          localStorage.setItem('myQueueSlots', JSON.stringify(next))
          return next
        })
        send({ action: 'join', slot: { ...invite.slot, type: 'taken' } })
      } else if (!accepted && invite) {
        // Remove pending slot
        setMySlots(prev => {
          const next = prev.filter(s => s._localId !== inviteId)
          localStorage.setItem('myQueueSlots', JSON.stringify(next))
          return next
        })
      }

      if (invite) {
        setInviteResults(prev => [...prev, { inviteId, accepted, target: invite.target }])
      }
      invitesSentRef.current = invitesSentRef.current.filter(i => i.inviteId !== inviteId)
    }
  }, [data, user?.username])

  // Re-join our slots after a reconnect (skip pending_invite and already-completed slots)
  useEffect(() => {
    if (connected && !prevConnected.current && mySlots.length > 0) {
      mySlots
        .filter(s => !completedGameIds.has(s._localId) && s.type !== 'pending_invite')
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
      setPendingInvites([])
      setInviteResults([])
      invitesSentRef.current = []
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
      setCompletedGameIds(prev => new Set([...prev, gameId]))
    }
    setActiveGame(null)
  }

  const signalGameEnd = (gameId) => {
    if (gameId) send({ action: 'game_end', gameId })
  }

  // ── Invite API ──────────────────────────────────────────────────────────────

  const sendInvite = (target, slot) => {
    const inviteId = slot._localId || crypto.randomUUID()
    const localSlot = { ...slot, _localId: inviteId, type: 'pending_invite' }
    invitesSentRef.current = [...invitesSentRef.current, { inviteId, target, slot: localSlot }]
    send({ action: 'invite', target, inviteId, slot: localSlot })
    // Add slot locally as pending so J1 can see it in their "upcoming"
    setMySlots(prev => {
      const next = [...prev, localSlot]
      localStorage.setItem('myQueueSlots', JSON.stringify(next))
      return next
    })
  }

  const respondToInvite = (inviteId, accepted, slot, fromUser) => {
    send({ action: 'invite_response', inviteId, accepted, from: fromUser })
    // J2 does NOT add to mySlots — invitedUpcoming in Accueil already shows the slot
    // once J1's joinQueue fires and the slot appears in the global queue with p2=J2.
    setPendingInvites(prev => prev.filter(i => i.inviteId !== inviteId))
  }

  const dismissInviteResult = (inviteId) => {
    setInviteResults(prev => prev.filter(i => i.inviteId !== inviteId))
  }

  return (
    <QueueContext.Provider value={{
      queue,
      setQueue,
      mySlots,
      activeGame,
      completedGameIds,
      lastGameEndedId,
      pendingInvites,
      inviteResults,
      joinQueue,
      leaveQueue,
      updateSlot,
      openGame,
      updateScore,
      closeGame,
      signalGameEnd,
      sendInvite,
      respondToInvite,
      dismissInviteResult,
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
