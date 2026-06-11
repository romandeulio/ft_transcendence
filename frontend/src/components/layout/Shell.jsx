import { useState } from 'react'
import Sidebar from './Sidebar'
import Footer from './Footer'
import InviteLayer from '../ui/InviteLayer'
import styles from './Shell.module.css'

export default function Shell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className={styles.shell}>
      {sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}
      <div className={styles.shellBody}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className={styles.main}>
          <button
            className={styles.hamburger}
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <span /><span /><span />
          </button>
          {children}
        </main>
        <div className={styles.rightGutter} />
      </div>
      <InviteLayer />
      <Footer />
    </div>
  )
}
