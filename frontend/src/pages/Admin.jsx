import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styles from './Admin.module.css'

const adm = (url, opts = {}) =>
  fetch(url, { credentials: 'include', ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } })

/* ------------------------------------------------------------------ */
/*  Status serveur                                                     */
/* ------------------------------------------------------------------ */
function StatusMini() {
  const { t } = useTranslation()
  const [data, setData] = useState(null)

  const check = () =>
    fetch('/health')
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ status: 'error', postgres: 'error', redis: 'error' }))

  useEffect(() => { check(); const id = setInterval(check, 10000); return () => clearInterval(id) }, [])

  const rows = data
    ? [
        { label: 'Backend',    val: data.status   },
        { label: 'PostgreSQL', val: data.postgres  },
        { label: 'Redis',      val: data.redis     },
      ]
    : []

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>{t('admin.status_server')}</div>
      {!data ? (
        <div className={styles.statusLoading}>{t('admin.loading')}</div>
      ) : (
        <div className={styles.statusRows}>
          {rows.map(r => (
            <div key={r.label} className={styles.statusRow}>
              <span className={styles.statusLabel}>{r.label}</span>
              <span className={`${styles.statusBadge} ${r.val === 'ok' ? styles.statusOk : styles.statusKo}`}>
                {r.val === 'ok' ? '* OK' : '* KO'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Saisons                                                            */
/* ------------------------------------------------------------------ */
function SeasonPanel() {
  const { t } = useTranslation()
  const [seasons,  setSeasons]  = useState([])
  const [addOpen,  setAddOpen]  = useState(false)
  const [newName,  setNewName]  = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd,   setNewEnd]   = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  const reload = () => adm('/api/admin/seasons/').then(r => r.json()).then(setSeasons).catch(() => {})

  useEffect(() => { reload() }, [])

  const active   = seasons.find(s => s.status === 'ACTIVE')
  const upcoming = seasons.filter(s => s.status === 'UPCOMING')

  const handleAddSeason = async () => {
    if (!newName || !newStart || !newEnd) return
    const res = await adm('/api/admin/seasons/', {
      method: 'POST',
      body: JSON.stringify({ name: newName, start_date: newStart, end_date: newEnd }),
    })
    if (res.ok) {
      setNewName(''); setNewStart(''); setNewEnd('')
      setAddOpen(false)
      reload()
    }
  }

  const handleSeasonAction = async (seasonId, action) => {
    setActionLoading(seasonId + action)
    const res = await adm(`/api/admin/seasons/${seasonId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    })
    setActionLoading(null)
    if (res.ok) reload()
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t('admin.seasons_title')}
        <button className={styles.addSeasonBtn} onClick={() => setAddOpen(o => !o)}>{t('admin.btn_add_season')}</button>
      </div>

      {addOpen && (
        <div className={styles.addSeasonForm}>
          <div className={styles.addSeasonField}>
            <label className={styles.addSeasonLabel}>{t('admin.season_name_label')}</label>
            <input className={styles.addSeasonInput} placeholder={t('admin.season_name_ph')} value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
          <div className={styles.addSeasonField}>
            <label className={styles.addSeasonLabel}>{t('admin.season_start_label')}</label>
            <input className={styles.addSeasonInput} type="date" value={newStart} onChange={e => setNewStart(e.target.value)} />
          </div>
          <div className={styles.addSeasonField}>
            <label className={styles.addSeasonLabel}>{t('admin.season_end_label')}</label>
            <input className={styles.addSeasonInput} type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
          </div>
          <div className={styles.addSeasonActions}>
            <button className={styles.seasonCancelBtn} onClick={() => setAddOpen(false)}>{t('admin.btn_cancel')}</button>
            <button className={styles.seasonOkBtn} onClick={handleAddSeason} disabled={!newName || !newStart || !newEnd}>{t('admin.btn_create')}</button>
          </div>
        </div>
      )}

      {active ? (
        <div className={styles.seasonCurrent}>
          <span className={styles.seasonIcon}>📅</span>
          <div style={{ flex: 1 }}>
            <div className={styles.seasonLabel}>{t('admin.season_current')}</div>
            <div className={styles.seasonName}>{active.name}</div>
          </div>
          <button
            className={styles.seasonCancelBtn}
            style={{ marginLeft: 8, fontSize: 11 }}
            onClick={() => handleSeasonAction(active.id, 'finish')}
            disabled={actionLoading === active.id + 'finish'}
          >
            {t('admin.btn_end_season')}
          </button>
        </div>
      ) : (
        <div className={styles.seasonNext}>{t('admin.no_active_season')}</div>
      )}

      {upcoming.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {upcoming.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ flex: 1, color: 'var(--ink2)' }}>📋 {s.name}</span>
              <button
                className={styles.seasonOkBtn}
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => handleSeasonAction(s.id, 'activate')}
                disabled={actionLoading === s.id + 'activate'}
              >
                {actionLoading === s.id + 'activate' ? '...' : t('admin.btn_activate')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Modal création tournoi                                             */
/* ------------------------------------------------------------------ */
function CreateTournamentModal({ onClose, onCreated }) {
  const { t } = useTranslation()
  const [name,       setName]       = useState('')
  const [dateStart,  setDateStart]  = useState('')
  const [deadline,   setDeadline]   = useState('')
  const [maxPlayers, setMaxPlayers] = useState('16')
  const [done,       setDone]       = useState(false)
  const [error,      setError]      = useState('')

  const handleCreate = async () => {
    if (!name) return
    const res = await adm('/api/tournaments/', {
      method: 'POST',
      body: JSON.stringify({
        name,
        start_date: dateStart,
        deadline: deadline || null,
        max_players: parseInt(maxPlayers),
      }),
    })
    if (res.ok) {
      setDone(true)
      onCreated?.()
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.detail || d.error || t('admin.modal_tourn_err'))
    }
  }

  if (done) return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalSuccess}>{t('admin.modal_tourn_success')}</div>
        <button className={styles.modalClose} onClick={onClose}>{t('admin.modal_tourn_close')}</button>
      </div>
    </div>
  )

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>{t('admin.modal_create_title')}</div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>{t('admin.modal_tourn_name')}</label>
          <input className={styles.modalInput} placeholder={t('admin.modal_tourn_name_ph')} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>{t('admin.modal_tourn_date')}</label>
          <input className={styles.modalInput} type="datetime-local" value={dateStart} onChange={e => setDateStart(e.target.value)} />
        </div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>{t('admin.modal_tourn_deadline')}</label>
          <input className={styles.modalInput} type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>{t('admin.modal_tourn_max')}</label>
          <select className={styles.modalInput} value={maxPlayers} onChange={e => setMaxPlayers(e.target.value)}>
            {[16, 32].map(n => <option key={n} value={n}>{t('admin.modal_tourn_players', { n })}</option>)}
          </select>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.modalCancelBtn} onClick={onClose}>{t('admin.modal_tourn_cancel')}</button>
          <button className={styles.modalOkBtn} onClick={handleCreate}>{t('admin.modal_tourn_submit')}</button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Modal ban                                                          */
/* ------------------------------------------------------------------ */
function BanModal({ player, onClose, onBanned }) {
  const { t } = useTranslation()
  const [banType,  setBanType]  = useState('temporary')
  const [hours,    setHours]    = useState(24)
  const [saving,   setSaving]   = useState(false)

  const handleBan = async () => {
    setSaving(true)
    const body = banType === 'permanent'
      ? { permanent: true }
      : { duration_hours: hours }
    const res = await adm(`/api/admin/players/${player.id}/ban/`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      onBanned?.()
      onClose()
    }
  }

  const durDisplay = hours >= 24
    ? `${Math.floor(hours / 24)}${t('admin.day_abbr')} ${hours % 24}h`
    : `${hours}h`

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>{t('admin.modal_ban_title', { username: player.username })}</div>

        <div className={styles.modalField}>
          <label className={styles.modalLabel}>{t('admin.modal_ban_type')}</label>
          <select className={styles.modalInput} value={banType} onChange={e => setBanType(e.target.value)}>
            <option value="temporary">{t('admin.modal_ban_temp')}</option>
            <option value="permanent">{t('admin.modal_ban_perm')}</option>
          </select>
        </div>

        {banType === 'temporary' && (
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>{t('admin.modal_ban_duration')}</label>
            <input className={styles.modalInput} type="number" min="1" value={hours} onChange={e => setHours(Number(e.target.value))} />
            <div style={{ fontSize: 12, color: '#8a8475', marginTop: 4 }}>= {durDisplay}</div>
          </div>
        )}

        {banType === 'permanent' && (
          <div style={{ fontSize: 13, color: '#c0392b', fontWeight: 600, margin: '8px 0' }}>
            {t('admin.modal_ban_warning')}
          </div>
        )}

        <div className={styles.modalActions}>
          <button className={styles.modalCancelBtn} onClick={onClose}>{t('admin.modal_ban_cancel')}</button>
          <button className={styles.modalOkBtn} onClick={handleBan} disabled={saving} style={{ background: '#c0392b', color: '#fff' }}>
            {saving ? t('admin.modal_ban_doing') : t('admin.modal_ban_confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Modal modification ELO                                             */
/* ------------------------------------------------------------------ */
function EditEloModal({ player, onClose, onSaved }) {
  const { t } = useTranslation()
  const [eloSolo, setEloSolo] = useState(player.elo_solo)
  const [eloTeam, setEloTeam] = useState(player.elo_team)
  const [saving,  setSaving]  = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const res = await adm(`/api/admin/players/${player.id}/elo/`, {
      method: 'PATCH',
      body: JSON.stringify({ elo_solo: eloSolo, elo_team: eloTeam }),
    })
    setSaving(false)
    if (res.ok) {
      onSaved?.({ ...player, elo_solo: eloSolo, elo_team: eloTeam })
      onClose()
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>{t('admin.modal_elo_title', { username: player.username })}</div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>{t('admin.modal_elo_solo')}</label>
          <input className={styles.modalInput} type="number" value={eloSolo} onChange={e => setEloSolo(Number(e.target.value))} />
        </div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>{t('admin.modal_elo_team')}</label>
          <input className={styles.modalInput} type="number" value={eloTeam} onChange={e => setEloTeam(Number(e.target.value))} />
        </div>
        <div className={styles.modalActions}>
          <button className={styles.modalCancelBtn} onClick={onClose}>{t('admin.modal_elo_cancel')}</button>
          <button className={styles.modalOkBtn} onClick={handleSave} disabled={saving}>
            {saving ? t('admin.modal_elo_saving') : t('admin.modal_elo_save')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Dashboard principal                                                */
/* ------------------------------------------------------------------ */
function Dashboard({ onLogout }) {
  const { t } = useTranslation()
  const [createOpen,    setCreateOpen]    = useState(false)
  const [editEloPlayer, setEditEloPlayer] = useState(null)
  const [banPlayer,     setBanPlayer]     = useState(null)
  const [playerSearch,  setPlayerSearch]  = useState('')
  const [stats,         setStats]         = useState(null)
  const [recentMatches, setRecentMatches] = useState([])
  const [players,       setPlayers]       = useState([])
  const [tournaments,   setTournaments]   = useState([])

  const loadAll = () => {
    adm('/api/admin/stats/').then(r => r.json()).then(setStats).catch(() => {})
    adm('/api/admin/players/').then(r => r.json()).then(setPlayers).catch(() => {})
    adm('/api/admin/matches/').then(r => r.json()).then(setRecentMatches).catch(() => {})
    adm('/api/admin/tournaments/').then(r => r.json()).then(setTournaments).catch(() => {})
  }

  useEffect(loadAll, [])

  const handleUnban = async (p) => {
    const res = await adm(`/api/admin/players/${p.id}/unban/`, { method: 'POST' })
    if (res.ok) {
      setPlayers(prev => prev.map(u => u.id === p.id ? { ...u, is_banned: false, ban_permanent: false, banned_until: null } : u))
    }
  }

  const handleCancelTournament = async (tourn) => {
    if (!confirm(t('admin.confirm_cancel_tourn', { name: tourn.name }))) return
    const res = await adm(`/api/admin/tournaments/${tourn.id}/cancel/`, { method: 'POST' })
    if (res.ok) {
      setTournaments(prev => prev.map(x => x.id === tourn.id ? { ...x, status: 'CANCELLED' } : x))
    }
  }

  const handleEloSaved = () => {
    adm('/api/admin/players/').then(r => r.json()).then(setPlayers).catch(() => {})
  }

  const fmtDate = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const tournStatus = (status) => ({
    OPEN: t('admin.status_open'),
    ONGOING: t('admin.status_ongoing'),
    CANCELLED: t('admin.status_cancelled'),
  }[status] ?? t('admin.status_finished'))

  const statCards = stats ? [
    { icon: '👥', value: stats.nb_users,       label: t('admin.stat_players') },
    { icon: '⚽', value: stats.nb_matches,      label: t('admin.stat_matches') },
    { icon: '🏆', value: stats.nb_tournaments,  label: t('admin.stat_tournaments') },
    { icon: '📅', value: stats.active_season || '—', label: t('admin.stat_season') },
  ] : []

  const handleLogout = async () => {
    await adm('/api/admin/logout/', { method: 'POST' }).catch(() => {})
    onLogout()
  }

  return (
    <div className={styles.dashboard}>
      {createOpen && <CreateTournamentModal onClose={() => setCreateOpen(false)} onCreated={loadAll} />}
      {editEloPlayer && <EditEloModal player={editEloPlayer} onClose={() => setEditEloPlayer(null)} onSaved={handleEloSaved} />}
      {banPlayer && <BanModal player={banPlayer} onClose={() => setBanPlayer(null)} onBanned={loadAll} />}

      <header className={styles.dashHeader}>
        <div className={styles.dashTitle}>{t('admin.title')}</div>
        <div className={styles.dashHeaderRight}>
          <span className={styles.dashAdmin}>{t('admin.logged_as')}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>{t('admin.logout')}</button>
        </div>
      </header>

      <div className={styles.dashContent}>
        {/* Stats */}
        <div className={styles.statsRow}>
          {statCards.length === 0 ? (
            <div className={styles.emptyState}>{t('admin.loading_stats')}</div>
          ) : statCards.map(s => (
            <div key={s.label} className={styles.statCard}>
              <div className={styles.statIcon}>{s.icon}</div>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className={styles.panels}>
          <div className={styles.panelMain}>
            {/* Matchs récents */}
            <div className={styles.panel}>
              <div className={styles.panelTitle}>{t('admin.matches_title')}</div>
              {recentMatches.length === 0 ? (
                <div className={styles.emptyState}>{t('admin.matches_empty')}</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('admin.col_players')}</th>
                      <th>{t('admin.col_score')}</th>
                      <th>{t('admin.col_mode')}</th>
                      <th>{t('admin.col_date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMatches.map((m, i) => (
                      <tr key={i}>
                        <td>
                          {m.p1}
                          {m.is_ranked && m.elo_p1 != null && (
                            <span style={{ color: m.elo_p1 >= 0 ? '#27ae60' : '#c0392b', fontWeight: 600, fontSize: 12, marginLeft: 4 }}>
                              {m.elo_p1 >= 0 ? `+${m.elo_p1}` : m.elo_p1}
                            </span>
                          )}
                          <span className={styles.vs}> vs </span>
                          {m.p2}
                          {m.is_ranked && m.elo_p2 != null && (
                            <span style={{ color: m.elo_p2 >= 0 ? '#27ae60' : '#c0392b', fontWeight: 600, fontSize: 12, marginLeft: 4 }}>
                              {m.elo_p2 >= 0 ? `+${m.elo_p2}` : m.elo_p2}
                            </span>
                          )}
                        </td>
                        <td className={styles.tdScore}>{m.score}</td>
                        <td>
                          <span className={`${styles.pill} ${m.is_ranked ? styles.pillCompet : styles.pillChill}`}>
                            {m.is_ranked ? t('admin.pill_ranked') : t('admin.pill_free')}
                          </span>
                        </td>
                        <td className={styles.tdDate}>{fmtDate(m.played_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Joueurs */}
            <div className={styles.panel}>
              <div className={styles.panelTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span>{t('admin.players_title')} ({players.length})</span>
                <input
                  className={styles.searchInput}
                  type="text"
                  placeholder={t('admin.players_search')}
                  value={playerSearch}
                  onChange={e => setPlayerSearch(e.target.value)}
                />
              </div>
              {players.length === 0 ? (
                <div className={styles.emptyState}>{t('admin.players_empty')}</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('admin.col_login')}</th>
                      <th>{t('admin.col_elo1v1')}</th>
                      <th>{t('admin.col_elo2v2')}</th>
                      <th>{t('admin.col_status')}</th>
                      <th>{t('admin.col_actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.filter(p => {
                      if (!playerSearch) return true
                      const q = playerSearch.toLowerCase()
                      return p.username.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
                    }).map(p => (
                      <tr key={p.id}>
                        <td>
                          <div className={styles.playerCell}>
                            <div className={styles.playerInitials}>{p.username.slice(0, 2).toUpperCase()}</div>
                            {p.username}
                          </div>
                        </td>
                        <td className={styles.tdScore}>{p.elo_solo}</td>
                        <td className={styles.tdScore}>{p.elo_team}</td>
                        <td>
                          <span className={`${styles.pill} ${p.is_banned ? styles.pillInactif : p.is_active ? styles.pillActif : styles.pillInactif}`}>
                            {p.is_banned
                              ? (p.ban_permanent ? t('admin.status_ban_perm') : t('admin.status_ban_temp'))
                              : p.is_active ? t('admin.status_active') : t('admin.status_inactive')}
                          </span>
                        </td>
                        <td className={styles.tdActions}>
                          <button className={styles.miniBtn} onClick={() => setEditEloPlayer(p)}>{t('admin.btn_elo')}</button>
                          {p.is_banned ? (
                            <button className={styles.miniBtn} onClick={() => handleUnban(p)}>{t('admin.btn_unban')}</button>
                          ) : (
                            <button
                              className={`${styles.miniBtn} ${styles.miniBtnDanger}`}
                              onClick={() => setBanPlayer(p)}
                            >
                              {t('admin.btn_ban')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Tournois */}
            <div className={styles.panel}>
              <div className={styles.panelTitle}>{t('admin.tournaments_title')} ({tournaments.length})</div>
              {tournaments.length === 0 ? (
                <div className={styles.emptyState}>{t('admin.tournaments_empty')}</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('admin.col_name')}</th>
                      <th>{t('admin.col_status')}</th>
                      <th>{t('admin.col_spots')}</th>
                      <th>{t('admin.col_date')}</th>
                      <th>{t('admin.col_actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournaments.map(tourn => (
                      <tr key={tourn.id}>
                        <td>{tourn.name}</td>
                        <td>
                          <span className={`${styles.pill} ${
                            tourn.status === 'OPEN' ? styles.pillActif :
                            tourn.status === 'ONGOING' ? styles.pillCompet :
                            tourn.status === 'CANCELLED' ? styles.pillInactif :
                            styles.pillChill
                          }`}>
                            {tournStatus(tourn.status)}
                          </span>
                        </td>
                        <td className={styles.tdScore}>{tourn.max_players}</td>
                        <td className={styles.tdDate}>{fmtDate(tourn.start_date)}</td>
                        <td className={styles.tdActions}>
                          {(tourn.status === 'OPEN' || tourn.status === 'ONGOING') && (
                            <button
                              className={`${styles.miniBtn} ${styles.miniBtnDanger}`}
                              onClick={() => handleCancelTournament(tourn)}
                            >
                              {t('admin.btn_cancel_tourn')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className={styles.panelSide}>
            <div className={styles.panel}>
              <div className={styles.panelTitle}>{t('admin.quick_title')}</div>
              <div className={styles.actions}>
                <button className={styles.actionBtn} onClick={() => setCreateOpen(true)}>{t('admin.btn_create_tourn')}</button>
              </div>
            </div>
            <SeasonPanel />
            <StatusMini />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page Admin (login + dashboard)                                     */
/* ------------------------------------------------------------------ */
export default function Admin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [login,    setLogin]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [error,    setError]    = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ login, password }),
      })
      if (res.ok) {
        setLoggedIn(true)
      } else {
        setError(t('admin.err_credentials'))
      }
    } catch {
      setError(t('admin.err_server'))
    } finally {
      setLoading(false)
    }
  }

  if (loggedIn) return <Dashboard onLogout={() => setLoggedIn(false)} />

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate(-1)}>{t('admin.back')}</button>

      <div className={styles.card}>
        <div className={styles.logo}>⚙️</div>
        <div className={styles.title}>{t('admin.title')}</div>
        <div className={styles.subtitle}>{t('admin.subtitle')}</div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>{t('admin.login_label')}</label>
            <input
              className={styles.input}
              type="text"
              value={login}
              onChange={e => setLogin(e.target.value)}
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{t('admin.password_label')}</label>
            <div className={styles.pwdWrap}>
              <input
                className={styles.input}
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPwd(v => !v)}
                aria-label={showPwd ? t('admin.hide_pwd') : t('admin.show_pwd')}
              >
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? t('admin.signing_in') : t('admin.sign_in')}
          </button>
        </form>
      </div>
    </div>
  )
}
