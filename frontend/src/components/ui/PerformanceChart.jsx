import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import { authFetch } from '../../services/api'
import styles from './PerformanceChart.module.css'

const COLORS = ['#CD3122', '#4068DB', '#57722F', '#E6B447', '#9B59B6', '#1ABC9C', '#E67E22', '#2C3E50']

export default function PerformanceChart() {
  const { t } = useTranslation()
  const [xAxis,     setXAxis]     = useState('matches')
  const [yAxis,     setYAxis]     = useState('elo')
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState([])
  const [players,   setPlayers]   = useState([])
  const [chartData, setChartData] = useState([])

  const X_OPTIONS = [
    { value: 'matches', label: t('performance.x.matches') },
    { value: 'weeks',   label: t('performance.x.weeks')   },
    { value: 'months',  label: t('performance.x.months')  },
    { value: 'seasons', label: t('performance.x.seasons') },
  ]

  const Y_OPTIONS = [
    { value: 'elo',     label: t('performance.y.elo')     },
    { value: 'wins',    label: t('performance.y.wins')    },
    { value: 'losses',  label: t('performance.y.losses')  },
    { value: 'winrate', label: t('performance.y.winrate') },
    { value: 'goals',   label: t('performance.y.goals')   },
    { value: 'streak',  label: t('performance.y.streak')  },
  ]

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
    authFetch(
      `/api/performance/history/?players=${encodeURIComponent(logins)}&x=${xAxis}&y=${yAxis}`
    )
      .then(r => r.json())
      .then(data => setChartData(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [selected, xAxis, yAxis])

  const togglePlayer = (player) => {
    setSelected(prev => {
      if (prev.some(p => p.login === player.login)) return prev.filter(p => p.login !== player.login)
      if (prev.length >= 4) return prev
      return [...prev, player]
    })
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.title}>{t('performance.title')}</span>
      </div>

      <div className={styles.controls}>
        <label className={styles.controlLabel}>
          {t('performance.axisX')}
          <select className={styles.controlSelect} value={xAxis} onChange={e => setXAxis(e.target.value)}>
            {X_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className={styles.controlLabel}>
          {t('performance.axisY')}
          <select className={styles.controlSelect} value={yAxis} onChange={e => setYAxis(e.target.value)}>
            {Y_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <div className={styles.playerPicker}>
        <div className={styles.pickerHeader}>
          <span className={styles.pickerLabel}>
            {t('performance.comparePlayers')} <span className={styles.pickerCount}>{selected.length}/4</span>
          </span>
        </div>
        <div className={styles.pickerBody}>
          <div className={styles.selectedPanel}>
            {selected.length === 0
              ? <span className={styles.pickerEmpty}>{t('performance.noSelected')}</span>
              : selected.map((p, i) => {
                  const color = COLORS[i]
                  return (
                    <span key={p.login} className={`${styles.playerChip} ${styles.playerChipOn}`}
                      style={{ borderColor: color, background: color + '18', color }}>
                      <span className={styles.chipDot} style={{ background: color }} />
                      {p.display}
                      <span className={styles.chipX} onClick={() => togglePlayer(p)}>✕</span>
                    </span>
                  )
                })
            }
          </div>

          <div className={styles.searchPanel}>
            <input
              className={styles.pickerSearch}
              type="text"
              placeholder={t('performance.searchPlayer')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className={styles.searchResults}>
              {players.filter(p => !selected.some(s => s.login === p.login)).map((p) => {
                const disabled = selected.length >= 4
                return (
                  <button
                    key={p.login}
                    className={`${styles.resultItem} ${disabled ? styles.playerChipDisabled : ''}`}
                    onClick={() => !disabled && togglePlayer(p)}
                    disabled={disabled}
                  >
                    {p.display}
                  </button>
                )
              })}
              {players.length === 0 && (
                <span className={styles.pickerEmpty}>
                  {!search.trim() ? t('performance.searchHint') : t('performance.noPlayer')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {selected.length === 0 ? (
        <div className={styles.emptyChart}>
          {t('performance.selectPlayer')}
        </div>
      ) : chartData.length === 0 ? (
        <div className={styles.emptyChart}>
          {t('performance.noData')}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} width={40} />
            <Tooltip />
            <Legend />
            {selected.map((p, i) => (
              <Line
                key={p.login}
                type="monotone"
                dataKey={p.login}
                stroke={COLORS[i]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
