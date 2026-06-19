import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { applyLang } from '../i18n/index.js'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import Toggle from '../components/ui/Toggle'
import { authFetch } from '../services/api'
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

  const [tfa,        setTfa]        = useState(user?.is_2fa_enabled ?? false)
  const [tfaSetup,   setTfaSetup]   = useState(null)
  const [tfaCode,    setTfaCode]    = useState('')
  const [tfaError,   setTfaError]   = useState('')
  const [tfaLoading, setTfaLoading] = useState(false)
  const [oauth, setOauth] = useState(true)
  const [notifs, setNotifs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('notifPrefs')) || { turn: true, bet: true, tourney: false, season: true, invite: true } } catch { return { turn: true, bet: true, tourney: false, season: true, invite: true } }
  })
  //const [email, setEmail]   = useState('')
  const [email, setEmail] = useState(user.email)

  const toggleNotif = (id) => {
    const next = { ...notifs, [id]: !notifs[id] }
    setNotifs(next)
    localStorage.setItem('notifPrefs', JSON.stringify(next))
  }

  const handleTfaToggle = async (val) => {
    if (val && !tfa) {
      setTfaLoading(true)
      setTfaError('')
      try {
        const res = await authFetch('/api/auth/2fa/enable/', { method: 'POST' })
        const data = await res.json()
        setTfaSetup(data)
        setTfaCode('')
      } catch { setTfaError('Erreur réseau') }
      finally { setTfaLoading(false) }
    } else if (!val && tfa) {
      setTfaLoading(true)
      setTfaError('')
      try {
        const res = await authFetch('/api/auth/2fa/enable/', { method: 'DELETE' })
        if (res.ok) {
          setTfa(false)
          login({ ...user, is_2fa_enabled: false })
        } else {
          setTfaError('Erreur lors de la désactivation')
        }
      } catch { setTfaError('Erreur réseau') }
      finally { setTfaLoading(false) }
    }
  }

  const handleTfaConfirm = async () => {
    setTfaLoading(true)
    setTfaError('')
    try {
      const res = await authFetch('/api/auth/2fa/enable/', {
        method: 'PUT',
        body: JSON.stringify({ code: tfaCode }),
      })
      if (res.ok) {
        setTfa(true)
        setTfaSetup(null)
        setTfaCode('')
        login({ ...user, is_2fa_enabled: true })
      } else {
        const data = await res.json().catch(() => ({}))
        setTfaError(data.error || 'Code invalide')
      }
    } catch { setTfaError('Erreur réseau') }
    finally { setTfaLoading(false) }
  }

  const handleLang = (code) => {
    i18n.changeLanguage(code)
    applyLang(code)
  }

  const noticeSections = t('settings.notice.sections', { returnObjects: true })

  const [avatarPreview,  setAvatarPreview]  = useState(user?.avatar_url ?? null)
  const [avatarFile,     setAvatarFile]     = useState(null)
  const [avatarDeleted,  setAvatarDeleted]  = useState(false)
  const [avatarLoading,  setAvatarLoading]  = useState(false)
  const [avatarError,    setAvatarError]    = useState('')

  const handleAvatarChange = (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      setAvatarFile(file)
      setAvatarPreview(URL.createObjectURL(file))
      setAvatarDeleted(false)
  }

  const handleDeleteAvatar = () => {
      setAvatarPreview(null)
      setAvatarFile(null)
      setAvatarDeleted(true)
  }

  const handleExport = async () => {
    const res = await authFetch("/api/auth/gdpr/export/?format=json")

    if (!res.ok) {
        alert("Erreur export")
        return
    }

    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = "my_data.json"
    a.click()

    window.URL.revokeObjectURL(url)
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm("Supprimer définitivement votre compte ?"))
        return

    const res = await authFetch("/api/auth/gdpr/delete/", {
        method: "DELETE",
    })

    if (!res.ok) {
        alert("Erreur suppression")
        return
    }

    logout()
    navigate("/login")
  }

const handleSave = async () => {
    const token = localStorage.getItem('access_token')

    try {
        setAvatarLoading(true)
        setAvatarError('')

        const profileData = new FormData()
        profileData.append('email', email)

        // Avatar supprimé → signaler au back
        if (avatarDeleted) {
            profileData.append('delete_avatar', 'true')
        }

        // Nouvel avatar → l'envoyer directement dans le même PUT
        if (avatarFile) {
            profileData.append('avatar', avatarFile)
        }

        const res = await fetch('/api/auth/profile/update/', {
            method:  'PUT',
            headers: { Authorization: `Bearer ${token}` },
            body:    profileData,
        })
        if (!res.ok) throw new Error('Erreur mise à jour profil')

        const updated = await res.json()

        login({
            ...user,
            email:      updated.email,
            avatar_url: updated.avatar_url,
        })

        setAvatarPreview(updated.avatar_url ?? null)
        setAvatarFile(null)
        setAvatarDeleted(false)

    } catch (err) {
        setAvatarError(err.message)
        console.error(err)
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
                              {avatarPreview
                                  ? <img
                                      src={avatarPreview}
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
                                  onChange={handleAvatarChange}
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
                                  onClick={handleDeleteAvatar}
                                  disabled={!avatarPreview || avatarLoading}
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
                  <button className={styles.btnPrimary} onClick={handleSave}>{t('settings.profile.save')}</button>
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
                <Toggle on={tfa} onChange={tfaLoading ? () => {} : handleTfaToggle} />
              </div>
              {tfaSetup && (
                <div className={styles.section} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '14px', marginTop: 8 }}>
                  <div className={styles.label} style={{ marginBottom: 8 }}>Clé secrète à ajouter dans votre app authenticator :</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, letterSpacing: '0.1em', marginBottom: 12, wordBreak: 'break-all', color: 'var(--ink)' }}>
                    {tfaSetup.secret}
                  </div>
                  <div className={styles.label} style={{ marginBottom: 6 }}>Entrez le code de confirmation :</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className={styles.input}
                      style={{ maxWidth: 160 }}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={tfaCode}
                      onChange={e => { setTfaCode(e.target.value); setTfaError('') }}
                    />
                    <button className={styles.btnPrimary} style={{ marginTop: 0 }} onClick={handleTfaConfirm} disabled={tfaLoading || tfaCode.length < 6}>
                      {tfaLoading ? '...' : 'Confirmer'}
                    </button>
                    <button className={styles.btnSecondary} onClick={() => { setTfaSetup(null); setTfaCode(''); setTfaError('') }}>
                      Annuler
                    </button>
                  </div>
                  {tfaError && <div style={{ color: '#CD3122', fontSize: 12, marginTop: 6 }}>{tfaError}</div>}
                </div>
              )}
              {tfaError && !tfaSetup && <div style={{ color: '#CD3122', fontSize: 12, marginTop: 4 }}>{tfaError}</div>}
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
                <button className={styles.btnSecondary} onClick={handleExport}>{t('settings.account.export')}</button>
              </div>
              <div className={styles.section}>
                <a href="#" className={styles.link}>{t('settings.account.privacy')}</a>
              </div>
              <div className={styles.dangerZone}>
                {/*<div className={styles.dangerTitle}>{t('settings.account.dangerZone')}</div>
                <div className={styles.dangerRow}>
                  <div>
                    <div className={styles.dangerLabel}>{t('settings.account.resetStats')}</div>
                    <div className={styles.dangerSub}>{t('settings.account.resetStatsSub')}</div>
                  </div>
                  <button className={styles.btnDanger}>{t('settings.account.reset')}</button>
                </div>*/}
                <div className={styles.dangerRow}>
                  <div>
                    <div className={styles.dangerLabel}>{t('settings.account.deleteAccount')}</div>
                    <div className={styles.dangerSub}>{t('settings.account.deleteAccountSub')}</div>
                  </div>
                  <button className={styles.btnDangerFill} onClick={handleDeleteAccount}>{t('settings.account.delete')}</button>
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
