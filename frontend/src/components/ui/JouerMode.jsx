import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './JouerMode.module.css'

export default function JouerMode({ onClose }) {
  const { t } = useTranslation()
  const [scoreRed,  setScoreRed]  = useState(0)
  const [scoreBlue, setScoreBlue] = useState(0)
  const [elapsed,   setElapsed]   = useState(0)
  const [fois,      setFois]      = useState(0)
  const [ended,     setEnded]     = useState(false)
  const intervalRef = useRef(null)

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
    setScoreRed(n => n + (fois > 0 ? fois : 1))
    setFois(0)
  }
  const addBlue = () => {
    if (ended) return
    setScoreBlue(n => n + (fois > 0 ? fois : 1))
    setFois(0)
  }
  const removeRed  = () => !ended && setScoreRed(n => Math.max(0, n - 1))
  const removeBlue = () => !ended && setScoreBlue(n => Math.max(0, n - 1))

  const handleEnd = () => {
    setEnded(true)
  }

  if (ended) {
    const isTie = scoreRed === scoreBlue
    const winColor = scoreRed > scoreBlue ? '#CD3122' : scoreBlue > scoreRed ? '#4068DB' : '#7A9BB5'
    const winnerLabel = isTie ? t('game.tie') : t('game.wins', { color: scoreRed > scoreBlue ? t('game.red') : t('game.blue') })
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
          <button className={styles.endCloseBtn} onClick={onClose}>
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
          <div className={styles.sideLabel}>{t('game.red')}</div>
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
          <div className={styles.sideLabel}>{t('game.blue')}</div>
          <div className={styles.sideScore}>{scoreBlue}</div>
          {fois > 0 && <div className={styles.demiIndicator}>×{fois}</div>}
        </button>

      </div>
    </div>
  )
}
