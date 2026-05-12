import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './Topbar.module.css'

export default function Topbar({ title, right, titleSize = 18 }) {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('theme') === 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <div className={styles.topbar}>
      <h1 className={styles.title} style={{ fontSize: titleSize }}>
        {title}
      </h1>
      <div className={styles.right}>
        {right}
        <NavLink to="/status" className={styles.statusLink}>
          Status
        </NavLink>
        <button
          className={styles.themeToggle}
          onClick={() => setDark(d => !d)}
          aria-label={dark ? 'Light mode' : 'Dark mode'}
          title={dark ? 'Light mode' : 'Dark mode'}
        >
          {dark ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  )
}