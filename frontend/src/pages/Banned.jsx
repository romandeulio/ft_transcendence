import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import styles from './Banned.module.css'

function formatRemaining(seconds) {
  if (seconds <= 0) return null
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts = []
  if (d > 0) parts.push(`${d} jour${d > 1 ? 's' : ''}`)
  if (h > 0) parts.push(`${h} heure${h > 1 ? 's' : ''}`)
  if (m > 0) parts.push(`${m} minute${m > 1 ? 's' : ''}`)
  return parts.join(', ') || 'moins d\'une minute'
}

export default function Banned() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const type = params.get('type')
  const until = params.get('until')

  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (type !== 'temporary' || !until) return
    const target = new Date(until)
    if (isNaN(target.getTime())) return
    const update = () => {
      const diff = (target - Date.now()) / 1000
      if (diff <= 0) {
        navigate('/login')
        return
      }
      setRemaining(diff)
    }
    update()
    const id = setInterval(update, 10000)
    return () => clearInterval(id)
  }, [type, until, navigate])

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>🚫</div>

        {type === 'permanent' ? (
          <>
            <h1 className={styles.title}>Compte banni</h1>
            <p className={styles.text}>
              Votre compte a été banni définitivement par un administrateur.
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Compte suspendu</h1>
            <p className={styles.text}>
              Votre compte est temporairement suspendu.
            </p>
            {remaining > 0 && (
              <div className={styles.timer}>
                Temps restant : <strong>{formatRemaining(remaining)}</strong>
              </div>
            )}
          </>
        )}

        <p className={styles.sub}>
          Si vous pensez qu'il s'agit d'une erreur, contactez un administrateur à l'adresse babyfoot42nice@gmail.com .
        </p>

        <button className={styles.btn} onClick={() => navigate('/login')}>
          Retour à la connexion
        </button>
      </div>
    </div>
  )
}
