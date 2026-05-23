import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './Admin.module.css'

const STATS = [
  { label: 'Joueurs actifs',      value: '24',     icon: '👥' },
  { label: 'Matchs cette semaine', value: '147',   icon: '🏓' },
  { label: 'Tournois créés',      value: '3',      icon: '🏆' },
  { label: 'Jetons distribués',   value: '18 500', icon: '🪙' },
]

const RECENT_MATCHES = [
  { p1: 'ltcherp',  p2: 'thais',    score: '10 – 7',  date: '23/05', mode: 'Compét' },
  { p1: 'roman',    p2: 'sydney',   score: '8 – 10',  date: '22/05', mode: 'Compét' },
  { p1: 'amorin',   p2: 'jblanc',   score: '10 – 5',  date: '22/05', mode: 'Chill'  },
  { p1: 'coraline', p2: 'kperez',   score: '10 – 9',  date: '21/05', mode: 'Compét' },
  { p1: 'ltcherp',  p2: 'roman',    score: '7 – 10',  date: '21/05', mode: 'Compét' },
]

const PLAYERS = [
  { initials: 'LT', login: 'ltcherp',  elo: 1420, status: 'Actif'   },
  { initials: 'SY', login: 'sydney',   elo: 1385, status: 'Actif'   },
  { initials: 'TH', login: 'thais',    elo: 1360, status: 'Actif'   },
  { initials: 'RO', login: 'roman',    elo: 1340, status: 'Inactif' },
  { initials: 'AM', login: 'amorin',   elo: 1310, status: 'Actif'   },
]

const SEASONS = ['Saison 1 — Automne 2025', 'Saison 2 — Hiver 2026', 'Saison 3 — Printemps 2026']

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
        <div className={styles.statusLoading}>Chargement…</div>
      ) : (
        <div className={styles.statusRows}>
          {rows.map(r => (
            <div key={r.label} className={styles.statusRow}>
              <span className={styles.statusLabel}>{r.label}</span>
              <span className={`${styles.statusBadge} ${r.val === 'ok' ? styles.statusOk : styles.statusKo}`}>
                {r.val === 'ok' ? '● OK' : '● KO'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SeasonPanel() {
  const [seasons,    setSeasons]    = useState(SEASONS)
  const [current,    setCurrent]    = useState(2)
  const [confirm,    setConfirm]    = useState(false)
  const [updated,    setUpdated]    = useState(false)
  const [addOpen,    setAddOpen]    = useState(false)
  const [newNum,     setNewNum]     = useState('')
  const [newStart,   setNewStart]   = useState('')
  const [newEnd,     setNewEnd]     = useState('')

  const handleNext = () => {
    if (current < seasons.length - 1) { setCurrent(c => c + 1); setConfirm(false); setUpdated(true) }
  }

  const handleAddSeason = () => {
    if (!newNum || !newStart || !newEnd) return
    const label = `Saison ${newNum} — à partir du ${new Date(newStart).toLocaleDateString('fr-FR')}`
    setSeasons(s => [...s, label])
    setNewNum(''); setNewStart(''); setNewEnd('')
    setAddOpen(false)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Changer de saison
        <button className={styles.addSeasonBtn} onClick={() => setAddOpen(o => !o)}>+ Saison</button>
      </div>

      {addOpen && (
        <div className={styles.addSeasonForm}>
          <div className={styles.addSeasonField}>
            <label className={styles.addSeasonLabel}>Numéro</label>
            <input className={styles.addSeasonInput} type="number" min="1" placeholder="4" value={newNum} onChange={e => setNewNum(e.target.value)} />
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
            <button className={styles.seasonOkBtn} onClick={handleAddSeason} disabled={!newNum || !newStart || !newEnd}>Créer</button>
          </div>
        </div>
      )}

      <div className={styles.seasonCurrent}>
        <span className={styles.seasonIcon}>📅</span>
        <div>
          <div className={styles.seasonLabel}>Saison en cours</div>
          <div className={styles.seasonName}>{seasons[current]}</div>
        </div>
      </div>
      {updated && <div className={styles.seasonUpdated}>✓ Saison mise à jour</div>}
      {current < seasons.length - 1 ? (
        <>
          <div className={styles.seasonNext}>Prochaine : <strong>{seasons[current + 1]}</strong></div>
          {!confirm ? (
            <button className={styles.seasonBtn} onClick={() => setConfirm(true)}>
              Passer à la saison suivante →
            </button>
          ) : (
            <div className={styles.seasonConfirm}>
              <div className={styles.seasonConfirmText}>
                Confirmer le passage à <strong>{seasons[current + 1]}</strong> ?<br/>
                <span className={styles.seasonWarn}>Les ELO seront archivés et remis à zéro.</span>
              </div>
              <div className={styles.seasonConfirmBtns}>
                <button className={styles.seasonCancelBtn} onClick={() => setConfirm(false)}>Annuler</button>
                <button className={styles.seasonOkBtn} onClick={handleNext}>Confirmer ✓</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.seasonNext}>Aucune saison suivante configurée.</div>
      )}
    </div>
  )
}

function CreateTournamentModal({ onClose }) {
  const [name,       setName]       = useState('')
  const [dateStart,  setDateStart]  = useState('')
  const [deadline,   setDeadline]   = useState('')
  const [maxPlayers, setMaxPlayers] = useState('16')
  const [done,       setDone]       = useState(false)

  if (done) return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalSuccess}>✓ Tournoi créé</div>
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
            {[8, 16, 32, 64].map(n => <option key={n} value={n}>{n} joueurs</option>)}
          </select>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.modalCancelBtn} onClick={onClose}>Annuler</button>
          <button className={styles.modalOkBtn} onClick={() => name && setDone(true)}>Créer le tournoi</button>
        </div>
      </div>
    </div>
  )
}

function Dashboard({ onLogout }) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className={styles.dashboard}>
      {createOpen && <CreateTournamentModal onClose={() => setCreateOpen(false)} />}
      <header className={styles.dashHeader}>
        <div className={styles.dashTitle}>Administration</div>
        <div className={styles.dashHeaderRight}>
          <span className={styles.dashAdmin}>Connecté en tant qu'admin</span>
          <button className={styles.logoutBtn} onClick={onLogout}>Déconnexion</button>
        </div>
      </header>

      <div className={styles.dashContent}>
        <div className={styles.statsRow}>
          {STATS.map(s => (
            <div key={s.label} className={styles.statCard}>
              <div className={styles.statIcon}>{s.icon}</div>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className={styles.panels}>
          <div className={styles.panelMain}>
            <div className={styles.panel}>
              <div className={styles.panelTitle}>Matchs récents</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Joueurs</th>
                    <th>Score</th>
                    <th>Mode</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {RECENT_MATCHES.map((m, i) => (
                    <tr key={i}>
                      <td>{m.p1} <span className={styles.vs}>vs</span> {m.p2}</td>
                      <td className={styles.tdScore}>{m.score}</td>
                      <td>
                        <span className={`${styles.pill} ${m.mode === 'Compét' ? styles.pillCompet : styles.pillChill}`}>
                          {m.mode}
                        </span>
                      </td>
                      <td className={styles.tdDate}>{m.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelTitle}>Joueurs</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Login</th>
                    <th>ELO</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {PLAYERS.map(p => (
                    <tr key={p.login}>
                      <td>
                        <div className={styles.playerCell}>
                          <div className={styles.playerInitials}>{p.initials}</div>
                          {p.login}
                        </div>
                      </td>
                      <td className={styles.tdScore}>{p.elo}</td>
                      <td>
                        <span className={`${styles.pill} ${p.status === 'Actif' ? styles.pillActif : styles.pillInactif}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className={styles.tdActions}>
                        <button className={styles.miniBtn}>Modifier</button>
                        <button className={`${styles.miniBtn} ${styles.miniBtnDanger}`}>Bannir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.panelSide}>
            <div className={styles.panel}>
              <div className={styles.panelTitle}>Actions rapides</div>
              <div className={styles.actions}>
                <button className={styles.actionBtn} onClick={() => setCreateOpen(true)}>🏆 Créer un tournoi</button>
                <button className={styles.actionBtn}>👥 Gérer les joueurs</button>
                <button className={styles.actionBtn}>📊 Exporter les stats (CSV)</button>
                <button className={styles.actionBtn}>🔄 Réinitialiser le bracket</button>
                <button className={`${styles.actionBtn} ${styles.actionDanger}`}>⚠️ Réinitialiser tous les ELO</button>
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

export default function Admin() {
  const navigate = useNavigate()
  const [login,    setLogin]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [error,    setError]    = useState('')
  const [loggedIn, setLoggedIn] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (login === 'admin' && password === 'starbucks') {
      setError('')
      setLoggedIn(true)
    } else {
      setError('Identifiant ou mot de passe incorrect.')
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
          <button className={styles.btn} type="submit">Se connecter</button>
        </form>
      </div>
    </div>
  )
}
