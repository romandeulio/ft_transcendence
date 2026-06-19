import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { authFetch } from '../../services/api'
import styles from './ComparisonBarChart.module.css'

const COLORS = ['#CD3122', '#4068DB', '#57722F', '#E6B447']

const METRICS = [
  { value: 'elo_solo',          label: 'ELO'             },
  { value: 'total_gamelles',    label: 'Gamelles'        },
  { value: 'series_wins',       label: 'Série victoires' },
  { value: 'matches_per_month', label: 'Parties / mois'  },
]

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--white)', border: '1.5px solid var(--beige)',
      borderRadius: 12, padding: '8px 14px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.fill, flexShrink: 0 }} />
          <span style={{ color: entry.fill, fontWeight: 700, fontSize: 12 }}>{entry.name}</span>
          <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 12 }}>{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function ComparisonBarChart() {
  const [metric,   setMetric]   = useState('elo_solo')
  const [search,   setSearch]   = useState('')
  const [players,  setPlayers]  = useState([])
  const [selected, setSelected] = useState([])
  const [chartData, setChartData] = useState([])

  useEffect(() => {
    if (!search.trim()) { setPlayers([]); return }
    const timer = setTimeout(() => {
      authFetch(`/api/auth/users/?search=${encodeURIComponent(search)}`)
        .then(r => r.json())
        .then(data => setPlayers(data.map(u => ({ login: u.login, display: u.name }))))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (selected.length === 0) { setChartData([]); return }
    const logins = selected.map(p => p.login).join(',')
    authFetch(`/api/performance/stats/?players=${encodeURIComponent(logins)}`)
      .then(r => r.json())
      .then(data => {
        const ordered = selected.map(p => data.find(d => d.login === p.login)).filter(Boolean)
        setChartData(ordered.map(d => ({ name: d.login, value: d[metric] ?? 0 })))
      })
      .catch(() => {})
  }, [selected, metric])

  const togglePlayer = (player) => {
    setSelected(prev => {
      if (prev.some(p => p.login === player.login)) return prev.filter(p => p.login !== player.login)
      if (prev.length >= 4) return prev
      return [...prev, player]
    })
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.metrics}>
        {METRICS.map(m => (
          <button
            key={m.value}
            className={`${styles.metricBtn} ${metric === m.value ? styles.metricBtnOn : ''}`}
            onClick={() => setMetric(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className={styles.pickerRow}>
        <div className={styles.selectedChips}>
          {selected.length === 0
            ? <span className={styles.hint}>Sélectionne jusqu'à 4 joueurs</span>
            : selected.map((p, i) => (
                <span key={p.login} className={styles.chip}
                  style={{ color: COLORS[i], borderColor: COLORS[i], background: COLORS[i] + '18' }}>
                  <span className={styles.dot} style={{ background: COLORS[i] }} />
                  {p.display}
                  <span className={styles.chipX} onClick={() => togglePlayer(p)}>✕</span>
                </span>
              ))
          }
        </div>

        <div className={styles.searchWrap}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Rechercher un login…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className={styles.results}>
            {players.filter(p => !selected.some(s => s.login === p.login)).map(p => {
              const disabled = selected.length >= 4
              return (
                <button key={p.login} className={styles.resultItem}
                  disabled={disabled}
                  onClick={() => !disabled && togglePlayer(p)}>
                  {p.display}
                </button>
              )
            })}
            {players.length === 0 && search.trim() && (
              <span className={styles.noResult}>Aucun joueur trouvé</span>
            )}
          </div>
        </div>
      </div>

      {selected.length === 0 ? (
        <div className={styles.empty}>Recherche et sélectionne des joueurs pour comparer</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              width={40}
              domain={[
                0,
                (dataMax) => dataMax + Math.max(5, Math.round(dataMax * 0.1)),
              ]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={COLORS[selected.findIndex(s => s.login === entry.name)]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
