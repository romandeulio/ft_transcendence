import { useState, useRef, useEffect } from 'react'
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

export default function Parametres() {
  const { user, logout, login } = useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [searchParams] = useSearchParams()

  const TABS = [
    { key: 'profile',  label: t('settings.tabs.profile') },
    { key: 'security', label: t('settings.tabs.security') },
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

  // ── Email ──
  const [email, setEmail] = useState(user?.email ?? '')

  // ── Avatar ──
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url ?? null)
  const [avatarFile,    setAvatarFile]    = useState(null)
  const [avatarDeleted, setAvatarDeleted] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarError,   setAvatarError]   = useState('')

  // ── GDPR modal ──
  const [gdprModal,   setGdprModal]   = useState(null)
  const [gdprCode,    setGdprCode]    = useState(['', '', '', '', '', ''])
  const [gdprError,   setGdprError]   = useState('')
  const [gdprLoading, setGdprLoading] = useState(false)
  const codeRef0 = useRef()
  const codeRef1 = useRef()
  const codeRef2 = useRef()
  const codeRef3 = useRef()
  const codeRef4 = useRef()
  const codeRef5 = useRef()
  const codeRefs = [codeRef0, codeRef1, codeRef2, codeRef3, codeRef4, codeRef5]

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

  // ── GDPR modal helpers ──
  const openGdprModal = async (action) => {
    setGdprCode(['', '', '', '', '', ''])
    setGdprError('')
    setGdprModal({ action })
    await authFetch('/api/auth/gdpr/request/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setTimeout(() => codeRefs[0].current?.focus(), 50)
  }

  const handleCodeInput = (i, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...gdprCode]
    next[i] = val
    setGdprCode(next)
    if (val && i < 5) codeRefs[i + 1].current?.focus()
  }

  const handleCodeKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !gdprCode[i] && i > 0) {
      codeRefs[i - 1].current?.focus()
    }
  }

  const handleGdprConfirm = async () => {
    const code = gdprCode.join('')
    if (code.length < 6) { setGdprError('Saisissez les 6 chiffres'); return }
    setGdprLoading(true)
    setGdprError('')

    const { action } = gdprModal

    if (action === 'export') {
      const res = await authFetch('/api/auth/gdpr/export/?format=json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        const d = await res.json()
        setGdprError(d.error || 'Code invalide')
        setGdprLoading(false)
        return
      }
      const blob = await res.blob()
      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'my_data.json'
      a.click()
      window.URL.revokeObjectURL(url)
      setGdprModal(null)
    }

    if (action === 'delete') {
      const res = await authFetch('/api/auth/gdpr/delete/', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        const d = await res.json()
        setGdprError(d.error || 'Code invalide')
        setGdprLoading(false)
        return
      }
      logout()
      navigate('/login')
    }

    setGdprLoading(false)
  }

  const handleExport        = () => openGdprModal('export')
  const handleDeleteAccount = () => openGdprModal('delete')

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

          {/* ── Profil ── */}
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
                <div className={styles.inputLocked}>{user?.username ?? '—'}</div>
              </div>
              <div className={styles.section}>
                <label className={styles.label}>{t('settings.profile.email')}</label>
                <input className={styles.input} value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <button className={styles.btnPrimary} onClick={handleSave}>{t('settings.profile.save')}</button>
            </div>
          )}

          {/* ── Sécurité ── */}
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

          {/* ── Langue ── */}
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

          {/* ── Compte ── */}
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

          {/* ── Notice ── */}
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

      {/* ── Modal GDPR ── */}
      {gdprModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--color-background-primary)',
            borderRadius: 'var(--border-radius-lg)',
            border: '0.5px solid var(--color-border-tertiary)',
            padding: '1.5rem 1.75rem',
            width: 340,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>Confirmation requise</span>
              <button
                onClick={() => setGdprModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 18, color: 'var(--color-text-secondary)', lineHeight: 1 }}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 1rem', lineHeight: 1.6 }}>
              Un code a été envoyé à{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>{user?.email}</strong>.
              Saisissez-le pour confirmer{gdprModal.action === 'delete' ? ' la suppression de votre compte' : " l'export"}.
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: '0.75rem' }}>
              {gdprCode.map((v, i) => (
                <input
                  key={i}
                  ref={codeRefs[i]}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={v}
                  onChange={e => handleCodeInput(i, e.target.value)}
                  onKeyDown={e => handleCodeKeyDown(i, e)}
                  style={{
                    width: 38, height: 46,
                    textAlign: 'center', fontSize: 20, fontWeight: 500,
                    borderRadius: 'var(--border-radius-md)',
                  }}
                />
              ))}
            </div>

            {gdprError && (
              <p style={{ color: 'var(--color-text-danger)', fontSize: 13, textAlign: 'center', margin: '0 0 0.75rem' }}>
                {gdprError}
              </p>
            )}

            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', margin: '0 0 1rem' }}>
              Valable 15 min ·{' '}
              <span
                style={{ color: 'var(--color-text-info)', cursor: 'pointer' }}
                onClick={() => openGdprModal(gdprModal.action)}
              >
                Renvoyer
              </span>
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.btnSecondary} style={{ flex: 1 }} onClick={() => setGdprModal(null)}>
                Annuler
              </button>
              <button
                className={gdprModal.action === 'delete' ? styles.btnDangerFill : styles.btnPrimary}
                style={{ flex: 1 }}
                onClick={handleGdprConfirm}
                disabled={gdprLoading || gdprCode.join('').length < 6}
              >
                {gdprLoading ? '...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}