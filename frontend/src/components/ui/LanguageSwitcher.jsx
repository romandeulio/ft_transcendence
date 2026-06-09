import { useTranslation } from 'react-i18next'
import { applyLang } from '../../i18n/index.js'
import styles from './LanguageSwitcher.module.css'

const LANGS = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'he', label: 'עב' },
]

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = i18n.language

  const change = (code) => {
    i18n.changeLanguage(code)
    applyLang(code)
  }

  return (
    <div className={styles.switcher}>
      {LANGS.map(l => (
        <button
          key={l.code}
          className={`${styles.btn} ${current === l.code ? styles.active : ''}`}
          onClick={() => change(l.code)}
          aria-label={l.code}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
