import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { authFetch, apiRefresh } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  // false tant que la session stockée n'a pas été validée auprès du backend.
  const [authChecked, setAuthChecked] = useState(false)

  const login = (u) => {
    setUser(u)
    localStorage.setItem('user', JSON.stringify(u))
  }

  const logout = () => {
    fetch('/api/auth/logout/', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
    setUser(null)
    localStorage.removeItem('user')
  }

  const updateUser = useCallback((partial) => {
    setUser(prev => {
      if (!prev) return prev
      const next = { ...prev, ...partial }
      localStorage.setItem('user', JSON.stringify(next))
      return next
    })
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const res = await authFetch('/api/auth/profile/')
      if (!res.ok) return
      const data = await res.json()
      setUser(prev => {
        const next = { ...(prev || {}), ...data }
        localStorage.setItem('user', JSON.stringify(next))
        return next
      })
    } catch {}
  }, [])

  // Valide le cookie JWT au démarrage : un token résiduel (ex. après `make re`
  // qui réinitialise la base) pointe vers un user qui n'existe plus → on purge
  // la session locale au lieu d'afficher un compte fantôme.
  useEffect(() => {
    let cancelled = false

    const stored = (() => {
      try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
    })()

    if (!stored) {
      setAuthChecked(true)
      return
    }

    ;(async () => {
      let fresh = null
      try {
        let res = await authFetch('/api/auth/profile/')
        if (res.status === 401) {
          // access token expiré ? on tente un refresh avant de conclure.
          try { await apiRefresh(); res = await authFetch('/api/auth/profile/') } catch {}
        }
        if (res.ok) fresh = await res.json()
      } catch {}

      if (cancelled) return

      if (fresh) {
        setUser(prev => {
          const next = { ...(prev || {}), ...fresh }
          localStorage.setItem('user', JSON.stringify(next))
          return next
        })
      } else {
        setUser(null)
        localStorage.removeItem('user')
      }
      setAuthChecked(true)
    })()

    return () => { cancelled = true }
  }, [])

  return (
    <AuthContext.Provider value={{ user, authChecked, login, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
