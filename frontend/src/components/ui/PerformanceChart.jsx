import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import styles from './PerformanceChart.module.css'

const Y_OPTIONS = [
  { value: 'elo',             label: 'ELO'                },
  { value: 'wins',            label: 'Victoires'          },
  { value: 'losses',          label: 'Défaites'           },
  { value: 'winrate',         label: 'Win rate (%)'       },
  { value: 'goals',           label: 'Buts marqués'       },
  { value: 'goals_against',   label: 'Buts encaissés'     },
  { value: 'bets_won',        label: 'Paris gagnés'       },
  { value: 'bets_lost',       label: 'Paris perdus'       },
  { value: 'tournaments_won', label: 'Tournois remportés' },
  { value: 'streak',          label: 'Série en cours'     },
]

const X_OPTIONS = [
  { value: 'weeks',   label: 'Semaines'     },
  { value: 'months',  label: 'Mois'         },
  { value: 'seasons', label: 'Saisons'      },
  { value: 'matches', label: 'Matchs joués' },
]

const ALL_PLAYERS = [
  { login: 'ltcherp',  display: 'ltcherp'  },
  { login: 'sydney',   display: 'sydney'   },
  { login: 'thais',    display: 'thais'    },
  { login: 'roman',    display: 'roman'    },
  { login: 'amorin',   display: 'amorin'   },
  { login: 'jblanc',   display: 'jblanc'   },
  { login: 'coraline', display: 'coraline' },
  { login: 'kperez',   display: 'kperez'   },
]

const RAW = {
  weeks: [
    { label:'S1', ltcherp:1180, sydney:1220, thais:1300, roman:1150, amorin:1100, jblanc:1080, coraline:1200, kperez:1050 },
    { label:'S2', ltcherp:1200, sydney:1240, thais:1285, roman:1170, amorin:1120, jblanc:1095, coraline:1215, kperez:1060 },
    { label:'S3', ltcherp:1215, sydney:1260, thais:1295, roman:1160, amorin:1140, jblanc:1110, coraline:1225, kperez:1055 },
    { label:'S4', ltcherp:1230, sydney:1250, thais:1310, roman:1175, amorin:1130, jblanc:1105, coraline:1240, kperez:1070 },
    { label:'S5', ltcherp:1250, sydney:1270, thais:1305, roman:1190, amorin:1150, jblanc:1120, coraline:1255, kperez:1080 },
    { label:'S6', ltcherp:1260, sydney:1255, thais:1320, roman:1185, amorin:1145, jblanc:1115, coraline:1260, kperez:1075 },
  ],
  months: [
    { label:'Jan', ltcherp:1150, sydney:1200, thais:1280, roman:1130, amorin:1090, jblanc:1070, coraline:1190, kperez:1040 },
    { label:'Fév', ltcherp:1180, sydney:1230, thais:1295, roman:1155, amorin:1110, jblanc:1090, coraline:1210, kperez:1055 },
    { label:'Mar', ltcherp:1220, sydney:1250, thais:1310, roman:1170, amorin:1130, jblanc:1105, coraline:1230, kperez:1065 },
    { label:'Avr', ltcherp:1260, sydney:1255, thais:1320, roman:1185, amorin:1145, jblanc:1115, coraline:1260, kperez:1075 },
  ],
  seasons: [
    { label:'S1', ltcherp:1200, sydney:1300, thais:1400, roman:1100, amorin:1080, jblanc:1060, coraline:1180, kperez:1030 },
    { label:'S2', ltcherp:1260, sydney:1255, thais:1320, roman:1185, amorin:1145, jblanc:1115, coraline:1260, kperez:1075 },
  ],
  matches: [
    { label:'5',  ltcherp:1160, sydney:1210, thais:1290, roman:1140, amorin:1095, jblanc:1075, coraline:1195, kperez:1045 },
    { label:'10', ltcherp:1190, sydney:1235, thais:1300, roman:1155, amorin:1115, jblanc:1092, coraline:1212, kperez:1058 },
    { label:'15', ltcherp:1210, sydney:1248, thais:1308, roman:1165, amorin:1128, jblanc:1102, coraline:1225, kperez:1062 },
    { label:'20', ltcherp:1235, sydney:1252, thais:1315, roman:1175, amorin:1138, jblanc:1108, coraline:1238, kperez:1070 },
    { label:'25', ltcherp:1250, sydney:1255, thais:1318, roman:1182, amorin:1143, jblanc:1112, coraline:1252, kperez:1073 },
  ],
}

const SCALE = {
  elo:             { ltcherp:1,     sydney:1,     thais:1,     roman:1,     amorin:1,     jblanc:1,     coraline:1,     kperez:1     },
  wins:            { ltcherp:0.020, sydney:0.023, thais:0.026, roman:0.016, amorin:0.014, jblanc:0.013, coraline:0.019, kperez:0.012 },
  losses:          { ltcherp:0.012, sydney:0.010, thais:0.008, roman:0.015, amorin:0.016, jblanc:0.017, coraline:0.011, kperez:0.018 },
  winrate:         { ltcherp:0.050, sydney:0.054, thais:0.060, roman:0.044, amorin:0.040, jblanc:0.038, coraline:0.048, kperez:0.035 },
  goals:           { ltcherp:0.15,  sydney:0.16,  thais:0.18,  roman:0.13,  amorin:0.12,  jblanc:0.11,  coraline:0.14,  kperez:0.10  },
  goals_against:   { ltcherp:0.10,  sydney:0.09,  thais:0.07,  roman:0.12,  amorin:0.13,  jblanc:0.14,  coraline:0.10,  kperez:0.15  },
  bets_won:        { ltcherp:0.008, sydney:0.009, thais:0.011, roman:0.007, amorin:0.006, jblanc:0.006, coraline:0.008, kperez:0.005 },
  bets_lost:       { ltcherp:0.005, sydney:0.005, thais:0.004, roman:0.007, amorin:0.008, jblanc:0.008, coraline:0.005, kperez:0.009 },
  tournaments_won: { ltcherp:0.001, sydney:0.002, thais:0.003, roman:0.001, amorin:0.001, jblanc:0.001, coraline:0.001, kperez:0.001 },
  streak:          { ltcherp:0.003, sydney:0.004, thais:0.005, roman:0.003, amorin:0.002, jblanc:0.002, coraline:0.003, kperez:0.002 },
}

const COLORS = ['#CD3122', '#4068DB', '#57722F', '#E6B447', '#9B59B6', '#1ABC9C', '#E67E22', '#2C3E50']

function buildData(xAxis, yMetric, players) {
  return RAW[xAxis].map(row => {
    const out = { label: row.label }
    players.forEach(p => {
      const v = SCALE[yMetric]?.[p] ?? 1
      out[p] = Math.round(row[p] * v)
    })
    return out
  })
}

export default function PerformanceChart() {
  const [xAxis,    setXAxis]    = useState('weeks')
  const [yAxis,    setYAxis]    = useState('elo')
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState(['ltcherp', 'sydney', 'thais', 'roman'])

  const filtered = ALL_PLAYERS.filter(p =>
    p.display.toLowerCase().includes(search.toLowerCase())
  )

  const togglePlayer = (login) => {
    setSelected(prev => {
      if (prev.includes(login)) return prev.filter(p => p !== login)
      if (prev.length >= 4) return prev
      return [...prev, login]
    })
  }

  const data = buildData(xAxis, yAxis, selected)

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.title}>PERFORMANCE</span>
      </div>

      <div className={styles.controls}>
        <label className={styles.controlLabel}>
          Axe X
          <select className={styles.controlSelect} value={xAxis} onChange={e => setXAxis(e.target.value)}>
            {X_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className={styles.controlLabel}>
          Axe Y
          <select className={styles.controlSelect} value={yAxis} onChange={e => setYAxis(e.target.value)}>
            {Y_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {/* Player picker */}
      <div className={styles.playerPicker}>
        <div className={styles.pickerHeader}>
          <span className={styles.pickerLabel}>Joueurs à comparer <span className={styles.pickerCount}>{selected.length}/4</span></span>
          <input
            className={styles.pickerSearch}
            type="text"
            placeholder="Rechercher un joueur…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.pickerList}>
          {filtered.map((p, i) => {
            const selIdx = selected.indexOf(p.login)
            const isSelected = selIdx !== -1
            const color = isSelected ? COLORS[selIdx] : undefined
            const disabled = !isSelected && selected.length >= 4
            return (
              <button
                key={p.login}
                className={`${styles.playerChip} ${isSelected ? styles.playerChipOn : ''} ${disabled ? styles.playerChipDisabled : ''}`}
                style={isSelected ? { borderColor: color, background: color + '18', color } : {}}
                onClick={() => !disabled && togglePlayer(p.login)}
                disabled={disabled}
              >
                {isSelected && <span className={styles.chipDot} style={{ background: color }} />}
                {p.display}
                {isSelected && <span className={styles.chipX} onClick={e => { e.stopPropagation(); togglePlayer(p.login) }}>✕</span>}
              </button>
            )
          })}
          {filtered.length === 0 && <span className={styles.pickerEmpty}>Aucun joueur trouvé</span>}
        </div>
      </div>

      {selected.length === 0 ? (
        <div className={styles.emptyChart}>Sélectionne au moins un joueur pour afficher le graphique.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 5, right: 24, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--ink3)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--ink3)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              contentStyle={{ fontSize: 11, fontFamily: 'inherit', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              itemStyle={{ color: 'var(--ink)' }}
              labelStyle={{ color: 'var(--ink2)', fontWeight: 700 }}
            />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'inherit', paddingTop: 8 }} />
            {selected.map((p, i) => (
              <Line key={p} type="monotone" dataKey={p} stroke={COLORS[selected.indexOf(p)]} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
