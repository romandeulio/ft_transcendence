import { useState, useEffect } from 'react'
import styles from './AvatarCreator.module.css'

/* ─── Constants ─────────────────────────────────────────────────────── */

const SKIN_TONES = {
  'Clair':      '#FFE0C4',
  'Pêche':      '#FDDBB4',
  'Doré':       '#EEB98A',
  'Brun clair': '#C68642',
  'Brun':       '#A05C34',
  'Foncé':      '#6B3B1C',
}

const HAIR_COLORS = {
  'Noir':     '#1C1208',
  'Brun':     '#5C3D2E',
  'Bordeaux': '#6B1A1A',
  'Rouge':    '#C62828',
  'Blond':    '#F0C040',
  'Olive':    '#8B7355',
  'Gris':     '#9E9E9E',
  'Blanc':    '#E8E4DC',
}

const EYE_COLORS = {
  'Noir':     '#1C1208',
  'Brun':     '#795548',
  'Bleu':     '#1565C0',
  'Vert':     '#2E7D32',
  'Gris':     '#607D8B',
  'Noisette': '#8D6E63',
  'Violet':   '#6A1B9A',
  'Rouge':    '#C62828',
}

const OUTFIT_COLORS = {
  'Rouge':  '#C62828', 'Bleu':   '#1565C0', 'Vert':   '#2E7D32', 'Jaune':  '#F9A825',
  'Violet': '#6A1B9A', 'Orange': '#E65100', 'Rose':   '#E91E63', 'Blanc':  '#B0BEC5',
}

const FACE_SHAPES = {
  'Rond':  { rx: 38, ry: 38 }, 'Ovale': { rx: 32, ry: 44 },
  'Carré': { rx: 38, ry: 34 }, 'Cœur':  { rx: 36, ry: 42 },
  'Long':  { rx: 28, ry: 48 }, 'Plat':  { rx: 44, ry: 30 },
  'Large': { rx: 44, ry: 38 }, 'Fin':   { rx: 26, ry: 44 },
}

const HAIR_STYLE_LIST = ['Court', 'Frange', 'Queue', 'Boucles', 'Tresses', 'Long', 'Mohawk', 'Chauve']
const EYE_STYLE_LIST  = ['Rond',  'Grand',  'Petit', 'Amande',  'Demi-lune', 'Plissé', 'Étoile', 'Cœur']
const ACCESSORY_LIST  = ['Aucun', 'Nœud',   'Lunettes', 'Couronne', 'Casquette', 'Bob', 'Écharpe', 'Bandeau']
const OUTFIT_LIST     = ['Rouge', 'Bleu',   'Vert',  'Jaune',  'Violet',   'Orange', 'Rose',   'Blanc']
const FACE_SHAPE_LIST = ['Rond',  'Ovale',  'Carré', 'Cœur',   'Long',     'Plat',   'Large',  'Fin']

const HAIR_SWATCHES = [
  { name:'Noir', hex:'#1C1208' }, { name:'Brun',     hex:'#5C3D2E' },
  { name:'Bordeaux', hex:'#6B1A1A' }, { name:'Rouge', hex:'#C62828' },
  { name:'Blond', hex:'#F0C040' }, { name:'Olive', hex:'#8B7355' },
  { name:'Gris', hex:'#9E9E9E' }, { name:'Blanc', hex:'#E8E4DC' },
]
const EYE_SWATCHES = [
  { name:'Noir', hex:'#1C1208' }, { name:'Brun', hex:'#795548' },
  { name:'Bleu', hex:'#1565C0' }, { name:'Vert', hex:'#2E7D32' },
  { name:'Gris', hex:'#607D8B' }, { name:'Noisette', hex:'#8D6E63' },
  { name:'Violet', hex:'#6A1B9A' }, { name:'Rouge', hex:'#C62828' },
]

const TABS = [
  { id:'face',      icon:'🐾', label:'Visage'     },
  { id:'hair',      icon:'✂️', label:'Coiffure'   },
  { id:'eyes',      icon:'👁️', label:'Yeux'       },
  { id:'accessory', icon:'🎀', label:'Accessoire' },
  { id:'outfit',    icon:'👗', label:'Tenue'      },
]

const DEFAULT_CONFIG = {
  faceShape: 'Rond', hairStyle: 'Court', hairColor: 'Brun',
  eyeStyle:  'Rond', eyeColor:  'Marron', skinTone: 'Pêche',
  accessory: 'Aucun', outfit: 'Bleu',
}

/* ─── Hair SVG ──────────────────────────────────────────────────────── */
/* Two-pass: HairBack renders behind the face, HairFront renders over it */

function HairBack({ style, color, cx, cy, r }) {
  if (!color || !style || style === 'Chauve' || style === 'Mohawk') return null
  if (style === 'Queue') return (
    <path
      d={`M ${cx + r * 0.58},${cy - r * 0.3} Q ${cx + r * 1.4},${cy + r * 0.15} ${cx + r * 1.2},${cy + r * 0.8}`}
      stroke={color} strokeWidth={r * 0.32} fill="none" strokeLinecap="round"
    />
  )
  if (style === 'Long') return <>
    <rect x={cx - r * 1.14} y={cy - r * 0.08} width={r * 0.54} height={r * 1.7} rx={r * 0.27} fill={color}/>
    <rect x={cx + r * 0.6}  y={cy - r * 0.08} width={r * 0.54} height={r * 1.7} rx={r * 0.27} fill={color}/>
  </>
  if (style === 'Tresses') return <>
    <rect x={cx - r * 1.06} y={cy + r * 0.0} width={r * 0.38} height={r * 1.35} rx={r * 0.19} fill={color}/>
    <rect x={cx + r * 0.68} y={cy + r * 0.0} width={r * 0.38} height={r * 1.35} rx={r * 0.19} fill={color}/>
  </>
  return null
}

function HairFront({ style, color, cx, cy, r }) {
  if (!color || !style || style === 'Chauve') return null
  const cap = <ellipse cx={cx} cy={cy - r * 0.5} rx={r + 3} ry={r * 0.62} fill={color}/>
  if (style === 'Court')   return cap
  if (style === 'Queue')   return cap
  if (style === 'Long')    return cap
  if (style === 'Tresses') return cap
  if (style === 'Frange')  return <>
    {cap}
    <rect x={cx - r * 0.62} y={cy - r * 0.26} width={r * 1.24} height={r * 0.44} rx={r * 0.2} fill={color}/>
  </>
  if (style === 'Boucles') return <>
    <circle cx={cx - r * 0.56} cy={cy - r * 0.98} r={r * 0.46} fill={color}/>
    <circle cx={cx + r * 0.56} cy={cy - r * 0.98} r={r * 0.46} fill={color}/>
    <circle cx={cx}             cy={cy - r * 1.08} r={r * 0.42} fill={color}/>
    {cap}
    <circle cx={cx - r * 1.0} cy={cy - r * 0.06} r={r * 0.37} fill={color}/>
    <circle cx={cx + r * 1.0} cy={cy - r * 0.06} r={r * 0.37} fill={color}/>
  </>
  if (style === 'Mohawk') return (
    <rect x={cx - r * 0.24} y={cy - r * 1.38} width={r * 0.48} height={r * 1.0} rx={r * 0.24} fill={color}/>
  )
  return cap
}

/* ─── Eye SVG ───────────────────────────────────────────────────────── */

function EyePair({ style, color, cx, cy, r }) {
  const ec  = color
  const ink = '#1a1a1a'
  const lx  = cx - r * 0.38
  const rx_ = cx + r * 0.38
  const ey  = cy + r * 0.04
  const er  = r * 0.215

  const eye = (x, y) => {
    if (style === 'Rond') return (
      <g key={x}>
        <circle cx={x} cy={y} r={er * 1.15} fill="white"/>
        <circle cx={x} cy={y} r={er}         fill={ec}/>
        <circle cx={x} cy={y} r={er * 0.5}   fill={ink}/>
        <circle cx={x - er*0.3} cy={y - er*0.3} r={er*0.22} fill="white" opacity="0.8"/>
      </g>
    )
    if (style === 'Grand') return (
      <g key={x}>
        <circle cx={x} cy={y} r={er * 1.5}  fill="white"/>
        <circle cx={x} cy={y} r={er * 1.35} fill={ec}/>
        <circle cx={x} cy={y} r={er * 0.65} fill={ink}/>
        <circle cx={x - er*0.42} cy={y - er*0.42} r={er*0.3} fill="white" opacity="0.8"/>
      </g>
    )
    if (style === 'Petit') return (
      <g key={x}>
        <circle cx={x} cy={y} r={er * 0.78} fill="white"/>
        <circle cx={x} cy={y} r={er * 0.66} fill={ec}/>
        <circle cx={x} cy={y} r={er * 0.34} fill={ink}/>
      </g>
    )
    if (style === 'Amande') return (
      <g key={x}>
        <ellipse cx={x} cy={y} rx={er * 1.38} ry={er * 0.88} fill="white"/>
        <ellipse cx={x} cy={y} rx={er * 1.22} ry={er * 0.76} fill={ec}/>
        <circle  cx={x} cy={y} r={er * 0.44}                  fill={ink}/>
        <circle  cx={x - er*0.32} cy={y - er*0.22} r={er*0.18} fill="white" opacity="0.8"/>
      </g>
    )
    if (style === 'Demi-lune') return (
      <g key={x}>
        <path d={`M ${x-er*1.12} ${y} A ${er*1.12} ${er*1.12} 0 0 1 ${x+er*1.12} ${y} Z`} fill="white"/>
        <path d={`M ${x-er*0.92} ${y} A ${er*0.92} ${er*0.92} 0 0 1 ${x+er*0.92} ${y} Z`} fill={ec}/>
        <path d={`M ${x-er*0.44} ${y} A ${er*0.44} ${er*0.44} 0 0 1 ${x+er*0.44} ${y} Z`} fill={ink}/>
      </g>
    )
    if (style === 'Plissé') return (
      <g key={x}>
        <ellipse cx={x} cy={y} rx={er*1.32} ry={er*0.48} fill="white"/>
        <ellipse cx={x} cy={y} rx={er*1.14} ry={er*0.38} fill={ec}/>
        <ellipse cx={x} cy={y} rx={er*0.52} ry={er*0.28} fill={ink}/>
      </g>
    )
    if (style === 'Étoile') return (
      <g key={x}>
        <circle cx={x} cy={y} r={er * 1.12} fill="white"/>
        <circle cx={x} cy={y} r={er}         fill={ec}/>
        {[0,1,2,3,4].map(i => {
          const a = (i*72 - 90) * Math.PI / 180
          return <line key={i} x1={x} y1={y}
            x2={x + Math.cos(a)*er*0.88} y2={y + Math.sin(a)*er*0.88}
            stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
        })}
      </g>
    )
    if (style === 'Cœur') return (
      <g key={x}>
        <path d={`M ${x} ${y+er*0.75} C ${x-er*1.45} ${y-er*0.15} ${x-er*1.45} ${y-er*1.25} ${x} ${y-er*0.22} C ${x+er*1.45} ${y-er*1.25} ${x+er*1.45} ${y-er*0.15} ${x} ${y+er*0.75} Z`}
          fill={ec}/>
      </g>
    )
    return <g key={x}><circle cx={x} cy={y} r={er} fill={ec}/><circle cx={x} cy={y} r={er*0.5} fill={ink}/></g>
  }

  return <>{eye(lx, ey)}{eye(rx_, ey)}</>
}

/* ─── Accessory SVG ─────────────────────────────────────────────────── */

function AccessorySVG({ accessory, cx, cy, rx, ry }) {
  if (!accessory || accessory === 'Aucun') return null
  if (accessory === 'Nœud') return <>
    <ellipse cx={cx - 10} cy={cy - ry - 8} rx="9" ry="6" fill="#FF4081" transform={`rotate(-25 ${cx-10} ${cy-ry-8})`}/>
    <ellipse cx={cx + 10} cy={cy - ry - 8} rx="9" ry="6" fill="#FF4081" transform={`rotate(25 ${cx+10} ${cy-ry-8})`}/>
    <circle cx={cx} cy={cy - ry - 8} r="5" fill="#F50057"/>
  </>
  if (accessory === 'Lunettes') return <>
    <circle cx={cx-rx*0.38} cy={cy+ry*0.04} r={rx*0.24} fill="none" stroke="#3E2723" strokeWidth="2.5"/>
    <circle cx={cx+rx*0.38} cy={cy+ry*0.04} r={rx*0.24} fill="none" stroke="#3E2723" strokeWidth="2.5"/>
    <line x1={cx-rx*0.14} y1={cy+ry*0.04} x2={cx+rx*0.14} y2={cy+ry*0.04} stroke="#3E2723" strokeWidth="2"/>
    <line x1={cx-rx*0.62} y1={cy+ry*0.04} x2={cx-rx*0.9} y2={cy-ry*0.1} stroke="#3E2723" strokeWidth="2"/>
    <line x1={cx+rx*0.62} y1={cy+ry*0.04} x2={cx+rx*0.9} y2={cy-ry*0.1} stroke="#3E2723" strokeWidth="2"/>
  </>
  if (accessory === 'Couronne') return (
    <polygon
      points={`${cx-rx*0.7},${cy-ry+2} ${cx-rx*0.7},${cy-ry-16} ${cx-rx*0.35},${cy-ry-6} ${cx},${cy-ry-20} ${cx+rx*0.35},${cy-ry-6} ${cx+rx*0.7},${cy-ry-16} ${cx+rx*0.7},${cy-ry+2}`}
      fill="#FFD700" stroke="#F9A825" strokeWidth="1.5"
    />
  )
  if (accessory === 'Casquette') return <>
    <ellipse cx={cx} cy={cy - ry + 6} rx={rx + 4} ry={rx * 0.55} fill="#2C3E50"/>
    <rect x={cx - rx * 0.85} y={cy - ry - 14} width={rx * 1.7} height={rx * 0.82} rx={rx * 0.4} fill="#2C3E50"/>
    <rect x={cx - rx * 1.18} y={cy - ry + 3} width={rx * 0.44} height={rx * 0.24} rx={rx * 0.12} fill="#263238"/>
  </>
  if (accessory === 'Bob') return <>
    <ellipse cx={cx} cy={cy - ry + 4} rx={rx + 5} ry={rx * 0.4} fill="#D4A96A"/>
    <ellipse cx={cx} cy={cy - ry - 8} rx={rx * 0.78} ry={rx * 0.88} fill="#D4A96A"/>
  </>
  if (accessory === 'Écharpe') return <>
    <rect x={cx - rx * 0.7} y={cy + ry - 6} width={rx * 1.4} height={rx * 0.44} rx={rx * 0.22} fill="#E53935"/>
    <rect x={cx - rx * 0.2} y={cy + ry - 4} width={rx * 0.32} height={rx * 0.88} rx={rx * 0.16} fill="#EF9A9A"/>
  </>
  if (accessory === 'Bandeau') return (
    <rect x={cx - rx - 2} y={cy - ry * 0.55} width={(rx + 2) * 2} height={ry * 0.28} rx={ry * 0.14} fill="#9C27B0" opacity="0.85"/>
  )
  return null
}

/* ─── Full Human SVG ────────────────────────────────────────────────── */

export function HumanSVG({ config = {}, size = 160 }) {
  const {
    faceShape = 'Rond',  hairStyle = 'Court', hairColor = 'Brun',
    eyeStyle  = 'Rond',  eyeColor  = 'Marron', skinTone  = 'Pêche',
    accessory = 'Aucun', outfit    = 'Bleu',
  } = config

  const skin   = SKIN_TONES[skinTone]       || '#FDDBB4'
  const hair   = HAIR_COLORS[hairColor]     || '#5C3D2E'
  const eye    = EYE_COLORS[eyeColor]       || '#795548'
  const shirt  = OUTFIT_COLORS[outfit]      || '#1565C0'
  const { rx: fRx = 38, ry: fRy = 38 } = FACE_SHAPES[faceShape] || {}
  const cx = 60, cy = 60, r = 38

  return (
    <svg
      viewBox="0 0 120 160"
      width={size}
      height={size * 160 / 120}
      style={{ filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.2))' }}
    >
      {/* Body */}
      <ellipse cx="60" cy="132" rx="28" ry="22" fill={shirt}/>
      {/* Collar */}
      <ellipse cx="60" cy="101" rx="12" ry="8" fill={skin}/>

      {/* Back hair */}
      <HairBack style={hairStyle} color={hair} cx={cx} cy={cy} r={r}/>

      {/* Face */}
      <ellipse cx={cx} cy={cy} rx={fRx} ry={fRy} fill={skin}/>

      {/* Cheeks */}
      <circle cx={cx - fRx*0.6} cy={cy + fRy*0.12} r={fRx*0.17} fill="#FFB3B3" opacity="0.55"/>
      <circle cx={cx + fRx*0.6} cy={cy + fRy*0.12} r={fRx*0.17} fill="#FFB3B3" opacity="0.55"/>

      {/* Eyes */}
      <EyePair style={eyeStyle} color={eye} cx={cx} cy={cy} r={r}/>

      {/* Nose */}
      <ellipse cx={cx} cy={cy + fRy*0.32} rx={fRx*0.07} ry={fRx*0.05} fill="#CC8866" opacity="0.55"/>

      {/* Mouth */}
      <path
        d={`M ${cx - fRx*0.2} ${cy + fRy*0.5} Q ${cx} ${cy + fRy*0.65} ${cx + fRx*0.2} ${cy + fRy*0.5}`}
        fill="none" stroke="#CC7755" strokeWidth="2.2" strokeLinecap="round"
      />

      {/* Front hair */}
      <HairFront style={hairStyle} color={hair} cx={cx} cy={cy} r={r}/>

      {/* Accessory */}
      <AccessorySVG accessory={accessory} cx={cx} cy={cy} rx={fRx} ry={fRy}/>
    </svg>
  )
}

/* ─── Hair card (head + hair only, like AC:NH style selector) ───────── */

function HairCardSVG({ hairStyle, hairColor }) {
  const c  = HAIR_COLORS[hairColor] || '#5C3D2E'
  const cx = 32, cy = 38, r = 22
  return (
    <svg viewBox="0 0 64 70" width="58" height="62">
      <HairBack  style={hairStyle} color={c} cx={cx} cy={cy} r={r}/>
      <circle cx={cx} cy={cy} r={r} fill="#FFF5EE"/>
      <HairFront style={hairStyle} color={c} cx={cx} cy={cy} r={r}/>
      {/* Minimal face dots */}
      <circle cx={cx - r*0.37} cy={cy + r*0.12} r={r*0.13} fill="#FFB3B3" opacity="0.45"/>
      <circle cx={cx + r*0.37} cy={cy + r*0.12} r={r*0.13} fill="#FFB3B3" opacity="0.45"/>
      <circle cx={cx - r*0.28} cy={cy + r*0.02} r={r*0.15} fill="#1a1a1a"/>
      <circle cx={cx + r*0.28} cy={cy + r*0.02} r={r*0.15} fill="#1a1a1a"/>
      <circle cx={cx - r*0.22} cy={cy - r*0.04} r={r*0.06} fill="white" opacity="0.8"/>
      <circle cx={cx + r*0.22} cy={cy - r*0.04} r={r*0.06} fill="white" opacity="0.8"/>
    </svg>
  )
}

/* ─── Eye card (face + eyes only) ───────────────────────────────────── */

function EyeCardSVG({ eyeStyle, eyeColor, skinTone }) {
  const ec   = EYE_COLORS[eyeColor] || '#1565C0'
  const skin = SKIN_TONES[skinTone] || '#FDDBB4'
  const cx = 32, cy = 36, r = 22
  return (
    <svg viewBox="0 0 64 68" width="58" height="62">
      <circle cx={cx} cy={cy} r={r} fill={skin}/>
      <circle cx={cx - r*0.6} cy={cy + r*0.12} r={r*0.16} fill="#FFB3B3" opacity="0.5"/>
      <circle cx={cx + r*0.6} cy={cy + r*0.12} r={r*0.16} fill="#FFB3B3" opacity="0.5"/>
      <EyePair style={eyeStyle} color={ec} cx={cx} cy={cy} r={r}/>
      <ellipse cx={cx} cy={cy + r*0.42} rx={r*0.08} ry={r*0.06} fill="#CC8866" opacity="0.5"/>
    </svg>
  )
}

/* ─── Grid card wrapper ─────────────────────────────────────────────── */

function GridCard({ isSelected, onClick, label, children }) {
  return (
    <button
      className={`${styles.card} ${isSelected ? styles.cardSel : ''}`}
      onClick={onClick}
      title={label}
    >
      <div className={styles.cardInner}>{children}</div>
      <span className={styles.cardLabel}>{label}</span>
      {isSelected && <span className={styles.check}>✓</span>}
    </button>
  )
}

/* ─── Main component ────────────────────────────────────────────────── */

export default function AvatarCreator({ open, onClose, config, onChange }) {
  const init = { ...DEFAULT_CONFIG, ...config }
  const [cfg,     setCfg]     = useState(init)
  const [tab,     setTab]     = useState('face')
  const [tabPage, setTabPage] = useState(0)

  /* Sync if config prop changes while open */
  useEffect(() => { if (open) setCfg({ ...DEFAULT_CONFIG, ...config }) }, [open])

  /* ESC */
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  /* Body scroll lock */
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const set = (key, val) => setCfg(prev => ({ ...prev, [key]: val }))

  /* ── Grid items for each tab ── */
  const tabItems = {
    face:      FACE_SHAPE_LIST,
    hair:      HAIR_STYLE_LIST,
    eyes:      EYE_STYLE_LIST,
    accessory: ACCESSORY_LIST,
    outfit:    OUTFIT_LIST,
  }

  const COLS = 4, ROWS = 2, PER_PAGE = COLS * ROWS
  const items     = tabItems[tab] || []
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE))
  const page       = Math.min(tabPage, totalPages - 1)
  const pageItems  = items.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const gridItems  = [...pageItems, ...Array(Math.max(0, PER_PAGE - pageItems.length)).fill(null)]

  const changeTab = (id) => { setTab(id); setTabPage(0) }

  /* Render content inside each grid card */
  const renderCardContent = (val) => {
    if (tab === 'face') return (
      <HumanSVG config={{ ...cfg, faceShape: val }} size={56}/>
    )
    if (tab === 'hair') return (
      <HairCardSVG hairStyle={val} hairColor={cfg.hairColor}/>
    )
    if (tab === 'eyes') return (
      <EyeCardSVG eyeStyle={val} eyeColor={cfg.eyeColor} skinTone={cfg.skinTone}/>
    )
    if (tab === 'accessory') return (
      <HumanSVG config={{ ...cfg, accessory: val }} size={56}/>
    )
    if (tab === 'outfit') return (
      <HumanSVG config={{ ...cfg, outfit: val }} size={56}/>
    )
    return null
  }

  /* Which option key does the current grid select? */
  const KEY_MAP = { face:'faceShape', hair:'hairStyle', eyes:'eyeStyle', accessory:'accessory', outfit:'outfit' }
  const activeKey = KEY_MAP[tab]

  /* Swatch row: shown for hair + eyes tabs */
  const showSwatches = tab === 'hair' || tab === 'eyes'
  const swatches     = tab === 'hair' ? HAIR_SWATCHES : EYE_SWATCHES
  const swatchKey    = tab === 'hair' ? 'hairColor' : 'eyeColor'

  const handleSave = () => {
    onChange?.(cfg)
    onClose?.()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>

        {/* ─ Left preview ─ */}
        <div className={styles.left}>
          <div className={styles.previewCircle}>
            <HumanSVG config={cfg} size={175}/>
          </div>
          <div className={styles.previewName}>ltcherp</div>
        </div>

        {/* ─ Right panel ─ */}
        <div className={styles.right}>

          {/* Tab bar */}
          <div className={styles.tabBar}>
            <button
              className={`${styles.navBtn} ${page === 0 ? styles.navDisabled : ''}`}
              onClick={() => setTabPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >L</button>

            <div className={styles.tabs}>
              {TABS.map(t => (
                <button
                  key={t.id}
                  className={`${styles.tabBtn} ${tab === t.id ? styles.tabActive : ''}`}
                  onClick={() => changeTab(t.id)}
                  title={t.label}
                >
                  <span className={styles.tabIcon}>{t.icon}</span>
                </button>
              ))}
            </div>

            <button
              className={`${styles.navBtn} ${page >= totalPages - 1 ? styles.navDisabled : ''}`}
              onClick={() => setTabPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >R</button>
          </div>

          {/* Tab label */}
          <div className={styles.tabLabel}>{TABS.find(t => t.id === tab)?.label}</div>

          {/* Options grid */}
          <div className={styles.grid}>
            {gridItems.map((val, i) =>
              val === null
                ? <div key={i} className={styles.cardEmpty}/>
                : <GridCard
                    key={val}
                    isSelected={cfg[activeKey] === val}
                    onClick={() => set(activeKey, val)}
                    label={val}
                  >
                    {renderCardContent(val)}
                  </GridCard>
            )}
          </div>

          {/* Color swatches */}
          {showSwatches && (
            <div className={styles.swatchRow}>
              {swatches.map(s => (
                <button
                  key={s.name}
                  className={`${styles.swatch} ${cfg[swatchKey] === s.name ? styles.swatchSel : ''}`}
                  style={{ background: s.hex }}
                  onClick={() => set(swatchKey, s.name)}
                  title={s.name}
                >
                  {cfg[swatchKey] === s.name && <span className={styles.swatchTick}>✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* Confirm */}
          <button className={styles.confirmBtn} onClick={handleSave}>
            Confirmer
            <span className={styles.plusBadge}>+</span>
          </button>

        </div>

        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
    </div>
  )
}
