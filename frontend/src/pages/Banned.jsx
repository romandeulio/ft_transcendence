import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import styles from './Banned.module.css'

function formatRemaining(seconds) {
  if (seconds <= 0) return null
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts = []
  if (d > 0) parts.push(i18n.t('banned.days', { count: d }))
  if (h > 0) parts.push(i18n.t('banned.hours', { count: h }))
  if (m > 0) parts.push(i18n.t('banned.minutes', { count: m }))
  return parts.join(', ') || i18n.t('banned.lessThanMinute')
}

export default function Banned() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const type = params.get('type')
  const until = params.get('until')

  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (type !== 'temporary' || !until) return
    const target = new Date(until)
    if (isNaN(target.getTime())) return
    const update = () => {
      const diff = (target - Date.now()) / 1000
      if (diff <= 0) {
        navigate('/login')
        return
      }
      setRemaining(diff)
    }
    update()
    const id = setInterval(update, 10000)
    return () => clearInterval(id)
  }, [type, until, navigate])

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>🚫</div>

        {type === 'permanent' ? (
          <>
            <h1 className={styles.title}>{t('banned.permTitle')}</h1>
            <p className={styles.text}>
              {t('banned.permText')}
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.title}>{t('banned.tempTitle')}</h1>
            <p className={styles.text}>
              {t('banned.tempText')}
            </p>
            {remaining > 0 && (
              <div className={styles.timer}>
                {t('banned.timeLeft')} <strong>{formatRemaining(remaining)}</strong>
              </div>
            )}
          </>
        )}

        <p className={styles.sub}>
          {t('banned.contact', { email: 'babyfoot42nice@gmail.com' })}
        </p>

        <button className={styles.btn} onClick={() => navigate('/login')}>
          {t('banned.backToLogin')}
        </button>
      </div>
    </div>
  )
}
