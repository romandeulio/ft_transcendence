import { Link } from 'react-router-dom'
import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.columns}>

          <div className={styles.column}>
            <div className={styles.colTitle}>Explorer</div>
            <Link to="/parametres?tab=notice" className={styles.link}>Plan du site</Link>
            <Link to="/classement" className={styles.link}>Classement</Link>
            <Link to="/tournois" className={styles.link}>Tournois</Link>
            <Link to="/admin" className={styles.link}>Admin</Link>
          </div>

          <div className={styles.column}>
            <div className={styles.colTitle}>Conseils et services</div>
            <span className={styles.link}>Politique de confidentialité</span>
            <Link to="/ticket" className={styles.link}>Envoyer un ticket</Link>
            <span className={styles.link}>Contact</span>
            <span className={styles.link}>RGPD</span>
          </div>

        </div>
        <div className={styles.bottom}>
          © {new Date().getFullYear()} ft_transcendence — Tous droits réservés
        </div>
      </div>
    </footer>
  )
}
