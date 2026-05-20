import Modal from './Modal'
import styles from './AvatarEditor.module.css'

export const SKIN_TONES = [
  { id: 't1', label: 'Très clair',  color: '#FFE0C4' },
  { id: 't2', label: 'Clair',       color: '#FDDBB4' },
  { id: 't3', label: 'Doré',        color: '#EEB98A' },
  { id: 't4', label: 'Brun clair',  color: '#C68642' },
  { id: 't5', label: 'Brun moyen',  color: '#A05C34' },
  { id: 't6', label: 'Brun',        color: '#8D5524' },
  { id: 't7', label: 'Foncé',       color: '#6B3B1C' },
  { id: 't8', label: 'Très foncé',  color: '#4A2912' },
]

export const HAIR_STYLES = [
  { id: 'court',   label: 'Court'        },
  { id: 'frange',  label: 'Frange'       },
  { id: 'queue',   label: 'Queue'        },
  { id: 'boucles', label: 'Boucles'      },
  { id: 'tresses', label: 'Tresses'      },
  { id: 'chauve',  label: 'Chauve'       },
]

export const HAIR_COLORS = [
  { id: 'noir',  label: 'Noir',  color: '#1C1208' },
  { id: 'brun',  label: 'Brun',  color: '#6B3A2A' },
  { id: 'blond', label: 'Blond', color: '#D4A853' },
  { id: 'roux',  label: 'Roux',  color: '#A83228' },
  { id: 'blanc', label: 'Blanc', color: '#D8D4CC' },
  { id: 'bleu',  label: 'Bleu',  color: '#4068DB' },
  { id: 'rose',  label: 'Rose',  color: '#E86EA4' },
  { id: 'vert',  label: 'Vert',  color: '#57722F' },
]

export const EYE_STYLES = [
  { id: 'ovale',  label: 'Ovale'     },
  { id: 'rond',   label: 'Rond'      },
  { id: 'amande', label: 'Amande'    },
  { id: 'demi',   label: 'Demi-lune' },
]

export const ACCESSORIES = [
  { id: 'aucun',    label: 'Aucun'       },
  { id: 'gl-ronde', label: '🕶 Rondes'   },
  { id: 'gl-carre', label: '🥽 Carrées'  },
  { id: 'chapeau',  label: '🧢 Chapeau'  },
  { id: 'bandeau',  label: '🎀 Bandeau'  },
]

export const OUTFITS = [
  { id: 'sport',   label: '🏃 Sport',   color: '#1C3A6A', collar: '#4068DB' },
  { id: 'casual',  label: '👕 Casual',  color: '#EBF0FC', collar: '#4068DB' },
  { id: 'elegant', label: '👔 Élégant', color: '#2A1C10', collar: '#CD3122' },
  { id: 'festif',  label: '🎉 Festif',  color: '#CD3122', collar: '#FFE0C4' },
]

export function AvatarSVG({
  skin      = '#FDDBB4',
  hairStyle = 'court',
  hairColor = '#1C1208',
  eyeStyle  = 'ovale',
  accessory = 'aucun',
  outfit    = 'sport',
  size      = 140,
}) {
  const od = OUTFITS.find(o => o.id === outfit) || OUTFITS[0]
  const hc = hairColor
  const browColor = hc === '#D8D4CC' ? '#8A8A8A' : hc

  const renderHair = () => {
    switch (hairStyle) {
      case 'court':
        return <ellipse cx="50" cy="29" rx="27" ry="13" fill={hc} />
      case 'frange':
        return <>
          <ellipse cx="50" cy="29" rx="27" ry="13" fill={hc} />
          <rect x="23" y="35" width="54" height="9" rx="2" fill={hc} />
        </>
      case 'queue':
        return <>
          <ellipse cx="50" cy="29" rx="27" ry="12" fill={hc} />
          <circle cx="50" cy="19" r="9" fill={hc} />
          <rect x="47" y="11" width="6" height="28" rx="3" fill={hc} />
          <ellipse cx="50" cy="39" rx="5" ry="3" fill={hc} />
        </>
      case 'boucles':
        return <>
          <circle cx="50" cy="18" r="12" fill={hc} />
          <circle cx="30" cy="30" r="12" fill={hc} />
          <circle cx="70" cy="30" r="12" fill={hc} />
          <circle cx="39" cy="19" r="11" fill={hc} />
          <circle cx="61" cy="19" r="11" fill={hc} />
        </>
      case 'tresses':
        return <>
          <ellipse cx="50" cy="27" rx="26" ry="12" fill={hc} />
          <rect x="43" y="67" width="14" height="36" rx="7" fill={hc} />
          <ellipse cx="50" cy="103" rx="7" ry="4" fill={hc} />
        </>
      case 'chauve':
        return null
      default:
        return <ellipse cx="50" cy="29" rx="27" ry="13" fill={hc} />
    }
  }

  const renderEyes = () => {
    return [40, 60].map((cx, i) => {
      switch (eyeStyle) {
        case 'ovale':
          return (
            <g key={i}>
              <ellipse cx={cx} cy="54" rx="5.5" ry="6" fill="white" stroke="#2A2A2A" strokeWidth="0.8"/>
              <circle  cx={cx} cy="55" r="3.2"  fill="#2A2A2A"/>
              <circle  cx={cx + 1.3} cy={53.2} r={1.4} fill="white"/>
            </g>
          )
        case 'rond':
          return (
            <g key={i}>
              <circle cx={cx} cy="54" r="5.5"   fill="white" stroke="#2A2A2A" strokeWidth="0.8"/>
              <circle cx={cx} cy="55" r="3.2"   fill="#2A2A2A"/>
              <circle cx={cx + 1.3} cy={53.2} r={1.4} fill="white"/>
            </g>
          )
        case 'amande':
          return (
            <g key={i}>
              <path d={`M${cx - 6} 55 Q${cx} 49 ${cx + 6} 55 Q${cx} 61 ${cx - 6} 55`}
                fill="white" stroke="#2A2A2A" strokeWidth="0.8"/>
              <circle cx={cx} cy="55" r="2.9" fill="#2A2A2A"/>
              <circle cx={cx + 1.1} cy={53.8} r={1.1} fill="white"/>
            </g>
          )
        case 'demi':
          return (
            <g key={i}>
              <path d={`M${cx - 5.5} 57 A 5.5 5.5 0 0 1 ${cx + 5.5} 57 Z`}
                fill="white" stroke="#2A2A2A" strokeWidth="0.8"/>
              <ellipse cx={cx} cy="55" rx="3.2" ry="2.5" fill="#2A2A2A"/>
              <circle cx={cx + 1} cy={53.9} r={1} fill="white"/>
            </g>
          )
        default:
          return null
      }
    })
  }

  const renderAccessory = () => {
    switch (accessory) {
      case 'gl-ronde':
        return (
          <g opacity="0.9">
            <circle cx="40" cy="54" r="7.5"  fill="rgba(180,220,255,0.25)" stroke="#2A2A2A" strokeWidth="1.5"/>
            <circle cx="60" cy="54" r="7.5"  fill="rgba(180,220,255,0.25)" stroke="#2A2A2A" strokeWidth="1.5"/>
            <line x1="47.5" y1="54" x2="52.5" y2="54" stroke="#2A2A2A" strokeWidth="1.5"/>
            <line x1="22"   y1="51" x2="32.5" y2="53" stroke="#2A2A2A" strokeWidth="1.2"/>
            <line x1="67.5" y1="53" x2="78"   y2="51" stroke="#2A2A2A" strokeWidth="1.2"/>
          </g>
        )
      case 'gl-carre':
        return (
          <g opacity="0.9">
            <rect x="33" y="49" width="15" height="12" rx="2.5"
              fill="rgba(180,220,255,0.25)" stroke="#2A2A2A" strokeWidth="1.5"/>
            <rect x="52" y="49" width="15" height="12" rx="2.5"
              fill="rgba(180,220,255,0.25)" stroke="#2A2A2A" strokeWidth="1.5"/>
            <line x1="48" y1="55" x2="52" y2="55" stroke="#2A2A2A" strokeWidth="1.5"/>
            <line x1="22" y1="52" x2="33" y2="53" stroke="#2A2A2A" strokeWidth="1.2"/>
            <line x1="67" y1="53" x2="78" y2="52" stroke="#2A2A2A" strokeWidth="1.2"/>
          </g>
        )
      case 'chapeau':
        return (
          <g>
            <rect   x="23" y="29" width="54" height="17" rx="4"   fill={hc === '#D8D4CC' ? '#555' : hc}/>
            <rect   x="15" y="43" width="70" height="7"  rx="3"   fill={hc === '#D8D4CC' ? '#666' : hc}/>
            <line   x1="15" y1="46" x2="85" y2="46" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"/>
          </g>
        )
      case 'bandeau':
        return (
          <g>
            <rect x="22" y="37" width="56" height="8" rx="4" fill="#E86EA4"/>
            <circle cx="72" cy="37" r="6" fill="#FFB7D5"/>
            <circle cx="72" cy="37" r="3" fill="#E86EA4"/>
          </g>
        )
      default:
        return null
    }
  }

  return (
    <svg viewBox="0 0 100 130" width={size} height={size * 1.3}
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>

      {/* Corps */}
      <rect x="22" y="98" width="56" height="35" rx="12" fill={od.color} />
      {/* Col */}
      <polygon points="50,100 43,114 57,114" fill={od.collar} />

      {/* Cheveux (derrière la tête) */}
      {renderHair()}

      {/* Cou */}
      <rect x="43" y="82" width="14" height="19" rx="5" fill={skin} />

      {/* Oreilles */}
      <ellipse cx="22" cy="63" rx="5.5" ry="6.5" fill={skin} stroke="#2A2A2A" strokeWidth="0.6"/>
      <ellipse cx="78" cy="63" rx="5.5" ry="6.5" fill={skin} stroke="#2A2A2A" strokeWidth="0.6"/>

      {/* Tête — grande et ronde, style AC */}
      <ellipse cx="50" cy="61" rx="29" ry="32" fill={skin} stroke="#2A2A2A" strokeWidth="0.9"/>

      {/* Sourcils */}
      <path d="M 35 45 Q 40 41 45 45" stroke={browColor} strokeWidth="2.1" fill="none" strokeLinecap="round"/>
      <path d="M 55 45 Q 60 41 65 45" stroke={browColor} strokeWidth="2.1" fill="none" strokeLinecap="round"/>

      {/* Yeux */}
      {renderEyes()}

      {/* Joues roses (blush AC) */}
      <ellipse cx="31" cy="68" rx="6.5" ry="4" fill="rgba(255,140,140,0.32)"/>
      <ellipse cx="69" cy="68" rx="6.5" ry="4" fill="rgba(255,140,140,0.32)"/>

      {/* Nez discret */}
      <ellipse cx="50" cy="65" rx="1.8" ry="1.1" fill="rgba(0,0,0,0.16)"/>

      {/* Bouche — sourire AC */}
      <path d="M 43 72 Q 50 79 57 72" stroke="#2A2A2A" strokeWidth="1.9" fill="none" strokeLinecap="round"/>

      {/* Accessoire (par-dessus tout) */}
      {renderAccessory()}
    </svg>
  )
}

export default function AvatarEditor({ open, onClose, config, onChange }) {
  const {
    skin      = '#FDDBB4',
    hairStyle = 'court',
    hairColor = '#1C1208',
    eyeStyle  = 'ovale',
    accessory = 'aucun',
    outfit    = 'sport',
  } = config

  const handleSave = async () => {
    try {
      await fetch('/api/user/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
    } catch (_) { /* offline */ }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Créer mon avatar">
      <div className={styles.wrap}>

        {/* Prévisualisation */}
        <div className={styles.preview}>
          <AvatarSVG
            skin={skin} hairStyle={hairStyle} hairColor={hairColor}
            eyeStyle={eyeStyle} accessory={accessory} outfit={outfit}
            size={120}
          />
        </div>

        {/* Couleur de peau */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Couleur de peau</div>
          <div className={styles.swatches}>
            {SKIN_TONES.map(t => (
              <button key={t.id}
                className={`${styles.swatch} ${skin === t.color ? styles.swatchActive : ''}`}
                style={{ background: t.color }} title={t.label}
                onClick={() => onChange({ ...config, skin: t.color })}
              />
            ))}
          </div>
        </div>

        {/* Coiffure */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Coiffure</div>
          <div className={styles.hairBtns}>
            {HAIR_STYLES.map(h => (
              <button key={h.id}
                className={`${styles.hairBtn} ${hairStyle === h.id ? styles.hairBtnActive : ''}`}
                onClick={() => onChange({ ...config, hairStyle: h.id })}
              >{h.label}</button>
            ))}
          </div>
        </div>

        {/* Couleur de cheveux (masquée si chauve) */}
        {hairStyle !== 'chauve' && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Couleur de cheveux</div>
            <div className={styles.swatches}>
              {HAIR_COLORS.map(c => (
                <button key={c.id}
                  className={`${styles.swatch} ${hairColor === c.color ? styles.swatchActive : ''}`}
                  style={{ background: c.color }} title={c.label}
                  onClick={() => onChange({ ...config, hairColor: c.color })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Forme des yeux */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Yeux</div>
          <div className={styles.hairBtns}>
            {EYE_STYLES.map(e => (
              <button key={e.id}
                className={`${styles.hairBtn} ${eyeStyle === e.id ? styles.hairBtnActive : ''}`}
                onClick={() => onChange({ ...config, eyeStyle: e.id })}
              >{e.label}</button>
            ))}
          </div>
        </div>

        {/* Accessoire */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Accessoire</div>
          <div className={styles.outfitBtns}>
            {ACCESSORIES.map(a => (
              <button key={a.id}
                className={`${styles.outfitBtn} ${accessory === a.id ? styles.outfitBtnActive : ''}`}
                onClick={() => onChange({ ...config, accessory: a.id })}
              >{a.label}</button>
            ))}
          </div>
        </div>

        {/* Habit */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Habit</div>
          <div className={styles.outfitBtns}>
            {OUTFITS.map(o => (
              <button key={o.id}
                className={`${styles.outfitBtn} ${outfit === o.id ? styles.outfitBtnActive : ''}`}
                style={outfit === o.id ? { borderColor: o.color, background: o.color + '22' } : {}}
                onClick={() => onChange({ ...config, outfit: o.id })}
              >
                <span className={styles.outfitDot} style={{ background: o.color }} />
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <button className={styles.saveBtn} onClick={handleSave}>
          Sauvegarder ✓
        </button>

      </div>
    </Modal>
  )
}
