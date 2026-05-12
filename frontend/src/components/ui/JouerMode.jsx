import { useState, useEffect, useRef } from 'react'
import styles from './JouerMode.module.css'

export default function JouerMode({ onClose }) {
  const [scoreRed,  setScoreRed]  = useState(0)
  const [scoreBlue, setScoreBlue] = useState(0)
  const [elapsed,   setElapsed]   = useState(0)
  const [demi,      setDemi]      = useState(false)
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
    setScoreRed(n => n + (demi ? 2 : 1))
    setDemi(false)
  }
  const addBlue = () => {
    if (ended) return
    setScoreBlue(n => n + (demi ? 2 : 1))
    setDemi(false)
  }
  const removeRed  = () => !ended && setScoreRed(n => Math.max(0, n - 1))
  const removeBlue = () => !ended && setScoreBlue(n => Math.max(0, n - 1))

  const handleEnd = () => {
    setEnded(true)
  }

  if (ended) {
    const winner = scoreRed > scoreBlue ? 'Rouge' : scoreBlue > scoreRed ? 'Bleu' : 'Égalité'
    const winColor = scoreRed > scoreBlue ? '#CD3122' : scoreBlue > scoreRed ? '#4068DB' : '#7A9BB5'
    return (
      <div className={styles.overlay}>
        <div className={styles.endScreen}>
          <div className={styles.endTitle} style={{ color: winColor }}>
            {winner === 'Égalité' ? 'Égalité !' : `${winner} gagne !`}
          </div>
          <div className={styles.endScore}>
            <span style={{ color: '#CD3122' }}>{scoreRed}</span>
            <span className={styles.endVs}>–</span>
            <span style={{ color: '#4068DB' }}>{scoreBlue}</span>
          </div>
          <div className={styles.endTime}>Durée : {fmt(elapsed)}</div>
          <button className={styles.endCloseBtn} onClick={onClose}>
            Terminer et fermer
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
      <button className={styles.closeBtn} onClick={onClose}>✕ Quitter</button>

      {/* Terrain */}
      <div className={styles.field}>

        {/* Côté rouge (gauche) */}
        <button className={styles.sideRed} onClick={addRed}>
          <div className={styles.sideLabel}>Rouge</div>
          <div className={styles.sideScore}>{scoreRed}</div>
          {demi && <div className={styles.demiIndicator}>×2</div>}
        </button>

        {/* Centre */}
        <div className={styles.center}>
          <div className={styles.vsText}>VS</div>
          <button
            className={styles.finPartieBtn}
            onClick={handleEnd}
          >
            Fin de<br/>partie
          </button>
          <div className={styles.centerBtns}>
            <button
              className={`${styles.demiBtn} ${demi ? styles.demiBtnActive : ''}`}
              onClick={() => setDemi(d => !d)}
            >
              Demi {demi ? '✓' : ''}
            </button>
          </div>
          <div className={styles.gamelleRow}>
            <button className={styles.gamelleBtn} onClick={removeRed}>−1 Rouge</button>
            <button className={styles.gamelleBtn} onClick={removeBlue}>−1 Bleu</button>
          </div>
        </div>

        {/* Côté bleu (droite) */}
        <button className={styles.sideBlue} onClick={addBlue}>
          <div className={styles.sideLabel}>Bleu</div>
          <div className={styles.sideScore}>{scoreBlue}</div>
          {demi && <div className={styles.demiIndicator}>×2</div>}
        </button>

      </div>
    </div>
  )
}
