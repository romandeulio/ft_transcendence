import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authFetch } from '../services/api'

export default function LoginSuccess() {
    const navigate = useNavigate()
    const { login } = useAuth()
    const done = useRef(false)

    useEffect(() => {
        if (done.current) return
        done.current = true

        authFetch('/api/auth/profile/')
            .then(res => {
                if (!res.ok) throw new Error('Profil inaccessible')
                return res.json()
            })
            .then(userData => {
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
                localStorage.setItem('user', JSON.stringify(me))
                login(me)
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
