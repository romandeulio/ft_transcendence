import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './JouerMode.module.css'

export default function JouerMode({ onClose, match, onComplete, onTieCancel, scoreRed: extRed, scoreBlue: extBlue, onScoreChange }) {
  const { t } = useTranslation()

  const slot    = match?._slot
  const is2v2   = slot?.format === '2v2' || slot?.match_type === 'TEAM'
  // team1 = côté bleu (player1), team2 = côté rouge (player2)
  const labelBlue = is2v2 && slot?.team1?.filter(Boolean).length
    ? slot.team1.filter(Boolean).join(' & ')
    : slot?.player1 || t('game.blue')
  const labelRed  = is2v2 && slot?.team2?.filter(Boolean).length
    ? slot.team2.filter(Boolean).join(' & ')
    : slot?.player2 || slot?.p2 || t('game.red')
  const [scoreRed,  setScoreRed]  = useState(extRed  ?? 0)
  const [scoreBlue, setScoreBlue] = useState(extBlue ?? 0)
  const [elapsed,   setElapsed]   = useState(0)
  const [fois,      setFois]      = useState(0)
  const [ended,     setEnded]     = useState(false)
  const intervalRef = useRef(null)
  const localUpdate = useRef(false)

  // Sync external score changes (from the other player via WS)
  useEffect(() => {
    if (localUpdate.current) return
    if (extRed  !== undefined) setScoreRed(extRed)
    if (extBlue !== undefined) setScoreBlue(extBlue)
  }, [extRed, extBlue])

  useEffect(() => {
    if (!ended) {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [ended])

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  const addRed = () => {
    if (ended) return
    const inc = fois > 0 ? fois : 1
    const next = Math.min(19, scoreRed + inc)
    localUpdate.current = true
    setScoreRed(next)
    setFois(0)
    onScoreChange?.(next, scoreBlue)
    setTimeout(() => { localUpdate.current = false }, 300)
  }
  const addBlue = () => {
    if (ended) return
    const inc = fois > 0 ? fois : 1
    const next = Math.min(19, scoreBlue + inc)
    localUpdate.current = true
    setScoreBlue(next)
    setFois(0)
    onScoreChange?.(scoreRed, next)
    setTimeout(() => { localUpdate.current = false }, 300)
  }
  const removeRed = () => {
    if (ended) return
    const next = scoreRed - 1
    localUpdate.current = true
    setScoreRed(next)
    onScoreChange?.(next, scoreBlue)
    setTimeout(() => { localUpdate.current = false }, 300)
  }
  const removeBlue = () => {
    if (ended) return
    const next = scoreBlue - 1
    localUpdate.current = true
    setScoreBlue(next)
    onScoreChange?.(scoreRed, next)
    setTimeout(() => { localUpdate.current = false }, 300)
  }

  const handleEnd = () => {
    setEnded(true)
  }

  if (ended) {
    const isTie = scoreRed === scoreBlue
    const winColor = scoreRed > scoreBlue ? '#CD3122' : scoreBlue > scoreRed ? '#4068DB' : '#7A9BB5'
    const winnerLabel = isTie ? t('game.tie') : t('game.wins', { color: scoreRed > scoreBlue ? labelRed : labelBlue })
    return (
      <div className={styles.overlay}>
        <div className={styles.endScreen}>
          <div className={styles.endTitle} style={{ color: winColor }}>
            {winnerLabel}
          </div>
          <div className={styles.endScore}>
            <span style={{ color: '#CD3122' }}>{scoreRed}</span>
            <span className={styles.endVs}>–</span>
            <span style={{ color: '#4068DB' }}>{scoreBlue}</span>
          </div>
          <div className={styles.endTime}>{t('game.duration', { time: fmt(elapsed) })}</div>
          {isTie && (
            <div className={styles.tieCancelWarning}>{t('game.tieCancelWarning')}</div>
          )}
          <button className={styles.endCloseBtn} onClick={() => {
            if (isTie) {
              if (onTieCancel) onTieCancel()
              else onClose()
            } else {
              if (onComplete) onComplete(scoreRed, scoreBlue)
              else onClose()
            }
          }}>
            {t('game.close')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.overlay}>
      {/* Chrono */}
      <div className={styles.chrono}>{fmt(elapsed)}</div>

      {/* Quitter discret */}
      <button className={styles.closeBtn} onClick={onClose}>{t('game.quit')}</button>

      {/* Terrain */}
      <div className={styles.field}>

        {/* Côté rouge (gauche) */}
        <button className={styles.sideRed} onClick={addRed}>
          <div className={`${styles.sideLabel} ${is2v2 ? styles.sideLabelTeam : ''}`}>{labelRed}</div>
          <div className={styles.sideScore}>{scoreRed}</div>
          {fois > 0 && <div className={styles.demiIndicator}>×{fois}</div>}
        </button>

        {/* Centre */}
        <div className={styles.center}>
          <div className={styles.vsText}>VS</div>
          <button
            className={styles.finPartieBtn}
            onClick={handleEnd}
          >
            {t('game.endMatch').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br/>}</span>)}
          </button>
          <div className={styles.centerBtns}>
            <button
              className={`${styles.demiBtn} ${fois > 0 ? styles.demiBtnActive : ''}`}
              onClick={() => setFois(f => f === 0 ? 2 : f + 1)}
            >
              {fois > 0 ? `×${fois}` : t('game.half')}
            </button>
          </div>
          <div className={styles.gamelleRow}>
            <button className={styles.gamelleBtn} onClick={removeRed}>{t('game.removeRed')}</button>
            <button className={styles.gamelleBtn} onClick={removeBlue}>{t('game.removeBlue')}</button>
          </div>
        </div>

        {/* Côté bleu (droite) */}
        <button className={styles.sideBlue} onClick={addBlue}>
          <div className={`${styles.sideLabel} ${is2v2 ? styles.sideLabelTeam : ''}`}>{labelBlue}</div>
          <div className={styles.sideScore}>{scoreBlue}</div>
          {fois > 0 && <div className={styles.demiIndicator}>×{fois}</div>}
        </button>

      </div>
    </div>
  )
}
