import { useState, useEffect, useMemo } from 'react'
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
  const { queue, mySlots, activeGame, completedGameIds, lastGameEndedId, joinQueue, leaveQueue, openGame, updateScore, closeGame, signalGameEnd, sendInvite } = useQueue()

  const [jouerOpen,      setJouerOpen]      = useState(false)
  const [selectedMatch,  setSelectedMatch]  = useState(null)
  const [matchPickOpen,  setMatchPickOpen]  = useState(false)
  const [joinOpen,       setJoinOpen]       = useState(false)

  const [matches,        setMatches]        = useState([])
  const [matchSearch,    setMatchSearch]    = useState('')
  const [matchPage,      setMatchPage]      = useState(0)

  const [matchError,     setMatchError]     = useState(null)
  const [initialOpponent, setInitialOpponent] = useState(null)

  // Matchs que j'ai initiés (persistant via localStorage)
  const myUpcoming = mySlots
    .filter(s => !completedGameIds.has(s._localId))
    .map(s => ({
      id:     s._localId,
      vs:     s.p2 || (s.takeWin ? '...' : '?'),
      format: s.format || '1v1',
      mode:   s.is_ranked ? 'Compétition' : 'Chill',
      label:  s.type === 'pending_invite' ? t('invite.pendingLabel') : t('home.waiting'),
      _slot:  s,
    }))

  // Matchs créés par d'autres où l'utilisateur est participant (pas spectateur)
  const invitedUpcoming = queue
    .filter(s => {
      if (s.p1 === user?.username) return false
      if (completedGameIds.has(s._localId) || completedGameIds.has(s.id)) return false
      const u = user?.username
      return u && (s.p2 === u || s.team1?.includes(u) || s.team2?.includes(u))
    })
    .map(s => ({
      id:     s.id || s._localId,
      vs:     s.p1 || '?',
      format: s.format || '1v1',
      mode:   s.is_ranked ? 'Compétition' : 'Chill',
      label:  'En attente',
      _slot:  s,
    }))

  const upcomingMatches = [...myUpcoming, ...invitedUpcoming]

  const isParticipant = (m) => {
    const slot = m?._slot
    if (!slot || !user?.username) return false
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
  const canPlay = firstGlobalSlot ? isParticipant({ _slot: firstGlobalSlot }) : false

  const handleAddMatch = async ({ mode, format, redPlayers, bluePlayers, takeWin }) => {
    setMatchError(null)
    const isRanked  = mode === 'compet'
    const matchType = format === '2v2' ? 'TEAM' : 'SOLO'
    // bluePlayers[0] = côté bleu (player1), redPlayers[0] = côté rouge (player2)
    // (déjà swappé par handleConfirm selon myColor)
    const body = {
      match_type:       matchType,
      is_ranked:        isRanked,
      player1:          bluePlayers[0] || user?.username,
      player2:          redPlayers[0]  || null,
      ...(matchType === 'TEAM' ? {
        player1_teammate: bluePlayers[1] || null,
        player2_teammate: redPlayers[1]  || null,
      } : {}),
    }
    // p1/p2 = affichage (owner vs adversaire), indépendant de la couleur choisie
    const opponent = bluePlayers[0] === user?.username
      ? (redPlayers[0] || null)
      : (bluePlayers[0] || null)

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
      ...(matchType === 'TEAM' ? {
        team1: [body.player1, body.player1_teammate].filter(Boolean),
        team2: [body.player2, body.player2_teammate].filter(Boolean),
      } : {}),
    }

    try {
      // Adversaire connu sans takeWin → toujours passer par l'invitation
      if (opponent && !takeWin) {
        const localSlot = { ...baseSlot, _localId: crypto.randomUUID() }
        sendInvite(opponent, localSlot)
        setMatchError(t('invite.sent', { player: opponent }))
        return
      }

      // Pas d'adversaire ou takeWin → essayer de réserver directement
      const resv = await authFetch('/api/planning/reservation/', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (resv.ok) {
        const resvData = await resv.json().catch(() => ({}))
        setMatchError('✅ Table réservée ! À vous de jouer.')
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
        setMatchError('✅ Ajouté à la file d\'attente !')
        joinQueue({ ...baseSlot, type: 'waiting' })
      } else {
        const err = await queueRes.json().catch(() => ({}))
        const errMsg = Object.values(err).flat().join(' ') || ''
        const alreadyQueued = errMsg.toLowerCase().includes('déjà') || errMsg.toLowerCase().includes('already')
        if (alreadyQueued) {
          setMatchError('✅ Ajouté à la file d\'attente !')
          joinQueue({ ...baseSlot, type: 'waiting' })
        } else {
          setMatchError(errMsg || 'Erreur inconnue')
        }
      }
    } catch (err) {
      console.error(err)
      setMatchError('Erreur réseau, réessaie.')
    }
  }

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

  const handleMatchComplete = async (scoreRed, scoreBlue) => {
    setJouerOpen(false)
    const rawSlot = selectedMatch?._slot
    // Relire le slot depuis mySlots pour obtenir player2 à jour (cas takeWin)
    const slot = mySlots.find(s => s._localId === rawSlot?._localId) || rawSlot

    // Prévenir l'autre joueur immédiatement via WS (avant les appels API)
    // sans modifier l'état local — évite que l'autre soumette aussi le score
    const gameId = slot?._localId || activeGame?.gameId
    signalGameEnd(gameId)

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
        match_type:      slot.match_type || 'SOLO',
        is_ranked:       slot.is_ranked  ?? false,
        player1:         slot.player1,
        player2:         effectivePlayer2,
        score_player1:   scoreBlue,
        score_player2:   scoreRed,
        ...(slot.player1_teammate ? { player1_teammate: slot.player1_teammate } : {}),
        ...(slot.player2_teammate ? { player2_teammate: slot.player2_teammate } : {}),
      }
      const matchRes = await authFetch('/api/matches/', {
        method: 'POST',
        body: JSON.stringify(matchBody),
      })
      if (!matchRes.ok) {
        const err = await matchRes.json().catch(() => ({}))
        setMatchError(Object.values(err).flat().join(' ') || 'Erreur création match')
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
      setMatchError('Erreur réseau lors de la validation.')
      doCleanup()
    }
  }

  // Auto-close JouerMode when the other player ends the game
  useEffect(() => {
    if (!lastGameEndedId || !jouerOpen) return
    const slot = selectedMatch?._slot
    const slotId = slot?._localId || slot?.id || selectedMatch?.id
    if (slotId !== lastGameEndedId) return
    if (slot?._localId) leaveQueue(slot._localId)
    setSelectedMatch(null)
    setJouerOpen(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastGameEndedId])

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
          onClose={() => { closeGame(activeGame?.gameId); setJouerOpen(false) }}
          match={selectedMatch}
          onComplete={handleMatchComplete}
          scoreRed={activeGame?.scoreRed}
          scoreBlue={activeGame?.scoreBlue}
          onScoreChange={(r, b) => activeGame?.gameId && updateScore(activeGame.gameId, r, b)}
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
            {upcomingMatches.length === 0 && (
              <div className={styles.jouerHint}>{t('home.selectToPlay')}</div>
            )}
            {upcomingMatches.length > 0 && !canPlay && (
              <div className={styles.jouerHint}>{t('home.notParticipant')}</div>
            )}
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
                  <Pill label={m.result} type={m.result === 'Victoire' ? 'win' : m.result === 'Egalité' ? 'draw' : 'loss'} />
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
                  <Avatar initials={tm.login.substring(0, 2).toUpperCase()} size={32} bg="var(--beige)" round />
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

        <PerformanceChart />

      </div>

      {/* ── Popup : choisir un match prévu ── */}
      <Modal open={matchPickOpen} onClose={() => setMatchPickOpen(false)} title={t('home.scheduledMatchesTitle')}>
        <div className={styles.matchPickList}>
          {upcomingMatches.map(m => (
            <button
              key={m.id}
              className={`${styles.matchPickItem} ${selectedMatch?.id === m.id ? styles.matchPickSelected : ''}`}
              onClick={() => { setSelectedMatch(m); setMatchPickOpen(false) }}
            >
              <div className={styles.matchPickVs}>vs <strong>{m.vs}</strong></div>
              <div className={styles.matchPickSub}>{m.format} · {m.mode} · {m.label}</div>
            </button>
          ))}
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
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background: matchError.startsWith('✅') ? '#22aa55' : '#ff4444', color:'#fff', padding:'10px 20px', borderRadius:8, zIndex:9999 }}>
          {matchError}
        </div>
      )}

      <AddMatchModal
        open={joinOpen}
        onClose={() => { setJoinOpen(false); setMatchError(null); setInitialOpponent(null) }}
        onConfirm={handleAddMatch}
        user={user}
        initialOpponent={initialOpponent}
        prevTeam={firstGlobalSlot ? {
          p1:     firstGlobalSlot.p1 || '?',
          p2:     firstGlobalSlot.p2 || '?',
          format: firstGlobalSlot.format || '1v1',
        } : null}
      />
    </Shell>
  )
}
