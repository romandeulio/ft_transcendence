import { useState, useEffect } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Avatar from '../components/ui/Avatar'
import Pill from '../components/ui/Pill'
import RankingEvolutionChart from '../components/ui/RankingEvolutionChart'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { authFetch } from '../services/api'
import styles from './Classement.module.css'

const RANK_MEDALS = ['🥇', '🥈', '🥉']
const PAGE_SIZE   = 5

export default function Classement() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [seasonOptions, setSeasonOptions] = useState([])
  const [season,    setSeason]    = useState('')
  const [seasonsLoaded, setSeasonsLoaded] = useState(false)
  const [page,      setPage]      = useState(0)
  const [page2v2,   setPage2v2]   = useState(0)
  const [hallOrder, setHallOrder] = useState('recent')
  const [hallMode,  setHallMode]  = useState('SOLO')

  const [players,     setPlayers]     = useState([])
  const [teams2v2,    setTeams2v2]    = useState([])
  const [pastSeasons, setPastSeasons] = useState([])
  const [hallRecords, setHallRecords] = useState([])
  const [seasonMap,   setSeasonMap]   = useState({}) // value → season id
  const [allSeasonData, setAllSeasonData] = useState([])

  useEffect(() => {
    authFetch('/api/seasons/')
      .then(r => r.json())
      .then(raw => {
        const allSeasons = Array.isArray(raw) ? raw : (raw?.results ?? [])

        // Construire le sélecteur de saisons (uniquement les vraies saisons)
        const opts = []
        const smap = {}
        allSeasons.forEach(s => {
          const key = `season_${s.id}`
          opts.push({ value: key, label: s.name })
          smap[key] = s.id
        })
        setSeasonOptions(opts)
        setSeasonMap(smap)
        setAllSeasonData(allSeasons)

        // Saison affichée par défaut : la saison active si elle existe,
        // sinon la dernière saison clôturée, sinon aucune.
        const active = allSeasons.find(s => s.status === 'ACTIVE')
        const lastFinished = allSeasons
          .filter(s => s.status === 'FINISHED')
          .sort((a, b) => new Date(b.end_date) - new Date(a.end_date))[0]
        const def = active || lastFinished || null
        setSeason(def ? `season_${def.id}` : '')
        setSeasonsLoaded(true)
      })
      .catch(() => setSeasonsLoaded(true))
  }, [])

  // Hall of Fame : recalcul quand le mode (1v1/2v2) ou les données changent
  useEffect(() => {
    const finished = allSeasonData.filter(s => s.status === 'FINISHED' && s.rewards_distributed)
    const rankType = hallMode === 'SOLO' ? 'SOLO' : 'TEAM'

    // Champions par saison
    const champions = finished.map(s => {
      const reward = s.rewards?.find(r => r.ranking_type === rankType && r.tier === 'TOP1')
      if (!reward) return null
      return {
        seasonId: s.id,
        seasonName: s.name,
        name: reward.player,
        initials: reward.player?.[0]?.toUpperCase() ?? '?',
        elo: reward.elo_at_end,
        avatar_url: reward.avatar_url || null,
      }
    }).filter(Boolean)
    setPastSeasons(champions)

    // Record all-time : plus haut ELO parmi rewards ET classement saison active
    const allCandidates = []

    // Candidats des saisons terminées (rewards)
    finished.forEach(s => {
      (s.rewards || []).filter(r => r.ranking_type === rankType).forEach(r => {
        allCandidates.push({ player: r.player, elo: r.elo_at_end, seasonName: s.name })
      })
    })

    // Candidats de la saison active (classement en cours)
    const currentPlayers = hallMode === 'SOLO' ? players : teams2v2
    const activeSeason = allSeasonData.find(s => s.status === 'ACTIVE')
    currentPlayers.forEach(p => {
      allCandidates.push({ player: p.name, elo: p.elo, seasonName: activeSeason?.name || t('ranking.currentSeason') })
    })

    if (allCandidates.length > 0) {
      const best = allCandidates.reduce((a, b) => (b.elo > a.elo ? b : a))
      setHallRecords([{
        icon: '👑',
        label: hallMode === 'SOLO' ? 'Plus haut ELO 1v1' : 'Plus haut ELO 2v2',
        value: best.player,
        stat: `${best.elo} ELO — saison : ${best.seasonName}`,
      }])
    } else {
      setHallRecords([])
    }
  }, [hallMode, allSeasonData, players, teams2v2])

  useEffect(() => {
    const seasonId = seasonMap[season]
    if (!seasonId) return

    authFetch(`/api/seasons/${seasonId}/ranking/?type=solo`)
      .then(r => r.json())
      .then(raw => {
        const ranking = Array.isArray(raw) ? raw : (raw?.results ?? [])
        if (!ranking.length && !Array.isArray(raw)) return
        setPlayers(ranking.map(e => ({
          id:         e.username,
          name:       e.username,
          avatar_url: e.avatar_url || null,
          isMe:       e.username === user?.username,
          wins:       e.wins,
          losses:     e.losses,
          elo:        e.elo,
          rank:       e.rank,
        })))
      })
      .catch(console.error)

    authFetch(`/api/seasons/${seasonId}/ranking/?type=team`)
      .then(r => r.json())
      .then(raw => {
        const ranking = Array.isArray(raw) ? raw : (raw?.results ?? [])
        if (!ranking.length && !Array.isArray(raw)) return
        setTeams2v2(ranking.map(e => ({
          id:         e.username,
          name:       e.username,
          avatar_url: e.avatar_url || null,
          isMe:       e.username === user?.username,
          wins:       e.wins,
          losses:     e.losses,
          elo:        e.elo,
          rank:       e.rank,
        })))
      })
      .catch(console.error)
  }, [season, seasonMap, user?.username])

  const totalPages   = Math.ceil(players.length / PAGE_SIZE)
  const pageSlice    = players.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const total2v2     = Math.ceil(teams2v2.length / PAGE_SIZE)
  const pageSlice2v2 = teams2v2.slice(page2v2 * PAGE_SIZE, page2v2 * PAGE_SIZE + PAGE_SIZE)

  // Aucune saison disponible (ni active, ni clôturée) → on floute tout.
  const noSeason = seasonsLoaded && !season

  const sortedSeasons = [...pastSeasons].sort((a, b) =>
    hallOrder === 'recent'
      ? a.seasonName.localeCompare(b.seasonName) * -1
      : a.seasonName.localeCompare(b.seasonName)
  )

  return (
    <Shell>
      <Topbar
        title={t('topbar.ranking')}
        titleSize={30}
      />

      <div className={styles.content}>

        <div className={styles.seasonRow}>
          <label className={styles.seasonLabel}>Saison :</label>
          {noSeason ? (
            <span className={styles.seasonSelect}>{t('ranking.noSeason')}</span>
          ) : (
            <select
              className={styles.seasonSelect}
              value={season}
              onChange={e => { setSeason(e.target.value); setPage(0); setPage2v2(0) }}
            >
              {seasonOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ position: 'relative' }}>
        <div style={noSeason ? { filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none' } : undefined}>

        <div className={styles.rankingRow}>

          {/* 1v1 */}
          <div className={styles.eloCard}>
            <div className={styles.eloHeader}>
              <span className={styles.eloTitle}>{t('ranking.palmares1v1')}</span>
              <span className={styles.eloSeason}>{seasonOptions.find(o => o.value === season)?.label}</span>
            </div>
            <div className={styles.eloBody}>
              <div className={styles.colHead}>
                <span className={styles.headName}>{t('ranking.player')}</span>
                <span className={styles.headVd}>{t('ranking.winsLosses')}</span>
                <span className={styles.headElo}>ELO</span>
                <span className={styles.headRank}>{t('ranking.rank')}</span>
              </div>
              {pageSlice.length === 0 && (
                <div className={styles.emptyState}>{t('ranking.noData')}</div>
              )}
              {pageSlice.map(p => (
                <div key={p.id} className={`${styles.playerRow} ${p.isMe ? styles.playerRowMe : ''}`}>
                  <Avatar initials={p.name} size={28} bg={p.isMe ? 'var(--orange-pale)' : 'var(--beige)'} round src={p.avatar_url} />
                  <span className={styles.playerName}>{p.name}</span>
                  <span className={styles.playerVd}>{p.wins} · {p.losses}</span>
                  <span className={styles.playerEloVal}>{p.elo}</span>
                  <span className={styles.rankColCell}>
                    {p.rank <= 3
                      ? <span className={styles.medal}>{RANK_MEDALS[p.rank - 1]}</span>
                      : <span className={styles.rankNum}>#{p.rank}</span>
                    }
                  </span>
                </div>
              ))}
            </div>
            {players.length > PAGE_SIZE && (
              <div className={styles.pagination}>
                <button className={styles.pageBtn} onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}>←</button>
                <span className={styles.pageInfo}>{page * PAGE_SIZE + 1}–{Math.min((page+1)*PAGE_SIZE, players.length)} / {players.length}</span>
                <button className={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page === totalPages-1}>→</button>
              </div>
            )}
          </div>

          {/* 2v2 */}
          <div className={styles.eloCard}>
            <div className={styles.eloHeader}>
              <span className={styles.eloTitle}>{t('ranking.palmares2v2')}</span>
              <span className={styles.eloSeason}>{seasonOptions.find(o => o.value === season)?.label}</span>
            </div>
            <div className={styles.eloBody}>
              <div className={styles.colHead}>
                <span className={styles.headName}>{t('ranking.player')}</span>
                <span className={styles.headVd}>{t('ranking.winsLosses')}</span>
                <span className={styles.headElo}>ELO</span>
                <span className={styles.headRank}>{t('ranking.rank')}</span>
              </div>
              {pageSlice2v2.length === 0 && (
                <div className={styles.emptyState}>{t('ranking.noData')}</div>
              )}
              {pageSlice2v2.map(p => (
                <div key={p.id} className={`${styles.playerRow} ${p.isMe ? styles.playerRowMe : ''}`}>
                  <Avatar initials={p.name} size={28} bg={p.isMe ? 'var(--orange-pale)' : 'var(--beige)'} round src={p.avatar_url} />
                  <span className={styles.playerName}>{p.name}</span>
                  <span className={styles.playerVd}>{p.wins} · {p.losses}</span>
                  <span className={styles.playerEloVal}>{p.elo}</span>
                  <span className={styles.rankColCell}>
                    {p.rank <= 3
                      ? <span className={styles.medal}>{RANK_MEDALS[p.rank - 1]}</span>
                      : <span className={styles.rankNum}>#{p.rank}</span>
                    }
                  </span>
                </div>
              ))}
            </div>
            {teams2v2.length > PAGE_SIZE && (
              <div className={styles.pagination}>
                <button className={styles.pageBtn} onClick={() => setPage2v2(p => Math.max(0, p-1))} disabled={page2v2 === 0}>←</button>
                <span className={styles.pageInfo}>{page2v2 * PAGE_SIZE + 1}–{Math.min((page2v2+1)*PAGE_SIZE, teams2v2.length)} / {teams2v2.length}</span>
                <button className={styles.pageBtn} onClick={() => setPage2v2(p => Math.min(total2v2-1, p+1))} disabled={page2v2 === total2v2-1}>→</button>
              </div>
            )}
          </div>

        </div>

        {/* ── Évolution du classement ── */}
        <RankingEvolutionChart seasonId={seasonMap[season]} />

        {/* ── Hall of Fame ── */}
        <div className={styles.hallCard}>
          <div className={styles.hallHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{t('ranking.hallOfFame')}</span>
            <select
              className={styles.hallOrderSelect}
              value={hallMode}
              onChange={e => setHallMode(e.target.value)}
            >
              <option value="SOLO">1v1</option>
              <option value="TEAM">2v2</option>
            </select>
          </div>
          <div className={styles.hallSplit}>

            <div className={styles.hallLeft}>
              <div className={styles.hallSectionTitle}>{t('ranking.allTimeRecords')}</div>
              {hallRecords.length === 0 && (
                <div className={styles.emptyState}>{t('ranking.noData')}</div>
              )}
              {hallRecords.map((r, i) => (
                <div key={i} className={styles.recordRow}>
                  <div className={styles.recordIconBox}>{r.icon}</div>
                  <div className={styles.recordInfo}>
                    <div className={styles.recordLabel}>{r.label}</div>
                    <div className={styles.recordValue}>{r.value}</div>
                    <div className={styles.recordStat}>{r.stat}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.hallDivider} />

            <div className={styles.hallRight}>
              <div className={styles.hallRightTop}>
                <div className={styles.hallSectionTitle}>{t('ranking.seasonChampions')}</div>
                <select
                  className={styles.hallOrderSelect}
                  value={hallOrder}
                  onChange={e => setHallOrder(e.target.value)}
                >
                  <option value="recent">{t('ranking.recentFirst')}</option>
                  <option value="oldest">{t('ranking.oldestFirst')}</option>
                </select>
              </div>
              <div className={styles.hallEntries}>
                {sortedSeasons.length === 0 && (
                  <div className={styles.emptyState}>{t('ranking.noData')}</div>
                )}
                {sortedSeasons.map(s => (
                  <div key={s.seasonId} className={styles.hallEntry}>
                    <div className={styles.hallSeasonLabel}>{s.seasonName}</div>
                    <Avatar initials={s.initials} size={44} bg="var(--yellow-pale)" round src={s.avatar_url} />
                    <div className={styles.hallName}>{s.name}</div>
                    <div className={styles.hallElo}>{s.elo} ELO</div>
                    <Pill label={t('ranking.champion')} type="gold" />
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        </div>
        {noSeason && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 2,
          }}>
            <span style={{
              fontSize: 22, fontWeight: 700, color: 'var(--ink)',
              background: 'var(--white)', padding: '12px 28px',
              borderRadius: 12, border: '1.5px solid var(--border)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
            }}>{t('ranking.noSeason')}</span>
          </div>
        )}
        </div>

      </div>
    </Shell>
  )
}
