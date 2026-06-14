import { NavLink, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Avatar from '../ui/Avatar'
import { useAuth } from '../../context/AuthContext'
import styles from './Sidebar.module.css'

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user } = useAuth()
  const { t } = useTranslation()

  const NAV_ITEMS = [
    { section: t('nav.game') },
    { label: t('nav.home'),        route: '/accueil' },
    { label: t('nav.ranking'),     route: '/classement' },
    { label: t('nav.bets'),        route: '/paris' },
    { label: t('nav.queue'),       route: '/planning' },
    { label: t('nav.tournaments'), route: '/tournois' },
    { section: t('nav.account') },
    { label: t('nav.profile'),     route: '/profil' },
    { label: t('nav.settings'),    route: '/parametres' },
  ]

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
      <Link to="/profil" className={styles.userBlock} onClick={onClose}>
        <div className={styles.avatarWrap}>
          {user?.avatar_url
            ? <img src={user.avatar_url} alt={user?.username ?? ''} className={styles.avatarImg} />
            : <Avatar initials={user?.username?.substring(0, 2).toUpperCase() ?? '?'} size={44} bg="rgba(255,255,255,0.15)" round />
          }
        </div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{user?.username ?? ''}</div>
          <div className={styles.userTokens}>{user?.wallet_tokens != null ? t('sidebar.tokens', { count: user.wallet_tokens }) : ''}</div>
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
