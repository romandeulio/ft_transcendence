import { useState, useEffect, useMemo } from 'react'
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
import ComparisonBarChart from '../components/ui/ComparisonBarChart'
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
  const [teammates_,    setTeammates]    = useState(() => {
    try { return JSON.parse(localStorage.getItem('favTeammates')) || [] } catch { return [] }
  })
  const [opponents,     setOpponents]    = useState([])
  const [feared,        setFeared]       = useState([])
  const [recentMatches, setRecentMatches] = useState([])
  const [seasons,       setSeasons]      = useState([])
  const [allPlayers,    setAllPlayers]   = useState([])
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
    if (!user?.username) return
    authFetch(`/api/performance/stats/?players=${encodeURIComponent(user.username)}`)
      .then(r => r.json())
      .then(data => {
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
        // Compter les gamelles du joueur sur tous ses matchs validés
        const totalGamelles = validated.reduce((sum, m) => {
          const asP1 = m.player1?.username === user.username || m.player1 === user.username
          return sum + (asP1 ? (m.gamelles_player1 || 0) : (m.gamelles_player2 || 0))
        }, 0)
        setStats(prev => ({ ...prev, gamelles: totalGamelles }))
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
              if (entry) setStats({ wins: entry.wins, losses: entry.losses, rank: entry.rank })
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

  const [newPartner,  setNewPartner]  = useState('')
  const [matchSearch, setMatchSearch] = useState('')
  const [matchPage,   setMatchPage]   = useState(0)
  const [photoUploadOpen,  setPhotoUploadOpen]  = useState(false)
  const [photoError,       setPhotoError]       = useState(null)

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

  const filteredMatches = recentMatches.filter(m =>
    m.vs.toLowerCase().includes(matchSearch.toLowerCase())
  )
  const totalMatchPages = Math.ceil(filteredMatches.length / MATCHES_PER_PAGE)
  const matchSlice = filteredMatches.slice(matchPage * MATCHES_PER_PAGE, matchPage * MATCHES_PER_PAGE + MATCHES_PER_PAGE)

  const addTeammate = () => {
    if (newPartner.trim() && teammates_.length < 5) {
      const next = [...teammates_, { login: newPartner.trim(), name: newPartner.trim() }]
      setTeammates(next)
      localStorage.setItem('favTeammates', JSON.stringify(next))
      setNewPartner('')
    }
  }

  const removeTeammate = (login) => {
    const next = teammates_.filter(tm => tm.login !== login)
    setTeammates(next)
    localStorage.setItem('favTeammates', JSON.stringify(next))
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
              onClick={() => { logout(); navigate('/login', { replace: true }) }}
            >
              {t('profile.logout')}
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
              right={<span className={styles.counter}>{t('profile.counter', { count: teammates_.length })}</span>}
            >
              <div className={styles.teammateNote}>
                {t('profile.teammateNote')}
              </div>
              {teammates_.length === 0 && (
                <div className={styles.noMatch}>{t('profile.noTeammate')}</div>
              )}
              {teammates_.map(tm => (
                <div key={tm.login} className={styles.teammateRow}>
                  <Avatar initials={tm.name} size={30} bg="var(--beige)" round src={avatarMap[tm.login] || null} />
                  <span className={styles.teammateName}>{tm.name}</span>
                  <button className={styles.planBtn} onClick={() => { setInitialTeammate(tm.login); setJoinOpen(true) }}>{t('profile.planGame')}</button>
                  <button className={styles.removeBtn} onClick={() => removeTeammate(tm.login)} title="Retirer">✕</button>
                </div>
              ))}
              {teammates_.length < 5 && (
                <div className={styles.addTeammate}>
                  <LoginInput
                    value={newPartner}
                    onChange={setNewPartner}
                    placeholder={t('profile.loginPlayerPlaceholder')}
                    players={allPlayers.filter(p => !teammates_.some(tm => tm.login === p.login))}
                  />
                  <button className={styles.addBtn} onClick={addTeammate}>{t('profile.addBtn')}</button>
                </div>
              )}
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

            <Card title="Comparaison joueurs">
              <ComparisonBarChart />
            </Card>
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
    </Shell>
  )
}
