import { useState, useEffect } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Modal from '../components/ui/Modal'
import Pill from '../components/ui/Pill'
import BracketTree from '../components/bracket/BracketTree'
import styles from './Tournois.module.css'

const TOURNAMENT_START = new Date('2026-05-08T18:00:00')
const BDE_PASSWORD     = '42bde2026'

const WAITING_LIST = [
  { id: 1, player1: 'ltcherp',  player2: 'srobert', registeredAt: '14:32' },
  { id: 2, player1: 'thbouche', player2: 'cdupont', registeredAt: '14:45' },
  { id: 3, player1: 'amorin',   player2: 'jblanc',  registeredAt: '15:01' },
]

const SOLO_WAITING = [
  { login: 'coraline', since: '18 min' },
  { login: 'jblanc',   since: '9 min'  },
  { login: 'thais',    since: '3 min'  },
]

function useCountdown(target) {
  const [diff, setDiff] = useState(() => target - Date.now())
  useEffect(() => {
    const id = setInterval(() => setDiff(target - Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  return Math.max(0, diff)
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
  const [bdeOpen,      setBdeOpen]      = useState(false)
  const [bdeInput,     setBdeInput]     = useState('')
  const [bdeUnlocked,  setBdeUnlocked]  = useState(false)
  const [bdeError,     setBdeError]     = useState(false)
  const [createOpen,   setCreateOpen]   = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registered,   setRegistered]   = useState(false)
  const [partner,      setPartner]      = useState('')
  const [showRecruit,  setShowRecruit]  = useState(false)
  const [invitedSet,   setInvitedSet]   = useState(new Set())

  const countdown    = useCountdown(TOURNAMENT_START.getTime())
  const hasStarted   = countdown === 0

  const handleBdeSubmit = () => {
    if (bdeInput === BDE_PASSWORD) {
      setBdeUnlocked(true)
      setBdeOpen(false)
      setCreateOpen(true)
      setBdeError(false)
    } else {
      setBdeError(true)
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
        <div className={styles.tournamentCard}>
          <div className={styles.tcHeader}>
            <div>
              <div className={styles.tcName}>TOURNOI DU JEUDI</div>
              <div className={styles.tcDate}>Jeudi 24 avril 2026 — 18h00</div>
            </div>
            <Pill label="🏆 500 jetons" type="season" />
          </div>
          <div className={styles.tcMeta}>
            <Pill label="Inscriptions jusqu'au 23/04 20h" type="live" />
            <span className={styles.participants}>8 / 16 inscrits</span>
          </div>
        </div>

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
            {SOLO_WAITING.map(p => (
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
            <span className={styles.waitingListCount}>{WAITING_LIST.length} équipe{WAITING_LIST.length > 1 ? 's' : ''}</span>
          </div>
          {WAITING_LIST.length === 0 ? (
            <p className={styles.waitingListEmpty}>Aucune équipe en attente</p>
          ) : (
            <div>
              {WAITING_LIST.map((team, i) => (
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
          {!hasStarted && (() => {
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
          <button className={styles.confirmBtn} onClick={handleBdeSubmit}>Accéder</button>
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
        <div className={styles.modalFooter}>
          <button className={styles.confirmBtn} onClick={() => setCreateOpen(false)}>Créer le tournoi</button>
        </div>
      </Modal>

      {/* ── Modal S'inscrire ── */}
      <Modal open={registerOpen} onClose={() => setRegisterOpen(false)} title="S'inscrire au tournoi">
        <div className={styles.formGroup}>
          <label className={styles.label}>Mon login</label>
          <input className={styles.meInput} value="ltcherp" readOnly />
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
