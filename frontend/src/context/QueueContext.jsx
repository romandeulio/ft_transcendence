import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAuth } from '../hooks/useAuth'
import { authFetch } from '../services/api'

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

function mapPersistedQueueEntry(entry) {
  const team1 = [entry.player1, entry.player1_teammate].filter(Boolean)
  const team2 = [entry.player2, entry.player2_teammate].filter(Boolean)
  const isTeam = entry.match_type === 'TEAM'

  return {
    id: entry.id,
    _localId: entry.id,
    p1: entry.player1,
    p2: entry.player2,
    player1: entry.player1,
    player1_teammate: entry.player1_teammate,
    player2: entry.player2,
    player2_teammate: entry.player2_teammate,
    match_type: entry.match_type,
    is_ranked: entry.is_ranked,
    format: isTeam ? '2v2' : entry.match_type === 'TWO_V_ONE' ? '2v1' : '1v1',
    team1: isTeam ? team1 : undefined,
    team2: isTeam ? team2 : undefined,
    type: 'taken',
    source: 'db',
    createdAt: entry.joined_at ? new Date(entry.joined_at).getTime() : Date.now(),
  }
}

function mergeQueueState(liveQueue, persistedQueue) {
  const seen = new Set(liveQueue.map(slot => String(slot.id || slot._localId)))
  const missingPersisted = persistedQueue.filter(slot => !seen.has(String(slot.id || slot._localId)))
  return [...liveQueue, ...missingPersisted].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
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
  const pendingInvitesRef = useRef([])                       // mirror of pendingInvites for non-stale reads in effects
  const acceptedInviteFromsRef = useRef({})                  // inviteId → from, for 2v2 partial-accept tracking
  const persistedQueueRef = useRef([])

  const prevConnected = useRef(false)

  // Keep ref in sync so effect handlers can read latest pendingInvites without stale closure
  useEffect(() => { pendingInvitesRef.current = pendingInvites }, [pendingInvites])

  const wsUrl = user?.username
    ? `/ws/queue/?username=${encodeURIComponent(user.username)}`
    : null
  const { data, connected, send } = useWebSocket(wsUrl)

  useEffect(() => {
    if (!data) return
    if (data.type === 'queue_state' && data.queue) {
      setQueue(mergeQueueState(data.queue, persistedQueueRef.current))
      // Sync winner into takeWin slots (handles missed game_ended on reconnect)
      setMySlots(prev => {
        let changed = false
        const next = prev.map(s => {
          if (!s.takeWin || s.p2) return s
          const qs = data.queue.find(q => q._localId === s._localId || q.id === s._localId)
          if (qs?.p2) {
            changed = true
            return {
              ...s, p2: qs.p2,
              player1: qs.player1 || s.player1,
              player2: qs.player2 || s.player2,
              ...(qs.player1_teammate ? { player1_teammate: qs.player1_teammate } : {}),
              ...(qs.player2_teammate ? { player2_teammate: qs.player2_teammate } : {}),
            }
          }
          return s
        })
        if (changed) localStorage.setItem('myQueueSlots', JSON.stringify(next))
        return changed ? next : prev
      })
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
          next = next.map(s => {
            if (!s.takeWin || s.p2) return s
            const fillBlue = s.player1 == null
            return {
              ...s,
              p2: data.winner,
              ...(fillBlue ? {
                player1: data.winner,
                ...(data.winner_teammate ? { player1_teammate: data.winner_teammate } : {}),
              } : {
                player2: data.winner,
                ...(data.winner_teammate ? { player2_teammate: data.winner_teammate } : {}),
              }),
            }
          })
        }
        localStorage.setItem('myQueueSlots', JSON.stringify(next))
        return next
      })

    } else if (data.type === 'win_invite') {
      // Winner receives invite to confirm participation in the next takeWin match
      setPendingInvites(prev => {
        if (prev.find(i => i.inviteId === data.inviteId)) return prev
        return [...prev, {
          inviteId:   data.inviteId,
          from:       data.from,
          slot:       data.slot,
          isWinClaim: true,
          slotId:     data.slotId,
        }]
      })

    } else if (data.type === 'win_claim_declined') {
      // Winner declined → remove our takeWin slot from mySlots
      setMySlots(prev => {
        const next = prev.filter(s => s._localId !== data.slotId && s.id !== data.slotId)
        localStorage.setItem('myQueueSlots', JSON.stringify(next))
        return next
      })
      setInviteResults(prev => [...prev, {
        inviteId: `wcd-${Date.now()}`,
        accepted: false,
        target: '?',
        winClaimDeclined: true,
      }])

    } else if (data.type === 'invite_received') {
      // J2 receives an invite from J1
      setPendingInvites(prev => {
        if (prev.find(i => i.inviteId === data.inviteId)) return prev
        return [...prev, { inviteId: data.inviteId, from: data.from, slot: data.slot }]
      })

    } else if (data.type === 'invite_cancelled') {
      // J1 cancelled → remove invite + show notification
      // Read from ref to avoid stale closure; also check acceptedInviteFromsRef for 2v2 partial accepts
      const inviteId = data.inviteId
      const inv = pendingInvitesRef.current.find(i => i.inviteId === inviteId)
      const fromAccepted = acceptedInviteFromsRef.current[inviteId]
      const from = inv?.from ?? fromAccepted
      if (from) {
        setInviteResults(r => [...r, {
          inviteId: `ic-${inviteId}`,
          accepted: false,
          target: from,
          inviteCancelled: true,
        }])
        delete acceptedInviteFromsRef.current[inviteId]
      }
      setPendingInvites(prev => prev.filter(i => i.inviteId !== inviteId))

    } else if (data.type === 'p2_left') {
      // J2 a annulé le match accepté → J1 retire le slot de mySlots
      setMySlots(prev => {
        const next = prev.filter(s => s._localId !== data.slotId && s.id !== data.slotId)
        localStorage.setItem('myQueueSlots', JSON.stringify(next))
        return next
      })

    } else if (data.type === 'match_cancelled') {
      if (data.slotId) {
        setMySlots(prev => {
          const next = prev.filter(s => s._localId !== data.slotId && s.id !== data.slotId)
          localStorage.setItem('myQueueSlots', JSON.stringify(next))
          return next
        })
      }
      setInviteResults(prev => [...prev, {
        inviteId: `cancel-${Date.now()}-${Math.random()}`,
        accepted: false,
        target: data.cancelledBy || '',
        cancelled: true,
        chain: data.chain || false,
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
        // All accepted → enter queue (skip for tournament_teammate invites)
        setMySlots(prev => {
          const next = prev.map(s =>
            s._localId === inviteId ? { ...s, type: 'taken' } : s
          )
          localStorage.setItem('myQueueSlots', JSON.stringify(next))
          return next
        })
        if (invite.slot?.type !== 'tournament_teammate') {
          send({ action: 'join', slot: { ...invite.slot, type: 'taken' } })
        }
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

  useEffect(() => {
    if (!user?.username) {
      persistedQueueRef.current = []
      return undefined
    }

    let cancelled = false
    const refreshPersistedQueue = async () => {
      try {
        const res = await authFetch('/api/planning/queue/')
        if (!res.ok) return
        const data = await res.json()
        const entries = Array.isArray(data) ? data : data.results || []
        const persistedQueue = entries.map(mapPersistedQueueEntry)
        if (cancelled) return
        persistedQueueRef.current = persistedQueue
        setQueue(prev => mergeQueueState(
          prev.filter(slot => slot.source !== 'db'),
          persistedQueue,
        ))
      } catch {
        // WebSocket remains the realtime fallback if the REST queue is temporarily unavailable.
      }
    }

    refreshPersistedQueue()
    const intervalId = setInterval(refreshPersistedQueue, 10000)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [user?.username])

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
      persistedQueueRef.current = []
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

  const signalGameEnd = (gameId, winner, winnerTeammate, matchType) => {
    if (gameId) send({ action: 'game_end', gameId, winner: winner || null, winner_teammate: winnerTeammate || null, match_type: matchType || 'SOLO', completed: true })
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

  const respondToInvite = (inviteId, accepted, slot, fromUser, isWinClaim, slotId) => {
    if (isWinClaim) {
      send({ action: 'win_claim_response', inviteId, accepted })
    } else {
      send({ action: 'invite_response', inviteId, accepted, from: fromUser })
      if (accepted && fromUser) {
        // Track accepted invite so we can notify if J1 later cancels (2v2 partial-accept case)
        acceptedInviteFromsRef.current[inviteId] = fromUser
      }
    }
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
