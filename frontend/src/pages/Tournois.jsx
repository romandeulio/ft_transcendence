import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Modal from '../components/ui/Modal'
import Pill from '../components/ui/Pill'
import BracketTree from '../components/bracket/BracketTree'
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

export default function Tournois() {
  const { user } = useAuth()
  const { t } = useTranslation()

  const [bdeOpen,      setBdeOpen]      = useState(false)
  const [bdeInput,     setBdeInput]     = useState('')
  const [bdeUnlocked,  setBdeUnlocked]  = useState(false)
  const [bdeError,     setBdeError]     = useState(false)
  const [bdeLoading,   setBdeLoading]   = useState(false)
  const [createOpen,   setCreateOpen]   = useState(false)
  const [maxPlayers,   setMaxPlayers]   = useState('16')
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registered,   setRegistered]   = useState(false)
  const [partner,      setPartner]      = useState('')
  const [showRecruit,  setShowRecruit]  = useState(false)
  const [invitedSet,   setInvitedSet]   = useState(new Set())

  const [tournament,  setTournament]  = useState(null)
  const [waitingList, setWaitingList] = useState([])
  const [soloWaiting, setSoloWaiting] = useState([])

  const tournamentStart = tournament?.startDate ? new Date(tournament.startDate).getTime() : null
  const countdown  = useCountdown(tournamentStart)
  const hasStarted = countdown === 0

  const handleBdeSubmit = async () => {
    setBdeLoading(true)
    setBdeError(false)
    try {
      const res = await fetch('/api/bde/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: bdeInput }),
      })
      if (res.ok) {
        setBdeUnlocked(true)
        setBdeOpen(false)
        setCreateOpen(true)
      } else {
        setBdeError(true)
      }
    } catch {
      setBdeError(true)
    } finally {
      setBdeLoading(false)
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

        {!registered && (
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
      <Modal open={bdeOpen} onClose={() => { setBdeOpen(false); setBdeError(false) }} title={t('tournaments.bdeAccess')}>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.bdePwd')}</label>
          <input
            className={styles.input}
            type="password"
            placeholder="••••••••"
            value={bdeInput}
            onChange={e => { setBdeInput(e.target.value); setBdeError(false) }}
            onKeyDown={e => e.key === 'Enter' && handleBdeSubmit()}
          />
          {bdeError && <div className={styles.bdeError}>{t('tournaments.incorrectPwd')}</div>}
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
          <input className={styles.input} placeholder={t('tournaments.tournamentNamePlaceholder')} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.dateTime')}</label>
          <input className={styles.input} type="datetime-local" />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.registrationDeadline')}</label>
          <input className={styles.input} type="datetime-local" />
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
        <div className={styles.modalFooter}>
          <button className={styles.confirmBtn} onClick={() => setCreateOpen(false)}>{t('tournaments.createBtn')}</button>
        </div>
      </Modal>

      {/* ── Modal S'inscrire ── */}
      <Modal open={registerOpen} onClose={() => setRegisterOpen(false)} title={t('tournaments.registerTitle')}>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.myLogin')}</label>
          <input className={styles.meInput} value={user?.login ?? ''} readOnly />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('tournaments.partner')}</label>
          <input
            className={styles.input}
            placeholder={t('tournaments.partnerPlaceholder')}
            value={partner}
            onChange={e => setPartner(e.target.value)}
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
        <div className={styles.modalFooter}>
          <button
            className={styles.confirmBtn}
            onClick={() => {
              setRegistered(true)
              setRegisterOpen(false)
              if (!partner.trim()) setShowRecruit(true)
            }}
          >
            {t('tournaments.confirmRegister')}
          </button>
        </div>
      </Modal>
    </Shell>
  )
}
