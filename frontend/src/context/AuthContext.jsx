import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch, apiRefresh, resetAuthSession, killAuthSession } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const { t } = useTranslation()
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  // false until the stored session has been validated against the backend.
  const [authChecked, setAuthChecked] = useState(false)
  // true once the account was just deleted: logs out and shows a terminal screen
  // (rendered here, outside the providers gated by `user`, so it survives the
  // logout).
  const [accountDeleted, setAccountDeleted] = useState(false)

  const login = (u) => {
    resetAuthSession()
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

  // Account deleted (signalled by the queue WebSocket): purge the local session
  // -- which stops every authenticated poll (and thus the 401s in the console)
  // -- then show the terminal screen.
  const markAccountDeleted = useCallback(() => {
    // Immediate lock: cuts off any later authFetch (idempotent with
    // killAuthSession already called on the 4002 close or by authFetch).
    killAuthSession()
    fetch('/api/auth/logout/', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
    localStorage.removeItem('user')
    setUser(null)
    setAccountDeleted(true)
  }, [])

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

  // Listens to the event emitted by authFetch when a refresh fails after a 401
  // (user deleted, session expired). Shows the logout modal.
  useEffect(() => {
    const handler = () => markAccountDeleted()
    window.addEventListener('auth:session-expired', handler)
    return () => window.removeEventListener('auth:session-expired', handler)
  }, [markAccountDeleted])

  // Validate the JWT cookie at startup: a leftover token (e.g. after `make re`
  // which resets the database) points to a user that no longer exists -> purge
  // the local session instead of showing a ghost account.
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
        // Refresh first (AllowAny endpoint, returns 200 {refreshed}). Only call
        // /profile/ (protected) IF we have a valid access token -> never a 401
        // in the console for a visitor that is not/no longer logged in.
        let refreshed = false
        try { await apiRefresh(); refreshed = true } catch {}
        if (refreshed) {
          const res = await authFetch('/api/auth/profile/')
          if (res.ok) fresh = await res.json()
        }
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
    <AuthContext.Provider value={{ user, authChecked, login, logout, updateUser, refreshUser, markAccountDeleted }}>
      {children}
      {accountDeleted && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.75)',
        }}>
          <div style={{
            background: 'var(--topbar-bg, #001A57)', color: '#fff',
            padding: '28px 32px', borderRadius: '12px', maxWidth: '420px',
            textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ margin: '0 0 12px', color: '#fff' }}>{t('queue.deletedTitle')}</h3>
            <p style={{ margin: '0 0 20px', color: '#fff', opacity: 0.85 }}>{t('queue.deletedBody')}</p>
            <button
              onClick={() => { window.location.href = '/login' }}
              style={{
                padding: '10px 20px', borderRadius: '8px', border: 'none',
                background: 'var(--color-primary, #4068DB)', color: '#fff',
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              {t('queue.deletedButton')}
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
