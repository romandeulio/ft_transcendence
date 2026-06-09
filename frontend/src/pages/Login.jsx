import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import styles from './Login.module.css'

export default function Login() {
  const { t } = useTranslation()
  return (
    <div className={styles.page}>
      <div className={styles.langBar}>
        <LanguageSwitcher />
      </div>
      <div className={styles.card}>
        <div className={styles.logo}>⚽</div>
        <h1 className={styles.title}>{t('login.title')}</h1>
        <p className={styles.sub}>{t('login.subtitle')}</p>
        <button className={styles.btn42}>
          {t('login.loginWith42')}
        </button>
        <div className={styles.divider}>{t('login.or')}</div>
        <input className={styles.input} placeholder={t('login.email')} type="email" />
        <input className={styles.input} placeholder={t('login.password')} type="password" />
        <button className={styles.btnLogin}>
          {t('login.submit')}
        </button>
      </div>
    </div>
  )
}
