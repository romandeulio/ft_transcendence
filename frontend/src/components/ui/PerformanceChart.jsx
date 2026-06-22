import { useState, useEffect, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { authFetch } from '../../services/api'
import styles from './PerformanceChart.module.css'

function exportCSV(chartData, selected, yAxis) {
  if (!chartData.length) return
  const header = ['period', ...selected.map(p => p.login)].join(',')
  const rows = chartData.map(row =>
    [row.period, ...selected.map(p => row[p.login] ?? '')].join(',')
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `performance_${yAxis}_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
}

async function exportPDF(chartRef, yAxis) {
  if (!chartRef.current) return
  const { default: html2canvas } = await import('html2canvas')
  const { jsPDF } = await import('jspdf')
  const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: '#ffffff' })
  const img = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width / 2, canvas.height / 2 + 40] })
  pdf.setFontSize(14)
  pdf.text(`Performance — ${yAxis}`, 20, 24)
  pdf.addImage(img, 'PNG', 0, 36, canvas.width / 2, canvas.height / 2)
  pdf.save(`performance_${yAxis}_${new Date().toISOString().slice(0,10)}.pdf`)
}

const COLORS = ['#CD3122', '#4068DB', '#57722F', '#E6B447', '#9B59B6', '#1ABC9C', '#E67E22', '#2C3E50']


function isoWeekKey(date) {
  const d = new Date(date); d.setHours(12, 0, 0, 0)
  // ISO: Thursday determines the week's year
  const thu = new Date(d)
  thu.setDate(thu.getDate() + 3 - ((thu.getDay() + 6) % 7))
  const year = thu.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const weekNum = 1 + Math.round(((thu - jan1) / 86400000 - 3 + ((jan1.getDay() + 6) % 7)) / 7)
  return `${year}-W${String(weekNum).padStart(2, '0')}`
}

function buildWeekSlots() {
  const now = new Date()
  const slots = []
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i * 7)
    slots.push({ key: isoWeekKey(d), label: i === 0 ? 'SA' : `S-${i}` })
  }
  return slots
}

function buildDaySlots(dateFrom, dateTo) {
  const start = new Date(dateFrom + 'T00:00:00')
  const end   = new Date(dateTo   + 'T00:00:00')
  const slots = []
  const cur = new Date(start)
  while (cur <= end) {
    const yyyy = cur.getFullYear()
    const mm   = String(cur.getMonth() + 1).padStart(2, '0')
    const dd   = String(cur.getDate()).padStart(2, '0')
    slots.push({ key: `${yyyy}-${mm}-${dd}`, dateLabel: `${dd}/${mm}` })
    cur.setDate(cur.getDate() + 1)
  }
  return slots
}

function buildMonthSlots() {
  const now = new Date()
  const slots = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    slots.push({ key, label: d.toLocaleString(i18n.language, { month: 'short' }) })
  }
  return slots
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--white)',
      border: '1.5px solid var(--beige)',
      borderRadius: 12,
      padding: '8px 14px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: entry.color, flexShrink: 0,
          }} />
          <span style={{ color: entry.color, fontWeight: 700, fontSize: 12 }}>
            {entry.name}
          </span>
          <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 12 }}>
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function PerformanceChart() {
  const { t } = useTranslation()
  const chartRef = useRef(null)
  const [xAxis,     setXAxis]     = useState('matches')
  const [yAxis,     setYAxis]     = useState('elo')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState([])
  const [players,   setPlayers]   = useState([])
  const [chartData, setChartData] = useState([])
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const downloadRef = useRef(null)

  useEffect(() => {
    if (!showDownloadMenu) return
    const close = (e) => {
      if (downloadRef.current && !downloadRef.current.contains(e.target)) {
        setShowDownloadMenu(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showDownloadMenu])

  const X_OPTIONS = [
    { value: 'matches', label: t('performance.x.matches') },
    { value: 'weeks',   label: t('performance.x.weeks')   },
    { value: 'months',  label: t('performance.x.months')  },
    { value: 'fixed',   label: t('performance.x.fixed')   },
  ]

  const Y_OPTIONS = [
    { value: 'elo',     label: t('performance.y.elo')     },
    { value: 'wins',    label: t('performance.y.wins')    },
    { value: 'losses',  label: t('performance.y.losses')  },
    { value: 'winrate', label: t('performance.y.winrate') },
    { value: 'goals',   label: t('performance.y.goals')   },
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
    const backendX = xAxis === 'fixed' ? 'days' : xAxis
    const params = new URLSearchParams({ players: logins, x: backendX, y: yAxis })
    if (xAxis === 'matches') {
      params.set('limit', '30')
    } else if (xAxis === 'weeks') {
      const d = new Date(); d.setDate(d.getDate() - 8 * 7)
      params.set('date_from', d.toISOString().slice(0, 10))
    } else if (xAxis === 'months') {
      const d = new Date(); d.setMonth(d.getMonth() - 6)
      params.set('date_from', d.toISOString().slice(0, 10))
    } else if (xAxis === 'fixed') {
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo)   params.set('date_to',   dateTo)
    }
    authFetch(`/api/performance/history/?${params}`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) { setChartData([]); return }
        if (xAxis === 'matches') {
          const byPeriod = {}
          for (const row of data) byPeriod[row.period] = row
          // Always 30 slots on X-axis; curve stops naturally at actual match count
          setChartData(Array.from({ length: 30 }, (_, i) => {
            const p = String(i + 1)
            return byPeriod[p] ?? { period: p }
          }))
        } else if (xAxis === 'weeks' || xAxis === 'months') {
          const slots = xAxis === 'weeks' ? buildWeekSlots() : buildMonthSlots()
          const byKey = {}
          for (const row of data) byKey[row.period] = row
          const rows = slots.map(({ key, label }) => {
            const row = byKey[key] ?? {}
            const entry = { period: label }
            for (const p of selected) {
              if (row[p.login] !== undefined) entry[p.login] = row[p.login]
            }
            return entry
          })
          if (yAxis === 'elo') {
            const fwd = {}
            for (const entry of rows) {
              for (const p of selected) {
                if (entry[p.login] !== undefined) fwd[p.login] = entry[p.login]
                else if (fwd[p.login] !== undefined) entry[p.login] = fwd[p.login]
              }
            }
            const bwd = {}
            for (let i = rows.length - 1; i >= 0; i--) {
              for (const p of selected) {
                if (rows[i][p.login] !== undefined) bwd[p.login] = rows[i][p.login]
                else if (bwd[p.login] !== undefined) rows[i][p.login] = bwd[p.login]
              }
            }
          }
          setChartData(rows)
        } else if (xAxis === 'fixed' && dateFrom && dateTo) {
          const slots = buildDaySlots(dateFrom, dateTo)
          const byKey = {}
          for (const row of data) byKey[row.period] = row
          setChartData(slots.map(({ key, dateLabel }) => ({
            ...(byKey[key] ?? {}), period: dateLabel,
          })))
        } else {
          setChartData(data)
        }
      })
      .catch(() => {})
  }, [selected, xAxis, yAxis, dateFrom, dateTo])

  const togglePlayer = (player) => {
    setSelected(prev => {
      if (prev.some(p => p.login === player.login)) return prev.filter(p => p.login !== player.login)
      if (prev.length >= 4) return prev
      return [...prev, player]
    })
  }

  const fixedStep = xAxis === 'fixed' && chartData.length > 0
    ? Math.max(1, Math.ceil(chartData.length / 15))
    : 1
  const fixedTicks = xAxis === 'fixed' && chartData.length > 0
    ? chartData.filter((_, i) => i % fixedStep === 0).map(r => r.period)
    : undefined
  const todayLabel = (() => {
    const n = new Date()
    return `${String(n.getDate()).padStart(2,'0')}/${String(n.getMonth()+1).padStart(2,'0')}`
  })()

  const renderFixedTick = ({ x, y, payload }) => {
    const isToday = payload.value === todayLabel
    return (
      <text x={x} y={y + 12} textAnchor="middle" fontSize={10}
        fill={isToday ? '#CD3122' : '#aaa'} fontWeight={isToday ? 700 : 400}>
        {payload.value}
      </text>
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.title}>{t('performance.title')}</span>
        {chartData.length > 0 && (
          <div className={styles.downloadWrapper} ref={downloadRef}>
            <button
              className={styles.exportBtn}
              onClick={() => setShowDownloadMenu(v => !v)}
            >
              ↓ Télécharger
            </button>
            {showDownloadMenu && (
              <div className={styles.downloadMenu}>
                <button
                  className={styles.downloadMenuItem}
                  onClick={() => { exportCSV(chartData, selected, yAxis); setShowDownloadMenu(false) }}
                >CSV</button>
                <button
                  className={styles.downloadMenuItem}
                  onClick={() => { exportPDF(chartRef, yAxis); setShowDownloadMenu(false) }}
                >PDF</button>
              </div>
            )}
          </div>
        )}
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
        {xAxis === 'fixed' && (<>
          <label className={styles.controlLabel}>
            {t('performance.dateFrom')}
            <input
              type="date"
              className={styles.controlSelect}
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </label>
          <label className={styles.controlLabel}>
            {t('performance.dateTo')}
            <input
              type="date"
              className={styles.controlSelect}
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </label>
        </>)}
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
      ) : xAxis === 'fixed' && (!dateFrom || !dateTo) ? (
        <div className={styles.emptyChart}>
          Choisissez vos dates
        </div>
      ) : chartData.length === 0 ? (
        <div className={styles.emptyChart}>
          {t('performance.noData')}
        </div>
      ) : (
        <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period"
              ticks={xAxis === 'fixed' ? fixedTicks : undefined}
              tick={xAxis === 'fixed' ? renderFixedTick : { fontSize: 10 }}
              interval={xAxis === 'fixed' ? 0 : xAxis === 'matches' ? 'preserveStartEnd' : 'preserveStartEnd'}
              allowDataOverflow={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              width={40}
              domain={[
                (dataMin) => Math.max(0, dataMin - Math.max(5, Math.round(Math.abs(dataMin) * 0.05))),
                (dataMax) => dataMax + Math.max(5, Math.round(Math.abs(dataMax) * 0.05)),
              ]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {selected.map((p, i) => (
              <Line
                key={p.login}
                type="monotone"
                dataKey={p.login}
                stroke={COLORS[i]}
                strokeWidth={2}
                dot={xAxis === 'matches' ? false : { r: 2, fill: COLORS[i], strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}