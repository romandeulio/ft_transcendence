import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useQueue } from '../context/QueueContext'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Modal from '../components/ui/Modal'
import Pill from '../components/ui/Pill'
import BracketTree from '../components/bracket/BracketTree'
import { authFetch } from '../services/api'
import { useTranslation } from 'react-i18next'
import styles from './Tournois.module.css'

function useCountdown(target) {
  const [diff, setDiff] = useState(() => target != null ? target - Date.now() : null)
  useEffect(() => {
    if (target == null) { setDiff(null); return }
    setDiff(target - Date.now())
    const id = setInterval(() => setDiff(target - Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  return diff != null ? Math.max(0, diff) : null
}

function toTimestamp(value) {
  if (!value) return null
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : null
}

function splitCountdown(ms) {
  return {
    d: Math.floor(ms / 86400000),
    h: Math.floor((ms % 86400000) / 3600000),
    m: Math.floor((ms % 3600000) / 60000),
    s: Math.floor((ms % 60000) / 1000),
  }
}

function mapTournament(data) {
  return {
    id:          data.id,
    name:        data.name,
    format:      data.format      ?? 'SINGLE_ELIMINATION',
    teamSize:    data.team_size   ?? 2,
    startDate:   data.start_date,
    deadlineRaw: data.deadline,
    dateLabel:   data.date_label,
    deadline:    data.deadline_label,
    prize:       data.prize || null,
    registered:  data.registered,
    maxPlayers:  data.max_players,
    status:      data.status,
  }
}

const FORMAT_LABELS = {
  SINGLE_ELIMINATION: '🏆 Élimination directe',
  ROUND_ROBIN:        '🔄 Round Robin',
  SWISS:              '🇨🇭 Tournoi Suisse',
}

const FORMAT_OPTIONS = [
  { value: 'SINGLE_ELIMINATION', label: 'Élimination directe' },
  { value: 'ROUND_ROBIN',        label: 'Round Robin' },
  { value: 'SWISS',              label: 'Tournoi Suisse' },
]

function StandingsTable({ standings, format }) {
  if (!standings || standings.length === 0) return (
    <p className={styles.waitingListEmpty}>Aucun classement disponible.</p>
  )

  return (
    <table className={styles.standingsTable}>
      <thead>
        <tr>
          <th className={styles.standingsTh}>#</th>
          <th className={styles.standingsTh}>Équipe</th>
          <th className={styles.standingsTh}>V</th>
          <th className={styles.standingsTh}>D</th>
          {format === 'ROUND_ROBIN' && <th className={styles.standingsTh}>Pts</th>}
        </tr>
      </thead>
      <tbody>
        {standings.map((s, i) => (
          <tr key={s.id} className={i % 2 === 0 ? styles.standingsRowEven : styles.standingsRowOdd}>
            <td className={styles.standingsTd}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
            </td>
            <td className={styles.standingsTd}>{s.team?.label ?? '—'}</td>
            <td className={styles.standingsTd}>{s.wins}</td>
            <td className={styles.standingsTd}>{s.losses}</td>
            {format === 'ROUND_ROBIN' && <td className={styles.standingsTd}>{s.points}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}


export default function Tournois() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const { notifyTournamentTeammate } = useQueue()
  const importInputRef = useRef(null)

  const [bdeOpen,     setBdeOpen]     = useState(false)
  const [bdeUnlocked, setBdeUnlocked] = useState(false)
  const [bdeError,    setBdeError]    = useState('')
  const [bdeLoading,  setBdeLoading]  = useState(false)

  const [createOpen,     setCreateOpen]     = useState(false)
  const [createName,     setCreateName]     = useState('')
  const [createStart,    setCreateStart]    = useState('')
  const [createDeadline, setCreateDeadline] = useState('')
  const [createPrize,    setCreatePrize]    = useState('')
  const [createFormat,   setCreateFormat]   = useState('SINGLE_ELIMINATION')
  const [createTeamSize, setCreateTeamSize] = useState('2')
  const [maxPlayers,     setMaxPlayers]     = useState('16')
  const [createLoading,  setCreateLoading]  = useState(false)
  const [createError,    setCreateError]    = useState('')

  const [editOpen,       setEditOpen]       = useState(false)
  const [editName,       setEditName]       = useState('')
  const [editStart,      setEditStart]      = useState('')
  const [editDeadline,   setEditDeadline]   = useState('')
  const [editPrize,      setEditPrize]      = useState('')
  const [editFormat,     setEditFormat]     = useState('SINGLE_ELIMINATION')
  const [editTeamSize,   setEditTeamSize]   = useState('2')
  const [editMaxPlayers, setEditMaxPlayers] = useState('16')
  const [editLoading,    setEditLoading]    = useState(false)
  const [editError,      setEditError]      = useState('')

  const [registerOpen,     setRegisterOpen]     = useState(false)
  const [registered,       setRegistered]       = useState(false)
  const [myRegistrationId, setMyRegistrationId] = useState(null)
  const [partner,          setPartner]          = useState('')
  const [registerError,    setRegisterError]    = useState('')
  const [registerLoading,  setRegisterLoading]  = useState(false)
  const [showRecruit,      setShowRecruit]      = useState(false)
  const [invitedSet,       setInvitedSet]       = useState(new Set())

  const [standingsOpen,    setStandingsOpen]    = useState(false)
  const [standings,        setStandings]        = useState([])

  const [importLoading, setImportLoading] = useState(false)
  const [importResult,  setImportResult]  = useState(null)
  const [importOpen,    setImportOpen]    = useState(false)

  const [tournament,    setTournament]    = useState(null)
  const [waitingList,   setWaitingList]   = useState([])
  const [soloWaiting,   setSoloWaiting]   = useState([])
  const [bracketRounds, setBracketRounds] = useState([])
  const [startLoading,  setStartLoading]  = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [startError,    setStartError]    = useState('')
  const [teamPlayer1,   setTeamPlayer1]   = useState('')
  const [teamPlayer2,   setTeamPlayer2]   = useState('')
  const [teamAdminError,   setTeamAdminError]   = useState('')
  const [teamAdminLoading, setTeamAdminLoading] = useState(false)
  const [swissNextLoading, setSwissNextLoading] = useState(false)
  const [swissNextError,   setSwissNextError]   = useState('')

  const tournamentStart      = toTimestamp(tournament?.startDate)
  const countdown            = useCountdown(tournamentStart)
  const showCountdownOverlay = tournament?.status === 'OPEN' && countdown != null
  const isArchivedTournament = tournament?.status === 'DONE'
  const canPlanTournament    = !tournament || isArchivedTournament
  const canManageTournament  = tournament && !isArchivedTournament
  const isSwiss              = tournament?.format === 'SWISS'
  const isRoundRobin         = tournament?.format === 'ROUND_ROBIN'
  const hasStandings         = (isSwiss || isRoundRobin) && tournament?.status !== 'OPEN'
  const is1v1                = tournament?.teamSize === 1


  const fetchWaitingList = useCallback(async (id) => {
    const res = await authFetch(`/api/tournaments/${id}/registrations/`)
    if (!res.ok) return
    const data = await res.json()
    setWaitingList(data.map(r => ({
      id:           r.id,
      player1:      r.player1,
      player2:      r.player2 ?? null,
      registeredAt: new Date(r.registered_at).toLocaleDateString('fr-FR'),
    })))
  }, [])

  const fetchSoloWaiting = useCallback(async (id) => {
    const res = await authFetch(`/api/tournaments/${id}/solo/`)
    if (!res.ok) return
    const data = await res.json()
    setSoloWaiting(data)
  }, [])

  const checkMyRegistration = useCallback(async (id) => {
    const res = await authFetch(`/api/tournaments/${id}/my-registration/`)
    if (!res.ok) return
    const data = await res.json()
    if (data) {
      setRegistered(true)
      setMyRegistrationId(data.id)
      if (!data.player2) setShowRecruit(true)
    }
  }, [])

  const fetchBracket = useCallback(async (id) => {
    const res = await authFetch(`/api/tournaments/${id}/bracket/`)
    if (!res.ok) return
    const data = await res.json()
    if (data.tournament) setTournament(mapTournament(data.tournament))
    setBracketRounds(data.rounds ?? [])
    setStandings(data.standings ?? [])
  }, [])


  useEffect(() => {
    const load = async () => {
      const res = await authFetch('/api/tournaments/')

      if (!res.ok) return

      const text = await res.text()

      if (!text) {
        setTournament(null)
        return
      }

      const data = JSON.parse(text)

      if (data) {
        const t = mapTournament(data)
        setTournament(t)
        fetchWaitingList(t.id)
        fetchSoloWaiting(t.id)
        checkMyRegistration(t.id)
        if (t.status !== 'OPEN') fetchBracket(t.id)
      }
    }
    load()
  }, [fetchWaitingList, fetchSoloWaiting, checkMyRegistration, fetchBracket])


  const handleBdeSubmit = async () => {
    setBdeLoading(true)
    setBdeError('')
    try {
      const res = await authFetch('/api/tournaments/bde-unlock/', { method: 'POST' })
      if (res.ok) { setBdeUnlocked(true); setBdeOpen(false) }
      else if (res.status === 403) setBdeError("Vous n'avez pas les droits BDE.")
      else setBdeError('Erreur inattendue.')
    } catch { setBdeError('Erreur réseau.') }
    finally  { setBdeLoading(false) }
  }


  const handleStartTournament = async () => {
    if (!tournament) return
    setStartLoading(true)
    setStartError('')
    try {
      const res = await authFetch(`/api/tournaments/${tournament.id}/start/`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setStartError(data.detail || 'Erreur lors du lancement.'); return }
      const t = mapTournament(data)
      setTournament(t)
      fetchWaitingList(t.id)
      fetchSoloWaiting(t.id)
      fetchBracket(t.id)
    } catch { setStartError('Erreur réseau.') }
    finally  { setStartLoading(false) }
  }


  const handleDeleteTournament = async () => {
    if (!tournament || !window.confirm('Annuler et supprimer ce tournoi ?')) return
    setDeleteLoading(true)
    setStartError('')
    try {
      const res = await authFetch(`/api/tournaments/${tournament.id}/`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setStartError(data.detail || 'Erreur lors de la suppression du tournoi.')
        return
      }
      setTournament(null)
      setWaitingList([])
      setSoloWaiting([])
      setBracketRounds([])
      setStandings([])
      setRegistered(false)
      setShowRecruit(false)
      setInvitedSet(new Set())
    } catch { setStartError('Erreur réseau.') }
    finally  { setDeleteLoading(false) }
  }


  const handleMatchWinner = async (match, winnerTeamId) => {
    if (!window.confirm('Confirmer le gagnant de ce match ?')) return
    try {
      const res = await authFetch(`/api/tournaments/matches/${match.id}/result/`, {
        method: 'PATCH',
        body: JSON.stringify({ winner_team: winnerTeamId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setStartError(data.detail || 'Erreur lors de la validation du match.')
        return
      }
      fetchBracket(tournament.id)
      fetchWaitingList(tournament.id)
    } catch { setStartError('Erreur réseau.') }
  }

  const handlePostponeMatch = async (match) => {
    try {
      const res = await authFetch(`/api/tournaments/matches/${match.id}/postpone/`, { method: 'PATCH' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setStartError(data.detail || 'Erreur lors de la replanification.')
        return
      }
      fetchBracket(tournament.id)
    } catch { setStartError('Erreur réseau.') }
  }


  const handleSwissNextRound = async () => {
    if (!tournament) return
    setSwissNextLoading(true)
    setSwissNextError('')
    try {
      const res = await authFetch(`/api/tournaments/${tournament.id}/swiss-next-round/`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setSwissNextError(data.detail || 'Erreur.'); return }
      fetchBracket(tournament.id)
    } catch { setSwissNextError('Erreur réseau.') }
    finally  { setSwissNextLoading(false) }
  }


  const openEditModal = () => {
    if (!tournament) return
    setEditName(tournament.name || '')
    setEditStart(tournament.startDate ? tournament.startDate.slice(0, 16) : '')
    setEditDeadline(tournament.deadlineRaw ? tournament.deadlineRaw.slice(0, 16) : '')
    setEditPrize(tournament.prize || '')
    setEditFormat(tournament.format || 'SINGLE_ELIMINATION')
    setEditTeamSize(String(tournament.teamSize || 2))
    setEditMaxPlayers(String(tournament.maxPlayers || 16))
    setEditError('')
    setEditOpen(true)
  }

  const handleEditSubmit = async () => {
    if (!tournament) return
    setEditLoading(true)
    setEditError('')
    try {
      const res = await authFetch(`/api/tournaments/${tournament.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          name:        editName,
          start_date:  editStart,
          deadline:    editDeadline || null,
          max_players: parseInt(editMaxPlayers, 10),
          prize:       editPrize,
          format:      editFormat,
          team_size:   parseInt(editTeamSize, 10),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.detail || 'Erreur lors de la modification.'); return }
      setTournament(mapTournament(data))
      setEditOpen(false)
    } catch { setEditError('Erreur réseau.') }
    finally  { setEditLoading(false) }
  }


  const handleCreateSubmit = async () => {
    setCreateLoading(true)
    setCreateError('')
    try {
      const res = await authFetch('/api/tournaments/', {
        method: 'POST',
        body: JSON.stringify({
          name:        createName,
          start_date:  createStart,
          deadline:    createDeadline || null,
          max_players: parseInt(maxPlayers, 10),
          prize:       createPrize,
          format:      createFormat,
          team_size:   parseInt(createTeamSize, 10),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setTournament(mapTournament(data))
        setWaitingList([]); setSoloWaiting([]); setBracketRounds([]); setStandings([])
        setRegistered(false); setShowRecruit(false); setInvitedSet(new Set())
        setCreateOpen(false)
        setCreateName(''); setCreateStart(''); setCreateDeadline(''); setCreatePrize('')
        setCreateFormat('SINGLE_ELIMINATION'); setCreateTeamSize('2')
      } else {
        setCreateError(data.detail || data.name?.[0] || 'Erreur lors de la création.')
      }
    } catch { setCreateError('Erreur réseau.') }
    finally  { setCreateLoading(false) }
  }


  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !tournament) return
    e.target.value = ''
    setImportLoading(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await authFetch(`/api/tournaments/${tournament.id}/import-players/`, {
        method: 'POST',
        body: formData,
        headers: {},
      })
      const data = await res.json()
      if (!res.ok) {
        setImportResult({ error: data.detail || 'Erreur lors de l\'import.' })
      } else {
        setImportResult(data)
        fetchWaitingList(tournament.id)
        fetchSoloWaiting(tournament.id)
        const tournamentRes = await authFetch('/api/tournaments/')
        if (tournamentRes.ok) {
          const td = await tournamentRes.json()
          if (td) setTournament(mapTournament(td))
        }
      }
    } catch { setImportResult({ error: 'Erreur réseau.' }) }
    finally  { setImportLoading(false); setImportOpen(true) }
  }


  const handleRegisterSubmit = async () => {
    if (!tournament) return
    setRegisterLoading(true)
    setRegisterError('')
    try {
      const body = is1v1 ? {} : { partner: partner.trim() || null }
      const res = await authFetch(`/api/tournaments/${tournament.id}/register/`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setRegistered(true)
        setRegisterOpen(false)
        if (!is1v1 && !partner.trim()) setShowRecruit(true)
        fetchWaitingList(tournament.id)
        fetchSoloWaiting(tournament.id)
        const increment = is1v1 ? 1 : (partner.trim() ? 2 : 1)
        setTournament(prev => prev ? { ...prev, registered: (prev.registered ?? 0) + increment } : prev)
      } else {
        setRegisterError(data.detail || "Erreur lors de l'inscription.")
      }
    } catch { setRegisterError('Erreur réseau.') }
    finally  { setRegisterLoading(false) }
  }

  const handleSelfUnregister = async () => {
    if (!tournament || !myRegistrationId) return
    const res = await authFetch(`/api/tournaments/${tournament.id}/my-registration/`, { method: 'DELETE' })
    if (res.ok) { setRegistered(false); setMyRegistrationId(null); setShowRecruit(false) }
  }


  const handleForceTeam = async () => {
    if (!tournament) return
    setTeamAdminLoading(true)
    setTeamAdminError('')
    try {
      const body = { player1: teamPlayer1.trim() }
      if (!is1v1) body.player2 = teamPlayer2.trim()
      const res = await authFetch(`/api/tournaments/${tournament.id}/force-team/`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setTeamAdminError(data.detail || 'Erreur lors de la modification des équipes.'); return }
      setTeamPlayer1(''); setTeamPlayer2('')
      fetchWaitingList(tournament.id)
      fetchSoloWaiting(tournament.id)
      const tournamentRes = await authFetch('/api/tournaments/')
      if (tournamentRes.ok) {
        const td = await tournamentRes.json()
        setTournament(td ? mapTournament(td) : null)
      }
    } catch { setTeamAdminError('Erreur réseau.') }
    finally  { setTeamAdminLoading(false) }
  }

  const handleRemoveRegistration = async (registrationId, playerCount = 1) => {
    if (!tournament || !window.confirm('Retirer cette inscription du tournoi ?')) return
    setTeamAdminError('')
    try {
      const res = await authFetch(`/api/tournaments/${tournament.id}/registrations/${registrationId}/`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setTeamAdminError(data.detail || 'Erreur lors de la suppression.')
        return
      }
      fetchWaitingList(tournament.id)
      fetchSoloWaiting(tournament.id)
      setTournament(prev => prev ? { ...prev, registered: Math.max(0, (prev.registered ?? 0) - playerCount) } : prev)
    } catch { setTeamAdminError('Erreur réseau.') }
  }

  const soloList      = waitingList.filter(t => !t.player2)
  const confirmedList = waitingList.filter(t =>  t.player2)

  return (
    <Shell>
      <Topbar
        title={t('topbar.tournaments')}
        titleSize={30}
        right={
          <button className={styles.bdeBtn} onClick={() => setBdeOpen(true)}>
            <span className={styles.bdeBtnText}>{t('tournaments.bdeAccess')}</span>
            <span className={styles.bdeBtnIcon}>🔑</span>
          </button>
        }
      />

      <div className={styles.content}>

        {/* ── Panel admin BDE ── */}
        {bdeUnlocked && (
          <div className={styles.adminPanel}>
            <div>
              <div className={styles.adminTitle}>Mode admin BDE</div>
              <div className={styles.adminSub}>Création, édition, équipes, validation et replanification.</div>
            </div>
            <div className={styles.adminActions}>
              {canPlanTournament && (
                <button className={styles.confirmBtn} onClick={() => setCreateOpen(true)}>
                  {t(isArchivedTournament ? 'tournaments.planNextTournament' : 'tournaments.createTournament')}
                </button>
              )}
              {canManageTournament && (
                <button className={styles.btnSecondary} onClick={openEditModal}>
                  Modifier le tournoi
                </button>
              )}
              {canManageTournament && (
                <>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => importInputRef.current?.click()}
                    disabled={importLoading}
                  >
                    {importLoading ? 'Import...' : 'Importer une liste de joueurs'}
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,.txt,.json"
                    style={{ display: 'none' }}
                    onChange={handleImportFile}
                  />
                </>
              )}
              {/* Bouton Round Suisse suivant dans le panel BDE */}
              {canManageTournament && isSwiss && tournament.status === 'ONGOING' && (
                <button
                  className={styles.confirmBtn}
                  onClick={handleSwissNextRound}
                  disabled={swissNextLoading}
                >
                  {swissNextLoading ? 'Génération...' : 'Round suivant (Suisse)'}
                </button>
              )}
              {swissNextError && <span className={styles.bdeError}>{swissNextError}</span>}
              {canManageTournament && (
                <button className={styles.btnDanger} onClick={handleDeleteTournament} disabled={deleteLoading}>
                  {deleteLoading ? 'Suppression...' : 'Annuler le tournoi'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Carte tournoi ── */}
        {tournament ? (
          <div className={styles.tournamentCard}>
            <div className={styles.tcHeader}>
              <div>
                <div className={styles.tcName}>{tournament.name}</div>
                {tournament.dateLabel && (
                  <div className={styles.tcDate}>
                    <span className={styles.tcDateLabel}>Date de l'évènement :</span> {tournament.dateLabel}
                  </div>
                )}
                {tournament.prize && (
                  <div className={styles.tcDate}>
                    <span className={styles.tcDateLabel}>🏆 Récompenses :</span> {tournament.prize}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.tcMeta}>
              {/* Format + team size */}
              <Pill
                label={`${FORMAT_LABELS[tournament.format] ?? tournament.format} · ${tournament.teamSize === 1 ? '1v1' : '2v2'}`}
                type="season"
              />
              {tournament.deadline && (
                <Pill label={`Inscriptions jusqu'au ${tournament.deadline}`} type="live" />
              )}
              {tournament.status !== 'OPEN' && (
                <Pill
                  label={tournament.status}
                  type={tournament.status === 'ONGOING' ? 'live' : 'season'}
                />
              )}
              {tournament.registered != null && tournament.maxPlayers != null && (
                <span className={styles.participants}>
                  {t('tournaments.registered', { count: tournament.registered, max: tournament.maxPlayers })}
                </span>
              )}
            </div>

            {bdeUnlocked && tournament.status === 'OPEN' && (
              <div className={styles.bdeActions}>
                <button className={styles.confirmBtn} onClick={handleStartTournament} disabled={startLoading}>
                  {startLoading ? 'Lancement...' : 'Lancer le tournoi'}
                </button>
                {startError && <span className={styles.bdeError}>{startError}</span>}
              </div>
            )}
            {startError && tournament.status !== 'OPEN' && (
              <div className={styles.bdeError}>{startError}</div>
            )}
          </div>
        ) : (
          <div className={styles.tournamentCard}>
            <div className={styles.tcHeader}>
              <div className={styles.tcName}>{t('tournaments.noTournament')}</div>
            </div>
          </div>
        )}

        {/* ── Bannière inscription / désinscription ── */}
        {tournament?.status === 'OPEN' && !registered && (
          <div className={styles.registerBanner}>
            <span>{t('tournaments.notRegistered')}</span>
            <button className={styles.registerBtn} onClick={() => setRegisterOpen(true)}>
              {t('tournaments.register')}
            </button>
          </div>
        )}
        {tournament?.status === 'OPEN' && registered && (
          <div className={styles.registerBanner}>
            <span>Tu es inscrit au tournoi.</span>
            <button className={styles.unregisterBtn} onClick={handleSelfUnregister}>
              Se désinscrire
            </button>
          </div>
        )}

        {/* ── Panel recrutement (uniquement 2v2) ── */}
        {registered && showRecruit && !is1v1 && (
          <div className={styles.recruitPanel}>
            <div className={styles.recruitHeader}>
              <span className={styles.recruitIcon}>🤝</span>
              <span className={styles.recruitTitle}>{t('tournaments.findTeammate')}</span>
            </div>
            <div className={styles.recruitSub}>{t('tournaments.findTeammateSub')}</div>
            {soloWaiting.length === 0 && (
              <div className={styles.waitingListEmpty}>{t('tournaments.noWaiting')}</div>
            )}
            {soloWaiting.map(p => (
              <div key={p.login} className={styles.recruitRow}>
                <div className={styles.recruitAvatar}>{p.login[0].toUpperCase()}</div>
                <div className={styles.recruitInfo}>
                  <div className={styles.recruitLogin}>{p.login}</div>
                  <div className={styles.recruitSince}>{t('tournaments.waitingSince', { since: p.since })}</div>
                </div>
                {invitedSet.has(p.login) ? (
                  <span className={styles.invitedBadge}>{t('tournaments.invited')}</span>
                ) : (
                  <button
                    className={styles.inviteBtn}
                    onClick={() => {
                      setInvitedSet(prev => new Set([...prev, p.login]))
                      notifyTournamentTeammate(p.login, {
                        tournamentId:   tournament?.id,
                        tournamentName: tournament?.name,
                        format:         '2v2',
                        is_ranked:      false,
                      })
                    }}
                  >
                    {t('tournaments.invite')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Listes d'attente ── */}
        {/* Joueurs sans partenaire — uniquement en 2v2 */}
        {!is1v1 && (
          <div className={styles.waitingListBox}>
            <div className={styles.waitingListHeader}>
              <span className={styles.waitingListTitle}>{t('tournaments.waitingList')}</span>
            </div>
            {soloList.length === 0 ? (
              <p className={styles.waitingListEmpty}>{t('tournaments.noWaiting')}</p>
            ) : (
              soloList.map(team => (
                <div key={team.id} className={styles.waitingListItem}>
                  <span className={styles.waitingBall}>⚽</span>
                  <div className={styles.waitingPlayers}>
                    <span>{team.player1}</span>
                  </div>
                  <Pill label={t('tournaments.searchingPartner')} type="season" />
                  {bdeUnlocked && tournament?.status === 'OPEN' && (
                    <button className={styles.inlineDanger} onClick={() => handleRemoveRegistration(team.id, 1)}>
                      Retirer
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Équipes / joueurs confirmés */}
        <div className={styles.confirmedTeamsBox}>
          <div className={styles.waitingListHeader}>
            <span className={styles.waitingListTitle}>
              {is1v1 ? 'Joueurs inscrits' : t('tournaments.confirmedTeams')}
            </span>
          </div>
          {confirmedList.length === 0 && soloList.length === 0 ? (
            <p className={styles.waitingListEmpty}>
              {is1v1 ? 'Aucun joueur inscrit.' : t('tournaments.noConfirmedTeams')}
            </p>
          ) : (
            (is1v1 ? waitingList : confirmedList).map(team => (
              <div key={team.id} className={styles.waitingListItem}>
                <span className={styles.waitingBall}>⚽</span>
                <div className={styles.waitingPlayers}>
                  <span>{team.player1}</span>
                  {!is1v1 && team.player2 && (
                    <>
                      <span className={styles.waitingSep}>&amp;</span>
                      <span>{team.player2}</span>
                    </>
                  )}
                </div>
                {bdeUnlocked && tournament?.status === 'OPEN' && (
                  <button
                    className={styles.inlineDanger}
                    onClick={() => handleRemoveRegistration(team.id, is1v1 ? 1 : 2)}
                  >
                    Retirer
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* ── Panel admin — Forcer une équipe ── */}
        {bdeUnlocked && tournament?.status === 'OPEN' && (
          <div className={styles.adminPanel}>
            <div>
              <div className={styles.adminTitle}>
                {is1v1 ? 'Inscrire un joueur' : 'Forcer une équipe'}
              </div>
              <div className={styles.adminSub}>
                {is1v1
                  ? 'Inscrit un joueur directement.'
                  : 'Associe deux logins et retire leurs anciennes inscriptions si besoin.'
                }
              </div>
            </div>
            <div className={styles.forceTeamForm}>
              <input
                className={styles.input}
                placeholder="login joueur 1"
                value={teamPlayer1}
                onChange={e => setTeamPlayer1(e.target.value)}
              />
              {!is1v1 && (
                <input
                  className={styles.input}
                  placeholder="login joueur 2"
                  value={teamPlayer2}
                  onChange={e => setTeamPlayer2(e.target.value)}
                />
              )}
              <button
                className={styles.confirmBtn}
                onClick={handleForceTeam}
                disabled={teamAdminLoading || !teamPlayer1 || (!is1v1 && !teamPlayer2)}
              >
                {teamAdminLoading ? '...' : is1v1 ? 'Inscrire' : 'Associer'}
              </button>
            </div>
            {teamAdminError && <div className={styles.bdeError}>{teamAdminError}</div>}
          </div>
        )}

        {/* ── Bracket / vue tournoi ── */}
        <div className={styles.bracketWrap}>
          {/* Bouton classement (Swiss / Round Robin) — sous le bracket */}
          {hasStandings && (
            <div className={styles.standingsBar}>
              <button className={styles.btnSecondary} onClick={() => setStandingsOpen(true)}>
                Voir le classement
              </button>
              {/* Bouton round suivant Swiss aussi ici */}
              {bdeUnlocked && isSwiss && tournament.status === 'ONGOING' && (
                <button
                  className={styles.confirmBtn}
                  onClick={handleSwissNextRound}
                  disabled={swissNextLoading}
                  style={{ marginLeft: 8 }}
                >
                  {swissNextLoading ? 'Génération...' : 'Round suivant'}
                </button>
              )}
              {swissNextError && <span className={styles.bdeError}>{swissNextError}</span>}
            </div>
          )}

          {showCountdownOverlay && (() => {
            const cd = splitCountdown(countdown)
            return (
              <div className={styles.bracketBlur}>
                <div className={styles.countdownBox}>
                  <div className={styles.countdownLabel}>{t('tournaments.tournamentStartsIn')}</div>
                  <div className={styles.countdownParts}>
                    {[
                      { val: cd.d, unit: t('tournaments.days') },
                      { val: cd.h, unit: t('tournaments.hours') },
                      { val: cd.m, unit: t('tournaments.minutes') },
                      { val: cd.s, unit: t('tournaments.seconds') },
                    ].map(({ val, unit }, i) => (
                      <div key={unit} className={styles.countdownItem}>
                        {i > 0 && <span className={styles.countdownColon}>:</span>}

                        <div className={styles.countdownPart}>
                          <span className={styles.countdownNum}>
                            {String(val).padStart(2, '0')}
                          </span>
                          <span className={styles.countdownUnit}>{unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={styles.countdownSub}>{t('tournaments.bracketReveal')}</div>
                </div>
              </div>
            )
          })()}

          {!tournament && (
            <div className={styles.bracketBlur}>
              <div className={styles.countdownBox}>
                <div className={styles.countdownLabel}>{t('tournaments.noTournamentPlanned')}</div>
              </div>
            </div>
          )}

          <BracketTree
            rounds={bracketRounds.length ? bracketRounds : undefined}
            maxPlayers={tournament?.maxPlayers ?? 16}
            canReport={bdeUnlocked && tournament?.status === 'ONGOING'}
            onWinner={handleMatchWinner}
            onPostpone={handlePostponeMatch}
          />
        </div>
      </div>

      {/* ── Accès BDE ── */}
      <Modal open={bdeOpen} onClose={() => { setBdeOpen(false); setBdeError('') }} title={t('tournaments.bdeAccess')}>
        <div className={styles.formGroup}>
          <div className={styles.adminSub}>Vérifie ton accès BDE via ton compte.</div>
          {bdeError && <div className={styles.bdeError}>{bdeError}</div>}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.confirmBtn} onClick={handleBdeSubmit} disabled={bdeLoading}>
            {bdeLoading ? t('tournaments.verifying') : t('tournaments.access')}
          </button>
        </div>
      </Modal>

      {/* ── Créer un tournoi ── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('tournaments.createTournament')}>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.tournamentName')}</label>
          <input
            className={styles.input}
            placeholder={t('tournaments.tournamentNamePlaceholder')}
            value={createName}
            onChange={e => setCreateName(e.target.value)}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Format</label>
          <select className={styles.input} value={createFormat} onChange={e => setCreateFormat(e.target.value)}>
            {FORMAT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Mode</label>
          <select className={styles.input} value={createTeamSize} onChange={e => setCreateTeamSize(e.target.value)}>
            <option value="1">1v1</option>
            <option value="2">2v2</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.dateTime')}</label>
          <input className={styles.input} type="datetime-local" value={createStart} onChange={e => setCreateStart(e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.registrationDeadline')}</label>
          <input className={styles.input} type="datetime-local" value={createDeadline} onChange={e => setCreateDeadline(e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.maxPlayers')}</label>
          <select className={styles.input} value={maxPlayers} onChange={e => setMaxPlayers(e.target.value)}>
            {[16, 32].map(n => (
              <option key={n} value={n}>{t('tournaments.playersCount', { count: n })}</option>
            ))}
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Prix (optionnel)</label>
          <input className={styles.input} placeholder="ex: Couverture offerte" value={createPrize} onChange={e => setCreatePrize(e.target.value)} />
        </div>
        {createError && <div className={styles.bdeError}>{createError}</div>}
        <div className={styles.modalFooter}>
          <button className={styles.confirmBtn} onClick={handleCreateSubmit} disabled={createLoading || !createName || !createStart}>
            {createLoading ? 'Création...' : t('tournaments.createBtn')}
          </button>
        </div>
      </Modal>

      {/* ── Modifier le tournoi ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifier le tournoi">
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.tournamentName')}</label>
          <input className={styles.input} value={editName} onChange={e => setEditName(e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Format</label>
          <select
            className={styles.input}
            value={editFormat}
            onChange={e => setEditFormat(e.target.value)}
            disabled={tournament?.status !== 'OPEN'}
          >
            {FORMAT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Mode</label>
          <select
            className={styles.input}
            value={editTeamSize}
            onChange={e => setEditTeamSize(e.target.value)}
            disabled={tournament?.status !== 'OPEN'}
          >
            <option value="1">1v1</option>
            <option value="2">2v2</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.dateTime')}</label>
          <input className={styles.input} type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)} disabled={tournament?.status !== 'OPEN'} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.registrationDeadline')}</label>
          <input className={styles.input} type="datetime-local" value={editDeadline} onChange={e => setEditDeadline(e.target.value)} disabled={tournament?.status !== 'OPEN'} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.maxPlayers')}</label>
          <select className={styles.input} value={editMaxPlayers} onChange={e => setEditMaxPlayers(e.target.value)} disabled={tournament?.status !== 'OPEN'}>
            {[16, 32].map(n => (
              <option key={n} value={n}>{t('tournaments.playersCount', { count: n })}</option>
            ))}
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Prix (optionnel)</label>
          <input className={styles.input} value={editPrize} onChange={e => setEditPrize(e.target.value)} />
        </div>
        {editError && <div className={styles.bdeError}>{editError}</div>}
        <div className={styles.modalFooter}>
          <button className={styles.confirmBtn} onClick={handleEditSubmit} disabled={editLoading || !editName || !editStart}>
            {editLoading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </Modal>

      {/* ── S'inscrire ── */}
      <Modal open={registerOpen} onClose={() => { setRegisterOpen(false); setRegisterError('') }} title={t('tournaments.registerTitle')}>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.myLogin')}</label>
          <input className={styles.meInput} value={user?.username ?? ''} readOnly />
        </div>

        {/* Champ partenaire uniquement en 2v2 */}
        {!is1v1 && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t('tournaments.partner')}</label>
              <input
                className={styles.input}
                placeholder={t('tournaments.partnerPlaceholder')}
                value={partner}
                onChange={e => { setPartner(e.target.value); setRegisterError('') }}
              />
              <div className={styles.partnerNote}>
                {partner.trim()
                  ? t('tournaments.partnerNote', { partner })
                  : t('tournaments.partnerEmpty')
                }
              </div>
            </div>
            {!partner.trim() && (
              <div className={styles.soloNote}>{t('tournaments.soloNote')}</div>
            )}
          </>
        )}

        {is1v1 && (
          <div className={styles.soloNote}>
            Ce tournoi est en 1v1 — tu t'inscriras seul.
          </div>
        )}

        {registerError && <div className={styles.bdeError}>{registerError}</div>}
        <div className={styles.modalFooter}>
          <button className={styles.confirmBtn} onClick={handleRegisterSubmit} disabled={registerLoading}>
            {registerLoading ? 'Inscription...' : t('tournaments.confirmRegister')}
          </button>
        </div>
      </Modal>

      {/* ── Classement Swiss / Round Robin ── */}
      <Modal
        open={standingsOpen}
        onClose={() => setStandingsOpen(false)}
        title={isSwiss ? 'Classement Suisse' : 'Classement Round Robin'}
      >
        <StandingsTable standings={standings} format={tournament?.format} />
      </Modal>

      {/* ── Résultat import ── */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Résultat de l'import">
        {importResult?.error ? (
          <div className={styles.bdeError}>{importResult.error}</div>
        ) : (
          <div className={styles.importResult}>
            {importResult?.created?.length > 0 && (
              <div className={styles.importSection}>
                <div className={styles.importSectionTitle}>✅ Inscrits ({importResult.created.length})</div>
                {importResult.created.map((name, i) => (
                  <div key={i} className={styles.importRow}>{name}</div>
                ))}
              </div>
            )}
            {importResult?.skipped?.length > 0 && (
              <div className={styles.importSection}>
                <div className={styles.importSectionTitle}>⏭️ Ignorés ({importResult.skipped.length})</div>
                {importResult.skipped.map((name, i) => (
                  <div key={i} className={styles.importRow}>{name}</div>
                ))}
              </div>
            )}
            {importResult?.errors?.length > 0 && (
              <div className={styles.importSection}>
                <div className={styles.importSectionTitle}>⚠️ Erreurs ({importResult.errors.length})</div>
                {importResult.errors.map((msg, i) => (
                  <div key={i} className={styles.importRow}>{msg}</div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className={styles.modalFooter}>
          <button className={styles.confirmBtn} onClick={() => setImportOpen(false)}>Fermer</button>
        </div>
      </Modal>
    </Shell>
  )
}