import { NavLink, Link } from 'react-router-dom'
import Avatar from '../ui/Avatar'
import { useAuth } from '../../context/AuthContext'
import styles from './Sidebar.module.css'

const NAV_ITEMS = [
  { section: 'Jeu' },
  { label: 'Accueil',         route: '/accueil' },
  { label: 'Classement',      route: '/classement' },
  { label: 'Paris',           route: '/paris' },
  { label: "File d'attente",  route: '/planning' },
  { label: 'Tournois',        route: '/tournois' },
  { section: 'Compte' },
  { label: 'Mon profil',  route: '/profil' },
  { label: 'Paramètres',  route: '/parametres' },
]

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user } = useAuth()

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
      <button className={styles.closeBtn} onClick={onClose} aria-label="Fermer">✕</button>

      <Link to="/profil" className={styles.userBlock} onClick={onClose}>
        <div className={styles.avatarWrap}>
          <Avatar initials={user?.login?.[0]?.toUpperCase() ?? '?'} size={44} bg="rgba(255,255,255,0.15)" round />
        </div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{user?.name ?? user?.login ?? ''}</div>
          <div className={styles.userTokens}>{user?.tokens != null ? `🪙 ${user.tokens} jetons` : ''}</div>
        </div>
      </Link>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item, i) => {
          if (item.section) {
            return <div key={i} className={styles.section}>{item.section}</div>
          }
          return (
            <NavLink
              key={item.route}
              to={item.route}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
              onClick={onClose}
            >
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
