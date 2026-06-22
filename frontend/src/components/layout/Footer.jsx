import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styles from './Footer.module.css'

export default function Footer() {
  const { t } = useTranslation()
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.columns}>

          <div className={styles.column}>
            <div className={styles.colTitle}>{t('footer.explore')}</div>
            <Link to="/parametres?tab=notice" className={styles.link}>{t('footer.sitemap')}</Link>
            <Link to="/classement" className={styles.link}>{t('footer.ranking')}</Link>
            <Link to="/tournois" className={styles.link}>{t('footer.tournaments')}</Link>
            <Link to="/admin" className={styles.link}>{t('footer.admin')}</Link>
          </div>

          <div className={styles.column}>
            <div className={styles.colTitle}>{t('footer.services')}</div>
            <Link to="/privacy-policy" className={styles.link}>{t('footer.privacy')}</Link>
            <Link to="/terms-of-service" className={styles.link}>{t('footer.terms')}</Link>
            <Link to="/ticket" className={styles.link}>{t('footer.ticket')}</Link>
            <Link to="/status" className={styles.link}>{t('footer.status')}</Link>
          </div>

        </div>
        <div className={styles.bottom}>
          {t('footer.copyright', { year: new Date().getFullYear() })}
        </div>
      </div>
    </footer>
  )
}
