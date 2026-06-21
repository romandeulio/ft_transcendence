import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import StatCard from '../components/ui/StatCard'
import Card from '../components/ui/Card'
import Avatar from '../components/ui/Avatar'
import Pill from '../components/ui/Pill'
import LoginInput from '../components/ui/LoginInput'
import AddMatchModal from '../components/ui/AddMatchModal'
import { getPlayerBadge } from '../utils/playerBadge'
import { useAuth } from '../context/AuthContext'
import { useQueue } from '../context/QueueContext'
import { useTranslation } from 'react-i18next'
import { authFetch, matchToRow } from '../services/api'
import { getFriends, addFriend, removeFriend } from '../services/friends'
import ComparisonBarChart from '../components/ui/ComparisonBarChart'
import StatsCardModal from '../components/ui/StatsCardModal'
import styles from './Profil.module.css'

async function uploadAvatar(file, user, login) {
  const formData = new FormData()
  formData.append('avatar', file)
  const res = await authFetch('/api/auth/avatar/', {
    method: 'POST',
    body: formData,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erreur upload')
  login({ ...user, avatar_url: data.avatar_url + '?v=' + Date.now() })
}

const MATCHES_PER_PAGE = 3

export default function Profil() {
  const { user, logout, login } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { queue, completedGameIds, sendInvite, joinQueue } = useQueue()

  const [joinOpen,         setJoinOpen]         = useState(false)
  const [initialOpponent,  setInitialOpponent]   = useState(null)
  const [initialTeammate,  setInitialTeammate]   = useState(null)
  const [matchError,       setMatchError]        = useState(null)

  const [stats,         setStats]        = useState({ wins: 0, losses: 0, rank: null, gamelles: 0, gamesPerMonth: null, streak: null })
  const [teammates_,    setTeammates]    = useState(() => getFriends())
  const [opponents,     setOpponents]    = useState([])
  const [feared,        setFeared]       = useState([])
  const [recentMatches, setRecentMatches] = useState([])
  const [seasons,       setSeasons]      = useState([])
  const [allPlayers,    setAllPlayers]   = useState([])
  const [onlineUsers,    setOnlineUsers]   = useState([])
  const [lastPlayedWith, setLastPlayedWith] = useState({})
  const [friendSearch,   setFriendSearch]  = useState('')
  const [friendSort,     setFriendSort]    = useState('az')
  const [friendPage,     setFriendPage]    = useState(0)
  const [addError,       setAddError]      = useState('')
  const FRIENDS_PER_PAGE = 8

  const avatarMap = useMemo(() =>
    Object.fromEntries(allPlayers.map(p => [p.login, p.avatar_url]).filter(([, v]) => v)),
  [allPlayers])

  useEffect(() => {
    if (!user?.username) return
    authFetch('/api/auth/users/')
      .then(r => r.json())
      .then(data => setAllPlayers(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [user?.username])

  useEffect(() => {
    const onChanged = () => setTeammates(getFriends())
    window.addEventListener('favTeammatesChanged', onChanged)
    return () => window.removeEventListener('favTeammatesChanged', onChanged)
  }, [])

  useEffect(() => {
    if (!user?.username) return
    const fetchOnline = () =>
      authFetch('/api/auth/online-users/')
        .then(r => r.json())
        .then(data => setOnlineUsers(Array.isArray(data) ? data : []))
        .catch(() => {})
    fetchOnline()
    const id = setInterval(fetchOnline, 30000)
    return () => clearInterval(id)
  }, [user?.username])

  useEffect(() => {
    if (!user?.username) return
    authFetch(`/api/performance/stats/?players=${encodeURIComponent(user.username)}`)
      .then(r => { console.log('[STATS] status:', r.status); return r.json() })
      .then(data => {
        console.log('[STATS] data:', JSON.stringify(data))
        if (Array.isArray(data) && data.length > 0) {
          const s = data[0]
          setStats(prev => ({
            ...prev,
            wins:          s.total_wins,
            losses:        s.total_losses,
            gamelles:      s.total_gamelles,
            gamesPerMonth: s.matches_per_month,
            streak:        s.series_wins,
          }))
        }
      })
      .catch(console.error)
  }, [user?.username])

  useEffect(() => {
    if (!user?.username) return

    // Matchs du joueur
    authFetch(`/api/matches/?player=${user.username}`)
      .then(r => r.json())
      .then(data => {
        const validated = (Array.isArray(data) ? data : (data?.results ?? []))
          .filter(m => m.status === 'VALIDATED')
          .sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
        const rows = validated.map(m => matchToRow(m, user.username))
        setRecentMatches(rows)
        // Dernière date jouée avec chaque coéquipier (matchs TEAM seulement)
        const playedWith = {}
        validated.forEach(m => {
          if (m.match_type !== 'TEAM') return
          const onTeam1 = m.player1 === user.username || m.player1_teammate === user.username
          const teammate = onTeam1
            ? (m.player1_teammate === user.username ? m.player1 : m.player1_teammate)
            : (m.player2_teammate === user.username ? m.player2 : m.player2_teammate)
          if (teammate && !playedWith[teammate]) playedWith[teammate] = m.played_at
        })
        setLastPlayedWith(playedWith)
      })
      .catch(console.error)

    // Saisons + classement du joueur
    authFetch('/api/seasons/')
      .then(r => r.json())
      .then(raw => {
        const allSeasons = Array.isArray(raw) ? raw : (raw?.results ?? [])
        if (!allSeasons.length) return
        const active = allSeasons.find(s => s.status === 'ACTIVE')
        if (active) {
          authFetch(`/api/seasons/${active.id}/ranking/?type=solo`)
            .then(r => r.json())
            .then(ranking => {
              const entry = ranking.find(e => e.username === user.username)
              if (entry) setStats(prev => ({ ...prev, wins: entry.wins, losses: entry.losses, rank: entry.rank }))
            })
            .catch(console.error)
        }
        const mapped = allSeasons
          .filter(s => s.status === 'FINISHED' || s.status === 'ACTIVE')
          .map(s => {
            const champion = s.rewards?.find(r => r.ranking_type === 'Solo' && r.tier === 'Top 1')
            const isMe = s.status === 'ACTIVE'
            return { season: s.id, name: s.name, prize: isMe ? 'ongoing' : (champion?.player === user.username ? 'gold' : null), rank: '—' }
          })
        setSeasons(mapped)
      })
      .catch(console.error)
  }, [user?.username])

  useEffect(() => {
    if (!recentMatches.length) return
    const stats = {}
    recentMatches.forEach(m => {
      const opp = m.vs.split(' & ')[0]
      if (!stats[opp]) stats[opp] = { wins: 0, total: 0 }
      stats[opp].total++
      if (m.result === 'Victoire') stats[opp].wins++
    })
    const entries = Object.entries(stats)
    setOpponents(
      entries
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 3)
        .map(([name, s]) => ({ login: name, name, winrate: Math.round(s.wins / s.total * 100) }))
    )
    setFeared(
      entries
        .sort((a, b) => (a[1].wins / a[1].total) - (b[1].wins / b[1].total))
        .slice(0, 3)
        .map(([name, s]) => ({ login: name, name, lossrate: Math.round((s.total - s.wins) / s.total * 100) }))
    )
  }, [recentMatches])

  const filteredFriends = useMemo(() => {
    let list = [...teammates_]
    if (friendSearch.trim()) {
      const q = friendSearch.toLowerCase()
      list = list.filter(tm => tm.login.toLowerCase().includes(q))
    }
    if (friendSort === 'az')       list.sort((a, b) => a.login.localeCompare(b.login))
    else if (friendSort === 'za')  list.sort((a, b) => b.login.localeCompare(a.login))
    else if (friendSort === 'online') list.sort((a, b) =>
      (onlineUsers.includes(b.login) ? 1 : 0) - (onlineUsers.includes(a.login) ? 1 : 0)
    )
    else if (friendSort === 'recent') list.sort((a, b) => {
      const ta = lastPlayedWith[a.login] ? new Date(lastPlayedWith[a.login]).getTime() : 0
      const tb = lastPlayedWith[b.login] ? new Date(lastPlayedWith[b.login]).getTime() : 0
      return tb - ta
    })
    return list
  }, [teammates_, friendSearch, friendSort, onlineUsers, lastPlayedWith])

  const friendTotalPages = Math.ceil(filteredFriends.length / FRIENDS_PER_PAGE)
  const friendSlice = filteredFriends.slice(friendPage * FRIENDS_PER_PAGE, (friendPage + 1) * FRIENDS_PER_PAGE)

  const [newPartner,    setNewPartner]   = useState('')
  const [matchSearch,   setMatchSearch]  = useState('')
  const [matchFilters,  setMatchFilters] = useState({ wins: false, losses: false, low: false })
  const [compareChecked, setCompareChecked] = useState([])
  const [compareTarget,  setCompareTarget]  = useState(null)
  const comparisonRef = useRef(null)
  const [matchPage,   setMatchPage]   = useState(0)
  const [photoUploadOpen,  setPhotoUploadOpen]  = useState(false)
  const [photoError,       setPhotoError]       = useState(null)
  const [statsCardOpen,    setStatsCardOpen]    = useState(false)

  const handlePlanMatch = async ({ mode, format, redPlayers, bluePlayers, takeWin }) => {
    setMatchError(null)
    const matchType = format === '2v2' ? 'TEAM' : 'SOLO'
    const isRanked  = mode === 'compet'
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
    const opponent = takeWin ? null : (
      bluePlayers[0] === user?.username ? (redPlayers[0] || null) : (bluePlayers[0] || null)
    )
    const parentSlotId = takeWin
      ? (queue.filter(s => s.match_type === matchType && !completedGameIds.has(s.id) && !completedGameIds.has(s._localId)).at(-1)?.id || null)
      : null
    const baseSlot = {
      p1: user?.username, p2: opponent,
      player1: body.player1, player2: body.player2 || null,
      player1_teammate: body.player1_teammate || null,
      player2_teammate: body.player2_teammate || null,
      match_type: matchType, is_ranked: isRanked,
      format: format === '2v2' ? '2v2' : '1v1',
      takeWin: takeWin || false, createdAt: Date.now(),
      ...(parentSlotId ? { parentSlotId } : {}),
      ...(matchType === 'TEAM' ? {
        team1: [body.player1, body.player1_teammate].filter(Boolean),
        team2: [body.player2, body.player2_teammate].filter(Boolean),
      } : {}),
    }
    if (opponent && !takeWin) {
      const localSlot = { ...baseSlot, _localId: crypto.randomUUID() }
      const inviteTargets = format === '2v2'
        ? [...bluePlayers, ...redPlayers].filter(p => p && p !== user?.username)
        : [opponent]
      sendInvite(inviteTargets, localSlot)
      setMatchError(t('invite.sent', { player: inviteTargets.join(', ') }))
      return
    }
    if (takeWin && matchType === 'TEAM') {
      const teammate = body.player1_teammate || body.player2_teammate
      if (teammate) {
        const localSlot = { ...baseSlot, _localId: crypto.randomUUID() }
        sendInvite([teammate], localSlot)
        setMatchError(t('invite.sent', { player: teammate }))
        return
      }
    }
    if (takeWin) { joinQueue(baseSlot); return }
    const resv = await authFetch('/api/planning/reservation/', { method: 'POST', body: JSON.stringify(body) })
    if (resv.ok) {
      const resvData = await resv.json().catch(() => ({}))
      setMatchError('✅ Table réservée ! À vous de jouer.')
      joinQueue({ ...baseSlot, reservationId: resvData.id, type: 'live' })
      return
    }
    const resvErr = await resv.json().catch(() => ({}))
    setMatchError(Object.values(resvErr).flat().join(' ') || 'Erreur lors de la réservation.')
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError(null)
    try {
      await uploadAvatar(file, user, login)
      setPhotoUploadOpen(false)
    } catch (err) {
      setPhotoError(err.message)
    }
  }

  const filteredMatches = recentMatches.filter(m => {
    if (matchSearch && !m.vs.toLowerCase().includes(matchSearch.toLowerCase())) return false
    if (matchFilters.wins   && m.result !== 'Victoire')  return false
    if (matchFilters.losses && m.result !== 'Défaite')   return false
    if (matchFilters.low) {
      const myScore = parseInt(m.score.split('-')[0], 10)
      if (isNaN(myScore) || myScore >= 5) return false
    }
    return true
  })
  const totalMatchPages = Math.ceil(filteredMatches.length / MATCHES_PER_PAGE)
  const matchSlice = filteredMatches.slice(matchPage * MATCHES_PER_PAGE, matchPage * MATCHES_PER_PAGE + MATCHES_PER_PAGE)

  const addTeammate = () => {
    const login = newPartner.trim()
    if (!login) return
    if (login === user?.username) {
      setAddError("Tu ne peux pas t'ajouter toi-même.")
      return
    }
    if (!allPlayers.some(p => p.login === login)) {
      setAddError('Joueur introuvable dans la base de données.')
      return
    }
    setAddError('')
    if (addFriend(login)) {
      setTeammates(getFriends())
      setNewPartner('')
      authFetch('/api/auth/friend-notify/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: login }) }).catch(() => {})
    }
  }

  const removeTeammate = (login) => {
    removeFriend(login)
    setTeammates(getFriends())
  }

  const myLogin = user?.username ?? '—'
  const myWins  = stats.wins
  const myElo   = user?.elo_solo ?? '—'
  const badge   = getPlayerBadge(myWins)

  return (
    <Shell>
      <Topbar title={t('topbar.profile')} titleSize={30} />

      {photoUploadOpen && (
        <div className={styles.photoOverlay} onClick={() => setPhotoUploadOpen(false)}>
          <div className={styles.photoDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.photoTitle}>{t('profile.profilePhoto')}</div>
            <label className={styles.photoDropZone}>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
              <span className={styles.photoDropIcon}>📷</span>
              <span>{t('profile.clickToChoose')}</span>
            </label>
            {user?.avatar_url && (
              <div className={styles.photoPreviewRow}>
                <img src={user.avatar_url} className={styles.photoPreview} alt="preview" />
              </div>
            )}
            {photoError && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{photoError}</div>}
            <div className={styles.photoDialogFooter}>
              <button className={styles.photoCloseBtn} onClick={() => setPhotoUploadOpen(false)}>{t('profile.close')}</button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.content}>
        <div className={styles.heroCard}>
          <div className={styles.heroLeft}>
            <div className={styles.avatarWrap}>
              <div className={styles.avatarStack}>
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      className={styles.avatarPhoto}
                      alt="avatar"
                      onClick={() => setPhotoUploadOpen(true)}
                    />
                  ) : (
                    <div
                      onClick={() => setPhotoUploadOpen(true)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Avatar
                        initials={myLogin[0]?.toUpperCase() ?? '?'}
                        size={66}
                        bg="var(--color-primary)"
                        color="#fff"
                        round
                      />
                    </div>
                  )}
                <button className={styles.photoUploadBtn} onClick={() => setPhotoUploadOpen(true)}>{t('profile.photo')}</button>
              </div>
            </div>
            <div className={styles.heroInfo}>
              <div className={styles.heroName}>{myLogin}</div>
              <div className={styles.heroBadges}>
                {user?.rank != null && <Pill label={`#${user.rank} Classement`} type="orange" />}
                {myWins > 0 && <Pill label={`${myWins} Victoires`} type="win" />}
              </div>
              <span className={styles.playerTitleBadge} style={{ background: badge.bg, color: badge.color }}>
                {t('profile.myBadge', { label: badge.label })}
              </span>
            </div>
          </div>
          <div className={styles.heroElo}>
            <div className={styles.eloVal}>{myElo}</div>
            <div className={styles.eloDelta}>ELO</div>
            <button
              className={styles.logoutBtn}
              onClick={() => setStatsCardOpen(true)}
            >
              My Stats Card
            </button>
          </div>
        </div>

        <div className={styles.statsGrid}>
          <StatCard color="var(--orange-pale)" label={t('profile.ratio')}         value={stats.wins + stats.losses > 0 ? `${Math.round(stats.wins / (stats.wins + stats.losses) * 100)}%` : '—'} sub={t('profile.winLoss')} />
          <StatCard color="var(--yellow-pale)" label={t('profile.streak')}        value={stats.streak ?? '—'} sub={t('profile.streakSub')} />
          <StatCard color="var(--green-pale)"  label={t('profile.tokensWon')}     value={user?.wallet_tokens ?? '—'} sub={t('profile.tokensSub')} />
          <StatCard color="var(--red-pale)"    label={t('profile.gamelles')}      value={stats.gamelles ?? '—'} sub={t('profile.gamellesSub')} />
          <StatCard color="var(--beige)"       label={t('profile.gamesPerMonth')} value={stats.gamesPerMonth ?? '—'} sub={t('profile.gamesPerMonthSub')} />
        </div>

        <div className={styles.grid}>
          <div className={styles.leftCol}>
            <Card
              title={t('profile.favoriteTeammates')}
              right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {compareChecked.length > 0 && (
                    <button
                      className={styles.compareBtn}
                      onClick={() => {
                        setCompareTarget(compareChecked.map(l => ({ login: l, display: l })))
                        setCompareChecked([])
                        setTimeout(() => comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
                      }}
                    >
                      Comparer ({compareChecked.length})
                    </button>
                  )}
                  <span className={styles.counter}>{teammates_.length}</span>
                </div>
              }
            >
              {teammates_.length > 0 && (
                <div className={styles.friendControls}>
                  <input
                    className={styles.friendSearch}
                    type="text"
                    placeholder="Rechercher un ami…"
                    value={friendSearch}
                    onChange={e => { setFriendSearch(e.target.value); setFriendPage(0) }}
                  />
                  <select
                    className={styles.friendSort}
                    value={friendSort}
                    onChange={e => { setFriendSort(e.target.value); setFriendPage(0) }}
                  >
                    <option value="az">A → Z</option>
                    <option value="za">Z → A</option>
                    <option value="online">En ligne d'abord</option>
                    <option value="recent">Récemment joué</option>
                  </select>
                </div>
              )}

              <div className={styles.friendList}>
                {filteredFriends.length === 0 && (
                  <div className={styles.noMatch}>{teammates_.length === 0 ? t('profile.noTeammate') : 'Aucun résultat.'}</div>
                )}
                {friendSlice.map(tm => {
                  const isChecked = compareChecked.includes(tm.login)
                  const maxReached = compareChecked.length >= 4 && !isChecked
                  return (
                    <div key={tm.login} className={`${styles.teammateRow} ${isChecked ? styles.teammateRowChecked : ''}`}>
                      <input
                        type="checkbox"
                        className={styles.compareCheck}
                        checked={isChecked}
                        disabled={maxReached}
                        onChange={() => setCompareChecked(prev =>
                          isChecked ? prev.filter(l => l !== tm.login) : [...prev, tm.login]
                        )}
                      />
                      <div className={styles.avatarOnlineWrap}>
                        <Avatar initials={tm.name} size={30} bg="var(--beige)" round src={avatarMap[tm.login] || null} />
                        <span className={onlineUsers.includes(tm.login) ? styles.onlineDot : styles.offlineDot} />
                      </div>
                      <span className={styles.teammateName}>{tm.name}</span>
                      <button className={styles.planBtn} onClick={() => { setInitialTeammate(tm.login); setJoinOpen(true) }}>{t('profile.planGame')}</button>
                      <button className={styles.removeBtn} onClick={() => removeTeammate(tm.login)} title="Retirer">✕</button>
                    </div>
                  )
                })}
              </div>

              {friendTotalPages > 1 && (
                <div className={styles.friendPagination}>
                  <button className={styles.pageNavBtn} onClick={() => setFriendPage(p => Math.max(0, p - 1))} disabled={friendPage === 0}>←</button>
                  {Array.from({ length: friendTotalPages }, (_, i) => (
                    <button
                      key={i}
                      className={`${styles.pageNumBtn} ${i === friendPage ? styles.pageNumActive : ''}`}
                      onClick={() => setFriendPage(i)}
                    >{i + 1}</button>
                  ))}
                  <button className={styles.pageNavBtn} onClick={() => setFriendPage(p => Math.min(friendTotalPages - 1, p + 1))} disabled={friendPage === friendTotalPages - 1}>→</button>
                </div>
              )}

              <div className={styles.addTeammate}>
                  <div className={styles.addTeammateDivider} />
                  <div className={styles.addTeammateRow}>
                    <LoginInput
                      value={newPartner}
                      onChange={v => { setNewPartner(v); setAddError('') }}
                      placeholder={t('profile.loginPlayerPlaceholder')}
                      players={allPlayers.filter(p => p.login !== user?.username && !teammates_.some(tm => tm.login === p.login))}
                    />
                    <button className={styles.addBtn} onClick={addTeammate}>{t('profile.addBtn')}</button>
                  </div>
                  {addError && <div className={styles.addError}>{addError}</div>}
                </div>
            </Card>

            <div className={styles.divider} />

            <Card title={t('profile.frequentOpponents')}>
              {opponents.length === 0 && (
                <div className={styles.noMatch}>{t('profile.noData')}</div>
              )}
              {opponents.map(o => (
                <div key={o.login} className={styles.opponentRow}>
                  <Avatar initials={o.name} size={28} bg="var(--beige)" round src={avatarMap[o.login] || null} />
                  <span className={styles.opponentName}>{o.name}</span>
                  <span className={styles.winrate}>{t('profile.winrate', { pct: o.winrate })}</span>
                </div>
              ))}
            </Card>

            <div className={styles.divider} />

            <Card title={t('profile.fearOpponents')}>
              <div className={styles.fearedNote}>{t('profile.fearNote')}</div>
              {feared.length === 0 && (
                <div className={styles.noMatch}>{t('profile.noData')}</div>
              )}
              {feared.map(o => (
                <div key={o.login} className={styles.opponentRow}>
                  <Avatar initials={o.name} size={28} bg="var(--red-pale)" round src={avatarMap[o.login] || null} />
                  <span className={styles.opponentName}>{o.name}</span>
                  <span className={styles.lossrate}>{t('profile.lossrate', { pct: o.lossrate })}</span>
                </div>
              ))}
            </Card>
          </div>

          <div className={styles.rightCol}>
            <Card title={t('profile.myMatches')}>
              <div className={styles.matchSearch}>
                <input
                  className={styles.searchInput}
                  placeholder={t('profile.searchLogin')}
                  value={matchSearch}
                  onChange={e => { setMatchSearch(e.target.value); setMatchPage(0) }}
                />
                <div className={styles.matchFilters}>
                  {[
                    { key: 'wins',   label: 'Victoires' },
                    { key: 'losses', label: 'Défaites' },
                    { key: 'low',    label: '< 5 pts marqués' },
                  ].map(f => (
                    <label key={f.key} className={`${styles.filterChip} ${matchFilters[f.key] ? styles.filterChipOn : ''}`}>
                      <input
                        type="checkbox"
                        checked={matchFilters[f.key]}
                        onChange={() => { setMatchFilters(p => ({ ...p, [f.key]: !p[f.key] })); setMatchPage(0) }}
                        style={{ display: 'none' }}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
              {matchSlice.map((m, i) => (
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
              {filteredMatches.length === 0 && (
                <div className={styles.noMatch}>{t('profile.noMatch')}</div>
              )}
              {totalMatchPages > 1 && (
                <div className={styles.matchNav}>
                  <button className={styles.navBtn} onClick={() => setMatchPage(p => Math.max(0, p - 1))} disabled={matchPage === 0}>←</button>
                  <span className={styles.navInfo}>{matchPage + 1} / {totalMatchPages}</span>
                  <button className={styles.navBtn} onClick={() => setMatchPage(p => Math.min(totalMatchPages - 1, p + 1))} disabled={matchPage === totalMatchPages - 1}>→</button>
                </div>
              )}
            </Card>

            <Card title={t('profile.seasonHistory')}>
              {seasons.length === 0 && (
                <div className={styles.noMatch}>{t('profile.noSeason')}</div>
              )}
              {seasons.map(s => (
                <div key={s.season} className={styles.seasonRow}>
                  <span className={styles.seasonName}>{t('profile.seasonLabel', { num: s.season })}</span>
                  <span className={styles.seasonRank}>{s.rank}</span>
                  {s.prize === 'ongoing'
                    ? <Pill label={t('profile.ongoing')} type="orange" />
                    : s.prize === 'gold'
                    ? <Pill label={t('profile.champion')} type="gold" />
                    : <span className={styles.noPrize}>—</span>
                  }
                </div>
              ))}
            </Card>

            <div ref={comparisonRef}>
              <Card title="Comparaison joueurs">
                <ComparisonBarChart externalSelected={compareTarget} />
              </Card>
            </div>
          </div>
        </div>
      </div>

      <AddMatchModal
        open={joinOpen}
        onClose={() => { setJoinOpen(false); setMatchError(null); setInitialOpponent(null); setInitialTeammate(null) }}
        onConfirm={handlePlanMatch}
        user={user}
        initialOpponent={initialOpponent}
        initialTeammate={initialTeammate}
      />

      {matchError && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background: matchError.startsWith('✅') ? '#22aa55' : '#ff4444', color:'#fff', padding:'10px 20px', borderRadius:8, zIndex:9999, display:'flex', alignItems:'center', gap:12 }}>
          <span>{matchError}</span>
          <button onClick={() => setMatchError(null)} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer', fontSize:18, lineHeight:1, padding:0, opacity:0.8 }}>×</button>
        </div>
      )}

      {statsCardOpen && (
        <StatsCardModal
          onClose={() => setStatsCardOpen(false)}
          knownStats={{
            login:         user?.username,
            total_matches: (stats.wins ?? 0) + (stats.losses ?? 0),
            best_streak:   stats.streak,
            max_tokens:    user?.wallet_tokens,
          }}
        />
      )}
    </Shell>
  )
}
