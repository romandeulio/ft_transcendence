import { useState } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import StatCard from '../components/ui/StatCard'
import Pill from '../components/ui/Pill'
import ProgressBar from '../components/ui/ProgressBar'
import { useBets } from '../context/BetsContext'
import { useAuth } from '../context/AuthContext'
import { getPlayerBadge } from '../utils/playerBadge'
import styles from './Paris.module.css'

const HIST_PER_PAGE = 3

function BetsChart({ history, yRange }) {
  if (!history.length) return null

  const vals = history.reduce((acc, h) => {
    const prev = acc[acc.length - 1] ?? 0
    return [...acc, prev + h.delta]
  }, [])

  const W = 300, H = 70, padL = 34, padT = 8, padR = 8, padB = 18
  const cW = W - padL - padR
  const cH = H - padT - padB

  const dMin = Math.min(...vals, 0)
  const dMax = Math.max(...vals, 1)
  const min  = yRange != null ? -yRange : dMin
  const max  = yRange != null ?  yRange : dMax
  const span = max - min || 1

  const x = i => padL + (i / Math.max(vals.length - 1, 1)) * cW
  const y = v => padT + ((max - v) / span) * cH

  const last  = vals[vals.length - 1]
  const color = last >= 0 ? '#57722F' : '#CD3122'
  const fill  = last >= 0 ? 'rgba(87,114,47,0.08)' : 'rgba(205,49,34,0.08)'

  let path = `M ${x(0)} ${y(vals[0])}`
  for (let i = 1; i < vals.length; i++) path += ` L ${x(i)} ${y(vals[i])}`
  const area = `${path} L ${x(vals.length - 1)} ${padT + cH} L ${padL} ${padT + cH} Z`

  const zeroY    = y(0)
  const showZero = dMin < 0 && dMax > 0
  const ticks    = [0, 0.5, 1].map(t => Math.round(min + t * span))
  const step     = Math.max(1, Math.floor(history.length / 7))

  return (
    <svg viewBox={`0 0 ${W} ${H + padB}`} width="100%" className={styles.chart} style={{ overflow: 'visible' }}>
      {ticks.map(v => {
        const yt = y(v)
        return (
          <g key={v}>
            <line x1={padL} y1={yt} x2={W - padR} y2={yt} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 3" />
            <text x={padL - 4} y={yt} textAnchor="end" fontSize="8" fill="var(--ink3)" dominantBaseline="middle">{v}</text>
          </g>
        )
      })}
      {showZero && <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--border)" strokeWidth="0.8" />}
      <path d={area} fill={fill} />
      <path d={path} fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      {vals.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r="2" fill={color} />
          <title>{history[i]?.date} : {v >= 0 ? '+' : ''}{v} jetons</title>
        </g>
      ))}
      {history.map((h, i) =>
        (i % step === 0 || i === history.length - 1)
          ? <text key={i} x={x(i)} y={H + padB - 2} textAnchor="middle" fontSize="8" fill="var(--ink3)">{h.date}</text>
          : null
      )}
    </svg>
  )
}

export default function Paris() {
  const { bets, betHistory, placeBet, cancelBet } = useBets()
  const { user } = useAuth()

  const [amounts,      setAmounts]      = useState({})
  const [showSlider,   setShowSlider]   = useState(null)
  const [betChoices,   setBetChoices]   = useState({})
  const [histPage,     setHistPage]     = useState(0)
  const [chartYFilter, setChartYFilter] = useState('auto')

  const maxTokens = user?.tokens ?? 0

  const getAmount = (id) => amounts[id] ?? 50
  const getChoice = (id) => betChoices[id] ?? null

  const handleBet = (bet) => {
    const choice = getChoice(bet.id)
    const player = choice === 'p1' ? bet.p1 : bet.p2
    placeBet(bet.id, player, getAmount(bet.id))
    setShowSlider(null)
    setBetChoices(prev => { const n = { ...prev }; delete n[bet.id]; return n })
  }

  const openMiser = (betId) => {
    setShowSlider(betId)
    setBetChoices(prev => ({ ...prev, [betId]: null }))
  }

  const histTotal = betHistory.length
  const histPages = Math.ceil(histTotal / HIST_PER_PAGE) || 1
  const histSlice = betHistory.slice(histPage * HIST_PER_PAGE, (histPage + 1) * HIST_PER_PAGE)

  const bestGain    = [...betHistory].sort((a, b) => b.delta - a.delta)[0]
  const biggestLoss = [...betHistory].sort((a, b) => a.delta - b.delta)[0]
  const totalBalance = betHistory.reduce((s, h) => s + h.delta, 0)

  const yRange       = chartYFilter === 'auto' ? null : parseInt(chartYFilter)
  const chartBalance = totalBalance

  return (
    <Shell>
      <Topbar
        title="Paris"
        titleSize={30}
        right={
          <div className={styles.wallet}>
            <span>🪙</span>
            <span>{maxTokens} jetons disponibles</span>
          </div>
        }
      />

      <div className={styles.content}>
        <div className={styles.statsGrid}>
          <StatCard color="var(--orange-pale)" label="Paris réalisés" value={betHistory.length} sub="cette saison" />
          <StatCard color="var(--yellow-pale)" label="Total misé"     value="—"                 sub="jetons misés" />
          <StatCard color="var(--green-pale)"  label="Bilan saison"   value={totalBalance >= 0 ? `+${totalBalance}` : totalBalance} sub="jetons net" />
        </div>

        <div className={styles.grid}>
          {/* ─ Paris disponibles ─ */}
          <div className={styles.cardWrap}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleRow}>
                <span className={styles.cardTitle}>Paris disponibles</span>
                <span className={styles.weekCounter}>{bets.length} pari{bets.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className={styles.cardBody}>
              {bets.length === 0 && (
                <div className={styles.emptyBets}>Aucun paris disponible pour le moment.</div>
              )}
              {bets.map(bet => {
                const isLive     = bet.status === 'live'
                const hasBet     = !!bet.myBet
                const amount     = getAmount(bet.id)
                const sliderOpen = showSlider === bet.id
                const choice     = getChoice(bet.id)

                return (
                  <div key={bet.id} className={styles.betBlock}>
                    <div className={styles.betHeader}>
                      <span className={styles.betMatch}>{bet.match}</span>
                      <div className={styles.betHeaderRight}>
                        {isLive && <Pill label="LIVE" type="live" />}
                        {!isLive && hasBet && (
                          <button className={styles.cancelBtn} onClick={() => cancelBet(bet.id)}>Annuler</button>
                        )}
                        {!isLive && !hasBet && (
                          <button
                            className={`${styles.miserBtn} ${sliderOpen ? styles.miserBtnOpen : ''}`}
                            onClick={() => sliderOpen ? setShowSlider(null) : openMiser(bet.id)}
                          >
                            {sliderOpen ? '✕' : 'Miser'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className={styles.betContext}>{bet.context}</div>

                    {sliderOpen && (
                      <div className={styles.sliderBox}>
                        {!choice && (
                          <>
                            <div className={styles.sliderLabel}>Sur qui pariez-vous ?</div>
                            <div className={styles.playerChoiceRow}>
                              <button
                                className={`${styles.playerChoiceBtn} ${styles.playerChoiceBtnRed}`}
                                onClick={() => setBetChoices(prev => ({ ...prev, [bet.id]: 'p1' }))}
                              >
                                {bet.p1}
                                {(() => { const b = getPlayerBadge(0); return (
                                  <span className={styles.playerBadge} style={{ background: b.bg, color: b.color }}>{b.label}</span>
                                )})()}
                              </button>
                              <span className={styles.playerChoiceVs}>vs</span>
                              <button
                                className={`${styles.playerChoiceBtn} ${styles.playerChoiceBtnBlue}`}
                                onClick={() => setBetChoices(prev => ({ ...prev, [bet.id]: 'p2' }))}
                              >
                                {bet.p2}
                                {(() => { const b = getPlayerBadge(0); return (
                                  <span className={styles.playerBadge} style={{ background: b.bg, color: b.color }}>{b.label}</span>
                                )})()}
                              </button>
                            </div>
                          </>
                        )}

                        {choice && (
                          <>
                            <div className={styles.sliderLabel}>
                              Parié sur <strong>{choice === 'p1' ? bet.p1 : bet.p2}</strong> —{' '}
                              <button
                                className={styles.changeChoiceBtn}
                                onClick={() => setBetChoices(prev => ({ ...prev, [bet.id]: null }))}
                              >
                                changer
                              </button>
                            </div>
                            <div className={styles.sliderLabel} style={{ marginTop: 8 }}>
                              Mise : <strong>{amount} jetons</strong>
                            </div>
                            <input
                              type="range" min={1} max={Math.max(maxTokens, 1)} value={amount}
                              onChange={e => setAmounts(p => ({ ...p, [bet.id]: +e.target.value }))}
                              className={styles.slider}
                            />
                            <div className={styles.sliderRange}>
                              <span>1</span><span>{maxTokens}</span>
                            </div>
                            <button className={styles.confirmMiseBtn} onClick={() => handleBet(bet)}>
                              Confirmer — {amount} jetons
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {hasBet && (
                      <div className={styles.myBetRow}>
                        <span className={styles.myBetLabel}>Mise placée sur {bet.myBet.player} :</span>
                        <span className={styles.myBetVal}>{bet.myBet.amount} jetons</span>
                      </div>
                    )}

                    <ProgressBar pct={bet.probP1} />
                    <div className={styles.betStats}>
                      <span>— {bet.pctBets}% sur {bet.p1}</span>
                      <span>— {100 - bet.pctBets}% sur {bet.p2}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─ Droite ─ */}
          <div className={styles.rightCol}>
            <div className={styles.cardWrap}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Historique des paris</span>
              </div>
              <div className={styles.cardBody}>
                {histSlice.length === 0 && (
                  <div className={styles.emptyBets}>Aucun historique disponible.</div>
                )}
                {histSlice.map(h => (
                  <div key={h.id} className={styles.histRow}>
                    <div className={styles.histInfo}>
                      <div className={styles.histMatch}>{h.match}</div>
                      <div className={styles.histBet}>Parié sur {h.betOn} · {h.date}</div>
                    </div>
                    <div className={styles.histResult}>
                      <span className={h.delta > 0 ? styles.win : styles.loss}>
                        {h.delta > 0 ? '+' : ''}{h.delta}
                      </span>
                      <Pill label={h.result} type={h.result === 'gagné' ? 'win' : 'loss'} />
                    </div>
                  </div>
                ))}
              </div>
              {histPages > 1 && (
                <div className={styles.histPagination}>
                  <button className={styles.pageBtn} onClick={() => setHistPage(p => Math.max(0, p-1))} disabled={histPage === 0}>←</button>
                  <span className={styles.pageInfo}>{histPage + 1} / {histPages}</span>
                  <button className={styles.pageBtn} onClick={() => setHistPage(p => Math.min(histPages-1, p+1))} disabled={histPage === histPages-1}>→</button>
                </div>
              )}
            </div>

            <div className={styles.cardWrap}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Tes stats de paris</span>
              </div>
              <div className={styles.statsBody}>
                {bestGain ? (
                  <div className={styles.glassRow}>
                    <span className={styles.glassBadgeGreen}>Meilleur gain</span>
                    <span className={styles.glassPlayer}>{bestGain.betOn}</span>
                    <span className={styles.glassVal} style={{ color: '#57722F' }}>+{bestGain.delta}</span>
                  </div>
                ) : null}
                {biggestLoss ? (
                  <div className={styles.glassRow}>
                    <span className={styles.glassBadgeRed}>Plus grosse perte</span>
                    <span className={styles.glassPlayer}>{biggestLoss.betOn}</span>
                    <span className={styles.glassVal} style={{ color: '#CD3122' }}>{biggestLoss.delta}</span>
                  </div>
                ) : null}
              </div>
              <div className={styles.chartSection}>
                <div className={styles.chartLabel}>
                  Évolution du solde
                  <span className={chartBalance >= 0 ? styles.chartPos : styles.chartNeg}>
                    {chartBalance >= 0 ? '+' : ''}{chartBalance} jetons
                  </span>
                </div>
                <div className={styles.chartFilters}>
                  <select className={styles.chartFilter} value={chartYFilter} onChange={e => setChartYFilter(e.target.value)}>
                    <option value="auto">Auto</option>
                    <option value="50">±50</option>
                    <option value="100">±100</option>
                    <option value="200">±200</option>
                    <option value="500">±500</option>
                    <option value="1000">±1 000</option>
                    <option value="2000">±2 000</option>
                  </select>
                </div>
                <BetsChart history={betHistory} yRange={yRange} />
                {betHistory.length === 0 && (
                  <div className={styles.emptyBets}>Aucun historique à afficher.</div>
                )}
                <div className={styles.chartHint}>Survolez un point pour voir le détail</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
