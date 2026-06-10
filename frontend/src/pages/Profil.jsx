import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import StatCard from '../components/ui/StatCard'
import Card from '../components/ui/Card'
import Avatar from '../components/ui/Avatar'
import Pill from '../components/ui/Pill'
import LoginInput from '../components/ui/LoginInput'
import { getPlayerBadge } from '../utils/playerBadge'
import { useAuth } from '../context/AuthContext'
import styles from './Profil.module.css'

const MATCHES_PER_PAGE = 3

export default function Profil() {
  //const { user, logout } = useAuth()
  const user = JSON.parse(localStorage.getItem("user"));
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };
  const navigate = useNavigate()

  const [teammates_,    setTeammates]    = useState([])
  const [opponents,     setOpponents]    = useState([])
  const [feared,        setFeared]       = useState([])
  const [recentMatches, setRecentMatches] = useState([])
  const [seasons,       setSeasons]      = useState([])

  const [newPartner,  setNewPartner]  = useState('')
  const [matchSearch, setMatchSearch] = useState('')
  const [matchPage,   setMatchPage]   = useState(0)
  const [photoUrl,         setPhotoUrl]         = useState(null)
  const [photoUploadOpen,  setPhotoUploadOpen]  = useState(false)

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setPhotoUrl(ev.target.result); setPhotoUploadOpen(false) }
    reader.readAsDataURL(file)
  }

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

  const myLogin = user?.username ?? '—'
  const myWins  = user?.wins  ?? 0
  const myElo   = user?.elo   ?? '—'
  const badge   = getPlayerBadge(myWins)

  return (
    <Shell>
      <Topbar title="Mon Profil" titleSize={30} />

      {photoUploadOpen && (
        <div className={styles.photoOverlay} onClick={() => setPhotoUploadOpen(false)}>
          <div className={styles.photoDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.photoTitle}>Photo de profil</div>
            <label className={styles.photoDropZone}>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
              <span className={styles.photoDropIcon}>📷</span>
              <span>Cliquer pour choisir une image</span>
            </label>
            {photoUrl && (
              <div className={styles.photoPreviewRow}>
                <img src={photoUrl} className={styles.photoPreview} alt="preview" />
                <button className={styles.photoRemoveBtn} onClick={() => { setPhotoUrl(null); setPhotoUploadOpen(false) }}>
                  Supprimer la photo
                </button>
              </div>
            )}
            <div className={styles.photoDialogFooter}>
              <button className={styles.photoCloseBtn} onClick={() => setPhotoUploadOpen(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.content}>
        <div className={styles.heroCard}>
          <div className={styles.heroLeft}>
            <div className={styles.avatarWrap}>
              <div className={styles.avatarStack}>
                {photoUrl
                  ? <img src={photoUrl} className={styles.avatarPhoto} alt="avatar" onClick={() => setPhotoUploadOpen(true)} />
                  : <div onClick={() => setPhotoUploadOpen(true)} style={{ cursor: 'pointer' }}>
                      <Avatar initials={myLogin[0]?.toUpperCase() ?? '?'} size={66} bg="var(--color-primary)" color="#fff" round />
                    </div>
                }
                <button className={styles.photoUploadBtn} onClick={() => setPhotoUploadOpen(true)}>📷 Photo</button>
              </div>
            </div>
            <div className={styles.heroInfo}>
              <div className={styles.heroName}>{myLogin}</div>
              <div className={styles.heroBadges}>
                {user?.rank != null && <Pill label={`#${user.rank} Classement`} type="orange" />}
                {myWins > 0 && <Pill label={`${myWins} Victoires`} type="win" />}
              </div>
              <span className={styles.playerTitleBadge} style={{ background: badge.bg, color: badge.color }}>
                Mon badge : {badge.label}
              </span>
            </div>
          </div>
          <div className={styles.heroElo}>
            <div className={styles.eloVal}>{myElo}</div>
            <div className={styles.eloDelta}>ELO</div>
            <button
              className={styles.logoutBtn}
              onClick={() => { logout(); navigate('/login') }}
            >
              Déconnexion
            </button>
          </div>
        </div>

        <div className={styles.statsGrid}>
          <StatCard color="var(--orange-pale)" label="Ratio"            value="—" sub="V · D" />
          <StatCard color="var(--yellow-pale)" label="Série en cours"   value="—" sub="victoires d'affilée" />
          <StatCard color="var(--green-pale)"  label="Jetons gagnés"    value="—" sub="bilan saison" />
          <StatCard color="var(--red-pale)"    label="Gamelles"         value="—" sub="effectuées cette saison" />
          <StatCard color="var(--beige)"       label="Parties / mois"   value="—" sub="moyenne ce mois" />
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
              {teammates_.length === 0 && (
                <div className={styles.noMatch}>Aucun coéquipier enregistré.</div>
              )}
              {teammates_.map(t => (
                <div key={t.login} className={styles.teammateRow}>
                  <Avatar initials={t.name} size={30} bg="var(--beige)" />
                  <span className={styles.teammateName}>{t.name}</span>
                  <button className={styles.planBtn}>Planifier une partie</button>
                </div>
              ))}
              {teammates_.length < 5 && (
                <div className={styles.addTeammate}>
                  <LoginInput
                    value={newPartner}
                    onChange={setNewPartner}
                    placeholder="Login joueur..."
                  />
                  <button className={styles.addBtn} onClick={addTeammate}>+ Ajouter</button>
                </div>
              )}
            </Card>

            <div className={styles.divider} />

            <Card title="Adversaires fréquents">
              {opponents.length === 0 && (
                <div className={styles.noMatch}>Aucune donnée disponible.</div>
              )}
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
              {feared.length === 0 && (
                <div className={styles.noMatch}>Aucune donnée disponible.</div>
              )}
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
              {seasons.length === 0 && (
                <div className={styles.noMatch}>Aucune saison disponible.</div>
              )}
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
