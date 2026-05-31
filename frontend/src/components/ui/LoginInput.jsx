import { useState, useRef, useEffect } from 'react'
import styles from './LoginInput.module.css'

export default function LoginInput({ value, onChange, placeholder, className, players = [] }) {
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    onChange(val)
    if (val.trim() && players.length > 0) {
      const filtered = players
        .filter(p =>
          p.login.toLowerCase().startsWith(val.toLowerCase()) ||
          p.name?.toLowerCase().startsWith(val.toLowerCase())
        )
        .slice(0, 6)
      setSuggestions(filtered)
      setOpen(filtered.length > 0)
    } else {
      setSuggestions([])
      setOpen(false)
    }
  }

  const select = (login) => {
    onChange(login)
    setOpen(false)
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <input
        className={`${styles.input} ${className || ''}`}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={() => value && suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && (
        <ul className={styles.dropdown}>
          {suggestions.map(p => (
            <li key={p.login} className={styles.item} onMouseDown={() => select(p.login)}>
              <span className={styles.login}>{p.login}</span>
              {p.name !== p.login && <span className={styles.name}>{p.name}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
