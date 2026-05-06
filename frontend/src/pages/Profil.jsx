import { useState } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import StatCard from '../components/ui/StatCard'
import Card from '../components/ui/Card'
import Avatar from '../components/ui/Avatar'
import Pill from '../components/ui/Pill'
import AvatarCreator, { HumanSVG } from '../components/ui/AvatarCreator'
import styles from './Profil.module.css'

const teammates = [
  { login: 'thais',  name: 'Thaïs'  },
  { login: 'sydney', name: 'Sydney' },
  { login: 'roman',  name: 'Roman'  },
]

const opponents = [
  { login: 'coraline', name: 'Coraline', winrate: 38 },
  { login: 'amorin',   name: 'amorin',   winrate: 45 },
  { login: 'jblanc',   name: 'jblanc',   winrate: 52 },
]

const feared = [
  { login: 'sydney', name: 'Sydney',  lossrate: 72 },
  { login: 'thais',  name: 'Thaïs',   lossrate: 64 },
  { login: 'roman',  name: 'Roman',   lossrate: 58 },
]

const recentMatches = [
  { result: 'Victoire', vs: 'amorin',   score: '10-7', elo: '+18', date: '20 avr' },
  { result: 'Défaite',  vs: 'sydney',   score: '5-10', elo: '-14', date: '19 avr' },
  { result: 'Victoire', vs: 'coraline', score: '10-4', elo: '+16', date: '18 avr' },
  { result: 'Victoire', vs: 'jblanc',   score: '10-8', elo: '+12', date: '17 avr' },
]

const seasons = [
  { season: 1, rank: '5ème',     prize: null },
  { season: 2, rank: 'En cours', prize: 'ongoing' },
]

const MATCHES_PER_PAGE = 3

export default function Profil() {
  const [teammates_, setTeammates] = useState(teammates)
  const [newPartner,  setNewPartner]  = useState('')
  const [matchSearch, setMatchSearch] = useState('')
  const [matchPage,   setMatchPage]   = useState(0)
  const [avatarOpen,  setAvatarOpen]  = useState(false)
  const [avatarConfig, setAvatarConfig] = useState({
    faceShape: 'Rond',  hairStyle: 'Court',  hairColor: 'Brun',
    eyeStyle:  'Rond',  eyeColor:  'Marron', skinTone:  'Pêche',
    accessory: 'Aucun', outfit:    'Bleu',
  })

  const filteredMatches = recentMatches.filter(m =>
    m.vs.toLowerCase().includes(matchSearch.toLowerCase())
  )
  const totalMatchPages = Math.ceil(filteredMatches.length / MATCHES_PER_PAGE)
  const matchSlice = filteredMatches.slice(matchPage * MATCHES_PER_PAGE, matchPage * MATCHES_PER_PAGE + MATCHES_PER_PAGE)

  const addTeammate = () => {
    if (newPartner.trim() && teammates_.length < 5) {
      setTeammates(prev => [...prev, { login: newPartner, name: newPartner }])
      setNewPartner('')
    }
  }

  return (
    <Shell>
      <Topbar title="Mon Profil" titleSize={30} />

      <AvatarCreator
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        config={avatarConfig}
        onChange={setAvatarConfig}
      />

      <div className={styles.content}>
        <div className={styles.heroCard}>
          <div className={styles.heroLeft}>
            <div className={styles.avatarWrap}>
              <div className={styles.avatarClickable} onClick={() => setAvatarOpen(true)}>
                <HumanSVG config={avatarConfig} size={66} />
                <div className={styles.avatarEditBadge}>✏️</div>
              </div>
            </div>
            <div className={styles.heroInfo}>
              <div className={styles.heroName}>ltcherp</div>
              <div className={styles.heroBadges}>
                <Pill label="#5 Classement" type="orange" />
                <Pill label="28 Victoires" type="win" />
              </div>
              <button className={styles.editAvatarBtn} onClick={() => setAvatarOpen(true)}>
                Modifier l'avatar
              </button>
            </div>
          </div>
          <div className={styles.heroElo}>
            <div className={styles.eloVal}>1412</div>
            <div className={styles.eloDelta}>+42 ce mois</div>
          </div>
        </div>

        <div className={styles.statsGrid}>
          <StatCard color="var(--orange-pale)" label="Ratio"            value="60.9%"  sub="28 V · 18 D" />
          <StatCard color="var(--yellow-pale)" label="Série en cours"   value="3"      sub="victoires d'affilée" />
          <StatCard color="var(--green-pale)"  label="Jetons gagnés"    value="+185"   sub="bilan saison 2" />
          <StatCard color="var(--red-pale)"    label="Gamelles"         value="14"     sub="effectuées cette saison" />
          <StatCard color="var(--beige)"       label="Parties / mois"   value="18"     sub="moyenne ce mois" />
        </div>

        <div className={styles.grid}>
          <div className={styles.leftCol}>
            <Card
              title="Coéquipiers favoris"
              right={<span className={styles.counter}>{teammates_.length} / 5 max</span>}
            >
              <div className={styles.teammateNote}>
                (ajoutés automatiquement selon le nombre de parties jouées ensemble)
              </div>
              {teammates_.map(t => (
                <div key={t.login} className={styles.teammateRow}>
                  <Avatar initials={t.name} size={30} bg="var(--beige)" />
                  <span className={styles.teammateName}>{t.name}</span>
                  <button className={styles.planBtn}>Planifier une partie</button>
                </div>
              ))}
              {teammates_.length < 5 && (
                <div className={styles.addTeammate}>
                  <input
                    className={styles.addInput}
                    placeholder="Login joueur..."
                    value={newPartner}
                    onChange={e => setNewPartner(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTeammate()}
                  />
                  <button className={styles.addBtn} onClick={addTeammate}>+ Ajouter</button>
                </div>
              )}
            </Card>

            <div className={styles.divider} />

            <Card title="Adversaires fréquents">
              {opponents.map(o => (
                <div key={o.login} className={styles.opponentRow}>
                  <Avatar initials={o.name} size={28} bg="var(--beige)" />
                  <span className={styles.opponentName}>{o.name}</span>
                  <span className={styles.winrate}>{o.winrate}% victoires</span>
                </div>
              ))}
            </Card>

            <div className={styles.divider} />

            <Card title="Adversaires redoutables">
              <div className={styles.fearedNote}>Joueurs contre qui tu perds le plus souvent</div>
              {feared.map(o => (
                <div key={o.login} className={styles.opponentRow}>
                  <Avatar initials={o.name} size={28} bg="var(--red-pale)" />
                  <span className={styles.opponentName}>{o.name}</span>
                  <span className={styles.lossrate}>{o.lossrate}% défaites</span>
                </div>
              ))}
            </Card>
          </div>

          <div className={styles.rightCol}>
            <Card title="Mes matchs">
              <div className={styles.matchSearch}>
                <input
                  className={styles.searchInput}
                  placeholder="Rechercher un login..."
                  value={matchSearch}
                  onChange={e => { setMatchSearch(e.target.value); setMatchPage(0) }}
                />
              </div>
              {matchSlice.map((m, i) => (
                <div key={i} className={styles.matchRow}>
                  <Pill label={m.result} type={m.result === 'Victoire' ? 'win' : 'loss'} />
                  <div className={styles.matchInfo}>
                    <span className={styles.matchVs}>vs {m.vs}</span>
                    <span className={styles.matchScore}>{m.score}</span>
                  </div>
                  <div className={styles.matchRight}>
                    <span className={m.elo.startsWith('+') ? styles.eloPos : styles.eloNeg}>{m.elo}</span>
                    <span className={styles.matchDate}>{m.date}</span>
                  </div>
                </div>
              ))}
              {filteredMatches.length === 0 && (
                <div className={styles.noMatch}>Aucun match trouvé</div>
              )}
              {totalMatchPages > 1 && (
                <div className={styles.matchNav}>
                  <button className={styles.navBtn} onClick={() => setMatchPage(p => Math.max(0, p - 1))} disabled={matchPage === 0}>←</button>
                  <span className={styles.navInfo}>{matchPage + 1} / {totalMatchPages}</span>
                  <button className={styles.navBtn} onClick={() => setMatchPage(p => Math.min(totalMatchPages - 1, p + 1))} disabled={matchPage === totalMatchPages - 1}>→</button>
                </div>
              )}
            </Card>

            <Card title="Historique des saisons">
              {seasons.map(s => (
                <div key={s.season} className={styles.seasonRow}>
                  <span className={styles.seasonName}>Saison {s.season}</span>
                  <span className={styles.seasonRank}>{s.rank}</span>
                  {s.prize === 'ongoing'
                    ? <Pill label="En cours" type="orange" />
                    : s.prize === 'gold'
                    ? <Pill label="Champion 🏆" type="gold" />
                    : <span className={styles.noPrize}>—</span>
                  }
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  )
}
