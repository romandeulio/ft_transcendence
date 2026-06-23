import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch, apiRefresh, resetAuthSession, killAuthSession } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const { t } = useTranslation()
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  // false tant que la session stockée n'a pas été validée auprès du backend.
  const [authChecked, setAuthChecked] = useState(false)
  // true quand le compte vient d'être supprimé : déconnecte et affiche un écran
  // terminal (rendu ici, hors des providers gated par `user`, pour survivre à
  // la déconnexion).
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

  // Compte supprimé (signalé par le WebSocket file d'attente) : on purge la
  // session locale — ce qui stoppe tous les polls authentifiés (et donc les
  // 401 en console) — puis on affiche l'écran terminal.
  const markAccountDeleted = useCallback(() => {
    // Verrou immédiat : coupe tout authFetch ultérieur (idempotent avec
    // killAuthSession déjà appelé sur le close 4002 ou par authFetch).
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

  // Écoute l'event émis par authFetch quand un refresh échoue après un 401
  // (user supprimé, session expirée). Affiche le modal de déconnexion.
  useEffect(() => {
    const handler = () => markAccountDeleted()
    window.addEventListener('auth:session-expired', handler)
    return () => window.removeEventListener('auth:session-expired', handler)
  }, [markAccountDeleted])

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
        // Refresh d'abord (endpoint AllowAny, renvoie 200 {refreshed}). On n'appelle
        // /profile/ (protégé) QUE si on a un access token valide → jamais de 401
        // dans la console pour un visiteur non/plus connecté.
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
