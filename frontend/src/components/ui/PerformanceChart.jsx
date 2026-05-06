import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import styles from './PerformanceChart.module.css'

const Y_OPTIONS = [
  { value: 'elo',             label: 'ELO'                   },
  { value: 'wins',            label: 'Victoires'             },
  { value: 'losses',          label: 'Défaites'              },
  { value: 'winrate',         label: 'Win rate (%)'          },
  { value: 'goals',           label: 'Buts marqués'          },
  { value: 'goals_against',   label: 'Buts encaissés'        },
  { value: 'bets_won',        label: 'Paris gagnés'          },
  { value: 'bets_lost',       label: 'Paris perdus'          },
  { value: 'tournaments_won', label: 'Tournois remportés'    },
  { value: 'streak',          label: 'Série en cours'        },
]

const X_OPTIONS = [
  { value: 'weeks',   label: 'Semaines'    },
  { value: 'months',  label: 'Mois'        },
  { value: 'seasons', label: 'Saisons'     },
  { value: 'matches', label: 'Matchs joués'},
]

const RAW = {
  weeks: [
    { label:'S1', ltcherp:1180, sydney:1220, thais:1300, roman:1150 },
    { label:'S2', ltcherp:1200, sydney:1240, thais:1285, roman:1170 },
    { label:'S3', ltcherp:1215, sydney:1260, thais:1295, roman:1160 },
    { label:'S4', ltcherp:1230, sydney:1250, thais:1310, roman:1175 },
    { label:'S5', ltcherp:1250, sydney:1270, thais:1305, roman:1190 },
    { label:'S6', ltcherp:1260, sydney:1255, thais:1320, roman:1185 },
  ],
  months: [
    { label:'Jan', ltcherp:1150, sydney:1200, thais:1280, roman:1130 },
    { label:'Fév', ltcherp:1180, sydney:1230, thais:1295, roman:1155 },
    { label:'Mar', ltcherp:1220, sydney:1250, thais:1310, roman:1170 },
    { label:'Avr', ltcherp:1260, sydney:1255, thais:1320, roman:1185 },
  ],
  seasons: [
    { label:'S1', ltcherp:1200, sydney:1300, thais:1400, roman:1100 },
    { label:'S2', ltcherp:1260, sydney:1255, thais:1320, roman:1185 },
  ],
  matches: [
    { label:'5',  ltcherp:1160, sydney:1210, thais:1290, roman:1140 },
    { label:'10', ltcherp:1190, sydney:1235, thais:1300, roman:1155 },
    { label:'15', ltcherp:1210, sydney:1248, thais:1308, roman:1165 },
    { label:'20', ltcherp:1235, sydney:1252, thais:1315, roman:1175 },
    { label:'25', ltcherp:1250, sydney:1255, thais:1318, roman:1182 },
  ],
}

const SCALE = {
  elo:             { ltcherp:1, sydney:1,    thais:1,    roman:1    },
  wins:            { ltcherp:0.020, sydney:0.023, thais:0.026, roman:0.016 },
  losses:          { ltcherp:0.012, sydney:0.010, thais:0.008, roman:0.015 },
  winrate:         { ltcherp:0.050, sydney:0.054, thais:0.060, roman:0.044 },
  goals:           { ltcherp:0.15,  sydney:0.16,  thais:0.18,  roman:0.13  },
  goals_against:   { ltcherp:0.10,  sydney:0.09,  thais:0.07,  roman:0.12  },
  bets_won:        { ltcherp:0.008, sydney:0.009, thais:0.011, roman:0.007 },
  bets_lost:       { ltcherp:0.005, sydney:0.005, thais:0.004, roman:0.007 },
  tournaments_won: { ltcherp:0.001, sydney:0.002, thais:0.003, roman:0.001 },
  streak:          { ltcherp:0.003, sydney:0.004, thais:0.005, roman:0.003 },
}

const PLAYERS = ['ltcherp', 'sydney', 'thais', 'roman']
const COLORS  = ['#CD3122', '#4068DB', '#57722F', '#E6B447']

function buildData(xAxis, yMetric) {
  return RAW[xAxis].map(row => {
    const out = { label: row.label }
    PLAYERS.forEach(p => {
      const v = SCALE[yMetric]?.[p] ?? 1
      out[p] = Math.round(row[p] * v)
    })
    return out
  })
}

export default function PerformanceChart() {
  const [xAxis, setXAxis] = useState('weeks')
  const [yAxis, setYAxis] = useState('elo')

  const data = buildData(xAxis, yAxis)

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.title}>PERFORMANCE</span>
      </div>

      <div className={styles.controls}>
        <label className={styles.controlLabel}>
          Axe X
          <select
            className={styles.controlSelect}
            value={xAxis}
            onChange={e => setXAxis(e.target.value)}
          >
            {X_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.controlLabel}>
          Axe Y
          <select
            className={styles.controlSelect}
            value={yAxis}
            onChange={e => setYAxis(e.target.value)}
          >
            {Y_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 24, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--ink3)', fontFamily: 'inherit' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--ink3)', fontFamily: 'inherit' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              fontFamily: 'inherit',
              background: 'var(--white)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '4px 10px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
            itemStyle={{ color: 'var(--ink)' }}
            labelStyle={{ color: 'var(--ink2)', fontWeight: 700 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, fontFamily: 'inherit', paddingTop: 8 }}
          />
          {PLAYERS.map((p, i) => (
            <Line
              key={p}
              type="monotone"
              dataKey={p}
              stroke={COLORS[i]}
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
