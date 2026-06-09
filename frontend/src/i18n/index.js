import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fr from './locales/fr.json'
import en from './locales/en.json'
import es from './locales/es.json'
import he from './locales/he.json'

const savedLang = localStorage.getItem('lang') || 'fr'

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en }, es: { translation: es }, he: { translation: he } },
  lng: savedLang,
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
})

export const RTL_LANGS = ['he']

export function applyLang(lang) {
  localStorage.setItem('lang', lang)
  const isRtl = RTL_LANGS.includes(lang)
  document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr')
  document.documentElement.setAttribute('lang', lang)
}

applyLang(savedLang)

export default i18n
