import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginSuccess() {
  const navigate = useNavigate()
  const { login } = useAuth()

  useEffect(() => {
    const params  = new URLSearchParams(window.location.search)
    const access  = params.get('access')
    const refresh = params.get('refresh')

    if (!access) {
      navigate('/login')
      return
    }

    // Stocker les tokens avec les bonnes clés
    localStorage.setItem('access_token',  access)   // ← clé cohérente avec AuthContext
    localStorage.setItem('refresh_token', refresh)

    // Récupérer le profil et mettre à jour le contexte
    fetch('/api/auth/profile/', {
      headers: { Authorization: `Bearer ${access}` }
    })
      .then(res => {
        console.log('Status profil:', res.status)
        if (!res.ok) throw new Error('Profil inaccessible')
        return res.json()
      })
      .then(userData => {
        // Construire le user dans le format qu'attend AuthContext
        console.log('userData reçu:', userData)
        const me = {
          id:            userData.id,
          username:      userData.username,
          login:         userData.username,
          name:          userData.username,
          email:         userData.email,
          avatar_url:    userData.avatar_url,
          role:          userData.role,
          elo_solo:      userData.elo_solo,
          elo_team:      userData.elo_team,
          wallet_tokens: userData.wallet_tokens,
        }
        console.log('me construit:', me)
        localStorage.setItem('user', JSON.stringify(me))
        login(me)  // ← utilise le cas spécial OAuth dans AuthContext
        navigate('/profil', { replace: true })
      })
      .catch(() => navigate('/login?error=profile_failed'))
  }, [])

  return (
    <div style={{ textAlign: 'center', padding: '4rem' }}>
      Connexion en cours...
    </div>
  )
}