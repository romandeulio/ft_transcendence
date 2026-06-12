import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { applyLang } from '../i18n/index.js'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import Toggle from '../components/ui/Toggle'
import styles from './Parametres.module.css'

const NOTIF_IDS = ['turn', 'bet', 'tourney', 'season', 'invite']
const LANG_OPTIONS = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'he', label: 'עב' },
]

export default function Parametres() {
  const { user, logout, login } = useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [searchParams] = useSearchParams()

  const TABS = [
    { key: 'profile',  label: t('settings.tabs.profile') },
    { key: 'security', label: t('settings.tabs.security') },
    { key: 'notifs',   label: t('settings.tabs.notifications') },
    { key: 'language', label: t('settings.tabs.language') },
    { key: 'account',  label: t('settings.tabs.account') },
    { key: 'notice',   label: t('settings.tabs.notice') },
  ]

  const TAB_PARAM_MAP = { notice: 'notice' }
  const initialTabKey = TAB_PARAM_MAP[searchParams.get('tab')] ?? 'profile'
  const [activeTab, setActiveTab] = useState(initialTabKey)

  useEffect(() => {
    const tab = TAB_PARAM_MAP[searchParams.get('tab')]
    if (tab) setActiveTab(tab)
  }, [searchParams])

  const [tfa,   setTfa]   = useState(false)
  const [oauth, setOauth] = useState(true)
  const [notifs, setNotifs] = useState({ turn: true, bet: true, tourney: false, season: true, invite: true })
  const [email, setEmail]   = useState('')

  const toggleNotif = (id) => setNotifs(prev => ({ ...prev, [id]: !prev[id] }))

  const handleLang = (code) => {
    i18n.changeLanguage(code)
    applyLang(code)
  }

  const noticeSections = t('settings.notice.sections', { returnObjects: true })

  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarError,   setAvatarError]   = useState('')

  const handleAvatarUpload = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return

      setAvatarLoading(true)
      setAvatarError('')

      const formData = new FormData()
      formData.append('avatar', file)

      try {
          const token = localStorage.getItem('access_token') || localStorage.getItem('token')
          const res   = await fetch('/api/auth/avatar/', {
              method:  'POST',
              headers: { Authorization: `Bearer ${token}` },
              body:    formData,
              // Ne pas mettre Content-Type — le navigateur le gère avec le boundary
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Erreur upload')

          // Mettre à jour le user dans le contexte et localStorage
          const updated = { ...user, avatar_url: data.avatar_url + '?v=' + Date.now() }
          login(updated)

      } catch (err) {
          setAvatarError(err.message)
      } finally {
          setAvatarLoading(false)
          // Reset l'input pour permettre de re-uploader le même fichier
          document.getElementById('avatar-input').value = ''
      }
  }

  const handleAvatarDelete = async () => {
      setAvatarLoading(true)
      setAvatarError('')
      try {
          const token = localStorage.getItem('access_token') || localStorage.getItem('token')
          const res   = await fetch('/api/auth/avatar/', {
              method:  'DELETE',
              headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) throw new Error('Erreur suppression')

          const updated = { ...user, avatar_url: null }
          login(updated)

      } catch (err) {
          setAvatarError(err.message)
      } finally {
          setAvatarLoading(false)
      }
  }
  return (
    <Shell>
      <Topbar title={t('topbar.settings')} titleSize={30} />
      <div className={styles.content}>
        <div className={styles.nav}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
          <div className={styles.navDivider} />
          <button
            className={styles.logoutBtn}
            onClick={() => { logout(); navigate('/login') }}
          >
            {t('settings.logout')}
          </button>
        </div>

        <div className={styles.panel}>
          {activeTab === 'profile' && (
              <div>
                  <div className={styles.section}>
                      <div className={styles.sectionTitle}>{t('settings.profile.photo')}</div>
                      <div className={styles.avatarRow}>

                          {/* Affichage de la photo */}
                          <div className={styles.avatarPreview}>
                              {user?.avatar_url
                                  ? <img
                                      src={user.avatar_url}
                                      alt="avatar"
                                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                    />
                                  : (user?.username?.[0]?.toUpperCase() ?? '?')
                              }
                          </div>

                          <div className={styles.avatarBtns}>
                              {/* Input file caché */}
                              <input
                                  id="avatar-input"
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  onChange={handleAvatarUpload}
                              />
                              <button
                                  className={styles.btnSecondary}
                                  onClick={() => document.getElementById('avatar-input').click()}
                                  disabled={avatarLoading}
                              >
                                  {avatarLoading ? 'Upload...' : t('settings.profile.edit')}
                              </button>
                              <button
                                  className={styles.btnDanger}
                                  onClick={handleAvatarDelete}
                                  disabled={!user?.avatar_url || avatarLoading}
                              >
                                  {t('settings.profile.delete')}
                              </button>
                          </div>
                      </div>
                      {avatarError && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px' }}>{avatarError}</p>}
                  </div>

                  <div className={styles.section}>
                      <label className={styles.label}>{t('settings.profile.login42')}</label>
                      <input className={styles.inputLocked} value={user?.login ?? ''} readOnly />
                  </div>
                  <div className={styles.section}>
                      <label className={styles.label}>{t('settings.profile.email')}</label>
                      <input className={styles.input} value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                  <button className={styles.btnPrimary}>{t('settings.profile.save')}</button>
              </div>
          )}

          {activeTab === 'security' && (
            <div>
              <div className={styles.section}>
                <button className={styles.btnSecondary}>{t('settings.security.changePassword')}</button>
              </div>
              <div className={styles.toggleRow}>
                <div>
                  <div className={styles.toggleLabel}>{t('settings.security.tfa')}</div>
                  <div className={styles.toggleSub}>{t('settings.security.tfaSub')}</div>
                </div>
                <Toggle on={tfa} onChange={setTfa} />
              </div>
              <div className={styles.toggleRow}>
                <div>
                  <div className={styles.toggleLabel}>{t('settings.security.oauth')}</div>
                  <div className={styles.toggleSub}>{t('settings.security.oauthSub')}</div>
                </div>
                <Toggle on={oauth} onChange={setOauth} />
              </div>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>{t('settings.security.activeSessions')}</div>
                <button className={styles.btnDanger}>{t('settings.security.disconnectAll')}</button>
              </div>
            </div>
          )}

          {activeTab === 'notifs' && (
            <div>
              {NOTIF_IDS.map(id => (
                <div key={id} className={styles.toggleRow}>
                  <div className={styles.toggleLabel}>{t(`settings.notifications.${id}`)}</div>
                  <Toggle on={notifs[id]} onChange={() => toggleNotif(id)} />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'language' && (
            <div>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>{t('settings.language.title')}</div>
                <LanguageSwitcher />
              </div>
              <div className={styles.section}>
                <label className={styles.label}>{t('settings.language.timezone')}</label>
                <input className={styles.input} defaultValue="Europe/Paris (UTC+2)" />
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div>
              <div className={styles.section}>
                <button className={styles.btnSecondary}>{t('settings.account.export')}</button>
              </div>
              <div className={styles.section}>
                <a href="#" className={styles.link}>{t('settings.account.privacy')}</a>
              </div>
              <div className={styles.dangerZone}>
                <div className={styles.dangerTitle}>{t('settings.account.dangerZone')}</div>
                <div className={styles.dangerRow}>
                  <div>
                    <div className={styles.dangerLabel}>{t('settings.account.resetStats')}</div>
                    <div className={styles.dangerSub}>{t('settings.account.resetStatsSub')}</div>
                  </div>
                  <button className={styles.btnDanger}>{t('settings.account.reset')}</button>
                </div>
                <div className={styles.dangerRow}>
                  <div>
                    <div className={styles.dangerLabel}>{t('settings.account.deleteAccount')}</div>
                    <div className={styles.dangerSub}>{t('settings.account.deleteAccountSub')}</div>
                  </div>
                  <button className={styles.btnDangerFill}>{t('settings.account.delete')}</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notice' && (
            <div>
              <div className={styles.noticeIntro}>
                {t('settings.notice.intro')}
              </div>
              {Array.isArray(noticeSections) && noticeSections.map((s, i) => (
                <div key={i} className={styles.noticeSection}>
                  <div className={styles.noticeTitle}>{s.title}</div>
                  <div className={styles.noticeBody}>{s.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}
