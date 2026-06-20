import { useState, useEffect, useCallback } from 'react'
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
    if (target == null) {
      setDiff(null)
      return
    }
    setDiff(target - Date.now())
    const id = setInterval(() => setDiff(target - Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  return diff != null ? Math.max(0, diff) : null
}

function toTimestamp(value) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
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

export default function Tournois() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const { notifyTournamentTeammate } =useQueue ()

  // ── BDE modal ──
  const [bdeOpen,    setBdeOpen]    = useState(false)
  const [bdeInput,   setBdeInput]   = useState('')
  const [bdeUnlocked, setBdeUnlocked] = useState(false)
  const [bdeError,   setBdeError]   = useState('')
  const [bdeLoading, setBdeLoading] = useState(false)

  // ── Créer tournoi modal ──
  const [createOpen,     setCreateOpen]     = useState(false)
  const [createName,     setCreateName]     = useState('')
  const [createStart,    setCreateStart]    = useState('')
  const [createDeadline, setCreateDeadline] = useState('')
  const [createPrize,    setCreatePrize]    = useState('')
  const [maxPlayers,     setMaxPlayers]     = useState('16')
  const [createLoading,  setCreateLoading]  = useState(false)
  const [createError,    setCreateError]    = useState('')

  // ── Modifier tournoi modal ──
  const [editOpen,       setEditOpen]       = useState(false)
  const [editName,       setEditName]       = useState('')
  const [editStart,      setEditStart]      = useState('')
  const [editDeadline,   setEditDeadline]   = useState('')
  const [editPrize,      setEditPrize]      = useState('')
  const [editMaxPlayers, setEditMaxPlayers] = useState('16')
  const [editLoading,    setEditLoading]    = useState(false)
  const [editError,      setEditError]      = useState('')

  // ── Inscription modal ──
  const [registerOpen,  setRegisterOpen]  = useState(false)
  const [registered,    setRegistered]    = useState(false)
  const [partner,       setPartner]       = useState('')
  const [registerError, setRegisterError] = useState('')
  const [registerLoading, setRegisterLoading] = useState(false)
  const [showRecruit,   setShowRecruit]   = useState(false)
  const [invitedSet,    setInvitedSet]    = useState(new Set())

  // ── Données backend ──
  const [tournament,  setTournament]  = useState(null)
  const [waitingList, setWaitingList] = useState([])
  const [soloWaiting, setSoloWaiting] = useState([])
  const [bracketRounds, setBracketRounds] = useState([])
  const [startLoading, setStartLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [startError, setStartError] = useState('')
  const [teamPlayer1, setTeamPlayer1] = useState('')
  const [teamPlayer2, setTeamPlayer2] = useState('')
  const [teamAdminError, setTeamAdminError] = useState('')
  const [teamAdminLoading, setTeamAdminLoading] = useState(false)

  const tournamentStart = toTimestamp(tournament?.startDate)
  const countdown  = useCountdown(tournamentStart)
  const showCountdownOverlay = tournament?.status === 'OPEN' && countdown != null
  const isArchivedTournament = tournament?.status === 'DONE'
  const canPlanTournament = !tournament || isArchivedTournament
  const canManageTournament = tournament && !isArchivedTournament

  // ── Chargement de la liste d'attente ──
  const fetchWaitingList = useCallback(async (id) => {
    const res = await authFetch(`/api/tournaments/${id}/registrations/`)
    if (!res.ok) return
    const data = await res.json()
    setWaitingList(data.map(r => ({
      id:           r.id,
      player1:      r.player1,
      player2:      r.player2 ?? '?',
      registeredAt: new Date(r.registered_at).toLocaleDateString('fr-FR'),
    })))
  }, [])

  // ── Chargement des solo en attente ──
  const fetchSoloWaiting = useCallback(async (id) => {
    const res = await authFetch(`/api/tournaments/${id}/solo/`)
    if (!res.ok) return
    const data = await res.json()
    setSoloWaiting(data)
  }, [])

  // ── Vérification de mon inscription ──
  const checkMyRegistration = useCallback(async (id) => {
    const res = await authFetch(`/api/tournaments/${id}/my-registration/`)
    if (!res.ok) return
    const data = await res.json()
    if (data) {
      setRegistered(true)
      if (!data.player2) setShowRecruit(true)
    }
  }, [])

  const fetchBracket = useCallback(async (id) => {
    const res = await authFetch(`/api/tournaments/${id}/bracket/`)
    if (!res.ok) return
    const data = await res.json()
    if (data.tournament) setTournament(mapTournament(data.tournament))
    setBracketRounds(data.rounds ?? [])
  }, [])

  const openEditModal = () => {
    if (!tournament) return
    setEditName(tournament.name || '')
    setEditStart(tournament.startDate ? tournament.startDate.slice(0, 16) : '')
    setEditDeadline(tournament.deadlineRaw ? tournament.deadlineRaw.slice(0, 16) : '')
    setEditPrize(tournament.prize || '')
    setEditMaxPlayers(String(tournament.maxPlayers || 16))
    setEditError('')
    setEditOpen(true)
  }

  // ── Chargement initial ──
  useEffect(() => {
    const load = async () => {
      const res = await authFetch('/api/tournaments/')
      if (!res.ok) return
      const data = await res.json()
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

  // ── Vérification mot de passe BDE ──
  const handleBdeSubmit = async () => {
    setBdeLoading(true)
    setBdeError('')
    try {
      const res = await authFetch('/api/tournaments/bde-unlock/', { method: 'POST' })
      if (res.ok) {
        setBdeUnlocked(true)
        setBdeOpen(false)
      } else if (res.status === 403) {
        setBdeError("Vous n'avez pas les droits BDE.")
      } else {
        setBdeError('Erreur inattendue.')
      }
    } catch {
      setBdeError('Erreur réseau.')
    } finally {
      setBdeLoading(false)
    }
  }

  const handleStartTournament = async () => {
    if (!tournament) return
    setStartLoading(true)
    setStartError('')
    try {
      const res = await authFetch(`/api/tournaments/${tournament.id}/start/`, {
        method: 'POST',
        body: JSON.stringify({ bde_password: bdeInput }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStartError(data.detail || 'Erreur lors du lancement.')
        return
      }
      const t = mapTournament(data)
      setTournament(t)
      fetchWaitingList(t.id)
      fetchSoloWaiting(t.id)
      fetchBracket(t.id)
    } catch {
      setStartError('Erreur réseau.')
    } finally {
      setStartLoading(false)
    }
  }

  const handleDeleteTournament = async () => {
    if (!tournament || !window.confirm('Annuler et supprimer ce tournoi ?')) return
    setDeleteLoading(true)
    setStartError('')
    try {
      const res = await authFetch(`/api/tournaments/${tournament.id}/`, {
        method: 'DELETE',
        body: JSON.stringify({ bde_password: bdeInput }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setStartError(data.detail || 'Erreur lors de la suppression du tournoi.')
        return
      }
      setTournament(null)
      setWaitingList([])
      setSoloWaiting([])
      setBracketRounds([])
      setRegistered(false)
      setShowRecruit(false)
      setInvitedSet(new Set())
    } catch {
      setStartError('Erreur réseau.')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleMatchWinner = async (match, winnerTeamId) => {
    if (!window.confirm('Confirmer le gagnant de ce match ?')) return
    try {
      const res = await authFetch(`/api/tournaments/matches/${match.id}/result/`, {
        method: 'PATCH',
        body: JSON.stringify({ winner_team: winnerTeamId, bde_password: bdeInput }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setStartError(data.detail || 'Erreur lors de la validation du match.')
        return
      }
      fetchBracket(tournament.id)
      fetchWaitingList(tournament.id)
    } catch {
      setStartError('Erreur réseau.')
    }
  }

  const handlePostponeMatch = async (match) => {
    try {
      const res = await authFetch(`/api/tournaments/matches/${match.id}/postpone/`, {
        method: 'PATCH',
        body: JSON.stringify({ bde_password: bdeInput }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setStartError(data.detail || 'Erreur lors de la replanification.')
        return
      }
      fetchBracket(tournament.id)
    } catch {
      setStartError('Erreur réseau.')
    }
  }

  const handleEditSubmit = async () => {
    if (!tournament) return
    setEditLoading(true)
    setEditError('')
    try {
      const res = await authFetch(`/api/tournaments/${tournament.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          bde_password: bdeInput,
          name: editName,
          start_date: editStart,
          deadline: editDeadline || null,
          max_players: parseInt(editMaxPlayers, 10),
          prize: editPrize,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditError(data.detail || 'Erreur lors de la modification.')
        return
      }
      setTournament(mapTournament(data))
      setEditOpen(false)
    } catch {
      setEditError('Erreur réseau.')
    } finally {
      setEditLoading(false)
    }
  }

  const handleForceTeam = async () => {
    if (!tournament) return
    setTeamAdminLoading(true)
    setTeamAdminError('')
    try {
      const res = await authFetch(`/api/tournaments/${tournament.id}/force-team/`, {
        method: 'POST',
        body: JSON.stringify({
          bde_password: bdeInput,
          player1: teamPlayer1.trim(),
          player2: teamPlayer2.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTeamAdminError(data.detail || 'Erreur lors de la modification des équipes.')
        return
      }
      setTeamPlayer1('')
      setTeamPlayer2('')
      fetchWaitingList(tournament.id)
      fetchSoloWaiting(tournament.id)
      const tournamentRes = await authFetch('/api/tournaments/')
      if (tournamentRes.ok) {
        const tournamentData = await tournamentRes.json()
        setTournament(tournamentData ? mapTournament(tournamentData) : null)
      }
    } catch {
      setTeamAdminError('Erreur réseau.')
    } finally {
      setTeamAdminLoading(false)
    }
  }

  const handleRemoveRegistration = async (registrationId, playerCount = 1) => {
    if (!tournament || !window.confirm('Retirer cette inscription du tournoi ?')) return
    setTeamAdminError('')
    try {
      const res = await authFetch(`/api/tournaments/${tournament.id}/registrations/${registrationId}/`, {
        method: 'DELETE',
        body: JSON.stringify({ bde_password: bdeInput }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setTeamAdminError(data.detail || 'Erreur lors de la suppression.')
        return
      }
      fetchWaitingList(tournament.id)
      fetchSoloWaiting(tournament.id)
      setTournament(prev => prev ? { ...prev, registered: Math.max(0, (prev.registered ?? 0) - playerCount) } : prev)
    } catch {
      setTeamAdminError('Erreur réseau.')
    }
  }

  // ── Création d'un tournoi ──
  const handleCreateSubmit = async () => {
    setCreateLoading(true)
    setCreateError('')
    try {
      const res = await authFetch('/api/tournaments/', {
        method: 'POST',
        body:   JSON.stringify({
          bde_password: bdeInput,
          name:         createName,
          start_date:   createStart,
          deadline:     createDeadline || null,
          max_players:  parseInt(maxPlayers, 10),
          prize:        createPrize,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setTournament(mapTournament(data))
        setWaitingList([])
        setSoloWaiting([])
        setBracketRounds([])
        setRegistered(false)
        setShowRecruit(false)
        setInvitedSet(new Set())
        setCreateOpen(false)
        setCreateName('')
        setCreateStart('')
        setCreateDeadline('')
        setCreatePrize('')
      } else {
        setCreateError(data.detail || data.name?.[0] || 'Erreur lors de la création.')
      }
    } catch {
      setCreateError('Erreur réseau.')
    } finally {
      setCreateLoading(false)
    }
  }

  // ── Inscription au tournoi ──
  const handleRegisterSubmit = async () => {
    if (!tournament) return
    setRegisterLoading(true)
    setRegisterError('')
    try {
      const res = await authFetch(`/api/tournaments/${tournament.id}/register/`, {
        method: 'POST',
        body:   JSON.stringify({ partner: partner.trim() || null }),
      })
      const data = await res.json()
      if (res.ok) {
        setRegistered(true)
        setRegisterOpen(false)
        if (!partner.trim()) setShowRecruit(true)
        fetchWaitingList(tournament.id)
        fetchSoloWaiting(tournament.id)
        // Refresh counter
        setTournament(prev => prev ? { ...prev, registered: (prev.registered ?? 0) + (partner.trim() ? 2 : 1) } : prev)
      } else {
        setRegisterError(data.detail || 'Erreur lors de l\'inscription.')
      }
    } catch {
      setRegisterError('Erreur réseau.')
    } finally {
      setRegisterLoading(false)
    }
  }

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
                <button className={styles.btnDanger} onClick={handleDeleteTournament} disabled={deleteLoading}>
                  {deleteLoading ? 'Suppression...' : 'Annuler le tournoi'}
                </button>
              )}
            </div>
          </div>
        )}

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
              {tournament.deadline && <Pill label={`Inscriptions jusqu'au ${tournament.deadline}`} type="live" />}
              {tournament.status !== 'OPEN' && (
                <Pill label={tournament.status} type={tournament.status === 'ONGOING' ? 'live' : 'season'} />
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
            {startError && tournament.status !== 'OPEN' && <div className={styles.bdeError}>{startError}</div>}
          </div>
        ) : (
          <div className={styles.tournamentCard}>
            <div className={styles.tcHeader}>
              <div className={styles.tcName}>{t('tournaments.noTournament')}</div>
            </div>
          </div>
        )}

        {tournament?.status === 'OPEN' && !registered && (
          <div className={styles.registerBanner}>
            <span>{t('tournaments.notRegistered')}</span>
            <button className={styles.registerBtn} onClick={() => setRegisterOpen(true)}>
              {t('tournaments.register')}
            </button>
          </div>
        )}

        {registered && showRecruit && (
          <div className={styles.recruitPanel}>
            <div className={styles.recruitHeader}>
              <span className={styles.recruitIcon}>🤝</span>
              <span className={styles.recruitTitle}>{t('tournaments.findTeammate')}</span>
            </div>
            <div className={styles.recruitSub}>
              {t('tournaments.findTeammateSub')}
            </div>
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
                        format:         '1v1',
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

        {/* Liste d'attente — joueurs seuls */}
        {(() => {
          const soloList = waitingList.filter(t => t.player2 === '?')
          const confirmedTeams = waitingList.filter(t => t.player2 !== '?')
          return (
            <>
              <div className={styles.waitingListBox}>
                <div className={styles.waitingListHeader}>
                  <span className={styles.waitingListTitle}>{t('tournaments.waitingList')}</span>
                </div>
                {soloList.length === 0 ? (
                  <p className={styles.waitingListEmpty}>{t('tournaments.noWaiting')}</p>
                ) : (
                  <div>
                    {soloList.map((team) => (
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
                    ))}
                  </div>
                )}
              </div>

              {/* Équipes confirmées */}
              <div className={styles.confirmedTeamsBox}>
                <div className={styles.waitingListHeader}>
                  <span className={styles.waitingListTitle}>{t('tournaments.confirmedTeams')}</span>
                </div>
                {confirmedTeams.length === 0 ? (
                  <p className={styles.waitingListEmpty}>{t('tournaments.noConfirmedTeams')}</p>
                ) : (
                  <div>
                    {confirmedTeams.map((team) => (
                      <div key={team.id} className={styles.waitingListItem}>
                        <span className={styles.waitingBall}>⚽</span>
                        <div className={styles.waitingPlayers}>
                          <span>{team.player1}</span>
                          <span className={styles.waitingSep}>&amp;</span>
                          <span>{team.player2}</span>
                        </div>
                        {bdeUnlocked && tournament?.status === 'OPEN' && (
                          <button className={styles.inlineDanger} onClick={() => handleRemoveRegistration(team.id, 2)}>
                            Retirer
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )
        })()}

        {bdeUnlocked && tournament?.status === 'OPEN' && (
          <div className={styles.adminPanel}>
            <div>
              <div className={styles.adminTitle}>Forcer une équipe</div>
              <div className={styles.adminSub}>Associe deux logins et retire leurs anciennes inscriptions si besoin.</div>
            </div>
            <div className={styles.forceTeamForm}>
              <input className={styles.input} placeholder="login joueur 1" value={teamPlayer1} onChange={e => setTeamPlayer1(e.target.value)} />
              <input className={styles.input} placeholder="login joueur 2" value={teamPlayer2} onChange={e => setTeamPlayer2(e.target.value)} />
              <button className={styles.confirmBtn} onClick={handleForceTeam} disabled={teamAdminLoading || !teamPlayer1 || !teamPlayer2}>
                {teamAdminLoading ? '...' : 'Associer'}
              </button>
            </div>
            {teamAdminError && <div className={styles.bdeError}>{teamAdminError}</div>}
          </div>
        )}

        {/* Bracket avec overlay gris tant que le tournoi n'est pas lancé */}
        <div className={styles.bracketWrap}>
          {showCountdownOverlay && (() => {
            const cd = splitCountdown(countdown)
            return (
              <div className={styles.bracketBlur}>
                <div className={styles.countdownBox}>
                  <div className={styles.countdownLabel}>{t('tournaments.tournamentStartsIn')}</div>
                  <div className={styles.countdownParts}>
                    <div className={styles.countdownPart}>
                      <span className={styles.countdownNum}>{String(cd.d).padStart(2,'0')}</span>
                      <span className={styles.countdownUnit}>{t('tournaments.days')}</span>
                    </div>
                    <span className={styles.countdownColon}>:</span>
                    <div className={styles.countdownPart}>
                      <span className={styles.countdownNum}>{String(cd.h).padStart(2,'0')}</span>
                      <span className={styles.countdownUnit}>{t('tournaments.hours')}</span>
                    </div>
                    <span className={styles.countdownColon}>:</span>
                    <div className={styles.countdownPart}>
                      <span className={styles.countdownNum}>{String(cd.m).padStart(2,'0')}</span>
                      <span className={styles.countdownUnit}>{t('tournaments.minutes')}</span>
                    </div>
                    <span className={styles.countdownColon}>:</span>
                    <div className={styles.countdownPart}>
                      <span className={styles.countdownNum}>{String(cd.s).padStart(2,'0')}</span>
                      <span className={styles.countdownUnit}>{t('tournaments.seconds')}</span>
                    </div>
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

      {/* ── Modal Accès BDE ── */}
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

      {/* ── Modal Créer un tournoi (BDE) ── */}
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
          <label className={styles.label}>{t('tournaments.dateTime')}</label>
          <input
            className={styles.input}
            type="datetime-local"
            value={createStart}
            onChange={e => setCreateStart(e.target.value)}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.registrationDeadline')}</label>
          <input
            className={styles.input}
            type="datetime-local"
            value={createDeadline}
            onChange={e => setCreateDeadline(e.target.value)}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.maxPlayers')}</label>
          <select
            className={styles.input}
            value={maxPlayers}
            onChange={e => setMaxPlayers(e.target.value)}
          >
            {[16, 32].map(n => (
              <option key={n} value={n}>{t('tournaments.playersCount', { count: n })}</option>
            ))}
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Prix (optionnel)</label>
          <input
            className={styles.input}
            placeholder="ex: Couverture offerte"
            value={createPrize}
            onChange={e => setCreatePrize(e.target.value)}
          />
        </div>
        {createError && <div className={styles.bdeError}>{createError}</div>}
        <div className={styles.modalFooter}>
          <button className={styles.confirmBtn} onClick={handleCreateSubmit} disabled={createLoading || !createName || !createStart}>
            {createLoading ? 'Création...' : t('tournaments.createBtn')}
          </button>
        </div>
      </Modal>

      {/* ── Modal Modifier le tournoi (BDE) ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifier le tournoi">
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.tournamentName')}</label>
          <input className={styles.input} value={editName} onChange={e => setEditName(e.target.value)} />
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

      {/* ── Modal S'inscrire ── */}
      <Modal open={registerOpen} onClose={() => { setRegisterOpen(false); setRegisterError('') }} title={t('tournaments.registerTitle')}>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.myLogin')}</label>
          <input className={styles.meInput} value={user?.username ?? ''} readOnly />
        </div>
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
          <div className={styles.soloNote}>
            {t('tournaments.soloNote')}
          </div>
        )}
        {registerError && <div className={styles.bdeError}>{registerError}</div>}
        <div className={styles.modalFooter}>
          <button
            className={styles.confirmBtn}
            onClick={handleRegisterSubmit}
            disabled={registerLoading}
          >
            {registerLoading ? 'Inscription...' : t('tournaments.confirmRegister')}
          </button>
        </div>
      </Modal>
    </Shell>
  )
}
