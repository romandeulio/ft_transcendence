import { useState } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import StatCard from '../components/ui/StatCard'
import Pill from '../components/ui/Pill'
import ProgressBar from '../components/ui/ProgressBar'
import { useBets } from '../context/BetsContext'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import styles from './Paris.module.css'

const HIST_PER_PAGE = 3

function BetsChart({ history, yRange }) {
  const { t } = useTranslation()
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
          <title>{history[i]?.date} : {v >= 0 ? '+' : ''}{v} {t('bets.tokensWord')}</title>
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
  const { t } = useTranslation()

  const [amounts,      setAmounts]      = useState({})
  const [showSlider,   setShowSlider]   = useState(null)
  const [betChoices,   setBetChoices]   = useState({})
  const [histPage,     setHistPage]     = useState(0)
  const [chartYFilter, setChartYFilter] = useState('auto')
  const [betError,     setBetError]     = useState(null)

  const maxTokens = user?.wallet_tokens ?? 0

  const getAmount = (id) => amounts[id] ?? 50
  const getChoice = (id) => betChoices[id] ?? null

  const handleBet = async (bet) => {
    const choice = getChoice(bet.id)
    if (!choice) return
    setBetError(null)
    try {
      await placeBet(bet.id, choice, getAmount(bet.id))
      setShowSlider(null)
      setBetChoices(prev => { const n = { ...prev }; delete n[bet.id]; return n })
    } catch (e) {
      setBetError({ id: bet.id, msg: e.message || t('bets.betRejected') })
    }
  }

  const openMiser = (betId) => {
    setShowSlider(betId)
    setBetChoices(prev => ({ ...prev, [betId]: null }))
  }

  const histTotal = betHistory.length
  const histPages = Math.ceil(histTotal / HIST_PER_PAGE) || 1
  const histSlice = betHistory.slice(histPage * HIST_PER_PAGE, (histPage + 1) * HIST_PER_PAGE)

  const bestGain    = betHistory.filter(h => h.delta > 0).reduce((m, h) => !m || h.delta > m.delta ? h : m, null)
  const biggestLoss = betHistory.filter(h => h.delta < 0).reduce((m, h) => !m || h.delta < m.delta ? h : m, null)
  const totalBalance = betHistory.reduce((s, h) => s + h.delta, 0)

  const yRange       = chartYFilter === 'auto' ? null : parseInt(chartYFilter)
  const chartBalance = totalBalance

  return (
    <Shell>
      <Topbar
        title={t('topbar.bets')}
        titleSize={30}
        right={
          <div className={styles.wallet}>
            <span>🪙</span>
            <span>{maxTokens} {t('bets.availableTokens')}</span>
          </div>
        }
      />

      <div className={styles.content}>
        <div className={styles.statsGrid}>
          <StatCard color="var(--orange-pale)" label={t('bets.betsPlaced')} value={betHistory.length} sub={t('bets.thisSeason')} />
          <StatCard color="var(--yellow-pale)" label={t('bets.totalBet')}   value="—"                 sub={t('bets.tokensBet')} />
          <StatCard color="var(--green-pale)"  label={t('bets.seasonBalance')} value={totalBalance >= 0 ? `+${totalBalance}` : totalBalance} sub={t('bets.netTokens')} />
        </div>

        <div className={styles.grid}>
          {/* ─ Paris disponibles ─ */}
          <div className={styles.cardWrap}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleRow}>
                <span className={styles.cardTitle}>{t('bets.availableBets')}</span>
                <span className={styles.weekCounter}>{t(bets.length === 1 ? 'bets.betCount_one' : 'bets.betCount_other', { count: bets.length })}</span>
              </div>
            </div>

            <div className={styles.cardBody}>
              {bets.length === 0 && (
                <div className={styles.emptyBets}>{t('bets.noBets')}</div>
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
                        {!isLive && hasBet && !bet.launched && (
                          <button className={styles.cancelBtn} onClick={() => cancelBet(bet.id)}>{t('bets.cancel')}</button>
                        )}
                        {!isLive && hasBet && bet.launched && (
                          <span className={styles.betContext}>Pari verrouillé</span>
                        )}
                        {!isLive && !hasBet && bet.bettable && bet.bettingOpen && (
                          <button
                            className={`${styles.miserBtn} ${sliderOpen ? styles.miserBtnOpen : ''}`}
                            onClick={() => sliderOpen ? setShowSlider(null) : openMiser(bet.id)}
                          >
                            {sliderOpen ? '✕' : t('bets.bet')}
                          </button>
                        )}
                        {!isLive && !hasBet && bet.bettable && !bet.bettingOpen && (
                          <span className={styles.betContext}>Paris fermés</span>
                        )}
                        {!isLive && !hasBet && !bet.bettable && (
                          <span className={styles.betContext}>Vous jouez</span>
                        )}
                      </div>
                    </div>

                    <div className={styles.betContext}>{bet.context}</div>

                    {sliderOpen && (
                      <div className={styles.sliderBox}>
                        {!choice && (
                          <>
                            <div className={styles.sliderLabel}>{t('bets.whoDoYouBet')}</div>
                            <div className={styles.playerChoiceRow}>
                              <button
                                className={`${styles.playerChoiceBtn} ${styles.playerChoiceBtnRed}`}
                                onClick={() => setBetChoices(prev => ({ ...prev, [bet.id]: 'p2' }))}
                              >
                                {bet.p2}
                                {bet.oddsP2 ? (
                                  <span className={styles.playerBadge} style={{ background: 'rgba(205,49,34,0.12)', color: '#CD3122' }}>×{bet.oddsP2}</span>
                                ) : null}
                              </button>
                              <span className={styles.playerChoiceVs}>vs</span>
                              <button
                                className={`${styles.playerChoiceBtn} ${styles.playerChoiceBtnBlue}`}
                                onClick={() => setBetChoices(prev => ({ ...prev, [bet.id]: 'p1' }))}
                              >
                                {bet.p1}
                                {bet.oddsP1 ? (
                                  <span className={styles.playerBadge} style={{ background: 'rgba(64,104,219,0.12)', color: '#4068DB' }}>×{bet.oddsP1}</span>
                                ) : null}
                              </button>
                            </div>
                          </>
                        )}

                        {choice && (
                          <>
                            <div className={styles.sliderLabel}>
                              {t('bets.betPlacedOn', { player: choice === 'p1' ? bet.p1 : bet.p2 })}{' '}
                              <button
                                className={styles.changeChoiceBtn}
                                onClick={() => setBetChoices(prev => ({ ...prev, [bet.id]: null }))}
                              >
                                {t('bets.change')}
                              </button>
                            </div>
                            <div className={styles.sliderLabel} style={{ marginTop: 8 }}>
                              {t('bets.amount', { amount })}
                            </div>
                            <input
                              type="range" min={1} max={Math.max(maxTokens, 1)} value={amount}
                              onChange={e => setAmounts(p => ({ ...p, [bet.id]: +e.target.value }))}
                              className={styles.slider}
                            />
                            <div className={styles.sliderRange}>
                              <span>1</span><span>{maxTokens}</span>
                            </div>
                            {(() => {
                              const odds = choice === 'p1' ? bet.oddsP1 : bet.oddsP2
                              return odds ? (
                                <div className={styles.sliderLabel} style={{ marginTop: 6 }}>
                                  Cote {odds} · gain potentiel {Math.round(amount * odds)} 🪙
                                </div>
                              ) : null
                            })()}
                            {betError?.id === bet.id && (
                              <div className={styles.sliderLabel} style={{ marginTop: 6, color: '#CD3122' }}>
                                {betError.msg}
                              </div>
                            )}
                            <button className={styles.confirmMiseBtn} onClick={() => handleBet(bet)}>
                              {t('bets.confirm', { amount })}
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {hasBet && (
                      <div className={styles.myBetRow}>
                        <span className={styles.myBetLabel}>{t('bets.betPlacedOn', { player: bet.myBet.player })}</span>
                        <span className={styles.myBetVal}>{bet.myBet.amount} {t('bets.tokensWord')}</span>
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
                <span className={styles.cardTitle}>{t('bets.history')}</span>
              </div>
              <div className={styles.cardBody}>
                {histSlice.length === 0 && (
                  <div className={styles.emptyBets}>{t('bets.noHistory')}</div>
                )}
                {histSlice.map(h => (
                  <div key={h.id} className={styles.histRow}>
                    <div className={styles.histInfo}>
                      <div className={styles.histMatch}>{h.match}</div>
                      <div className={styles.histBet}>{t('bets.bettedOn', { player: h.betOn, date: h.date })}</div>
                    </div>
                    <div className={styles.histResult}>
                      <span className={h.delta > 0 ? styles.win : styles.loss}>
                        {h.delta > 0 ? '+' : ''}{h.delta}
                      </span>
                      <Pill label={t(`bets.result.${h.result}`)} type={h.result === 'won' ? 'win' : h.result === 'refunded' ? 'draw' : 'loss'} />
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
                <span className={styles.cardTitle}>{t('bets.yourBetStats')}</span>
              </div>
              {(bestGain || biggestLoss) && (
              <div className={styles.statsBody}>
                {bestGain ? (
                  <div className={styles.glassRow}>
                    <span className={styles.glassBadgeGreen}>{t('bets.bestGain')}</span>
                    <span className={styles.glassPlayer}>{bestGain.match}{bestGain.score ? ` · ${bestGain.score}` : ''}</span>
                    <span className={styles.glassVal} style={{ color: '#57722F' }}>+{bestGain.delta}</span>
                  </div>
                ) : null}
                {biggestLoss ? (
                  <div className={styles.glassRow}>
                    <span className={styles.glassBadgeRed}>{t('bets.biggestLoss')}</span>
                    <span className={styles.glassPlayer}>{biggestLoss.match}{biggestLoss.score ? ` · ${biggestLoss.score}` : ''}</span>
                    <span className={styles.glassVal} style={{ color: '#CD3122' }}>{biggestLoss.delta}</span>
                  </div>
                ) : null}
              </div>
              )}
              <div className={styles.chartSection}>
                <div className={styles.chartLabel}>
                  {t('bets.balanceEvolution')}
                  <span className={chartBalance >= 0 ? styles.chartPos : styles.chartNeg}>
                    {chartBalance >= 0 ? '+' : ''}{chartBalance} {t('bets.tokensWord')}
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
                  <div className={styles.emptyBets}>{t('bets.noChartData')}</div>
                )}
                <div className={styles.chartHint}>{t('bets.hoverHint')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
