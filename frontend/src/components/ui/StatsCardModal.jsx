import { useEffect, useRef, useState } from 'react'
import { authFetch } from '../../services/api'
import styles from './StatsCardModal.module.css'

const ROWS = [
  { icon: '⚡', key: 'best_elo',      label: 'Meilleur ELO'          },
  { icon: '🎮', key: 'total_matches', label: 'Matchs joués'           },
  { icon: '🔥', key: 'best_streak',   label: 'Meilleure série'        },
  { icon: '💰', key: 'max_tokens',    label: 'Plus grande richesse'   },
  { icon: '📅', key: 'best_month',    label: 'Meilleur mois'          },
]

export default function StatsCardModal({ onClose }) {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [dlLoading, setDlLoading] = useState(false)
  const cardRef = useRef(null)

  useEffect(() => {
    authFetch('/api/auth/my-stats-card/')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const download = async () => {
    if (!cardRef.current) return
    setDlLoading(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        backgroundColor: '#0d1117',
        useCORS: true,
      })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `${data?.login ?? 'stats'}_card.png`
      a.click()
    } finally {
      setDlLoading(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>

        <div className={styles.card} ref={cardRef}>
          <div className={styles.cardTitle}>
            {loading ? '…' : `${data?.login}'s Stats`}
          </div>
          <div className={styles.rows}>
            {ROWS.map(r => (
              <div key={r.key} className={styles.row}>
                <span className={styles.icon}>{r.icon}</span>
                <span className={styles.rowLabel}>{r.label} :</span>
                <span className={styles.rowValue}>
                  {loading ? '…' : (data?.[r.key] ?? '—')}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.dlBtn} onClick={download} disabled={loading || dlLoading}>
            {dlLoading ? 'Export…' : '↓ Télécharger (.png)'}
          </button>
          <button className={styles.closeBtn} onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
