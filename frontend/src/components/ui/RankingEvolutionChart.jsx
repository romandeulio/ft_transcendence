import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { authFetch } from '../../services/api'
import styles from './RankingEvolutionChart.module.css'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--white)',
      border: '1.5px solid var(--beige)',
      borderRadius: 10,
      padding: '7px 13px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--ink)',
    }}>
      <div style={{ marginBottom: 2, color: 'var(--ink3)', fontSize: 11 }}>Match {label}</div>
      {payload.map((e, i) => (
        <div key={i} style={{ color: e.color }}>{e.name} : {e.value}</div>
      ))}
    </div>
  )
}

export default function RankingEvolutionChart({ seasonId }) {
  const [mode,    setMode]    = useState('solo')
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!seasonId) { setData([]); return }
    setLoading(true)
    authFetch(`/api/performance/rank-history/?season=${seasonId}&type=${mode}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setData(Array.isArray(d) ? d : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [seasonId, mode])

  const rankDomain = data.length
    ? [1, Math.max(Math.max(...data.map(d => d.rank)) + 1, 5)]
    : [1, 5]

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.title}>Évolution du classement</span>
        <select
          className={styles.seasonSelect}
          value={mode}
          onChange={e => setMode(e.target.value)}
        >
          <option value="solo">1v1</option>
          <option value="team">2v2</option>
        </select>
      </div>

      {loading ? (
        <div className={styles.empty}>Chargement…</div>
      ) : data.length === 0 ? (
        <div className={styles.empty}>Aucune donnée pour cette saison.</div>
      ) : (
        <div className={styles.charts}>
          <div className={styles.chartBlock}>
            <div className={styles.chartLabel}>Position dans le classement</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="match" tick={{ fontSize: 10 }} label={{ value: 'Matchs joués', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--ink3)' }} />
                <YAxis
                  reversed
                  domain={rankDomain}
                  allowDecimals={false}
                  tickCount={5}
                  tick={{ fontSize: 11 }}
                  width={32}
                  tickFormatter={v => `#${v}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="rank"
                  name="Rang"
                  stroke="#4068DB"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.divider} />

          <div className={styles.chartBlock}>
            <div className={styles.chartLabel}>ELO</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="match" tick={{ fontSize: 10 }} label={{ value: 'Matchs joués', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--ink3)' }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={40}
                  domain={[
                    d => Math.max(0, d - Math.max(5, Math.round(Math.abs(d) * 0.05))),
                    d => d + Math.max(5, Math.round(Math.abs(d) * 0.05)),
                  ]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="elo"
                  name="ELO"
                  stroke="#CD3122"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
