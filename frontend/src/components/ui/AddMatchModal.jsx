import { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import LoginInput from './LoginInput'
import { useTranslation } from 'react-i18next'
import styles from './AddMatchModal.module.css'

export default function AddMatchModal({ open, onClose, onConfirm, user, prevTeam, initialOpponent }) {
  const { t } = useTranslation()

  const u = user?.username
  const userIsInPrevTeam = !!(prevTeam && u && (
    prevTeam.p1 === u ||
    prevTeam.p2 === u ||
    prevTeam.team1?.includes(u) ||
    prevTeam.team2?.includes(u)
  ))
  const canTakeWin = !!prevTeam && !userIsInPrevTeam
  const [step,        setStep]        = useState(1)
  const [joinMode,    setJoinMode]    = useState('compet')
  const [joinFormat,  setJoinFormat]  = useState('1v1')
  const [redPlayers,  setRedPlayers]  = useState(['', ''])
  const [bluePlayers, setBluePlayers] = useState(['', ''])
  const [takeWin,     setTakeWin]     = useState(null)
  const [myColor,     setMyColor]     = useState('blue')

  useEffect(() => {
    if (!open) return
    if (initialOpponent) {
      // Pre-fill opponent, start from mode choice (step 1), skip takeWin step
      setTakeWin(false)
      setRedPlayers([initialOpponent, ''])
      setBluePlayers(['', ''])
      setMyColor('blue')
      setStep(1)
    } else {
      setBluePlayers(['', ''])
    }
  }, [open, initialOpponent])

  const reset = () => {
    setStep(1); setJoinMode('compet'); setJoinFormat('1v1')
    setRedPlayers(['', '']); setBluePlayers(['', '']); setTakeWin(null); setMyColor('blue')
  }

  const handleClose = () => { reset(); onClose() }

  const handleConfirm = () => {
    // Quand takeWin=true : l'adversaire sera le gagnant du match précédent (pas saisi)
    let finalBlue, finalRed
    if (takeWin === true) {
      finalBlue = myColor === 'blue' ? [user?.username, bluePlayers[1]] : []
      finalRed  = myColor === 'red'  ? [user?.username, bluePlayers[1]] : []
    } else {
      finalBlue = myColor === 'blue'
        ? [user?.username, bluePlayers[1]]
        : [redPlayers[0], redPlayers[1]]
      finalRed = myColor === 'blue'
        ? [redPlayers[0], redPlayers[1]]
        : [user?.username, bluePlayers[1]]
    }
    onConfirm?.({ mode: joinMode, format: joinFormat, redPlayers: finalRed, bluePlayers: finalBlue, takeWin })
    reset()
    onClose()
  }

  // Ref toujours à jour pour le handler keydown
  const confirmRef = useRef(handleConfirm)
  confirmRef.current = handleConfirm

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key !== 'Enter') return
      if (step === 1) setStep(2)
      else if (step === 2) setStep(initialOpponent ? 4 : 3)
      else if (step === 3 && joinFormat === 'Seul') confirmRef.current()
      else if (step === 3 && takeWin !== null) {
        // 1v1 + prendre la gagne → pas besoin de choisir l'adversaire
        if (takeWin === true && joinFormat === '1v1') confirmRef.current()
        else setStep(4)
      }
      else if (step === 4) confirmRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, step, joinFormat, takeWin])

  return (
    <Modal open={open} onClose={handleClose} title={t('addMatch.title')}>

      {/* ── Étape 1 : Mode ── */}
      {step === 1 && (
        <div>
          <div className={styles.stepLabel}>{t('addMatch.step1')}</div>
          <div className={styles.modeBtns}>
            <button className={`${styles.modeBtn} ${joinMode === 'compet' ? styles.modeBtnCompet : ''}`} onClick={() => setJoinMode('compet')}>{t('addMatch.competition')}</button>
            <button className={`${styles.modeBtn} ${joinMode === 'chill'  ? styles.modeBtnChill  : ''}`} onClick={() => setJoinMode('chill')}>{t('addMatch.chill')}</button>
          </div>
          <div className={styles.modeNote}>
            {joinMode === 'compet' ? t('addMatch.competNote') : t('addMatch.chillNote')}
          </div>
          <div className={styles.stepActions}>
            <button className={styles.nextBtn} onClick={() => setStep(2)}>{t('addMatch.next')}</button>
          </div>
        </div>
      )}

      {/* ── Étape 2 : Format ── */}
      {step === 2 && (
        <div>
          <div className={styles.stepLabel}>{t('addMatch.step2')}</div>
          <div className={styles.formatBtns}>
            {['1v1', '2v2', 'Seul'].map(f => (
              <button key={f} className={`${styles.modeBtn} ${joinFormat === f ? styles.modeBtnCompet : ''}`} onClick={() => setJoinFormat(f)}>
                {f === '1v1' ? '⚔️ 1v1' : f === '2v2' ? '👥 2v2' : t('addMatch.solo')}
              </button>
            ))}
          </div>
          <div className={styles.stepActions}>
            <button className={styles.backBtn} onClick={() => setStep(1)}>{t('addMatch.back')}</button>
            <button className={styles.nextBtn} onClick={() => setStep(initialOpponent ? 4 : 3)}>{t('addMatch.next')}</button>
          </div>
        </div>
      )}

      {/* ── Étape 3 : Prendre la gagne ? (ou message Seul) ── */}
      {step === 3 && (
        <div>
          <div className={styles.stepLabel}>
            {joinFormat === 'Seul' ? t('addMatch.step3Queue') : t('addMatch.step3Win')}
          </div>

          {joinFormat === 'Seul' ? (
            <div className={styles.seulMsg}>{t('addMatch.soloMsg')}</div>
          ) : (
            <>
              <div className={styles.step4Question}>{t('addMatch.takeWinQuestion')}</div>
              <div className={styles.ouiNonRow}>
                <button
                  className={`${styles.nonBtn} ${takeWin === false ? styles.nonBtnActive : ''}`}
                  onClick={() => setTakeWin(false)}
                >
                  {t('addMatch.no')}
                </button>
                <button
                  className={`${styles.ouiBtn} ${takeWin === true ? styles.ouiBtnActive : ''}`}
                  onClick={() => canTakeWin && setTakeWin(true)}
                  disabled={!canTakeWin}
                  style={!canTakeWin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
                  title={!prevTeam ? t('addMatch.noPrevSlot') : userIsInPrevTeam ? t('addMatch.alreadyParticipant') : undefined}
                >
                  {t('addMatch.yes')}
                </button>
              </div>
              <div className={styles.prevSlotTitle}>{t('addMatch.prevSlot')}</div>
              <div className={styles.prevSlotCard}>
                {prevTeam ? (
                  <div className={styles.prevSlotDuel}>
                    <span className={styles.prevSlotName}>{prevTeam.p1}</span>
                    <span className={styles.prevSlotVs}>{t('common.vs')}</span>
                    <span className={styles.prevSlotName}>{prevTeam.p2}</span>
                    {prevTeam.format && <span className={styles.prevSlotMeta}>{prevTeam.format}</span>}
                  </div>
                ) : (
                  <div className={styles.noMatch}>{t('addMatch.noPrevSlot')}</div>
                )}
              </div>
            </>
          )}

          <div className={styles.stepActions}>
            <button className={styles.backBtn} onClick={() => setStep(2)}>{t('addMatch.back')}</button>
            {joinFormat === 'Seul' ? (
              <button className={styles.confirmBtn} onClick={handleConfirm}>{t('addMatch.joinQueue')}</button>
            ) : takeWin === true && joinFormat === '1v1' ? (
              // 1v1 + prendre la gagne → adversaire = gagnant → on confirme directement
              <button className={styles.confirmBtn} onClick={handleConfirm}>{t('addMatch.confirm')}</button>
            ) : (
              <button
                className={styles.nextBtn}
                onClick={() => setStep(4)}
                disabled={takeWin === null}
                style={takeWin === null ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
              >
                {t('addMatch.next')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Étape 4 : Joueurs ── */}
      {step === 4 && (
        <div>
          <div className={styles.stepLabel}>{t('addMatch.step4Players')}</div>

          {/* Choix de couleur (toujours affiché) */}
          <div className={styles.colorToggle}>
            <span className={styles.colorToggleLabel}>{t('addMatch.yourColor')}</span>
            <button
              className={`${styles.colorBtn} ${myColor === 'blue' ? styles.colorBtnBlueActive : ''}`}
              onClick={() => setMyColor('blue')}
            >{t('addMatch.blueTeam')}</button>
            <button
              className={`${styles.colorBtn} ${myColor === 'red' ? styles.colorBtnRedActive : ''}`}
              onClick={() => setMyColor('red')}
            >{t('addMatch.redTeam')}</button>
          </div>

          <div className={styles.teamsGrid}>
            {/* Équipe rouge */}
            <div className={styles.teamRed}>
              <div className={styles.teamLabel}>{t('addMatch.redTeam')}</div>
              {myColor === 'red' ? (
                // Utilisateur = rouge
                <>
                  <div className={styles.lockedPlayer}>
                    <span>{user?.username}</span>
                    <span className={styles.lockedPlayerTag}>{t('addMatch.you')}</span>
                  </div>
                  {joinFormat === '2v2' && (
                    <LoginInput
                      value={bluePlayers[1] || ''}
                      onChange={v => setBluePlayers(prev => { const n = [...prev]; n[1] = v; return n })}
                      placeholder={t('addMatch.redPlayer2v2', { num: 2 })}
                    />
                  )}
                </>
              ) : takeWin === true ? (
                // Adversaire rouge = gagnant du match précédent (verrouillé)
                <div className={styles.lockedPlayer} style={{ opacity: 0.6 }}>
                  <span>{prevTeam ? `${prevTeam.p1} / ${prevTeam.p2}` : '?'}</span>
                  <span className={styles.lockedPlayerTag}>{t('addMatch.opponentLocked')}</span>
                </div>
              ) : (
                Array.from({ length: joinFormat === '2v2' ? 2 : 1 }).map((_, i) => (
                  <LoginInput
                    key={i}
                    value={redPlayers[i] || ''}
                    onChange={v => setRedPlayers(prev => { const n = [...prev]; n[i] = v; return n })}
                    placeholder={joinFormat === '2v2' ? t('addMatch.redPlayer2v2', { num: i + 1 }) : t('addMatch.redPlayer')}
                  />
                ))
              )}
            </div>

            {/* Équipe bleue */}
            <div className={styles.teamBlue}>
              <div className={styles.teamLabel}>{t('addMatch.blueTeam')}</div>
              {myColor === 'blue' ? (
                // Utilisateur = bleu
                <>
                  <div className={styles.lockedPlayer}>
                    <span>{user?.username}</span>
                    <span className={styles.lockedPlayerTag}>{t('addMatch.you')}</span>
                  </div>
                  {joinFormat === '2v2' && (
                    <LoginInput
                      value={bluePlayers[1] || ''}
                      onChange={v => setBluePlayers(prev => { const n = [...prev]; n[1] = v; return n })}
                      placeholder={t('addMatch.bluePlayer2v2', { num: 2 })}
                    />
                  )}
                </>
              ) : takeWin === true ? (
                // Adversaire bleu = gagnant du match précédent (verrouillé)
                <div className={styles.lockedPlayer} style={{ opacity: 0.6 }}>
                  <span>{prevTeam ? `${prevTeam.p1} / ${prevTeam.p2}` : '?'}</span>
                  <span className={styles.lockedPlayerTag}>{t('addMatch.opponentLocked')}</span>
                </div>
              ) : (
                Array.from({ length: joinFormat === '2v2' ? 2 : 1 }).map((_, i) => (
                  <LoginInput
                    key={i}
                    value={redPlayers[i] || ''}
                    onChange={v => setRedPlayers(prev => { const n = [...prev]; n[i] = v; return n })}
                    placeholder={joinFormat === '2v2' ? t('addMatch.bluePlayer2v2', { num: i + 1 }) : t('addMatch.bluePlayer')}
                  />
                ))
              )}
            </div>
          </div>

          <div className={styles.stepActions}>
            <button className={styles.backBtn} onClick={() => setStep(3)}>{t('addMatch.back')}</button>
            <button className={styles.confirmBtn} onClick={handleConfirm}>{t('addMatch.confirm')}</button>
          </div>
        </div>
      )}

    </Modal>
  )
}
