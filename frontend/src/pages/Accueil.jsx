import { useState, useEffect, useMemo, useRef } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Avatar from '../components/ui/Avatar'
import Pill from '../components/ui/Pill'
import Modal from '../components/ui/Modal'
import JouerMode from '../components/ui/JouerMode'
import LoginInput from '../components/ui/LoginInput'
import PerformanceChart from '../components/ui/PerformanceChart'
import AddMatchModal from '../components/ui/AddMatchModal'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useQueue } from '../context/QueueContext'
import { authFetch, matchToRow } from '../services/api'
import styles from './Accueil.module.css'

const MATCHES_PER_PAGE = 3

export default function Accueil() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const { queue, mySlots, activeGame, completedGameIds, lastGameEndedId, joinQueue, leaveQueue, openGame, updateScore, closeGame, signalGameEnd, sendInvite, cancelInvite, cancelAsP2, pendingInvites, respondToInvite, connected } = useQueue()

  const [jouerOpen,      setJouerOpen]      = useState(false)
  const [selectedMatch,  setSelectedMatch]  = useState(null)

  // Refs to read latest values in effects without stale closures
  const jouerOpenRef = useRef(false)
  jouerOpenRef.current = jouerOpen
  const selectedMatchRef = useRef(null)
  selectedMatchRef.current = selectedMatch
  const prevConnectedRef = useRef(false)
  const [matchPickOpen,  setMatchPickOpen]  = useState(false)
  const [joinOpen,       setJoinOpen]       = useState(false)

  const [matches,        setMatches]        = useState([])
  const [matchSearch,    setMatchSearch]    = useState('')
  const [matchPage,      setMatchPage]      = useState(0)

  const [matchError,     setMatchError]     = useState(null)
  const [initialOpponent, setInitialOpponent] = useState(null)
  const [userAvatars,    setUserAvatars]    = useState({})

  // Matchs que j'ai initiés (persistant via localStorage)
  const myUpcoming = mySlots
    .filter(s => !completedGameIds.has(s._localId))
    .map(s => {
      const u = user?.username
      let vs, vsColor
      const userIsBlue = s.player1 === u || s.team1?.includes(u)
      if (s.format === '2v2' || s.match_type === 'TEAM') {
        const opp = userIsBlue
          ? (s.team2?.filter(Boolean).length ? s.team2.filter(Boolean) : [s.p2, s.player2_teammate].filter(Boolean))
          : (s.team1?.filter(Boolean).length ? s.team1.filter(Boolean) : [s.p1, s.player1_teammate].filter(Boolean))
        vs = opp.length ? opp.join(' & ') : (s.takeWin ? '...' : '?')
        vsColor = opp.length ? (userIsBlue ? 'red' : 'blue') : null
      } else {
        vs = s.p2 || (s.takeWin ? '...' : '?')
        vsColor = s.p2 ? (userIsBlue ? 'red' : 'blue') : null
      }
      return {
        id:       s._localId,
        vs,
        vsColor,
        format:   s.format || '1v1',
        mode:     s.is_ranked ? t('addMatch.competition') : t('addMatch.chill'),
        label:    s.type === 'pending_invite' ? t('invite.pendingLabel') : t('home.waiting'),
        cancelFn: s.type === 'pending_invite'
          ? () => cancelInvite(s._localId)
          : () => leaveQueue(s._localId),
        _slot:    s,
      }
    })

  // Matchs créés par d'autres où l'utilisateur est participant (pas spectateur)
  const invitedUpcoming = queue
    .filter(s => {
      if (s.p1 === user?.username) return false
      if (completedGameIds.has(s._localId) || completedGameIds.has(s.id)) return false
      const u = user?.username
      return u && (s.p2 === u || s.team1?.includes(u) || s.team2?.includes(u))
    })
    .map(s => {
      const u = user?.username
      const userIsBlue = s.player1 === u || s.team1?.includes(u)
      let vs, vsColor
      if (s.format === '2v2' || s.match_type === 'TEAM') {
        const opp = userIsBlue
          ? (s.team2?.filter(Boolean).length ? s.team2.filter(Boolean) : [s.p2, s.player2_teammate].filter(Boolean))
          : (s.team1?.filter(Boolean).length ? s.team1.filter(Boolean) : [s.p1, s.player1_teammate].filter(Boolean))
        vs = opp.length ? opp.join(' & ') : '?'
        vsColor = userIsBlue ? 'red' : 'blue'
      } else {
        vs = userIsBlue ? (s.player2 || s.p1 || '?') : (s.player1 || s.p2 || '?')
        vsColor = userIsBlue ? 'red' : 'blue'
      }
      return {
        id:       s.id || s._localId,
        vs,
        vsColor,
        format:   s.format || '1v1',
        mode:     s.is_ranked ? t('addMatch.competition') : t('addMatch.chill'),
        label:    t('home.waiting'),
        cancelFn: () => cancelAsP2(s.id || s._localId),
        _slot:    s,
      }
    })

  const baseUpcomingMatches = [...myUpcoming, ...invitedUpcoming]

  // Fallback: si activeGame est défini et que l'utilisateur est participant mais que le slot
  // n'est pas dans la file (J1 brièvement déconnecté), on synthétise un match pour que J2
  // puisse quand même accéder à "Jouer" au lieu d'avoir le bouton grisé.
  const activeGameSlotId = activeGame?.gameId
  const hasActiveGameInUpcoming = baseUpcomingMatches.some(m =>
    (m._slot?._localId || m._slot?.id || m.id) === activeGameSlotId
  )
  const isParticipantOfActiveGame = !!(activeGame && user?.username && (
    activeGame.player1 === user.username ||
    activeGame.player2 === user.username ||
    activeGame.player1_teammate === user.username ||
    activeGame.player2_teammate === user.username
  ))
  const syntheticActiveMatch = (activeGame && !hasActiveGameInUpcoming && isParticipantOfActiveGame)
    ? {
        id: activeGame.gameId,
        vs: activeGame.player1 === user.username
          ? (activeGame.player2 || '?')
          : (activeGame.player1 || '?'),
        vsColor: activeGame.player1 === user.username ? 'red' : 'blue',
        format: activeGame.match_type === 'TEAM' ? '2v2' : '1v1',
        mode: t('addMatch.chill'),
        label: t('home.waiting'),
        cancelFn: () => {},
        _slot: {
          _localId: activeGame.gameId,
          id: activeGame.gameId,
          p1: activeGame.player1,
          p2: activeGame.player2,
          player1: activeGame.player1,
          player2: activeGame.player2,
          player1_teammate: activeGame.player1_teammate || null,
          player2_teammate: activeGame.player2_teammate || null,
          match_type: activeGame.match_type || 'SOLO',
        },
      }
    : null

  const upcomingMatches = syntheticActiveMatch
    ? [syntheticActiveMatch, ...baseUpcomingMatches]
    : baseUpcomingMatches

  // Dernier slot de la file = match précédent pour "prendre la gagne"
  const lastQueueSlot = [...queue]
    .filter(s => !completedGameIds.has(s._localId) && !completedGameIds.has(s.id))
    .at(-1) || null

  const isParticipant = (m) => {
    const slot = m?._slot
    if (!slot || !user?.username) return false
    // Un « prendre la gagne » n'est pas jouable tant que le gagnant précédent
    // n'a pas accepté l'invitation (p2 encore vide) : pas d'adversaire confirmé.
    if (slot.takeWin && !slot.p2) return false
    const u = user.username
    return slot.p1 === u || slot.p2 === u ||
      slot.team1?.includes(u) || slot.team2?.includes(u)
  }

  // Premier match dans la file globale (ordre d'arrivée côté serveur)
  // C'est lui qui détermine qui a le droit de jouer maintenant
  const firstGlobalSlot = queue.find(s =>
    !completedGameIds.has(s._localId) && !completedGameIds.has(s.id)
  ) || mySlots.find(s => !completedGameIds.has(s._localId) && s.type !== 'pending_invite') || null

  const matchToPlay = selectedMatch || (upcomingMatches.length > 0 ? upcomingMatches[0] : null)
  // canPlay est aussi vrai si activeGame est actif et que l'utilisateur est participant
  // (couvre le cas où le slot a temporairement disparu de la file pendant la reconnexion de J1)
  const canPlay = (firstGlobalSlot ? isParticipant({ _slot: firstGlobalSlot }) : false)
    || isParticipantOfActiveGame

  const handleAddMatch = async ({ mode, format, redPlayers, bluePlayers, takeWin }) => {
    setMatchError(null)

    if (baseUpcomingMatches.length >= 3) {
      return t('home.maxMatches')
    }

    // Vérification max 3 matchs en attente pour les cibles invitées
    if (!takeWin && format !== 'Seul') {
      const targets = [...(bluePlayers || []), ...(redPlayers || [])].filter(p => p && p !== user?.username)
      const overloaded = targets.filter(p => {
        const count = queue.filter(s =>
          s.p1 === p || s.p2 === p ||
          s.team1?.includes(p) || s.team2?.includes(p)
        ).length
        return count >= 3
      })
      if (overloaded.length > 0) {
        return t('home.targetMaxMatches', { player: overloaded.join(', ') })
      }
    }

    // Vérification existence des logins via API
    const matchType = format === '2v2' ? 'TEAM' : 'SOLO'
    const toCheck = takeWin && matchType === 'TEAM'
      ? [...bluePlayers, ...redPlayers].filter(p => p && p !== user?.username)
      : (!takeWin && format !== 'Seul')
        ? [...bluePlayers, ...redPlayers].filter(p => p && p !== user?.username)
        : []
    if (toCheck.length > 0) {
      try {
        const resp = await authFetch('/api/auth/users/')
        if (resp.ok) {
          const knownUsers = await resp.json()
          const known = new Set((Array.isArray(knownUsers) ? knownUsers : (knownUsers.results ?? [])).map(u => u.login || u.username))
          const invalid = toCheck.filter(p => !known.has(p))
          if (invalid.length > 0) {
            return `Joueur(s) introuvable(s) : ${invalid.join(', ')}`
          }
        }
      } catch { /* si l'API échoue, on laisse passer */ }
    }

    const isRanked  = mode === 'compet'
    // bluePlayers[0] = côté bleu (player1), redPlayers[0] = côté rouge (player2)
    // (déjà swappé par handleConfirm selon myColor)
    // Pour takeWin : le côté vide = TBD (gagnant du match précédent)
    const userOnBlue = takeWin ? bluePlayers[0] === user?.username : true
    const body = {
      match_type:       matchType,
      is_ranked:        isRanked,
      player1:          takeWin ? (userOnBlue ? user?.username : null) : (bluePlayers[0] || user?.username),
      player2:          takeWin ? (userOnBlue ? null : user?.username) : (redPlayers[0] || null),
      ...(matchType === 'TEAM' ? {
        player1_teammate: takeWin ? (userOnBlue ? (bluePlayers[1] || null) : null) : (bluePlayers[1] || null),
        player2_teammate: takeWin ? (userOnBlue ? null : (redPlayers[1] || null)) : (redPlayers[1] || null),
      } : {}),
    }
    // p1/p2 = affichage (owner vs adversaire), indépendant de la couleur choisie
    const opponent = takeWin ? null : (
      bluePlayers[0] === user?.username
        ? (redPlayers[0] || null)
        : (bluePlayers[0] || null)
    )

    const parentSlotId = takeWin
      ? (queue.filter(s => s.match_type === matchType && !completedGameIds.has(s.id) && !completedGameIds.has(s._localId)).at(-1)?.id || null)
      : null

    const baseSlot = {
      p1:               user?.username,
      p2:               opponent,
      player1:          body.player1,
      player2:          body.player2 || null,
      player1_teammate: body.player1_teammate || null,
      player2_teammate: body.player2_teammate || null,
      match_type:       matchType,
      is_ranked:        isRanked,
      format:           format === '2v2' ? '2v2' : '1v1',
      takeWin:          takeWin || false,
      createdAt:        Date.now(),
      ...(parentSlotId ? { parentSlotId } : {}),
      ...(matchType === 'TEAM' ? {
        team1: [body.player1, body.player1_teammate].filter(Boolean),
        team2: [body.player2, body.player2_teammate].filter(Boolean),
      } : {}),
    }

    try {
      // Adversaire connu sans takeWin → toujours passer par l'invitation
      if (opponent && !takeWin) {
        const localSlot = { ...baseSlot, _localId: crypto.randomUUID() }
        // 2v2 : inviter les 3 autres joueurs ; 1v1 : juste l'adversaire
        const inviteTargets = format === '2v2'
          ? [...bluePlayers, ...redPlayers].filter(p => p && p !== user?.username)
          : [opponent]
        sendInvite(inviteTargets, localSlot)
        setMatchError(t('invite.sent', { player: inviteTargets.join(', ') }))
        return
      }

      // takeWin + TEAM → inviter uniquement le coéquipier (l'adversaire sera le gagnant du match précédent)
      if (takeWin && matchType === 'TEAM') {
        const teammate = body.player1_teammate || body.player2_teammate
        if (teammate) {
          const localSlot = { ...baseSlot, _localId: crypto.randomUUID() }
          sendInvite([teammate], localSlot)
          setMatchError(t('invite.sent', { player: teammate }))
          return
        }
      }

      // takeWin 1v1 (ou 2v2 sans coéquipier) → rejoindre la file directement, pas de réservation API
      // (le slot est incomplet côté joueurs jusqu'à ce que le gagnant accepte)
      if (takeWin) {
        joinQueue(baseSlot)
        return
      }

      // Pas d'adversaire → essayer de réserver directement
      const resv = await authFetch('/api/planning/reservation/', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (resv.ok) {
        const resvData = await resv.json().catch(() => ({}))
        setMatchError(t('home.tableReserved'))
        joinQueue({ ...baseSlot, reservationId: resvData.id, type: 'live' })
        return
      }

      const resvErr = await resv.json().catch(() => ({}))
      const isBusy = JSON.stringify(resvErr).toLowerCase().includes('occupé')
      if (!isBusy) {
        setMatchError(Object.values(resvErr).flat().join(' '))
        return
      }

      const queueRes = await authFetch('/api/planning/queue/join/', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (queueRes.ok) {
        setMatchError(t('home.addedToQueue'))
        joinQueue({ ...baseSlot, type: 'waiting' })
      } else {
        const err = await queueRes.json().catch(() => ({}))
        const errMsg = Object.values(err).flat().join(' ') || ''
        const alreadyQueued = errMsg.toLowerCase().includes('déjà') || errMsg.toLowerCase().includes('already')
        if (alreadyQueued) {
          setMatchError(t('home.addedToQueue'))
          joinQueue({ ...baseSlot, type: 'waiting' })
        } else {
          setMatchError(errMsg || t('home.unknownError'))
        }
      }
    } catch (err) {
      console.error(err)
      setMatchError(t('home.networkError'))
    }
  }

  useEffect(() => {
    authFetch('/api/auth/users/')
      .then(r => r.json())
      .then(data => {
        const users = Array.isArray(data) ? data : (data?.results ?? [])
        const map = {}
        users.forEach(u => { if (u.login && u.avatar_url) map[u.login] = u.avatar_url })
        setUserAvatars(map)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!user?.username) return

    // Matchs validés (historique)
    authFetch(`/api/matches/?player=${user.username}&status=VALIDATED`)
      .then(r => r.json())
      .then(data => {
        const rows = (Array.isArray(data) ? data : (data?.results ?? []))
          .sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
          .map(m => matchToRow(m, user.username))
        setMatches(rows)
      })
      .catch(console.error)

  }, [user?.username])

  const topOpponents = useMemo(() => {
    const counts = {}
    matches.forEach(m => {
      m.vs.split(' & ').forEach(p => {
        const player = p.trim()
        if (player && player !== '?') counts[player] = (counts[player] || 0) + 1
      })
    })
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([login, count]) => ({ login, count }))
  }, [matches])

  const handleMatchComplete = async (scoreRed, scoreBlue, gamellesRed = 0, gamellesBlue = 0, demisRed = 0, demisBlue = 0) => {
    setJouerOpen(false)
    const rawSlot = selectedMatch?._slot
    // Relire le slot depuis mySlots pour obtenir player2 à jour (cas takeWin)
    const slot = mySlots.find(s => s._localId === rawSlot?._localId) || rawSlot

    // Prévenir l'autre joueur immédiatement via WS (avant les appels API)
    // sans modifier l'état local — évite que l'autre soumette aussi le score
    const gameId = slot?._localId || activeGame?.gameId
    // Déterminer le gagnant dès maintenant (player1 = bleu, player2 = rouge)
    let winner = null
    let winnerTeammate = null
    if (scoreBlue > scoreRed) {
      winner = slot?.player1
      winnerTeammate = slot?.player1_teammate || null
    } else if (scoreRed > scoreBlue) {
      winner = slot?.player2 || (slot?.takeWin && slot?.p2 ? slot.p2 : null)
      winnerTeammate = slot?.player2_teammate || null
    }
    signalGameEnd(gameId, winner, winnerTeammate, slot?.match_type || 'SOLO')

    const doCleanup = () => {
      if (slot?._localId) leaveQueue(slot._localId)
      closeGame(gameId)
      setSelectedMatch(null)
    }

    // For takeWin slots, player2 may arrive via p2 before player2 is updated
    const effectivePlayer2 = slot?.player2 || (slot?.takeWin && slot?.p2 ? slot.p2 : null)

    if (!slot?.player1 || !effectivePlayer2) {
      doCleanup()
      return
    }

    try {
      const matchBody = {
        match_type:        slot.match_type || 'SOLO',
        is_ranked:         slot.is_ranked  ?? false,
        player1:           slot.player1,
        player2:           effectivePlayer2,
        score_player1:     scoreBlue,
        score_player2:     scoreRed,
        gamelles_player1:  gamellesBlue,
        gamelles_player2:  gamellesRed,
        demis_player1:     demisBlue,
        demis_player2:     demisRed,
        ...(slot.player1_teammate ? { player1_teammate: slot.player1_teammate } : {}),
        ...(slot.player2_teammate ? { player2_teammate: slot.player2_teammate } : {}),
      }
      const matchRes = await authFetch('/api/matches/', {
        method: 'POST',
        body: JSON.stringify(matchBody),
      })
      if (!matchRes.ok) {
        const err = await matchRes.json().catch(() => ({}))
        setMatchError(Object.values(err).flat().join(' ') || t('home.matchCreateError'))
        doCleanup()
        return
      }
      const matchData = await matchRes.json()

      const validateRes = await authFetch(`/api/matches/${matchData.id}/validate/`, {
        method: 'PATCH',
        body: JSON.stringify({ score_player1: scoreBlue, score_player2: scoreRed }),
      })
      if (!validateRes.ok) {
        const err = await validateRes.json().catch(() => ({}))
        const alreadyValidated = err.detail?.includes('actuel')
        if (!alreadyValidated) {
          setMatchError(err.detail || Object.values(err).flat().join(' ') || 'Erreur validation match')
        }
        doCleanup()
        return
      }

      if (slot.reservationId) {
        await authFetch(`/api/planning/reservation/${slot.reservationId}/close/`, {
          method: 'PATCH',
          body: JSON.stringify({}),
        })
      }

      doCleanup()

      // Rafraîchir l'historique
      authFetch(`/api/matches/?player=${user.username}&status=VALIDATED`)
        .then(r => r.json())
        .then(data => {
          const rows = (Array.isArray(data) ? data : (data?.results ?? []))
            .sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
            .map(m => matchToRow(m, user.username))
          setMatches(rows)
        })
        .catch(console.error)
    } catch (err) {
      console.error(err)
      setMatchError(t('home.networkValidationError'))
      doCleanup()
    }
  }

  const handleTieCancel = () => {
    const rawSlot = selectedMatch?._slot
    const slot = mySlots.find(s => s._localId === rawSlot?._localId) || rawSlot
    const gameId = slot?._localId || activeGame?.gameId
    if (slot?._localId) leaveQueue(slot._localId)
    closeGame(gameId, { isTie: true })
    setSelectedMatch(null)
    setJouerOpen(false)
  }

  // On WS reconnect, close JouerMode so J1 never sees a stale game screen.
  // If the game is still alive, game_state will restore activeGame and J1 can re-click Jouer.
  useEffect(() => {
    const wasConnected = prevConnectedRef.current
    prevConnectedRef.current = connected
    if (connected && !wasConnected && jouerOpenRef.current) {
      setJouerOpen(false)
      setSelectedMatch(null)
    }
  }, [connected])

  // Auto-close JouerMode when the active game ends (online: other player ends it while J1 is live).
  // Uses refs instead of closure capture to avoid stale jouerOpen / selectedMatch.
  const prevActiveGameIdRef = useRef(activeGame?.gameId)
  useEffect(() => {
    const prevId = prevActiveGameIdRef.current
    prevActiveGameIdRef.current = activeGame?.gameId
    // Fired when activeGame transitions from a known gameId → null
    if (prevId && !activeGame?.gameId && jouerOpenRef.current) {
      const slot = selectedMatchRef.current?._slot
      if (slot?._localId) leaveQueue(slot._localId)
      setSelectedMatch(null)
      setJouerOpen(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGame?.gameId])

  const filtered = matches.filter(m =>
    m.vs.toLowerCase().includes(matchSearch.toLowerCase())
  )
  const totalPages = Math.ceil(filtered.length / MATCHES_PER_PAGE)
  const pageSlice  = filtered.slice(matchPage * MATCHES_PER_PAGE, matchPage * MATCHES_PER_PAGE + MATCHES_PER_PAGE)

  return (
    <Shell>
      <Topbar title={t('topbar.home')} titleSize={30} />

      {jouerOpen && (
        <JouerMode
          onClose={() => { setJouerOpen(false); setSelectedMatch(null) }}
          match={selectedMatch}
          onComplete={handleMatchComplete}
          onTieCancel={handleTieCancel}
          scoreRed={activeGame?.scoreRed}
          scoreBlue={activeGame?.scoreBlue}
          gamellesRed={activeGame?.gamellesRed}
          gamellesBlue={activeGame?.gamellesBlue}
          demisRed={activeGame?.demisRed}
          demisBlue={activeGame?.demisBlue}
          onScoreChange={(r, b, extra) => activeGame?.gameId && updateScore(activeGame.gameId, r, b, extra)}
          startTime={activeGame?.startTime}
        />
      )}

      <div className={styles.content}>

        {/* ── Section Jouer ── */}
        <div className={styles.jouerSection}>

          <svg className={styles.pitchBg} viewBox="0 0 800 320" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {[0,1,2,3,4,5,6,7,8,9].map(i => (
              <rect key={i} x={i*80} y={0} width={80} height={320} fill={i%2===0 ? '#3a8832' : '#449e3b'} />
            ))}
            <rect x="28" y="22" width="744" height="276" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2.5"/>
            <line x1="400" y1="22" x2="400" y2="298" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <circle cx="400" cy="160" r="62" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <circle cx="400" cy="160" r="5" fill="rgba(255,255,255,0.7)"/>
            <circle cx="400" cy="160" r="13" fill="white" opacity="0.6"/>
            <rect x="28" y="88" width="115" height="144" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <rect x="28" y="120" width="48" height="80" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <circle cx="98" cy="160" r="4" fill="rgba(255,255,255,0.65)"/>
            <path d="M 143 100 A 68 68 0 0 1 143 220" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" clipPath="url(#lpClip)"/>
            <defs>
              <clipPath id="lpClip"><rect x="143" y="0" width="800" height="320"/></clipPath>
              <clipPath id="rpClip"><rect x="0" y="0" width="657" height="320"/></clipPath>
            </defs>
            <rect x="8" y="132" width="20" height="56" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <rect x="657" y="88" width="115" height="144" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <rect x="724" y="120" width="48" height="80" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <circle cx="702" cy="160" r="4" fill="rgba(255,255,255,0.65)"/>
            <path d="M 657 100 A 68 68 0 0 0 657 220" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" clipPath="url(#rpClip)"/>
            <rect x="772" y="132" width="20" height="56" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <path d="M 28 22 A 16 16 0 0 1 44 38" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <path d="M 772 22 A 16 16 0 0 0 756 38" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <path d="M 28 298 A 16 16 0 0 0 44 282" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <path d="M 772 298 A 16 16 0 0 1 756 282" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
          </svg>

          <div className={styles.pitchContent}>
            <div className={styles.matchChoiceBtns}>
              <button
                className={`${styles.choiceBtn} ${selectedMatch ? styles.choiceBtnSelected : ''}`}
                onClick={() => setMatchPickOpen(true)}
              >
                {t('home.scheduledMatch')}
                {selectedMatch && <span className={styles.selectedBadge}>vs {selectedMatch.vs}</span>}
              </button>
              <div className={styles.orSep}>
                <div className={styles.orLine} />
                <span className={styles.orText}>{t('home.or')}</span>
                <div className={styles.orLine} />
              </div>
              <button className={styles.addMatchBtn} onClick={() => setJoinOpen(true)}>
                <span className={styles.addEmoji}>⚽</span>
                <span className={styles.addLine}>{t('home.addMatch')}</span>
              </button>
            </div>

            <button
              className={`${styles.jouerBtn} ${!canPlay ? styles.jouerBtnDisabled : ''}`}
              disabled={!canPlay}
              onClick={() => {
                const match = selectedMatch || (upcomingMatches.length > 0 ? upcomingMatches[0] : null)
                if (!selectedMatch && match) setSelectedMatch(match)
                if (match?._slot) openGame(match._slot)
                setJouerOpen(true)
              }}
            >
              <span className={styles.jouerIcon}>▶</span>
              {t('home.play')}
            </button>
          </div>
        </div>

        {/* ── Grid : Mes matchs + Amis ── */}
        <div className={styles.grid}>

          <div className={styles.card}>
            <div className={styles.cardHeader}>{t('home.myMatches')}</div>
            <div className={styles.cardBody}>
              <div className={styles.matchSearch}>
                <LoginInput
                  value={matchSearch}
                  onChange={(val) => { setMatchSearch(val); setMatchPage(0) }}
                  placeholder={t('home.searchLogin')}
                  className={styles.searchInput}
                />
              </div>
              {pageSlice.map((m, i) => (
                <div key={i} className={styles.matchRow}>
                  <Pill label={t(`profile.result.${m.result}`)} type={m.result} />
                  <div className={styles.matchInfo}>
                    <span className={styles.matchVs}>vs {m.vs}</span>
                    <span className={styles.matchScore}>{m.score}</span>
                  </div>
                  <div className={styles.matchRight}>
                    <span className={m.elo.startsWith('+') ? styles.eloPos : styles.eloNeg}>{m.elo}</span>
                    <span className={styles.matchDate}>{m.date}</span>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className={styles.noMatch}>{t('home.noMatch')}</div>}
              {totalPages > 1 && (
                <div className={styles.matchNav}>
                  <button className={styles.navBtn} onClick={() => setMatchPage(p => Math.max(0, p-1))} disabled={matchPage === 0}>←</button>
                  <span className={styles.navInfo}>{matchPage + 1} / {totalPages}</span>
                  <button className={styles.navBtn} onClick={() => setMatchPage(p => Math.min(totalPages-1, p+1))} disabled={matchPage === totalPages-1}>→</button>
                </div>
              )}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span>{t('home.favFriends')}</span>
              <span className={styles.counter}>{topOpponents.length} / 5</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.teamNote}>{t('home.favFriendsNote')}</div>
              {topOpponents.length === 0 && (
                <div className={styles.noMatch}>{t('home.noFavFriends')}</div>
              )}
              {topOpponents.map((tm, i) => (
                <div key={tm.login} className={styles.teammateRow}>
                  <span className={styles.rankBadge}>#{i + 1}</span>
                  <Avatar initials={tm.login.substring(0, 2).toUpperCase()} size={32} bg="var(--beige)" round src={userAvatars[tm.login] || null} />
                  <span className={styles.teammateName}>{tm.login}</span>
                  <span className={styles.gamesCount}>{tm.count}p</span>
                  <button
                    className={styles.queueBtn}
                    onClick={() => { setInitialOpponent(tm.login); setJoinOpen(true) }}
                  >
                    {t('home.addQueue')}
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── Invitations en cours ── */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span>{t('home.pendingInvites')}</span>
            <span className={styles.counter}>{pendingInvites.length}</span>
          </div>
          <div className={styles.cardBody}>
            {pendingInvites.length === 0 && (
              <div className={styles.noMatch}>{t('home.noPendingInvites')}</div>
            )}
            {pendingInvites.map(inv => (
              <div key={inv.inviteId} className={styles.inviteRow}>
                <div className={styles.inviteRowInfo}>
                  <span className={styles.inviteRowFrom}>{inv.from}</span>
                  <span className={styles.inviteRowDetail}>
                    {inv.isWinClaim
                      ? t('invite.winClaimReceived', { player: inv.from })
                      : inv.slot?.type === 'tournament_teammate'
                        ? t('invite.tournamentTeammate', { player: inv.from })
                        : t('invite.received', {
                            format: inv.slot?.format || '1v1',
                            mode: inv.slot?.is_ranked ? t('addMatch.competition') : t('addMatch.chill'),
                          })}
                  </span>
                </div>
                <div className={styles.inviteRowActions}>
                  <button
                    className={styles.acceptSmallBtn}
                    onClick={async () => {
                      if (inv.slot?.type === 'tournament_teammate' && inv.slot?.tournamentId) {
                        try {
                          const res = await authFetch(`/api/tournaments/${inv.slot.tournamentId}/accept-invite/`, {
                            method: 'POST',
                            body: JSON.stringify({ inviter: inv.from }),
                          })
                          if (!res.ok) {
                            const text = await res.text().catch(() => '')
                            let detail = ''
                            try { detail = text ? JSON.parse(text).detail : '' } catch {}
                            window.alert(detail || t('invite.acceptError'))
                            return
                          }
                        } catch {
                          window.alert(t('invite.acceptError'))
                          return
                        }
                      }
                      respondToInvite(inv.inviteId, true, inv.slot, inv.from, inv.isWinClaim, inv.slotId)
                    }}
                  >{t('invite.accept')}</button>
                  <button
                    className={styles.declineSmallBtn}
                    onClick={() => respondToInvite(inv.inviteId, false, inv.slot, inv.from, inv.isWinClaim, inv.slotId)}
                  >{t('invite.decline')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <PerformanceChart />

      </div>

      {/* ── Popup : choisir un match prévu ── */}
      <Modal open={matchPickOpen} onClose={() => setMatchPickOpen(false)} title={t('home.scheduledMatchesTitle')}>
        <div className={styles.matchPickList}>
          {upcomingMatches.map(m => {
            const slotId = m._slot?._localId || m._slot?.id
            const isLive = activeGame?.gameId === slotId
            return (
              <div key={m.id} className={styles.matchPickRow}>
                <button
                  className={`${styles.matchPickItem} ${selectedMatch?.id === m.id ? styles.matchPickSelected : ''}`}
                  onClick={() => { setSelectedMatch(m); setMatchPickOpen(false) }}
                >
                  <div className={styles.matchPickVs}>
                    vs{' '}
                    {m.vsColor && <span className={m.vsColor === 'blue' ? styles.dotBlue : styles.dotRed} />}
                    <strong>{m.vs}</strong>
                  </div>
                  <div className={styles.matchPickSub}>{m.format} · {m.mode} · {m.label}</div>
                </button>
                {!isLive && (
                  <button
                    className={styles.cancelMatchBtn}
                    title={t('home.cancelMatch')}
                    onClick={(e) => {
                      e.stopPropagation()
                      m.cancelFn?.()
                      if (selectedMatch?.id === m.id) setSelectedMatch(null)
                      setMatchPickOpen(false)
                    }}
                  >✕</button>
                )}
              </div>
            )
          })}
          {upcomingMatches.length === 0 && (
            <div className={styles.noMatch}>{t('home.noScheduled')}</div>
          )}
        </div>
        {selectedMatch && (
          <div className={styles.clearMatch}>
            <button className={styles.clearBtn} onClick={() => { setSelectedMatch(null); setMatchPickOpen(false) }}>
              {t('home.deselect')}
            </button>
          </div>
        )}
      </Modal>

      {matchError && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background: matchError.startsWith('✅') ? '#22aa55' : '#ff4444', color:'#fff', padding:'10px 20px', borderRadius:8, zIndex:9999, display:'flex', alignItems:'center', gap:12 }}>
          <span>{matchError}</span>
          <button onClick={() => setMatchError(null)} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer', fontSize:18, lineHeight:1, padding:0, opacity:0.8 }}>×</button>
        </div>
      )}

      <AddMatchModal
        open={joinOpen}
        onClose={() => { setJoinOpen(false); setMatchError(null); setInitialOpponent(null) }}
        onConfirm={handleAddMatch}
        user={user}
        initialOpponent={initialOpponent}
        prevTeam={lastQueueSlot ? {
          p1:        lastQueueSlot.p1 || '?',
          p2:        lastQueueSlot.p2 || '?',
          format:    lastQueueSlot.format || '1v1',
          team1:     lastQueueSlot.team1 || null,
          team2:     lastQueueSlot.team2 || null,
          is_ranked: lastQueueSlot.is_ranked,
        } : null}
      />
    </Shell>
  )
}
