import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './Admin.module.css'

const adm = (url, opts = {}) =>
  fetch(url, { credentials: 'include', ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } })

/* ------------------------------------------------------------------ */
/*  Status serveur                                                     */
/* ------------------------------------------------------------------ */
function StatusMini() {
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
      <div className={styles.panelTitle}>Status serveur</div>
      {!data ? (
        <div className={styles.statusLoading}>Chargement...</div>
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
  const [seasons,  setSeasons]  = useState([])
  const [addOpen,  setAddOpen]  = useState(false)
  const [newName,  setNewName]  = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd,   setNewEnd]   = useState('')

  useEffect(() => {
    adm('/api/admin/seasons/').then(r => r.json()).then(setSeasons).catch(() => {})
  }, [])

  const active = seasons.find(s => s.status === 'ACTIVE')

  const handleAddSeason = async () => {
    if (!newName || !newStart || !newEnd) return
    const res = await adm('/api/admin/seasons/', {
      method: 'POST',
      body: JSON.stringify({ name: newName, start_date: newStart, end_date: newEnd }),
    })
    if (res.ok) {
      const created = await res.json()
      setSeasons(s => [{ id: created.id, name: created.name, status: 'UPCOMING', start_date: newStart, end_date: newEnd }, ...s])
      setNewName(''); setNewStart(''); setNewEnd('')
      setAddOpen(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Saisons
        <button className={styles.addSeasonBtn} onClick={() => setAddOpen(o => !o)}>+ Saison</button>
      </div>

      {addOpen && (
        <div className={styles.addSeasonForm}>
          <div className={styles.addSeasonField}>
            <label className={styles.addSeasonLabel}>Nom</label>
            <input className={styles.addSeasonInput} placeholder="Saison 4 - Été" value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
          <div className={styles.addSeasonField}>
            <label className={styles.addSeasonLabel}>Début</label>
            <input className={styles.addSeasonInput} type="date" value={newStart} onChange={e => setNewStart(e.target.value)} />
          </div>
          <div className={styles.addSeasonField}>
            <label className={styles.addSeasonLabel}>Fin</label>
            <input className={styles.addSeasonInput} type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
          </div>
          <div className={styles.addSeasonActions}>
            <button className={styles.seasonCancelBtn} onClick={() => setAddOpen(false)}>Annuler</button>
            <button className={styles.seasonOkBtn} onClick={handleAddSeason} disabled={!newName || !newStart || !newEnd}>Créer</button>
          </div>
        </div>
      )}

      {active ? (
        <div className={styles.seasonCurrent}>
          <span className={styles.seasonIcon}>📅</span>
          <div>
            <div className={styles.seasonLabel}>Saison en cours</div>
            <div className={styles.seasonName}>{active.name}</div>
          </div>
        </div>
      ) : (
        <div className={styles.seasonNext}>Aucune saison active.</div>
      )}

      {seasons.filter(s => s.status === 'UPCOMING').length > 0 && (
        <div className={styles.seasonNext}>
          A venir : {seasons.filter(s => s.status === 'UPCOMING').map(s => s.name).join(', ')}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Modal création tournoi                                             */
/* ------------------------------------------------------------------ */
function CreateTournamentModal({ onClose, onCreated }) {
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
      setError(d.detail || d.error || 'Erreur')
    }
  }

  if (done) return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalSuccess}>Tournoi créé</div>
        <button className={styles.modalClose} onClick={onClose}>Fermer</button>
      </div>
    </div>
  )

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>Créer un tournoi</div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Nom du tournoi</label>
          <input className={styles.modalInput} placeholder="Ex: Tournoi du jeudi #5" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Date et heure</label>
          <input className={styles.modalInput} type="datetime-local" value={dateStart} onChange={e => setDateStart(e.target.value)} />
        </div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Limite d'inscription</label>
          <input className={styles.modalInput} type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Nombre maximum de joueurs</label>
          <select className={styles.modalInput} value={maxPlayers} onChange={e => setMaxPlayers(e.target.value)}>
            {[16, 32].map(n => <option key={n} value={n}>{n} joueurs</option>)}
          </select>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.modalCancelBtn} onClick={onClose}>Annuler</button>
          <button className={styles.modalOkBtn} onClick={handleCreate}>Créer le tournoi</button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Modal ban                                                          */
/* ------------------------------------------------------------------ */
function BanModal({ player, onClose, onBanned }) {
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

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>Bannir {player.username}</div>

        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Type de ban</label>
          <select className={styles.modalInput} value={banType} onChange={e => setBanType(e.target.value)}>
            <option value="temporary">Temporaire</option>
            <option value="permanent">Définitif</option>
          </select>
        </div>

        {banType === 'temporary' && (
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Durée (en heures)</label>
            <input className={styles.modalInput} type="number" min="1" value={hours} onChange={e => setHours(Number(e.target.value))} />
            <div style={{ fontSize: 12, color: '#8a8475', marginTop: 4 }}>
              = {hours >= 24 ? `${Math.floor(hours / 24)}j ${hours % 24}h` : `${hours}h`}
            </div>
          </div>
        )}

        {banType === 'permanent' && (
          <div style={{ fontSize: 13, color: '#c0392b', fontWeight: 600, margin: '8px 0' }}>
            Le joueur ne pourra plus se connecter.
          </div>
        )}

        <div className={styles.modalActions}>
          <button className={styles.modalCancelBtn} onClick={onClose}>Annuler</button>
          <button className={styles.modalOkBtn} onClick={handleBan} disabled={saving} style={{ background: '#c0392b', color: '#fff' }}>
            {saving ? 'Bannissement...' : 'Confirmer le ban'}
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
        <div className={styles.modalTitle}>Modifier ELO — {player.username}</div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>ELO Solo (1v1)</label>
          <input className={styles.modalInput} type="number" value={eloSolo} onChange={e => setEloSolo(Number(e.target.value))} />
        </div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>ELO Team (2v2)</label>
          <input className={styles.modalInput} type="number" value={eloTeam} onChange={e => setEloTeam(Number(e.target.value))} />
        </div>
        <div className={styles.modalActions}>
          <button className={styles.modalCancelBtn} onClick={onClose}>Annuler</button>
          <button className={styles.modalOkBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Sauvegarde...' : 'Enregistrer'}
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

  const handleCancelTournament = async (t) => {
    if (!confirm(`Annuler le tournoi "${t.name}" ?`)) return
    const res = await adm(`/api/admin/tournaments/${t.id}/cancel/`, { method: 'POST' })
    if (res.ok) {
      setTournaments(prev => prev.map(x => x.id === t.id ? { ...x, status: 'CANCELLED' } : x))
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

  const statCards = stats ? [
    { icon: '👥', value: stats.nb_users,       label: 'Joueurs actifs' },
    { icon: '⚽', value: stats.nb_matches,      label: 'Matchs joués' },
    { icon: '🏆', value: stats.nb_tournaments,  label: 'Tournois' },
    { icon: '📅', value: stats.active_season || '—', label: 'Saison active' },
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
        <div className={styles.dashTitle}>Administration</div>
        <div className={styles.dashHeaderRight}>
          <span className={styles.dashAdmin}>Connecté en tant qu'admin</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>Déconnexion</button>
        </div>
      </header>

      <div className={styles.dashContent}>
        {/* Stats */}
        <div className={styles.statsRow}>
          {statCards.length === 0 ? (
            <div className={styles.emptyState}>Chargement des statistiques...</div>
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
              <div className={styles.panelTitle}>Matchs récents</div>
              {recentMatches.length === 0 ? (
                <div className={styles.emptyState}>Aucun match récent.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr><th>Joueurs</th><th>Score</th><th>Mode</th><th>Date</th></tr>
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
                            {m.is_ranked ? 'Classé' : 'Libre'}
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
                <span>Joueurs ({players.length})</span>
                <input
                  className={styles.searchInput}
                  type="text"
                  placeholder="Rechercher un joueur..."
                  value={playerSearch}
                  onChange={e => setPlayerSearch(e.target.value)}
                />
              </div>
              {players.length === 0 ? (
                <div className={styles.emptyState}>Aucun joueur enregistré.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr><th>Login</th><th>ELO 1v1</th><th>ELO 2v2</th><th>Statut</th><th>Actions</th></tr>
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
                            {p.is_banned ? (p.ban_permanent ? 'Ban déf.' : 'Ban temp.') : p.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td className={styles.tdActions}>
                          <button className={styles.miniBtn} onClick={() => setEditEloPlayer(p)}>ELO</button>
                          {p.is_banned ? (
                            <button className={styles.miniBtn} onClick={() => handleUnban(p)}>Débannir</button>
                          ) : (
                            <button
                              className={`${styles.miniBtn} ${styles.miniBtnDanger}`}
                              onClick={() => setBanPlayer(p)}
                            >
                              Bannir
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
              <div className={styles.panelTitle}>Tournois ({tournaments.length})</div>
              {tournaments.length === 0 ? (
                <div className={styles.emptyState}>Aucun tournoi.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr><th>Nom</th><th>Statut</th><th>Places</th><th>Date</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {tournaments.map(t => (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td>
                          <span className={`${styles.pill} ${
                            t.status === 'OPEN' ? styles.pillActif :
                            t.status === 'ONGOING' ? styles.pillCompet :
                            t.status === 'CANCELLED' ? styles.pillInactif :
                            styles.pillChill
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className={styles.tdScore}>{t.max_players}</td>
                        <td className={styles.tdDate}>{fmtDate(t.start_date)}</td>
                        <td className={styles.tdActions}>
                          {(t.status === 'OPEN' || t.status === 'ONGOING') && (
                            <button
                              className={`${styles.miniBtn} ${styles.miniBtnDanger}`}
                              onClick={() => handleCancelTournament(t)}
                            >
                              Annuler
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
              <div className={styles.panelTitle}>Actions rapides</div>
              <div className={styles.actions}>
                <button className={styles.actionBtn} onClick={() => setCreateOpen(true)}>🏆 Créer un tournoi</button>
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
        setError('Identifiant ou mot de passe incorrect.')
      }
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  if (loggedIn) return <Dashboard onLogout={() => setLoggedIn(false)} />

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate(-1)}>← Retour</button>

      <div className={styles.card}>
        <div className={styles.logo}>⚙️</div>
        <div className={styles.title}>Administration</div>
        <div className={styles.subtitle}>Accès réservé aux administrateurs</div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Identifiant</label>
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
            <label className={styles.label}>Mot de passe</label>
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
                aria-label={showPwd ? 'Cacher le mot de passe' : 'Voir le mot de passe'}
              >
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
