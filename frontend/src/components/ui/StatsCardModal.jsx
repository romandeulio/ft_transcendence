import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch } from '../../services/api'
import styles from './StatsCardModal.module.css'

export default function StatsCardModal({ onClose, knownStats = {} }) {
  const { t } = useTranslation()
  const [remote,    setRemote]    = useState(null)
  const [dlLoading, setDlLoading] = useState(false)
  const cardRef = useRef(null)

  useEffect(() => {
    authFetch('/api/auth/my-stats-card/')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setRemote(d))
      .catch(() => {})
  }, [])

  const login       = remote?.login           ?? knownStats.login ?? ''
  const bestElo     = remote?.best_elo        ?? '…'
  const totalMatchs = knownStats.total_matches ?? remote?.total_matches ?? '…'
  const bestStreak  = knownStats.best_streak   ?? remote?.best_streak   ?? '…'
  const maxTokens   = knownStats.max_tokens    ?? remote?.max_tokens    ?? '…'
  const bestRatio   = remote?.best_ratio       ?? '…'

  const ROWS = [
    { icon: '⭐', label: t('statsCard.bestElo'),      value: bestElo     },
    { icon: '🎮', label: t('statsCard.matchesPlayed'), value: totalMatchs },
    { icon: '🔥', label: t('statsCard.currentStreak'), value: bestStreak  },
    { icon: '💰', label: t('statsCard.currentWealth'), value: maxTokens   },
    { icon: '📊', label: t('statsCard.currentRatio'),  value: bestRatio   },
  ]

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
      a.download = `${login || 'stats'}_card.png`
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
            {login ? t('statsCard.titleOf', { login }) : t('statsCard.titleMine')}
          </div>
          <div className={styles.rows}>
            {ROWS.map((r, i) => (
              <div key={i} className={styles.row}>
                <span className={styles.icon}>{r.icon}</span>
                <span className={styles.rowLabel}>{r.label} :</span>
                <span className={styles.rowValue}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.dlBtn} onClick={download} disabled={dlLoading}>
            {dlLoading ? t('statsCard.exporting') : t('statsCard.download')}
          </button>
          <button className={styles.closeBtn} onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}
