import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import styles from './Login.module.css'

const bgItems = [
  { icon: '⚽', top: '8%',  left: '5%',  size: 28, delay: 0   },
  { icon: '🥅', top: '15%', left: '88%', size: 32, delay: 1.2 },
  { icon: '🏆', top: '70%', left: '7%',  size: 26, delay: 2.1 },
  { icon: '⚽', top: '80%', left: '85%', size: 30, delay: 0.7 },
  { icon: '🥅', top: '45%', left: '92%', size: 24, delay: 1.8 },
  { icon: '⚽', top: '55%', left: '2%',  size: 22, delay: 3.0 },
  { icon: '🏆', top: '30%', left: '91%', size: 28, delay: 0.4 },
  { icon: '⚽', top: '90%', left: '40%', size: 20, delay: 2.5 },
  { icon: '🥅', top: '5%',  left: '55%', size: 26, delay: 1.5 },
  { icon: '🏆', top: '88%', left: '62%', size: 22, delay: 3.3 },
]

export default function ActivateAccount() {
  const { t } = useTranslation()
  const { uidb64, token } = useParams()
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    fetch(`/api/auth/activate/${uidb64}/${token}/`)
      .then(r => {
        if (r.ok) setStatus('success')
        else setStatus('error')
      })
      .catch(() => setStatus('error'))
  }, [uidb64, token])

  return (
    <div className={styles.page}>
      {bgItems.map((item, i) => (
        <span
          key={i}
          className={styles.bgItem}
          style={{ top: item.top, left: item.left, fontSize: item.size, animationDelay: `${item.delay}s` }}
        >
          {item.icon}
        </span>
      ))}

      <div className={styles.langBar}>
        <LanguageSwitcher />
      </div>

      <div className={styles.card}>
        {status === 'loading' && (
          <>
            <div className={styles.logo}>⏳</div>
            <h1 className={styles.title}>{t('activate.loadingTitle')}</h1>
            <p className={styles.sub}>{t('activate.loadingSub')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className={styles.logo}>✅</div>
            <h1 className={styles.title}>{t('activate.successTitle')}</h1>
            <p className={styles.sub}>{t('activate.successSub')}</p>
            <Link to="/login" className={styles.btnLogin} style={{ textDecoration: 'none', textAlign: 'center', marginTop: '8px' }}>
              {t('activate.login')}
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className={styles.logo}>❌</div>
            <h1 className={styles.title}>{t('activate.errorTitle')}</h1>
            <p className={styles.sub}>{t('activate.errorSub')}</p>
            <Link to="/register" className={styles.btnLogin} style={{ textDecoration: 'none', textAlign: 'center', marginTop: '8px' }}>
              {t('activate.createAccount')}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
