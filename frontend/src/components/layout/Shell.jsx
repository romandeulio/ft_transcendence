import { useState } from 'react'
import Sidebar from './Sidebar'
import styles from './Shell.module.css'

export default function Shell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className={styles.shell}>
      {sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}
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
  )
}
