import { useTranslation } from 'react-i18next'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'

const s = {
  page:    { padding: '32px 24px', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 32 },
  section: { display: 'flex', flexDirection: 'column', gap: 10 },
  h2:      { color: 'var(--ink)', fontWeight: 700, fontSize: 17, margin: 0 },
  p:       { color: 'var(--ink2)', fontSize: 14, lineHeight: 1.7, margin: 0 },
  ul:      { color: 'var(--ink2)', fontSize: 14, lineHeight: 1.7, margin: 0, paddingLeft: 20 },
  updated: { color: 'var(--ink3)', fontSize: 12 },
}

const SECTIONS = [
  { key: 's1', type: 'body' },
  { key: 's2', type: 'list' },
  { key: 's3', type: 'list' },
  { key: 's4', type: 'body' },
  { key: 's5', type: 'list' },
  { key: 's6', type: 'body' },
  { key: 's7', type: 'list' },
  { key: 's8', type: 'body' },
  { key: 's9', type: 'body' },
]

export default function PrivacyPolicy() {
  const { t } = useTranslation()

  return (
    <Shell>
      <Topbar title={t('privacy.title')} />
      <div style={s.page}>
        <p style={s.updated}>{t('privacy.updated')}</p>
        {SECTIONS.map(({ key, type }) => (
          <div key={key} style={s.section}>
            <h2 style={s.h2}>{t(`privacy.${key}.title`)}</h2>
            {type === 'body' ? (
              <p style={s.p}>{t(`privacy.${key}.body`)}</p>
            ) : (
              <ul style={s.ul}>
                {t(`privacy.${key}.items`, { returnObjects: true }).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Shell>
  )
}
