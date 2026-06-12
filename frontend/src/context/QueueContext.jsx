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
      const u = user?.username
      if (u && (g.player1 === u || g.player2 === u ||
                g.player1_teammate === u || g.player2_teammate === u)) {
        setActiveGame(prev => ({ ...prev, ...g }))
      }
    } else if (data.type === 'game_ended' && data.gameId) {
      setActiveGame(prev => prev?.gameId === data.gameId ? null : prev)
      setLastGameEndedId(data.gameId)
      setMySlots(prev => {
        let next = prev.filter(s => s._localId !== data.gameId)
        if (data.winner) {
          next = next.map(s =>
            s.takeWin && !s.p2 ? {
              ...s,
              p2: data.winner,
              player2: data.winner,
              ...(data.winner_teammate ? { player2_teammate: data.winner_teammate } : {}),
            } : s
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

    } else if (data.type === 'invite_cancelled') {
      // J1 annulé → J2 retire l'invite de sa liste
      setPendingInvites(prev => prev.filter(i => i.inviteId !== data.inviteId))

    } else if (data.type === 'p2_left') {
      // J2 a annulé le match accepté → J1 retire le slot de mySlots
      setMySlots(prev => {
        const next = prev.filter(s => s._localId !== data.slotId && s.id !== data.slotId)
        localStorage.setItem('myQueueSlots', JSON.stringify(next))
        return next
      })

    } else if (data.type === 'match_cancelled') {
      setInviteResults(prev => [...prev, {
        inviteId: `cancel-${Date.now()}-${Math.random()}`,
        accepted: false,
        target: data.cancelledBy,
        cancelled: true,
      }])

    } else if (data.type === 'invite_response') {
      // J1 receives a response from one of the invited players
      const { inviteId, accepted, responder } = data
      const invite = invitesSentRef.current.find(i => i.inviteId === inviteId)
      if (!invite) return

      const cancelAll = () => {
        invite.targets.forEach(t => send({ action: 'cancel_invite', inviteId, target: t }))
        setMySlots(prev => {
          const next = prev.filter(s => s._localId !== inviteId)
          localStorage.setItem('myQueueSlots', JSON.stringify(next))
          return next
        })
        invitesSentRef.current = invitesSentRef.current.filter(i => i.inviteId !== inviteId)
      }

      if (!accepted) {
        // Any decline → cancel everything for everyone
        cancelAll()
        setInviteResults(prev => [...prev, { inviteId, accepted: false, target: responder }])
        return
      }

      // Track this acceptance
      const alreadyAccepted = invite.accepted || []
      if (alreadyAccepted.includes(responder)) return  // duplicate, ignore
      const nowAccepted = [...alreadyAccepted, responder]
      invitesSentRef.current = invitesSentRef.current.map(i =>
        i.inviteId === inviteId ? { ...i, accepted: nowAccepted } : i
      )

      if (nowAccepted.length >= invite.targets.length) {
        // All accepted → enter queue
        setMySlots(prev => {
          const next = prev.map(s =>
            s._localId === inviteId ? { ...s, type: 'taken' } : s
          )
          localStorage.setItem('myQueueSlots', JSON.stringify(next))
          return next
        })
        send({ action: 'join', slot: { ...invite.slot, type: 'taken' } })
        setInviteResults(prev => [...prev, { inviteId, accepted: true, target: nowAccepted.join(', ') }])
        invitesSentRef.current = invitesSentRef.current.filter(i => i.inviteId !== inviteId)
      } else {
        // Partial — show intermediate notification (e.g. "2/3 accepté")
        setInviteResults(prev => [...prev, {
          inviteId, accepted: true, target: responder,
          partial: true, count: nowAccepted.length, total: invite.targets.length,
        }])
      }
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
      send({
        action: 'game_open',
        gameId,
        player1: p1,
        player2: p2,
        player1_teammate: slot.player1_teammate || null,
        player2_teammate: slot.player2_teammate || null,
        match_type: slot.match_type || 'SOLO',
      })
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

  const sendInvite = (targets, slot) => {
    const targetList = Array.isArray(targets) ? targets : [targets]
    const inviteId   = slot._localId || crypto.randomUUID()
    const localSlot  = { ...slot, _localId: inviteId, type: 'pending_invite', _targets: targetList }
    invitesSentRef.current = [...invitesSentRef.current, { inviteId, targets: targetList, slot: localSlot }]
    targetList.forEach(t => send({ action: 'invite', target: t, inviteId, slot: localSlot }))
    setMySlots(prev => {
      const next = [...prev, localSlot]
      localStorage.setItem('myQueueSlots', JSON.stringify(next))
      return next
    })
  }

  const cancelInvite = (inviteId) => {
    // Lookup targets from ref (current session) or from slot (after refresh via _targets)
    const invite = invitesSentRef.current.find(i => i.inviteId === inviteId)
    const targets = invite?.targets || []
    targets.forEach(t => send({ action: 'cancel_invite', inviteId, target: t }))
    invitesSentRef.current = invitesSentRef.current.filter(i => i.inviteId !== inviteId)
    setMySlots(prev => {
      const next = prev.filter(s => s._localId !== inviteId)
      localStorage.setItem('myQueueSlots', JSON.stringify(next))
      return next
    })
  }

  const cancelAsP2 = (slotId) => {
    send({ action: 'leave_as_p2', slotId })
    // La queue_state broadcast côté serveur mettra à jour invitedUpcoming automatiquement
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
      cancelInvite,
      cancelAsP2,
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
