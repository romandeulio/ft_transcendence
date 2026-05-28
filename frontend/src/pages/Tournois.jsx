import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Modal from '../components/ui/Modal'
import Pill from '../components/ui/Pill'
import BracketTree from '../components/bracket/BracketTree'
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
        title="Tournois"
        titleSize={30}
        right={
          <button className={styles.bdeBtn} onClick={() => setBdeOpen(true)}>
            Accès BDE
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
              <div className={styles.tcName}>Aucun tournoi en cours</div>
            </div>
          </div>
        )}

        {!registered && (
          <div className={styles.registerBanner}>
            <span>Tu n'es pas encore inscrit au tournoi</span>
            <button className={styles.registerBtn} onClick={() => setRegisterOpen(true)}>
              S'inscrire →
            </button>
          </div>
        )}

        {registered && showRecruit && (
          <div className={styles.recruitPanel}>
            <div className={styles.recruitHeader}>
              <span className={styles.recruitIcon}>🤝</span>
              <span className={styles.recruitTitle}>Trouve un coéquipier</span>
            </div>
            <div className={styles.recruitSub}>
              Ces joueurs sont seuls en liste d'attente pour ce tournoi. Envoie-leur une invitation d'équipe.
            </div>
            {soloWaiting.length === 0 && (
              <div className={styles.waitingListEmpty}>Aucun joueur en attente pour le moment.</div>
            )}
            {soloWaiting.map(p => (
              <div key={p.login} className={styles.recruitRow}>
                <div className={styles.recruitAvatar}>{p.login[0].toUpperCase()}</div>
                <div className={styles.recruitInfo}>
                  <div className={styles.recruitLogin}>{p.login}</div>
                  <div className={styles.recruitSince}>En attente depuis {p.since}</div>
                </div>
                {invitedSet.has(p.login) ? (
                  <span className={styles.invitedBadge}>✓ Invitation envoyée</span>
                ) : (
                  <button
                    className={styles.inviteBtn}
                    onClick={() => setInvitedSet(prev => new Set([...prev, p.login]))}
                  >
                    Inviter
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Liste d'attente */}
        <div className={styles.waitingListBox}>
          <div className={styles.waitingListHeader}>
            <span className={styles.waitingListTitle}>LISTE D'ATTENTE</span>
            <span className={styles.waitingListCount}>{waitingList.length} équipe{waitingList.length > 1 ? 's' : ''}</span>
          </div>
          {waitingList.length === 0 ? (
            <p className={styles.waitingListEmpty}>Aucune équipe en attente</p>
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
                  <Pill label="Équipe confirmée" type="win" />
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
                  <div className={styles.countdownLabel}>Le tournoi commence dans</div>
                  <div className={styles.countdownParts}>
                    <div className={styles.countdownPart}>
                      <span className={styles.countdownNum}>{String(cd.d).padStart(2,'0')}</span>
                      <span className={styles.countdownUnit}>J</span>
                    </div>
                    <span className={styles.countdownColon}>:</span>
                    <div className={styles.countdownPart}>
                      <span className={styles.countdownNum}>{String(cd.h).padStart(2,'0')}</span>
                      <span className={styles.countdownUnit}>H</span>
                    </div>
                    <span className={styles.countdownColon}>:</span>
                    <div className={styles.countdownPart}>
                      <span className={styles.countdownNum}>{String(cd.m).padStart(2,'0')}</span>
                      <span className={styles.countdownUnit}>M</span>
                    </div>
                    <span className={styles.countdownColon}>:</span>
                    <div className={styles.countdownPart}>
                      <span className={styles.countdownNum}>{String(cd.s).padStart(2,'0')}</span>
                      <span className={styles.countdownUnit}>S</span>
                    </div>
                  </div>
                  <div className={styles.countdownSub}>Le bracket sera révélé au démarrage</div>
                </div>
              </div>
            )
          })()}
          {countdown == null && (
            <div className={styles.bracketBlur}>
              <div className={styles.countdownBox}>
                <div className={styles.countdownLabel}>Aucun tournoi planifié</div>
              </div>
            </div>
          )}
          <BracketTree />
        </div>
      </div>

      {/* ── Modal Accès BDE ── */}
      <Modal open={bdeOpen} onClose={() => { setBdeOpen(false); setBdeError(false) }} title="Accès BDE">
        <div className={styles.formGroup}>
          <label className={styles.label}>Mot de passe BDE</label>
          <input
            className={styles.input}
            type="password"
            placeholder="••••••••"
            value={bdeInput}
            onChange={e => { setBdeInput(e.target.value); setBdeError(false) }}
            onKeyDown={e => e.key === 'Enter' && handleBdeSubmit()}
          />
          {bdeError && <div className={styles.bdeError}>Mot de passe incorrect</div>}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.confirmBtn} onClick={handleBdeSubmit} disabled={bdeLoading}>
            {bdeLoading ? 'Vérification…' : 'Accéder'}
          </button>
        </div>
      </Modal>

      {/* ── Modal Créer un tournoi (BDE) ── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Créer un tournoi">
        <div className={styles.formGroup}>
          <label className={styles.label}>Nom du tournoi</label>
          <input className={styles.input} placeholder="Ex: Tournoi du jeudi #5" />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Date et heure</label>
          <input className={styles.input} type="datetime-local" />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Limite d'inscription</label>
          <input className={styles.input} type="datetime-local" />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Nombre maximum de joueurs</label>
          <select
            className={styles.input}
            value={maxPlayers}
            onChange={e => setMaxPlayers(e.target.value)}
          >
            {[8, 16, 32, 64].map(n => (
              <option key={n} value={n}>{n} joueurs</option>
            ))}
          </select>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.confirmBtn} onClick={() => setCreateOpen(false)}>Créer le tournoi</button>
        </div>
      </Modal>

      {/* ── Modal S'inscrire ── */}
      <Modal open={registerOpen} onClose={() => setRegisterOpen(false)} title="S'inscrire au tournoi">
        <div className={styles.formGroup}>
          <label className={styles.label}>Mon login</label>
          <input className={styles.meInput} value={user?.login ?? ''} readOnly />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Partenaire</label>
          <input
            className={styles.input}
            placeholder="Login joueur... (optionnel)"
            value={partner}
            onChange={e => setPartner(e.target.value)}
          />
          <div className={styles.partnerNote}>
            {partner.trim()
              ? <>✓ <strong>{partner}</strong> sera invité et inscrit directement avec toi.</>
              : 'Laisse vide pour être associé à un partenaire aléatoirement.'
            }
          </div>
        </div>
        {!partner.trim() && (
          <div className={styles.soloNote}>
            Si tu es seul, tu entres en liste d'attente. La liste d'attente sera affichée et tu pourras envoyer une demande d'équipe aux autres joueurs en attente.
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
            Confirmer l'inscription
          </button>
        </div>
      </Modal>
    </Shell>
  )
}
