import { useState } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Modal from '../components/ui/Modal'
import Pill from '../components/ui/Pill'
import Avatar from '../components/ui/Avatar'
import LoginInput from '../components/ui/LoginInput'
import AddMatchModal from '../components/ui/AddMatchModal'
import { useBets } from '../context/BetsContext'
import { useQueue } from '../context/QueueContext'
import { useAuth } from '../hooks/useAuth'
import styles from './Planning.module.css'

const MAX_TOKENS = 1412

export default function Planning() {
  const { addBet } = useBets()
  const { queue, joinQueue, leaveQueue, updateSlot, connected } = useQueue()
  const { user } = useAuth()
  const [hoveredIdx,  setHoveredIdx]  = useState(null)

  const [betSlot,   setBetSlot]   = useState(null)
  const [betAmount, setBetAmount] = useState(50)
  const [betTeam,   setBetTeam]   = useState(null)

  const [joinOpen, setJoinOpen] = useState(false)

  const [editOpen,        setEditOpen]        = useState(false)
  const [editPlayersOpen, setEditPlayersOpen] = useState(false)
  const [editP1,          setEditP1]          = useState('')
  const [editP2,          setEditP2]          = useState('')

  const handleJoinConfirm = ({ format, redPlayers, bluePlayers }) => {
    if (format === 'Seul') return
    const newSlot = {
      p1: bluePlayers[0],
      p2: redPlayers[0],
      format,
      team1: format === '2v2' ? bluePlayers : undefined,
      team2: format === '2v2' ? redPlayers : undefined,
      type: 'taken',
    }
    joinQueue(newSlot)
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
  const prevTeam = displaySlots.length > 0 ? displaySlots[displaySlots.length - 1] : null

  return (
    <Shell>
      <Topbar
        title="File d'attente"
        titleSize={30}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!connected && <span style={{ fontSize: '12px', color: 'var(--red)' }}>Déconnecté</span>}
            <button className={styles.btnJoin} onClick={() => setJoinOpen(true)}>
              + S'ajouter à la file
            </button>
          </div>
        }
      />

      <div className={styles.content}>

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

              <div className={styles.slotWrapper} key="book">
                <div className={styles.slotLabel} />
                <div
                  className={`${styles.slot} ${styles.slotBook}`}
                  onClick={() => setJoinOpen(true)}
                >
                  <div className={styles.bookPlus}>+</div>
                  <div className={styles.bookLabel}>Réserver ce créneau</div>
                </div>
              </div>
            </div>
          </div>
        </div>

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
                  type="range" min={1} max={Math.max(user?.tokens ?? 1000, 1)} value={betAmount}
                  onChange={e => setBetAmount(+e.target.value)}
                  className={styles.slider}
                />
                <div className={styles.sliderRange}><span>1</span><span>{user?.tokens ?? 1000}</span></div>
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

      <AddMatchModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onConfirm={handleJoinConfirm}
        user={user}
        prevTeam={prevTeam}
      />

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
