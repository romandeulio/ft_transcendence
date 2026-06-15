import { useState } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Modal from '../components/ui/Modal'
import Pill from '../components/ui/Pill'
import Avatar from '../components/ui/Avatar'
import AddMatchModal from '../components/ui/AddMatchModal'
import { useBets } from '../context/BetsContext'
import { useQueue } from '../context/QueueContext'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import styles from './Planning.module.css'

const MAX_TOKENS = 1412

export default function Planning() {
  const { bets: liveMarkets, placeBet } = useBets()
  const { queue, mySlots, activeGame, completedGameIds, joinQueue, leaveQueue, cancelAsP2, updateSlot, connected, sendInvite, pendingInvites, cancelInvite, liveGames } = useQueue()
  const { user } = useAuth()
  const { t } = useTranslation()
  const [hoveredIdx,  setHoveredIdx]  = useState(null)
  const [inviteMsg,   setInviteMsg]   = useState(null)

  const [betSlot,   setBetSlot]   = useState(null)
  const [betAmount, setBetAmount] = useState(50)
  const [betTeam,   setBetTeam]   = useState(null)
  const [betMsg,    setBetMsg]    = useState(null)

  const [joinOpen, setJoinOpen] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [cancelTargetSlot, setCancelTargetSlot] = useState(null)

  const userPendingCount = () => {
    const u = user?.username
    const mine = mySlots.filter(s => !completedGameIds.has(s._localId)).length
    const invited = queue.filter(s => u && s.p1 !== u && (s.p2 === u || s.team1?.includes(u) || s.team2?.includes(u))).length
    return mine + invited
  }

  const handleJoinConfirm = ({ mode, format, redPlayers, bluePlayers, takeWin }) => {
    if (format === 'Seul') return
    if (userPendingCount() >= 3) return t('home.maxMatches')

    // Vérification max 3 matchs en attente pour les cibles invitées
    if (!takeWin) {
      const targets = [...(bluePlayers || []), ...(redPlayers || [])].filter(p => p && p !== user?.username)
      const overloaded = targets.filter(p => {
        const count = queue.filter(s =>
          s.p1 === p || s.p2 === p ||
          s.team1?.includes(p) || s.team2?.includes(p)
        ).length
        return count >= 3
      })
      if (overloaded.length > 0) return t('home.targetMaxMatches', { player: overloaded.join(', ') })
    }

    const opponent = bluePlayers[0] === user?.username
      ? (redPlayers[0] || null)
      : (bluePlayers[0] || null)
    const isTeam = format === '2v2'
    const matchType = isTeam ? 'TEAM' : 'SOLO'
    const parentSlotId = takeWin
      ? (queue.filter(s => s.match_type === matchType && !completedGameIds.has(s.id) && !completedGameIds.has(s._localId)).at(-1)?.id || null)
      : null
    const userOnBlue = takeWin ? bluePlayers[0] === user?.username : true
    const newSlot = {
      p1:               user?.username,
      p2:               opponent,
      player1:          takeWin ? (userOnBlue ? user?.username : null) : (bluePlayers[0] || user?.username),
      player2:          takeWin ? (userOnBlue ? null : user?.username) : (redPlayers[0] || null),
      player1_teammate: isTeam
        ? (takeWin ? (userOnBlue ? (bluePlayers[1] || null) : null) : (bluePlayers[1] || null))
        : undefined,
      player2_teammate: isTeam
        ? (takeWin ? (userOnBlue ? null : (redPlayers[1] || null)) : (redPlayers[1] || null))
        : undefined,
      match_type:       matchType,
      is_ranked:        mode === 'compet',
      format,
      createdAt:        Date.now(),
      team1:            isTeam ? bluePlayers.filter(Boolean) : undefined,
      team2:            isTeam ? redPlayers.filter(Boolean)  : undefined,
      takeWin:          takeWin || false,
      type:             'taken',
      ...(parentSlotId ? { parentSlotId } : {}),
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

  const handleBet = async () => {
    if (!betSlot || !betTeam) return
    setBetMsg(null)
    const norm = s => (s || '').toString().toLowerCase()
    let reservationId = betSlot.reservationId || null
    let side = null
    if (reservationId) {
      side = betTeam === betSlot.p1 ? 'p1' : 'p2'
    } else {
      const market = liveMarkets.find(m =>
        (norm(m.p1).includes(norm(betSlot.p1)) && norm(m.p2).includes(norm(betSlot.p2))) ||
        (norm(m.p1).includes(norm(betSlot.p2)) && norm(m.p2).includes(norm(betSlot.p1)))
      )
      if (market) {
        reservationId = market.reservationId
        side = norm(market.p1).includes(norm(betTeam)) ? 'p1' : 'p2'
      }
    }
    if (!reservationId) {
      setBetMsg('Les paris ouvriront quand la partie démarrera.')
      return
    }
    try {
      await placeBet(reservationId, side, betAmount)
      setBetSlot(null)
      setBetAmount(50)
      setBetTeam(null)
      setBetMsg(null)
    } catch (e) {
      setBetMsg(e.message || 'Pari refusé.')
    }
  }


  const u = user?.username

  const cancelSlot = () => {
    const target = cancelTargetSlot
    setCancelTargetSlot(null)
    setEditOpen(false)
    if (!target) return
    const slotId = target._localId || target.id
    if (target.p1 === u) {
      // Owner: leaveQueue removes from mySlots + sends 'leave' to backend
      leaveQueue(slotId)
    } else {
      // Non-owner participant (J2 / teammate): sends 'leave_as_p2'
      cancelAsP2(slotId)
    }
  }


  const invitedSlot = queue.find(s => {
    const sid = s.id || s._localId
    if (sid && completedGameIds.has(sid)) return false
    if (s.live) return false
    return s.p1 !== u && u && (s.p2 === u || (s.team1 || []).includes(u) || (s.team2 || []).includes(u))
  }) || null
  const mySlot = mySlots.find(s =>
    !completedGameIds.has(s._localId) &&
    s.type !== 'pending_invite' &&
    s._localId !== activeGame?.gameId
  ) || invitedSlot || null
  const pendingInviteSlots = mySlots.filter(s => s.type === 'pending_invite' && !completedGameIds.has(s._localId))
  const liveSlots = (() => {
    const fromQueue = queue.filter(s => s.live)
    if (!activeGame) return fromQueue
    const alreadyIn = fromQueue.some(s => (s.id || s._localId) === activeGame.gameId)
    if (alreadyIn) return fromQueue
    return [...fromQueue, {
      id: activeGame.gameId,
      _localId: activeGame.gameId,
      p1: activeGame.player1,
      p2: activeGame.player2,
      player1: activeGame.player1,
      player2: activeGame.player2,
      player1_teammate: activeGame.player1_teammate || null,
      player2_teammate: activeGame.player2_teammate || null,
      match_type: activeGame.match_type || 'SOLO',
      format: activeGame.match_type === 'TEAM' ? '2v2' : '1v1',
      live: true,
    }]
  })()
  const displaySlots = queue.filter(s => s.type !== 'free')
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
                const isMe          = slot.p1 === u
                const isParticipant = isMe || !!(u && (slot.p2 === u || slot.team1?.includes(u) || slot.team2?.includes(u)))
                const isLive  = !!slot.live
                const isTaken = slot.type === 'taken' && !slot.live
                const hovered = hoveredIdx === i

                return (
                  <div
                    key={slot.id || i}
                    className={styles.slotWrapper}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    <div className={styles.slotLabel}>
                      {isLive        && <span className={styles.liveLabelText}>{t('queue.live')}</span>}
                      {isParticipant && <span className={styles.mineLabelText}>{t('queue.myMatch')}</span>}
                    </div>

                    <div
                      className={[
                        styles.slot,
                        isLive        ? styles.slotLive  : '',
                        isParticipant ? styles.slotMine  : '',
                        isTaken       ? styles.slotTaken : '',
                      ].join(' ')}
                    >
                      {slot.p1 && (
                        <div className={styles.slotNames}>
                          {slot.format === '2v2' && Array.isArray(slot.team1) && slot.team1.length ? (
                            <>
                              <span className={styles.dotBlue} />{slot.team1.join(' & ')}
                              <br />vs<br />
                              <span className={styles.dotRed} />{Array.isArray(slot.team2) && slot.team2.length ? slot.team2.join(' & ') : '...'}
                            </>
                          ) : (() => {
                            const p1Blue = slot.player2 !== slot.p1 && (!slot.player1 || slot.player1 === slot.p1)
                            return (
                              <>
                                <span className={p1Blue ? styles.dotBlue : styles.dotRed} />{slot.p1}
                                <br />vs<br />
                                <span className={p1Blue ? styles.dotRed : styles.dotBlue} />{slot.p2 || (slot.takeWin ? '...' : '?')}
                              </>
                            )
                          })()}
                        </div>
                      )}
                      {slot.format && <div className={styles.slotFormat}>{slot.format}</div>}

                      {!isLive && isParticipant && (
                        <button
                          className={styles.editSlotBtn}
                          onClick={e => { e.stopPropagation(); setCancelTargetSlot(slot); setEditOpen(true) }}
                        >✕</button>
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
              {mySlot ? (() => {
                const isTeam = mySlot.format === '2v2'
                const iAmP1 = mySlot.p1 === u || (Array.isArray(mySlot.team1) && mySlot.team1.includes(u))
                let opponentLabel
                if (isTeam) {
                  const oppTeam = iAmP1 ? mySlot.team2 : mySlot.team1
                  opponentLabel = Array.isArray(oppTeam) && oppTeam.filter(Boolean).length
                    ? oppTeam.filter(Boolean).join(' & ')
                    : (iAmP1 ? mySlot.p2 : mySlot.p1) || '?'
                } else {
                  const opp = iAmP1 ? mySlot.p2 : mySlot.p1
                  opponentLabel = opp || (mySlot.takeWin ? t('queue.waitingWinner') : '?')
                }
                return (
                  <div className={styles.myMatchInfo}>
                    <Avatar initials={opponentLabel.substring(0, 2).toUpperCase()} size={34} bg="var(--beige)" round />
                    <div>
                      <div className={styles.myMatchVs}>vs <strong>{opponentLabel}</strong></div>
                      <div className={styles.myMatchSub}>{mySlot.format} · {mySlot.is_ranked ? t('addMatch.competition') : t('addMatch.chill')}</div>
                    </div>
                  </div>
                )
              })() : (
                <div className={styles.noMatch}>{t('queue.noMatch')}</div>
              )}
            </div>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.infoCardHeader}>{t('queue.currentMatch')}</div>
            <div className={styles.infoCardBody}>
              {liveSlots.length === 0 && (
                <div className={styles.noMatch}>{t('queue.noLive')}</div>
              )}
              {liveSlots.map((s) => {
                const slotId = s.id || s._localId
                const game = liveGames[slotId] ?? (s.scoreBlue !== undefined ? { scoreBlue: s.scoreBlue, scoreRed: s.scoreRed } : null)
                const blueLabel = s.format === '2v2' && s.team1?.length
                  ? s.team1.filter(Boolean).join(' & ')
                  : s.player1 || s.p1 || '?'
                const redLabel = s.format === '2v2' && s.team2?.length
                  ? s.team2.filter(Boolean).join(' & ')
                  : s.player2 || s.p2 || '?'
                return (
                  <div key={slotId} className={styles.liveMatchRow}>
                    <Pill label="LIVE" type="live" />
                    <div className={styles.liveMatchContent}>
                      <div className={styles.liveMatchNames}>
                        <span className={styles.dotBlue} />{blueLabel}
                        {' vs '}
                        <span className={styles.dotRed} />{redLabel}
                      </div>
                      {game && (
                        <div className={styles.liveScore}>
                          <span className={styles.liveScoreBlue}>{game.scoreBlue ?? 0}</span>
                          <span className={styles.liveScoreSep}>–</span>
                          <span className={styles.liveScoreRed}>{game.scoreRed ?? 0}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className={styles.infoCard}>
          <div className={styles.infoCardHeader}>{t('queue.pendingAccept')}</div>
          <div className={styles.infoCardBody}>
            {pendingInviteSlots.length === 0 && pendingInvites.length === 0 ? (
              <div className={styles.noMatch}>{t('queue.noPending')}</div>
            ) : (
              <div className={styles.pendingList}>
                {pendingInviteSlots.map(s => (
                  <div key={s._localId} className={styles.pendingRow}>
                    <div className={styles.pendingInfo}>
                      <span className={styles.pendingVs}>
                        {s.p2
                          ? t('queue.pendingVs', { opponent: s.p2 })
                          : (s._targets?.join(', ') || '?')}
                      </span>
                      <span className={styles.pendingFormat}>{s.format} · {t('invite.pendingLabel')}</span>
                    </div>
                    <button
                      className={styles.pendingCancelBtn}
                      onClick={() => cancelInvite(s._localId)}
                    >
                      {t('queue.cancelInvite')}
                    </button>
                  </div>
                ))}
                {pendingInvites.map(inv => (
                  <div key={inv.inviteId} className={styles.pendingRow}>
                    <div className={styles.pendingInfo}>
                      <span className={styles.pendingVs}>{inv.from}</span>
                      <span className={styles.pendingFormat}>
                        {inv.slot?.format || '1v1'} · {inv.slot?.is_ranked ? t('addMatch.competition') : t('addMatch.chill')} · {t('invite.pendingLabel')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal parier ── */}
      <Modal open={!!betSlot} onClose={() => { setBetSlot(null); setBetTeam(null); setBetMsg(null) }} title={t('queue.betModalTitle')}>
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
                  type="range" min={1} max={Math.max(user?.wallet_tokens ?? 1, 1)} value={betAmount}
                  onChange={e => setBetAmount(+e.target.value)}
                  className={styles.slider}
                />
                <div className={styles.sliderRange}><span>1</span><span>{user?.wallet_tokens ?? 0}</span></div>
              </div>
            </div>
            {betMsg && (
              <div className={styles.modalSection} style={{ color: '#CD3122', fontSize: 13 }}>
                {betMsg}
              </div>
            )}
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
      <Modal open={editOpen} onClose={() => { setEditOpen(false); setCancelTargetSlot(null) }} title={t('queue.mySlotTitle')}>
        <div className={styles.editOptions}>
          <button className={styles.editCancelBtn} onClick={cancelSlot}>{t('queue.cancelSlot')}</button>
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
