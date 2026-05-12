import { useState } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Modal from '../components/ui/Modal'
import Pill from '../components/ui/Pill'
import Avatar from '../components/ui/Avatar'
import LoginInput from '../components/ui/LoginInput'
import { useBets } from '../context/BetsContext'
import { useQueue } from '../context/QueueContext'
import { useAuth } from '../hooks/useAuth'
import styles from './Planning.module.css'

// Équipe précédente dans la file (avant les créneaux libres)
const PREV_TEAM = { p1: 'amorin', p2: 'kperez', format: '1v1' }

const MAX_TOKENS = 1412

export default function Planning() {
  const { addBet } = useBets()
  const { queue, joinQueue, leaveQueue, updateSlot, connected } = useQueue()
  const { user } = useAuth()
  const [hoveredIdx,  setHoveredIdx]  = useState(null)

  // Modal parier
  const [betSlot,   setBetSlot]   = useState(null)
  const [betAmount, setBetAmount] = useState(50)
  const [betTeam,   setBetTeam]   = useState(null)

  // Modal S'ajouter — multi-step (5 étapes)
  const [joinOpen,    setJoinOpen]    = useState(false)
  const [step,        setStep]        = useState(1)
  const [joinMode,    setJoinMode]    = useState('compet')
  const [joinFormat,  setJoinFormat]  = useState('1v1')
  const [partner,     setPartner]     = useState('')
  const [opp1,        setOpp1]        = useState('')
  const [opp2,        setOpp2]        = useState('')
  const [laGagne,     setLaGagne]     = useState(10)
  const [waitingOpen, setWaitingOpen] = useState(false)
  const [teamRequest, setTeamRequest] = useState('')

  // Modal modifier mon créneau
  const [editOpen,        setEditOpen]        = useState(false)
  const [editPlayersOpen, setEditPlayersOpen] = useState(false)
  const [editP1,          setEditP1]          = useState('')
  const [editP2,          setEditP2]          = useState('')

  const resetJoin = () => {
    setStep(1); setJoinMode('compet'); setJoinFormat('1v1')
    setPartner(''); setOpp1(''); setOpp2(''); setLaGagne(10)
  }

  const handleBet = () => {
    if (!betSlot || !betTeam) return
    addBet({
      match:   `${betSlot.p1} vs ${betSlot.p2}`,
      p1:      betSlot.p1,
      p2:      betSlot.p2,
      status:  'soon',
      context: "File d'attente",
      myBet:   { player: betTeam, amount: betAmount },
    })
    setBetSlot(null)
    setBetAmount(50)
    setBetTeam(null)
  }

  const handleJoinConfirm = () => {
    if (joinFormat === 'Seul') {
      setJoinOpen(false)
      setWaitingOpen(true)
    } else {
      setStep(4)
    }
  }

  const handleToStep5 = () => setStep(5)

  const handleFinalConfirm = () => {
    // Create and join slot
    const newSlot = {
      p1: joinFormat === '1v1' || joinFormat === '2v2' ? user?.username : '',
      p2: joinFormat === '1v1' ? opp1 : '',
      format: joinFormat,
      team1: joinFormat === '2v2' ? [user?.username, partner] : undefined,
      team2: joinFormat === '2v2' ? [opp1, opp2] : undefined,
      type: 'taken',
      laGagne: laGagne
    }
    joinQueue(newSlot)
    setJoinOpen(false)
    resetJoin()
  }

  const cancelSlot = () => {
    const mySlot = queue.find(s => s.ownerId === user?.id || s.type === 'mine')
    if (mySlot) {
      leaveQueue(mySlot.id)
    }
    setEditOpen(false)
  }

  const openEditPlayers = () => {
    const slot = queue.find(s => s.ownerId === user?.id || s.type === 'mine')
    if (slot) { setEditP1(slot.p1 || ''); setEditP2(slot.p2 || '') }
    setEditOpen(false)
    setEditPlayersOpen(true)
  }

  const saveEditPlayers = () => {
    const mySlot = queue.find(s => s.ownerId === user?.id || s.type === 'mine')
    if (mySlot) {
      updateSlot(mySlot.id, { p1: editP1, p2: editP2 })
    }
    setEditPlayersOpen(false)
  }

  const mySlot = queue.find(s => s.ownerId === user?.id || s.type === 'mine')
  const liveSlots = queue.filter(s => s.type === 'live')
  const displaySlots = queue.filter(s => s.type !== 'free' && s.type !== 'live')

  return (
    <Shell>
      <Topbar
        title="File d'attente"
        titleSize={30}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!connected && <span style={{ fontSize: '12px', color: 'var(--red)' }}>Déconnecté</span>}
            <button className={styles.btnJoin} onClick={() => { resetJoin(); setJoinOpen(true) }}>
              + S'ajouter à la file
            </button>
          </div>
        }
      />

      <div className={styles.content}>

        {/* Timeline */}
        <div className={styles.timelineCard}>
          <div className={styles.timelineHeader}>Matchs en attente</div>
          <div className={styles.timelineOuter}>
            <div className={styles.timeline}>
              {displaySlots.map((slot, i) => {
                const isMe    = slot.ownerId === user?.id || slot.type === 'mine'
                const isLive  = slot.type === 'live'
                const isTaken = slot.type === 'taken'
                const hovered = hoveredIdx === i

                return (
                  <div
                    key={slot.id || i}
                    className={styles.slotWrapper}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    <div className={styles.slotLabel}>
                      {isLive && <span className={styles.liveLabelText}>En cours</span>}
                      {isMe   && <span className={styles.mineLabelText}>Mon match</span>}
                    </div>

                    <div
                      className={[
                        styles.slot,
                        isLive  ? styles.slotLive  : '',
                        isMe    ? styles.slotMine  : '',
                        isTaken ? styles.slotTaken : '',
                      ].join(' ')}
                    >
                      {slot.p1 && (
                        <div className={styles.slotNames}>
                          {slot.format === '2v2' && slot.team1
                            ? <>{slot.team1.join(' & ')}<br />vs<br />{slot.team2.join(' & ')}</>
                            : <>{slot.p1}<br />vs<br />{slot.p2}</>
                          }
                        </div>
                      )}
                      {slot.format && <div className={styles.slotFormat}>{slot.format}</div>}

                      {isMe && (
                        <button
                          className={styles.editSlotBtn}
                          onClick={e => { e.stopPropagation(); setEditOpen(true) }}
                          title="Modifier"
                        >✏️</button>
                      )}

                      {(isLive || isTaken) && hovered && (
                        <button
                          className={styles.hoverBetBtn}
                          onClick={e => { e.stopPropagation(); setBetSlot(slot); setBetAmount(50) }}
                        >
                          Parier →
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Booking card — always last, always exactly one */}
              <div className={styles.slotWrapper} key="book">
                <div className={styles.slotLabel} />
                <div
                  className={`${styles.slot} ${styles.slotBook}`}
                  onClick={() => { resetJoin(); setJoinOpen(true) }}
                >
                  <div className={styles.bookPlus}>+</div>
                  <div className={styles.bookLabel}>Réserver ce créneau</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Deux petits blocs */}
        <div className={styles.infoRow}>
          <div className={styles.infoCard}>
            <div className={styles.infoCardHeader}>Mon prochain match</div>
            <div className={styles.infoCardBody}>
              {mySlot ? (
                <div className={styles.myMatchInfo}>
                  <Avatar initials={mySlot.p2?.substring(0, 2).toUpperCase() || "?"} size={34} bg="var(--beige)" round />
                  <div>
                    <div className={styles.myMatchVs}>vs <strong>{mySlot.p2}</strong></div>
                    <div className={styles.myMatchSub}>{mySlot.format} · {mySlot.type === 'live' ? 'En cours' : 'Compétition'}</div>
                  </div>
                </div>
              ) : (
                <div className={styles.noMatch}>Pas de match prévu</div>
              )}
            </div>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.infoCardHeader}>Match en cours</div>
            <div className={styles.infoCardBody}>
              {liveSlots.map((s, i) => (
                <div key={i} className={styles.liveMatchRow}>
                  <Pill label="LIVE" type="live" />
                  <span className={styles.liveMatchNames}>{s.p1} vs {s.p2}</span>
                </div>
              ))}
              {liveSlots.length === 0 && (
                <div className={styles.noMatch}>Aucun match en cours</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal parier ── */}
      <Modal open={!!betSlot} onClose={() => { setBetSlot(null); setBetTeam(null) }} title="Parier sur ce match">
        {betSlot && (
          <>
            <div className={styles.betMatchRow}>
              <strong>{betSlot.p1}</strong> vs <strong>{betSlot.p2}</strong>
            </div>
            <div className={styles.modalSection}>
              <label className={styles.modalLabel}>Parier sur</label>
              <div className={styles.betTeamChoice}>
                <button
                  className={`${styles.betTeamBtn} ${betTeam === betSlot.p1 ? styles.betTeamActive : ''}`}
                  onClick={() => setBetTeam(betSlot.p1)}
                >
                  {betSlot.p1}
                </button>
                <button
                  className={`${styles.betTeamBtn} ${betTeam === betSlot.p2 ? styles.betTeamActive : ''}`}
                  onClick={() => setBetTeam(betSlot.p2)}
                >
                  {betSlot.p2}
                </button>
              </div>
            </div>
            <div className={styles.modalSection}>
              <label className={styles.modalLabel}>Montant de la mise</label>
              <div className={styles.sliderBox}>
                <div className={styles.sliderLabel}>Mise : <strong>{betAmount} jetons</strong></div>
                <input
                  type="range" min={1} max={MAX_TOKENS} value={betAmount}
                  onChange={e => setBetAmount(+e.target.value)}
                  className={styles.slider}
                />
                <div className={styles.sliderRange}><span>1</span><span>{MAX_TOKENS}</span></div>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.confirmBtn}
                onClick={handleBet}
                disabled={!betTeam}
                style={!betTeam ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
              >
                Confirmer — {betAmount} jetons
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Modal S'ajouter (5 étapes) ── */}
      <Modal open={joinOpen} onClose={() => { setJoinOpen(false); resetJoin() }} title="S'ajouter à la file d'attente">
        {step === 1 && (
          <div>
            <div className={styles.stepLabel}>Étape 1 / 5 — Mode de jeu</div>
            <div className={styles.modeBtns}>
              <button className={`${styles.modeBtn} ${joinMode === 'compet' ? styles.modeBtnCompet : ''}`} onClick={() => setJoinMode('compet')}>🏆 Compétition</button>
              <button className={`${styles.modeBtn} ${joinMode === 'chill'  ? styles.modeBtnChill  : ''}`} onClick={() => setJoinMode('chill')}>😎 Chill</button>
            </div>
            <div className={styles.modeNote}>{joinMode === 'compet' ? 'ELO pris en compte · Résultats officiels' : "Partie détendue · Pas d'impact ELO"}</div>
            <div className={styles.stepActions}>
              <button className={styles.nextBtn} onClick={() => setStep(2)}>Suivant →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className={styles.stepLabel}>Étape 2 / 5 — Format</div>
            <div className={styles.formatBtns}>
              {['1v1', '2v2', 'Seul'].map(f => (
                <button key={f} className={`${styles.formatBtn} ${joinFormat === f ? styles.formatBtnActive : ''}`} onClick={() => setJoinFormat(f)}>
                  {f === 'Seul' ? '👤 Seul' : f === '1v1' ? '⚔️ 1v1' : '👥 2v2'}
                </button>
              ))}
            </div>
            {joinFormat === 'Seul' && (
              <div className={styles.soloNote}>Tu seras placé en liste d'attente. Tu pourras envoyer des demandes d'équipe aux autres joueurs en attente.</div>
            )}
            <div className={styles.stepActions}>
              <button className={styles.backBtn} onClick={() => setStep(1)}>← Retour</button>
              <button className={styles.nextBtn} onClick={() => setStep(3)}>Suivant →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className={styles.stepLabel}>Étape 3 / 5 — Joueurs</div>
            {joinFormat === '1v1' && (
              <div className={styles.teamsGrid}>
                <div className={styles.teamBlue}>
                  <div className={styles.teamLabel}>Toi</div>
                  <input className={styles.meInput} value={user?.username || ""} readOnly />
                </div>
                <div className={styles.teamRed}>
                  <div className={styles.teamLabel}>Adversaire</div>
                  <LoginInput value={opp1} onChange={setOpp1} placeholder="Login..." className={styles.partnerInput} />
                </div>
              </div>
            )}
            {joinFormat === '2v2' && (
              <div className={styles.teamsGrid}>
                <div className={styles.teamBlue}>
                  <div className={styles.teamLabel}>Ton équipe</div>
                  <input className={styles.meInput} value={user?.username || ""} readOnly />
                  <LoginInput value={partner} onChange={setPartner} placeholder="Coéquipier..." className={styles.partnerInput} />
                </div>
                <div className={styles.teamRed}>
                  <div className={styles.teamLabel}>Adversaires</div>
                  <LoginInput value={opp1} onChange={setOpp1} placeholder="Adv. 1..." className={styles.partnerInput} />
                  <LoginInput value={opp2} onChange={setOpp2} placeholder="Adv. 2..." className={styles.partnerInput} />
                </div>
              </div>
            )}
            {joinFormat === 'Seul' && (
              <div className={styles.soloNote}>Tu rejoindras la liste d'attente. Un partenaire te sera attribué automatiquement.</div>
            )}
            <div className={styles.stepActions}>
              <button className={styles.backBtn} onClick={() => setStep(2)}>← Retour</button>
              <button className={styles.nextBtn} onClick={handleJoinConfirm}>
                {joinFormat === 'Seul' ? 'Rejoindre →' : 'Suivant →'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <div className={styles.stepLabel}>Étape 4 / 5 — La gagne ?</div>
            <div className={styles.lagagneBox}>
              <div className={styles.lagagneLabel}>Nombre de points pour gagner</div>
              <div className={styles.lagagneRow}>
                <button className={styles.lagagneBtn} onClick={() => setLaGagne(n => Math.max(1, n-1))}>−</button>
                <span className={styles.lagagneVal}>{laGagne}</span>
                <button className={styles.lagagneBtn} onClick={() => setLaGagne(n => n+1)}>+</button>
              </div>
              <div className={styles.lagagneSub}>Pré-rempli selon le dernier match ({joinFormat})</div>
            </div>
            <div className={styles.stepActions}>
              <button className={styles.backBtn} onClick={() => setStep(3)}>← Retour</button>
              <button className={styles.nextBtn} onClick={handleToStep5}>Suivant →</button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <div className={styles.stepLabel}>Étape 5 / 5 — Gagne de l'équipe précédente</div>
            <div className={styles.prevTeamQuestion}>
              Voulez-vous prendre la gagne de l'équipe précédente dans la file ?
            </div>
            <div className={styles.prevTeamCard}>
              <div className={styles.prevTeamLabel}>Équipe précédente</div>
              <div className={styles.prevTeamPlayers}>
                <Avatar initials={PREV_TEAM.p1?.substring(0, 2).toUpperCase()} size={36} bg="var(--beige)" round />
                <span className={styles.prevTeamName}>{PREV_TEAM.p1}</span>
                <span className={styles.prevTeamVs}>vs</span>
                <Avatar initials={PREV_TEAM.p2?.substring(0, 2).toUpperCase()} size={36} bg="var(--beige)" round />
                <span className={styles.prevTeamName}>{PREV_TEAM.p2}</span>
              </div>
              <div className={styles.prevTeamFormat}>{PREV_TEAM.format} · la gagne = {laGagne} pts</div>
            </div>
            <div className={styles.stepActions}>
              <button className={styles.backBtn} onClick={() => setStep(4)}>← Retour</button>
              <button className={styles.nonBtn} onClick={handleFinalConfirm}>Non</button>
              <button className={styles.ouiBtn} onClick={handleFinalConfirm}>Oui ✓</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Popup liste d'attente ── */}
      {waitingOpen && (
        <div className={styles.waitingOverlay} onClick={() => setWaitingOpen(false)}>
          <div className={styles.waitingPopup} onClick={e => e.stopPropagation()}>
            <button className={styles.popupClose} onClick={() => setWaitingOpen(false)}>✕</button>
            <div className={styles.waitingTitle}>En attente d'une équipe</div>
            <div className={styles.waitingDesc}>Tu es dans la liste d'attente. Les autres joueurs seuls ci-dessous peuvent rejoindre ton équipe.</div>
            <div className={styles.waitingList}>
              {['jblanc', 'kperez'].map(login => (
                <div key={login} className={styles.waitingRow}>
                  <Avatar initials={login?.substring(0, 2).toUpperCase()} size={32} bg="var(--beige)" round />
                  <span className={styles.waitingLogin}>{login}</span>
                  <button className={styles.requestBtn}>Inviter →</button>
                </div>
              ))}
            </div>
            <div className={styles.waitingInput}>
              <LoginInput value={teamRequest} onChange={setTeamRequest} placeholder="Envoyer demande à un login..." className={styles.partnerInput} />
              <button className={styles.confirmBtn} onClick={() => setTeamRequest('')}>Envoyer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal modifier créneau ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Mon créneau">
        <div className={styles.editOptions}>
          <button className={styles.editCancelBtn} onClick={cancelSlot}>✕ Annuler mon créneau</button>
          <button className={styles.editModifyBtn} onClick={openEditPlayers}>✏️ Modifier les joueurs</button>
        </div>
      </Modal>

      {/* ── Modal modifier les joueurs ── */}
      <Modal open={editPlayersOpen} onClose={() => setEditPlayersOpen(false)} title="Modifier les joueurs">
        <div className={styles.teamsGrid}>
          <div className={styles.teamBlue}>
            <div className={styles.teamLabel}>Toi</div>
            <input className={styles.meInput} value={editP1} onChange={e => setEditP1(e.target.value)} />
          </div>
          <div className={styles.teamRed}>
            <div className={styles.teamLabel}>Adversaire</div>
            <LoginInput value={editP2} onChange={setEditP2} placeholder="Login..." className={styles.partnerInput} />
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.confirmBtn} onClick={saveEditPlayers}>Enregistrer</button>
        </div>
      </Modal>
    </Shell>
  )
}
