import { createContext, useContext, useState, useCallback } from 'react'
import { authFetch } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })

  const login = (u) => {
    setUser(u)
    localStorage.setItem('user', JSON.stringify(u))
  }

  const logout = () => {
    fetch('/api/auth/logout/', {
      method: 'POST',
      credentials: 'same-origin',
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

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
