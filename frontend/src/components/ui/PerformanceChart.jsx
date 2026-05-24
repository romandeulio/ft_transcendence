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

const COLORS = ['#CD3122', '#4068DB', '#57722F', '#E6B447', '#9B59B6', '#1ABC9C', '#E67E22', '#2C3E50']

export default function PerformanceChart() {
  const [xAxis,    setXAxis]    = useState('weeks')
  const [yAxis,    setYAxis]    = useState('elo')
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState([])
  const [players,  setPlayers]  = useState([])

  const filtered = players.filter(p =>
    p.display.toLowerCase().includes(search.toLowerCase())
  )

  const togglePlayer = (login) => {
    setSelected(prev => {
      if (prev.includes(login)) return prev.filter(p => p !== login)
      if (prev.length >= 4) return prev
      return [...prev, login]
    })
  }

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

      <div className={styles.playerPicker}>
        <div className={styles.pickerHeader}>
          <span className={styles.pickerLabel}>
            Joueurs à comparer <span className={styles.pickerCount}>{selected.length}/4</span>
          </span>
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
                {isSelected && (
                  <span className={styles.chipX} onClick={e => { e.stopPropagation(); togglePlayer(p.login) }}>✕</span>
                )}
              </button>
            )
          })}
          {filtered.length === 0 && (
            <span className={styles.pickerEmpty}>
              {players.length === 0 ? 'Données non disponibles' : 'Aucun joueur trouvé'}
            </span>
          )}
        </div>
      </div>

      <div className={styles.emptyChart}>
        Sélectionne au moins un joueur pour afficher le graphique.
      </div>
    </div>
  )
}
