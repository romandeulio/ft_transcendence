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

  // ── Password change ──
  const [pwForm,    setPwForm]    = useState({ current: '', new1: '', new2: '' })
  const [pwError,   setPwError]   = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  // ── 2FA ──
  const [tfaLoading, setTfaLoading] = useState(false)

  // ── OAuth toggle ──
  const [oauth, setOauth] = useState(true)

  // ── Notifications (localStorage) ──
  const [notifs, setNotifs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('notifPrefs')) || { turn: true, bet: true, tourney: false, season: true, invite: true } } catch { return { turn: true, bet: true, tourney: false, season: true, invite: true } }
  })

  // ── Email ──
  const [email, setEmail] = useState(user?.email ?? '')

  // ── Avatar ──
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url ?? null)
  const [avatarFile,    setAvatarFile]    = useState(null)
  const [avatarDeleted, setAvatarDeleted] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarError,   setAvatarError]   = useState('')

  const toggleNotif = (id) => {
    const next = { ...notifs, [id]: !notifs[id] }
    setNotifs(next)
    localStorage.setItem('notifPrefs', JSON.stringify(next))
  }

  const handleLang = (code) => {
    i18n.changeLanguage(code)
    applyLang(code)
  }

  const noticeSections = t('settings.notice.sections', { returnObjects: true })

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
    const res = await fetch('/api/auth/gdpr/export/?format=json', { credentials: 'include' })
    if (!res.ok) { alert('Erreur export'); return }
    const blob = await res.blob()
    const url  = window.URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'my_data.json'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm('Supprimer définitivement votre compte ?')) return
    const res = await fetch('/api/auth/gdpr/delete/', { method: 'DELETE', credentials: 'include' })
    if (!res.ok) { alert('Erreur suppression'); return }
    logout()
    navigate('/login')
  }

  const handleSave = async () => {
    try {
      setAvatarLoading(true)
      setAvatarError('')
      const profileData = new FormData()
      profileData.append('email', email)
      if (avatarDeleted) profileData.append('delete_avatar', 'true')
      if (avatarFile)    profileData.append('avatar', avatarFile)
      const res = await fetch('/api/auth/profile/update/', {
        method: 'PUT', credentials: 'include', body: profileData,
      })
      if (!res.ok) throw new Error('Erreur mise à jour profil')
      const updated = await res.json()
      login({ ...user, email: updated.email, avatar_url: updated.avatar_url })
      setAvatarPreview(updated.avatar_url ?? null)
      setAvatarFile(null)
      setAvatarDeleted(false)
    } catch (err) {
      setAvatarError(err.message)
    } finally {
      setAvatarLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (pwForm.new1 !== pwForm.new2) { setPwError('Les mots de passe ne correspondent pas'); return }
    if (pwForm.new1.length < 8) { setPwError('Minimum 8 caractères'); return }
    setPwLoading(true)
    setPwError('')
    setPwSuccess(false)
    const res = await fetch('/api/auth/password/change/', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.new1 }),
    })
    if (res.ok) {
      setPwSuccess(true)
      setPwForm({ current: '', new1: '', new2: '' })
    } else {
      const data = await res.json()
      setPwError(data.error || 'Erreur')
    }
    setPwLoading(false)
  }

  const handleToggle2FA = async () => {
    setTfaLoading(true)
    const method = user?.is_2fa_enabled ? 'DELETE' : 'POST'
    const res = await fetch('/api/auth/2fa/enable/', { method, credentials: 'include' })
    if (res.ok) {
      login({ ...user, is_2fa_enabled: !user.is_2fa_enabled })
    }
    setTfaLoading(false)
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
          <button className={styles.logoutBtn} onClick={() => { logout(); navigate('/login') }}>
            {t('settings.logout')}
          </button>
        </div>

        <div className={styles.panel}>
          {activeTab === 'profile' && (
            <div>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>{t('settings.profile.photo')}</div>
                <div className={styles.avatarRow}>
                  <div className={styles.avatarPreview}>
                    {avatarPreview
                      ? <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : (user?.username?.[0]?.toUpperCase() ?? '?')
                    }
                  </div>
                  <div className={styles.avatarBtns}>
                    <input id="avatar-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
                    <button className={styles.btnSecondary} onClick={() => document.getElementById('avatar-input').click()} disabled={avatarLoading}>
                      {avatarLoading ? 'Upload...' : t('settings.profile.edit')}
                    </button>
                    <button className={styles.btnDanger} onClick={handleDeleteAvatar} disabled={!avatarPreview || avatarLoading}>
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
              {!user?.oauth_42_id && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>{t('settings.security.changePassword')}</div>
                  <input className={styles.input} type="password" placeholder="Mot de passe actuel" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} style={{ marginBottom: '8px' }} />
                  <input className={styles.input} type="password" placeholder="Nouveau mot de passe" value={pwForm.new1} onChange={e => setPwForm(f => ({ ...f, new1: e.target.value }))} style={{ marginBottom: '8px' }} />
                  <input className={styles.input} type="password" placeholder="Confirmer le nouveau mot de passe" value={pwForm.new2} onChange={e => setPwForm(f => ({ ...f, new2: e.target.value }))} style={{ marginBottom: '8px' }} />
                  {pwError   && <p style={{ color: '#ef4444', fontSize: '13px' }}>{pwError}</p>}
                  {pwSuccess && <p style={{ color: '#22c55e', fontSize: '13px' }}>Mot de passe modifié ✓</p>}
                  <button className={styles.btnSecondary} onClick={handleChangePassword} disabled={pwLoading}>
                    {pwLoading ? 'Enregistrement...' : 'Changer le mot de passe'}
                  </button>
                </div>
              )}

              <div className={styles.section}>
                <div className={styles.sectionTitle}>{t('settings.security.tfa')}</div>
                <div className={styles.toggleSub}>
                  {user?.is_2fa_enabled
                    ? 'Un code de vérification sera envoyé par email à chaque connexion.'
                    : 'Activez la double authentification par email pour sécuriser votre compte.'}
                </div>
                <button
                  className={user?.is_2fa_enabled ? styles.btnDanger : styles.btnSecondary}
                  onClick={handleToggle2FA}
                  disabled={tfaLoading}
                  style={{ marginTop: '12px' }}
                >
                  {tfaLoading
                    ? '...'
                    : user?.is_2fa_enabled
                      ? 'Désactiver le 2FA'
                      : 'Activer le 2FA par email'}
                </button>
                {user?.is_2fa_enabled && (
                  <p style={{ fontSize: '13px', color: '#22c55e', marginTop: '8px' }}>2FA activé ✓</p>
                )}
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
                <button className={styles.btnSecondary} onClick={handleExport}>{t('settings.account.export')}</button>
              </div>
              <div className={styles.section}>
                <a href="#" className={styles.link}>{t('settings.account.privacy')}</a>
              </div>
              <div className={styles.dangerZone}>
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
