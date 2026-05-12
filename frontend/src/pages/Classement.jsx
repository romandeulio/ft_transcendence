import { useState } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Avatar from '../components/ui/Avatar'
import Pill from '../components/ui/Pill'
import { players } from '../mock/mockPlayers'
import styles from './Classement.module.css'

const RANK_MEDALS = ['🥇', '🥈', '🥉']
const PAGE_SIZE   = 5

const TEAMS_2V2 = [
  { id:1, team: ['Sydney', 'Thaïs'],    elo: 2120, wins: 34, losses: 5,  rank: 1 },
  { id:2, team: ['Roman', 'amorin'],    elo: 1980, wins: 28, losses: 9,  rank: 2 },
  { id:3, team: ['Léa', 'jblanc'],      elo: 1840, wins: 24, losses: 12, rank: 3, isMe: true },
  { id:4, team: ['coraline', 'kperez'], elo: 1720, wins: 19, losses: 16, rank: 4 },
  { id:5, team: ['thais', 'amorin'],    elo: 1610, wins: 14, losses: 18, rank: 5 },
]

const PAST_SEASONS = [
  { season: 2, name: 'Thaïs',  initials: 'TH', elo: 1834 },
  { season: 1, name: 'Sydney', initials: 'SY', elo: 1920 },
]

const SEASON_OPTIONS = [
  { value: 'current', label: 'Saison actuelle (S2)' },
  { value: 'season1', label: 'Saison 1' },
  { value: 'annual',  label: 'Classement annuel' },
]

const HALL_RECORDS = [
  { icon: '🏆', label: 'Plus grand nombre de victoires', value: 'Sydney', stat: '42 victoires' },
  { icon: '💥', label: 'Plus grand nombre de gamelles',  value: 'amorin', stat: '31 gamelles' },
  { icon: '🔥', label: 'Plus de victoires d\'affilée',   value: 'Thaïs',  stat: '9 de suite' },
]


export default function Classement() {
  const [season,    setSeason]    = useState('current')
  const [page,      setPage]      = useState(0)
  const [page2v2,   setPage2v2]   = useState(0)
  const [hallOrder, setHallOrder] = useState('recent')

  const totalPages   = Math.ceil(players.length / PAGE_SIZE)
  const pageSlice    = players.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const total2v2     = Math.ceil(TEAMS_2V2.length / PAGE_SIZE)
  const pageSlice2v2 = TEAMS_2V2.slice(page2v2 * PAGE_SIZE, page2v2 * PAGE_SIZE + PAGE_SIZE)

  const sortedSeasons = [...PAST_SEASONS].sort((a, b) =>
    hallOrder === 'recent' ? b.season - a.season : a.season - b.season
  )

  return (
    <Shell>
      <Topbar
        title="Classement"
        titleSize={30}
        right={<Pill label="Saison 2" type="season" />}
      />

      <div className={styles.content}>

        {/* Sélecteur saison */}
        <div className={styles.seasonRow}>
          <label className={styles.seasonLabel}>Afficher :</label>
          <select
            className={styles.seasonSelect}
            value={season}
            onChange={e => { setSeason(e.target.value); setPage(0); setPage2v2(0) }}
          >
            {SEASON_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Classements 1v1 + 2v2 */}
        <div className={styles.rankingRow}>

          {/* 1v1 */}
          <div className={styles.eloCard}>
            <div className={styles.eloHeader}>
              <span className={styles.eloTitle}>PALMARÈS 1v1</span>
              <span className={styles.eloSeason}>{SEASON_OPTIONS.find(o => o.value === season)?.label}</span>
            </div>
            <div className={styles.eloBody}>
              <div className={styles.colHead}>
                <span className={styles.headName}>Joueur</span>
                <span className={styles.headVd}>V · D</span>
                <span className={styles.headElo}>ELO</span>
                <span className={styles.headRank}>Rang</span>
              </div>
              {pageSlice.map(p => (
                <div key={p.id} className={`${styles.playerRow} ${p.isMe ? styles.playerRowMe : ''}`}>
                  <Avatar initials={p.name} size={28} bg={p.isMe ? 'var(--orange-pale)' : 'var(--beige)'} round />
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
            <div className={styles.pagination}>
              <button className={styles.pageBtn} onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}>←</button>
              <span className={styles.pageInfo}>{page * PAGE_SIZE + 1}–{Math.min((page+1)*PAGE_SIZE, players.length)} / {players.length}</span>
              <button className={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page === totalPages-1}>→</button>
            </div>
          </div>

          {/* 2v2 */}
          <div className={styles.eloCard}>
            <div className={styles.eloHeader}>
              <span className={styles.eloTitle}>PALMARÈS 2v2</span>
              <span className={styles.eloSeason}>{SEASON_OPTIONS.find(o => o.value === season)?.label}</span>
            </div>
            <div className={styles.eloBody}>
              <div className={styles.colHead}>
                <span className={styles.headTeam}>Équipe</span>
                <span className={styles.headVd}>V · D</span>
                <span className={styles.headElo}>ELO</span>
                <span className={styles.headRank}>Rang</span>
              </div>
              {pageSlice2v2.map(t => (
                <div key={t.id} className={`${styles.playerRow} ${t.isMe ? styles.playerRowMe : ''}`}>
                  <div className={styles.teamAvatars}>
                    <Avatar initials={t.team[0]} size={20} bg={t.isMe ? 'var(--orange-pale)' : 'var(--beige)'} round />
                    <Avatar initials={t.team[1]} size={20} bg={t.isMe ? 'var(--orange-pale)' : 'var(--beige)'} round />
                  </div>
                  <span className={styles.playerName}>{t.team[0]} & {t.team[1]}</span>
                  <span className={styles.playerVd}>{t.wins} · {t.losses}</span>
                  <span className={styles.playerEloVal}>{t.elo}</span>
                  <span className={styles.rankColCell}>
                    {t.rank <= 3
                      ? <span className={styles.medal}>{RANK_MEDALS[t.rank - 1]}</span>
                      : <span className={styles.rankNum}>#{t.rank}</span>
                    }
                  </span>
                </div>
              ))}
            </div>
            <div className={styles.pagination}>
              <button className={styles.pageBtn} onClick={() => setPage2v2(p => Math.max(0, p-1))} disabled={page2v2 === 0}>←</button>
              <span className={styles.pageInfo}>{page2v2 * PAGE_SIZE + 1}–{Math.min((page2v2+1)*PAGE_SIZE, TEAMS_2V2.length)} / {TEAMS_2V2.length}</span>
              <button className={styles.pageBtn} onClick={() => setPage2v2(p => Math.min(total2v2-1, p+1))} disabled={page2v2 === total2v2-1}>→</button>
            </div>
          </div>

        </div>

        {/* ── Hall of Fame ── */}
        <div className={styles.hallCard}>
          <div className={styles.hallHeader}>Hall of Fame</div>
          <div className={styles.hallSplit}>

            {/* Gauche : records 50% */}
            <div className={styles.hallLeft}>
              <div className={styles.hallSectionTitle}>Records all-time</div>
              {HALL_RECORDS.map((r, i) => (
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

            {/* Droite : champions 50% */}
            <div className={styles.hallRight}>
              <div className={styles.hallRightTop}>
                <div className={styles.hallSectionTitle}>Champions des saisons</div>
                <select
                  className={styles.hallOrderSelect}
                  value={hallOrder}
                  onChange={e => setHallOrder(e.target.value)}
                >
                  <option value="recent">Plus récent en premier</option>
                  <option value="oldest">Plus ancien en premier</option>
                </select>
              </div>
              <div className={styles.hallEntries}>
                {sortedSeasons.map(s => (
                  <div key={s.season} className={styles.hallEntry}>
                    <div className={styles.hallSeasonLabel}>Saison {s.season}</div>
                    <Avatar initials={s.initials} size={44} bg="var(--yellow-pale)" round />
                    <div className={styles.hallName}>{s.name}</div>
                    <div className={styles.hallElo}>{s.elo} ELO</div>
                    <Pill label="🏆 Champion" type="gold" />
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>


      </div>
    </Shell>
  )
}
