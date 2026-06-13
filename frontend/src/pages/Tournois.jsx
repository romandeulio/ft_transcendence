import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Modal from '../components/ui/Modal'
import Pill from '../components/ui/Pill'
import BracketTree from '../components/bracket/BracketTree'
import { authFetch } from '../services/api'
import { useTranslation } from 'react-i18next'
import styles from './Tournois.module.css'

function useCountdown(target) {
  const [diff, setDiff] = useState(() => target ? target - Date.now() : null)
  useEffect(() => {
    if (!target) return
    const id = setInterval(() => setDiff(target - Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  return diff != null ? Math.max(0, diff) : null
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

  const tournamentStart = tournament?.startDate ? new Date(tournament.startDate).getTime() : null
  const countdown  = useCountdown(tournamentStart)
  const hasStarted = countdown === 0

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
      }
    }
    load()
  }, [fetchWaitingList, fetchSoloWaiting, checkMyRegistration])

  // ── Vérification mot de passe BDE ──
  const handleBdeSubmit = async () => {
    setBdeLoading(true)
    setBdeError('')
    try {
      const res = await authFetch('/api/tournaments/bde-unlock/', {
        method: 'POST',
        body:   JSON.stringify({ password: bdeInput }),
      })
      if (res.ok) {
        setBdeUnlocked(true)
        setBdeOpen(false)
        setCreateOpen(true)
      } else if (res.status === 401) {
        setBdeError('Session expirée — reconnecte-toi.')
      } else {
        setBdeError(t('tournaments.incorrectPwd'))
      }
    } catch {
      setBdeError('Erreur réseau.')
    } finally {
      setBdeLoading(false)
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
        setTournament(prev => prev ? { ...prev, registered: (prev.registered ?? 0) + 1 } : prev)
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
            {t('tournaments.bdeAccess')}
          </button>
        }
      />
      <div className={styles.content}>

        {tournament ? (
          <div className={styles.tournamentCard}>
            <div className={styles.tcHeader}>
              <div>
                <div className={styles.tcName}>{tournament.name}</div>
                <div className={styles.tcDate}>{tournament.dateLabel}</div>
              </div>
              {tournament.prize && <Pill label={`🏆 ${tournament.prize}`} type="season" />}
            </div>
            <div className={styles.tcMeta}>
              {tournament.deadline && <Pill label={`Inscriptions jusqu'au ${tournament.deadline}`} type="live" />}
              {tournament.registered != null && tournament.maxPlayers != null && (
                <span className={styles.participants}>{tournament.registered} / {tournament.maxPlayers} inscrits</span>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.tournamentCard}>
            <div className={styles.tcHeader}>
              <div className={styles.tcName}>{t('tournaments.noTournament')}</div>
            </div>
          </div>
        )}

        {tournament && !registered && (
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
                    onClick={() => setInvitedSet(prev => new Set([...prev, p.login]))}
                  >
                    {t('tournaments.invite')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Liste d'attente */}
        <div className={styles.waitingListBox}>
          <div className={styles.waitingListHeader}>
            <span className={styles.waitingListTitle}>{t('tournaments.waitingList')}</span>
            <span className={styles.waitingListCount}>{t(waitingList.length > 1 ? 'tournaments.teams_plural' : 'tournaments.teams', { count: waitingList.length })}</span>
          </div>
          {waitingList.length === 0 ? (
            <p className={styles.waitingListEmpty}>{t('tournaments.noTeams')}</p>
          ) : (
            <div>
              {waitingList.map((team, i) => (
                <div key={team.id} className={styles.waitingListItem}>
                  <span className={styles.waitingRank}>#{i + 1}</span>
                  <div className={styles.waitingPlayers}>
                    <span>{team.player1}</span>
                    <span className={styles.waitingSep}>&amp;</span>
                    <span>{team.player2}</span>
                  </div>
                  <Pill label={t('tournaments.confirmedTeam')} type="win" />
                  <span className={styles.waitingTime}>{team.registeredAt}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bracket avec overlay gris si pas encore commencé */}
        <div className={styles.bracketWrap}>
          {countdown != null && !hasStarted && (() => {
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
          {countdown == null && (
            <div className={styles.bracketBlur}>
              <div className={styles.countdownBox}>
                <div className={styles.countdownLabel}>{t('tournaments.noTournamentPlanned')}</div>
              </div>
            </div>
          )}
          <BracketTree />
        </div>
      </div>

      {/* ── Modal Accès BDE ── */}
      <Modal open={bdeOpen} onClose={() => { setBdeOpen(false); setBdeError('') }} title={t('tournaments.bdeAccess')}>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.bdePwd')}</label>
          <input
            className={styles.input}
            type="password"
            placeholder="••••••••"
            value={bdeInput}
            onChange={e => { setBdeInput(e.target.value); setBdeError('') }}
            onKeyDown={e => e.key === 'Enter' && handleBdeSubmit()}
          />
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
            {[8, 16, 32, 64].map(n => (
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
