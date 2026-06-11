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
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import styles from './Planning.module.css'

const MAX_TOKENS = 1412

export default function Planning() {
  const { addBet } = useBets()
  const { queue, joinQueue, leaveQueue, updateSlot, connected, sendInvite } = useQueue()
  const { user } = useAuth()
  const { t } = useTranslation()
  const [hoveredIdx,  setHoveredIdx]  = useState(null)
  const [inviteMsg,   setInviteMsg]   = useState(null)

  const [betSlot,   setBetSlot]   = useState(null)
  const [betAmount, setBetAmount] = useState(50)
  const [betTeam,   setBetTeam]   = useState(null)

  const [joinOpen, setJoinOpen] = useState(false)

  const [editOpen,        setEditOpen]        = useState(false)
  const [editPlayersOpen, setEditPlayersOpen] = useState(false)
  const [editP1,          setEditP1]          = useState('')
  const [editP2,          setEditP2]          = useState('')

  const handleJoinConfirm = ({ mode, format, redPlayers, bluePlayers, takeWin }) => {
    if (format === 'Seul') return
    const opponent = bluePlayers[0] === user?.username
      ? (redPlayers[0] || null)
      : (bluePlayers[0] || null)
    const isTeam = format === '2v2'
    const newSlot = {
      p1:               user?.username,
      p2:               opponent,
      player1:          bluePlayers[0] || user?.username,
      player2:          redPlayers[0]  || null,
      player1_teammate: isTeam ? (bluePlayers[1] || null) : undefined,
      player2_teammate: isTeam ? (redPlayers[1]  || null) : undefined,
      match_type:       isTeam ? 'TEAM' : 'SOLO',
      is_ranked:        mode === 'compet',
      format,
      team1:            isTeam ? bluePlayers.filter(Boolean) : undefined,
      team2:            isTeam ? redPlayers.filter(Boolean)  : undefined,
      takeWin:          takeWin || false,
      type:             'taken',
    }
    if (opponent && !takeWin) {
      const localSlot = { ...newSlot, _localId: crypto.randomUUID() }
      const inviteTargets = isTeam
        ? [...bluePlayers, ...redPlayers].filter(p => p && p !== user?.username)
        : [opponent]
      sendInvite(inviteTargets, localSlot)
      setInviteMsg(t('invite.sent', { player: inviteTargets.join(', ') }))
      setTimeout(() => setInviteMsg(null), 4000)
    } else {
      joinQueue(newSlot)
    }
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
        title={t('topbar.queue')}
        titleSize={30}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!connected && <span style={{ fontSize: '12px', color: 'var(--red)' }}>{t('queue.disconnected')}</span>}
            <button className={styles.btnJoin} onClick={() => setJoinOpen(true)}>
              {t('queue.joinQueue')}
            </button>
          </div>
        }
      />

      <div className={styles.content}>

        <div className={styles.timelineCard}>
          <div className={styles.timelineHeader}>{t('queue.waitingMatches')}</div>
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
                      {isLive && <span className={styles.liveLabelText}>{t('queue.live')}</span>}
                      {isMe   && <span className={styles.mineLabelText}>{t('queue.myMatch')}</span>}
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
                            : <>{slot.p1}<br />vs<br />{slot.p2 || (slot.takeWin ? '...' : '?')}</>
                          }
                        </div>
                      )}
                      {slot.format && <div className={styles.slotFormat}>{slot.format}</div>}

                      {isMe && (
                        <button
                          className={styles.editSlotBtn}
                          onClick={e => { e.stopPropagation(); setEditOpen(true) }}
                          title={t('queue.editSlot')}
                        >✏️</button>
                      )}

                      {(isLive || isTaken) && hovered && (
                        <button
                          className={styles.hoverBetBtn}
                          onClick={e => { e.stopPropagation(); setBetSlot(slot); setBetAmount(50) }}
                        >
                          {t('queue.betOn')}
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
                  <div className={styles.bookLabel}>{t('queue.bookSlot')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.infoRow}>
          <div className={styles.infoCard}>
            <div className={styles.infoCardHeader}>{t('queue.nextMatch')}</div>
            <div className={styles.infoCardBody}>
              {mySlot ? (
                <div className={styles.myMatchInfo}>
                  <Avatar initials={mySlot.p2?.substring(0, 2).toUpperCase() || "?"} size={34} bg="var(--beige)" round />
                  <div>
                    <div className={styles.myMatchVs}>vs <strong>{mySlot.p2 || (mySlot.takeWin ? t('queue.waitingWinner') : '?')}</strong></div>
                    <div className={styles.myMatchSub}>{mySlot.format} · {mySlot.type === 'live' ? 'En cours' : 'Compétition'}</div>
                  </div>
                </div>
              ) : (
                <div className={styles.noMatch}>{t('queue.noMatch')}</div>
              )}
            </div>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.infoCardHeader}>{t('queue.currentMatch')}</div>
            <div className={styles.infoCardBody}>
              {liveSlots.map((s, i) => (
                <div key={i} className={styles.liveMatchRow}>
                  <Pill label="LIVE" type="live" />
                  <span className={styles.liveMatchNames}>{s.p1} vs {s.p2}</span>
                </div>
              ))}
              {liveSlots.length === 0 && (
                <div className={styles.noMatch}>{t('queue.noLive')}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal parier ── */}
      <Modal open={!!betSlot} onClose={() => { setBetSlot(null); setBetTeam(null) }} title={t('queue.betModalTitle')}>
        {betSlot && (
          <>
            <div className={styles.betMatchRow}>
              <strong>{betSlot.p1}</strong> vs <strong>{betSlot.p2}</strong>
            </div>
            <div className={styles.modalSection}>
              <label className={styles.modalLabel}>{t('queue.betOn2')}</label>
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
              <label className={styles.modalLabel}>{t('queue.betAmount')}</label>
              <div className={styles.sliderBox}>
                <div className={styles.sliderLabel}>{t('bets.amount', { amount: betAmount })}</div>
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
                {t('queue.confirmBet', { amount: betAmount })}
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
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={t('queue.mySlotTitle')}>
        <div className={styles.editOptions}>
          <button className={styles.editCancelBtn} onClick={cancelSlot}>{t('queue.cancelSlot')}</button>
          <button className={styles.editModifyBtn} onClick={openEditPlayers}>{t('queue.modifyPlayers')}</button>
        </div>
      </Modal>

      <Modal open={editPlayersOpen} onClose={() => setEditPlayersOpen(false)} title={t('queue.modifyPlayers')}>
        <div className={styles.teamsGrid}>
          <div className={styles.teamBlue}>
            <div className={styles.teamLabel}>{t('queue.me')}</div>
            <input className={styles.meInput} value={editP1} onChange={e => setEditP1(e.target.value)} />
          </div>
          <div className={styles.teamRed}>
            <div className={styles.teamLabel}>{t('queue.opponent')}</div>
            <LoginInput value={editP2} onChange={setEditP2} placeholder={t('queue.loginPlaceholder')} className={styles.partnerInput} />
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.confirmBtn} onClick={saveEditPlayers}>{t('queue.save')}</button>
        </div>
      </Modal>

      {inviteMsg && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#22aa55', color:'#fff', padding:'10px 20px', borderRadius:8, zIndex:9999 }}>
          {inviteMsg}
        </div>
      )}
    </Shell>
  )
}
