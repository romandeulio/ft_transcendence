import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import styles from './Ticket.module.css'

export default function Ticket() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const PAGES = t('ticket.pages', { returnObjects: true })

  const [login,       setLogin]       = useState('')
  const [description, setDescription] = useState('')
  const [pages,       setPages]       = useState(new Set())
  const [photos,      setPhotos]      = useState([])
  const [error,       setError]       = useState(null)
  const [sending,     setSending]     = useState(false)
  const [sent,        setSent]        = useState(false)

  const togglePage = (page) => {
    setPages(prev => {
      const next = new Set(prev)
      next.has(page) ? next.delete(page) : next.add(page)
      return next
    })
  }

  const handleFiles = (e) => {
    const files = Array.from(e.target.files)
    const previews = files.map(f => ({ name: f.name, url: URL.createObjectURL(f), file: f }))
    setPhotos(prev => [...prev, ...previews])
  }

  const removePhoto = (i) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!login.trim() || !description.trim()) return
    setError(null)
    setSending(true)

    const fd = new FormData()
    fd.append('login', login.trim())
    fd.append('description', description.trim())
    if (pages.size > 0) fd.append('pages', [...pages].join(', '))
    photos.forEach((p, i) => {
      if (p.file) fd.append(`photo_${i}`, p.file)
    })

    try {
      const res = await fetch('/api/auth/ticket/', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || t('ticket.err_server'))
      }
      setSent(true)
    } catch (err) {
      setError(err.message || t('ticket.err_network'))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <Shell>
        <Topbar title={t('ticket.title')} titleSize={26} />
        <div className={styles.content}>
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✅</div>
            <div className={styles.successTitle}>{t('ticket.success_title')}</div>
            <div className={styles.successSub}>{t('ticket.success_sub')}</div>
            <button className={styles.backBtn} onClick={() => navigate(-1)}>{t('ticket.back')}</button>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <Topbar title={t('ticket.title')} titleSize={26} />
      <div className={styles.content}>
        <div className={styles.card}>
          <div className={styles.cardIntro}>{t('ticket.intro')}</div>

          <form className={styles.form} onSubmit={handleSubmit}>

            <div className={styles.field}>
              <label className={styles.label}>{t('ticket.login_label')} <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                type="text"
                placeholder={t('ticket.login_placeholder')}
                value={login}
                onChange={e => setLogin(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>{t('ticket.desc_label')} <span className={styles.req}>*</span></label>
              <textarea
                className={styles.textarea}
                placeholder={t('ticket.desc_placeholder')}
                rows={5}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>{t('ticket.pages_label')}</label>
              <div className={styles.checkGrid}>
                {PAGES.map(page => (
                  <label key={page} className={`${styles.checkItem} ${pages.has(page) ? styles.checkItemOn : ''}`}>
                    <input
                      type="checkbox"
                      className={styles.checkInput}
                      checked={pages.has(page)}
                      onChange={() => togglePage(page)}
                    />
                    <span className={styles.checkBox}>{pages.has(page) ? '✓' : ''}</span>
                    <span className={styles.checkLabel}>{page}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>{t('ticket.photos_label')}</label>
              <div
                className={styles.dropZone}
                onClick={() => fileRef.current.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
                  setPhotos(prev => [...prev, ...files.map(f => ({ name: f.name, url: URL.createObjectURL(f), file: f }))])
                }}
              >
                <span className={styles.dropIcon}>📎</span>
                <span className={styles.dropText}>{t('ticket.drop_text')}</span>
                <span className={styles.dropHint}>{t('ticket.drop_hint')}</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFiles}
                />
              </div>
              {photos.length > 0 && (
                <div className={styles.photoGrid}>
                  {photos.map((p, i) => (
                    <div key={i} className={styles.photoThumb}>
                      <img src={p.url} alt={p.name} className={styles.thumbImg} />
                      <button
                        type="button"
                        className={styles.removePhoto}
                        onClick={() => removePhoto(i)}
                      >✕</button>
                      <span className={styles.thumbName}>{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => navigate(-1)}>{t('ticket.cancel')}</button>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={!login.trim() || !description.trim() || sending}
              >
                {sending ? t('ticket.sending') : t('ticket.submit')}
              </button>
            </div>

          </form>
        </div>
      </div>
    </Shell>
  )
}
