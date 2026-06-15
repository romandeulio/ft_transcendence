import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import styles from './Ticket.module.css'

const PAGES = [
  'Accueil',
  'Classement',
  'Paris',
  "File d'attente",
  'Tournois',
  'Mon profil',
  'Paramètres',
  'Admin',
]

export default function Ticket() {
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [login,       setLogin]       = useState('')
  const [description, setDescription] = useState('')
  const [pages,       setPages]       = useState(new Set())
  const [photos,      setPhotos]      = useState([])   // { name, url, file }
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
        credentials: 'same-origin',
        body: fd,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur serveur')
      }
      setSent(true)
    } catch (err) {
      setError(err.message || 'Erreur réseau')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <Shell>
        <Topbar title="Envoyer un ticket" titleSize={26} />
        <div className={styles.content}>
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✅</div>
            <div className={styles.successTitle}>Ticket envoyé !</div>
            <div className={styles.successSub}>Merci pour ton retour. L'équipe en prendra connaissance rapidement.</div>
            <button className={styles.backBtn} onClick={() => navigate(-1)}>← Retour</button>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <Topbar title="Envoyer un ticket" titleSize={26} />
      <div className={styles.content}>
        <div className={styles.card}>
          <div className={styles.cardIntro}>
            Quelque chose ne fonctionne pas ? Décris-nous le problème et on s'en occupe.
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>

            <div className={styles.field}>
              <label className={styles.label}>Login ou nom <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                type="text"
                placeholder="Ex : ltcherp"
                value={login}
                onChange={e => setLogin(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Description du bug <span className={styles.req}>*</span></label>
              <textarea
                className={styles.textarea}
                placeholder="Décris ce que tu as observé, les étapes pour reproduire le problème, et ce que tu attendais..."
                rows={5}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Pages concernées</label>
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
              <label className={styles.label}>Joindre des captures d'écran</label>
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
                <span className={styles.dropText}>Clique ou glisse tes images ici</span>
                <span className={styles.dropHint}>PNG, JPG, WebP — max 5 fichiers</span>
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
              <button type="button" className={styles.cancelBtn} onClick={() => navigate(-1)}>Annuler</button>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={!login.trim() || !description.trim() || sending}
              >
                {sending ? 'Envoi en cours…' : 'Envoyer le ticket →'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </Shell>
  )
}
