import { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import LoginInput from './LoginInput'
import { useTranslation } from 'react-i18next'
import styles from './AddMatchModal.module.css'

export default function AddMatchModal({ open, onClose, onConfirm, user, prevTeam }) {
  const { t } = useTranslation()
  const [step,        setStep]        = useState(1)
  const [joinMode,    setJoinMode]    = useState('compet')
  const [joinFormat,  setJoinFormat]  = useState('1v1')
  const [redPlayers,  setRedPlayers]  = useState(['', ''])
  const [bluePlayers, setBluePlayers] = useState(['', ''])
  const [takeWin,     setTakeWin]     = useState(null)

  useEffect(() => {
    if (open) setBluePlayers(['', ''])
  }, [open])

  const reset = () => {
    setStep(1); setJoinMode('compet'); setJoinFormat('1v1')
    setRedPlayers(['', '']); setBluePlayers(['', '']); setTakeWin(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleConfirm = () => {
    onConfirm?.({ mode: joinMode, format: joinFormat, redPlayers, bluePlayers, takeWin })
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
      else if (step === 2) setStep(3)
      else if (step === 3 && joinFormat === 'Seul') confirmRef.current()
      else if (step === 3) setStep(4)
      else if (step === 4 && takeWin !== null) confirmRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, step, joinFormat, takeWin])

  return (
    <Modal open={open} onClose={handleClose} title={t('addMatch.title')}>
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
            <button className={styles.nextBtn} onClick={() => setStep(3)}>{t('addMatch.next')}</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className={styles.stepLabel}>
            {joinFormat === 'Seul' ? t('addMatch.step3Queue') : t('addMatch.step3Players')}
          </div>
          {joinFormat === 'Seul' ? (
            <div className={styles.seulMsg}>
              {t('addMatch.soloMsg')}
            </div>
          ) : (
            <div className={styles.teamsGrid}>
              <div className={styles.teamRed}>
                <div className={styles.teamLabel}>{t('addMatch.redTeam')}</div>
                {Array.from({ length: joinFormat === '2v2' ? 2 : 1 }).map((_, i) => (
                  <LoginInput
                    key={i}
                    value={redPlayers[i] || ''}
                    onChange={v => setRedPlayers(prev => { const n = [...prev]; n[i] = v; return n })}
                    placeholder={joinFormat === '2v2' ? t('addMatch.redPlayer2v2', { num: i + 1 }) : t('addMatch.redPlayer')}
                  />
                ))}
              </div>
              <div className={styles.teamBlue}>
                <div className={styles.teamLabel}>{t('addMatch.blueTeam')}</div>
                {/* Joueur 1 bleu = toujours l'utilisateur connecté, verrouillé */}
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
              </div>
            </div>
          )}
          <div className={styles.stepActions}>
            <button className={styles.backBtn} onClick={() => setStep(2)}>{t('addMatch.back')}</button>
            {joinFormat === 'Seul' ? (
              <button className={styles.confirmBtn} onClick={handleConfirm}>{t('addMatch.joinQueue')}</button>
            ) : (
              <button className={styles.nextBtn} onClick={() => setStep(4)}>{t('addMatch.next')}</button>
            )}
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <div className={styles.stepLabel}>{t('addMatch.step4')}</div>
          <div className={styles.step4Question}>
            {t('addMatch.takeWinQuestion')}
          </div>
          <div className={styles.ouiNonRow}>
            <button
              className={`${styles.nonBtn} ${takeWin === false ? styles.nonBtnActive : ''}`}
              onClick={() => setTakeWin(false)}
            >
              {t('addMatch.no')}
            </button>
            <button
              className={`${styles.ouiBtn} ${takeWin === true ? styles.ouiBtnActive : ''}`}
              onClick={() => setTakeWin(true)}
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
          <div className={styles.stepActions}>
            <button className={styles.backBtn} onClick={() => setStep(3)}>{t('addMatch.back')}</button>
            <button
              className={styles.confirmBtn}
              onClick={handleConfirm}
              disabled={takeWin === null}
              style={takeWin === null ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >
              {t('addMatch.confirm')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
