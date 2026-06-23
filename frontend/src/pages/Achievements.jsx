import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import { authFetch } from '../services/api'
import styles from './Achievements.module.css'

const CATEGORY_ORDER = ['GAMELLES', 'DEMIS', 'MATCH', 'SERIE', 'ELO', 'SAISON', 'EQUIPE', 'ECONOMIE']

export default function Achievements() {
  const { t, i18n } = useTranslation()
  const [achievements, setAchievements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authFetch('/api/achievements/')
      .then(r => r.json())
      .then(data => { setAchievements(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const unlocked = achievements.filter(a => a.unlocked).length
  const total = achievements.length
  const pct = total ? Math.round((unlocked / total) * 100) : 0

  const grouped = {}
  for (const a of achievements) {
    if (!grouped[a.category]) grouped[a.category] = []
    grouped[a.category].push(a)
  }

  return (
    <Shell>
      <Topbar title={t('nav.achievements')} />
      <div className={styles.content}>
        {loading ? (
          <div className={styles.loading}>{t('achievements.loading')}</div>
        ) : (
          <>
            {/* Barre de progression */}
            <div className={styles.progressBar}>
              <div className={styles.progressLabel}>
                {t('achievements.progress', { unlocked, total, pct })}
              </div>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Catégories */}
            {CATEGORY_ORDER.map(cat => {
              const items = grouped[cat]
              if (!items || items.length === 0) return null
              return (
                <div key={cat} className={styles.category}>
                  <div className={styles.categoryTitle}>
                    {t(`achievements.cat.${cat}`)}
                  </div>
                  <div className={styles.grid}>
                    {items.map(a => (
                      <div
                        key={a.id}
                        className={`${styles.card} ${!a.unlocked ? styles.cardLocked : ''}`}
                      >
                        <span className={styles.icon}>{a.icon}</span>
                        <div className={styles.info}>
                          <div className={styles.name}>{t(`achievements.items.${a.id}.name`, { defaultValue: a.name })}</div>
                          <div className={styles.desc}>{t(`achievements.items.${a.id}.desc`, { defaultValue: a.description })}</div>
                          {a.unlocked && a.unlocked_at && (
                            <div className={styles.date}>
                              {new Date(a.unlocked_at).toLocaleDateString(i18n.language)}
                            </div>
                          )}
                        </div>
                        <span className={styles.badge}>
                          {a.unlocked ? '✅' : '🔒'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </Shell>
  )
}
