import { useState } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Avatar from '../components/ui/Avatar'
import Pill from '../components/ui/Pill'
import Modal from '../components/ui/Modal'
import JouerMode from '../components/ui/JouerMode'
import LoginInput from '../components/ui/LoginInput'
import PerformanceChart from '../components/ui/PerformanceChart'
import AddMatchModal from '../components/ui/AddMatchModal'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import styles from './Accueil.module.css'

const MATCHES_PER_PAGE = 3

export default function Accueil() {
  const { user } = useAuth()
  const { t } = useTranslation()

  const [jouerOpen,      setJouerOpen]      = useState(false)
  const [selectedMatch,  setSelectedMatch]  = useState(null)
  const [matchPickOpen,  setMatchPickOpen]  = useState(false)
  const [joinOpen,       setJoinOpen]       = useState(false)

  const [matches,        setMatches]        = useState([])
  const [upcomingMatches,setUpcomingMatches] = useState([])
  const [matchSearch,    setMatchSearch]    = useState('')
  const [matchPage,      setMatchPage]      = useState(0)

  const [teammates,      setTeammates]      = useState([])
  const [newTeammate,    setNewTeammate]    = useState('')

  const addTeammate = () => {
    if (newTeammate.trim() && teammates.length < 5) {
      setTeammates(prev => [...prev, { login: newTeammate, name: newTeammate }])
      setNewTeammate('')
    }
  }

  const filtered = matches.filter(m =>
    m.vs.toLowerCase().includes(matchSearch.toLowerCase())
  )
  const totalPages = Math.ceil(filtered.length / MATCHES_PER_PAGE)
  const pageSlice  = filtered.slice(matchPage * MATCHES_PER_PAGE, matchPage * MATCHES_PER_PAGE + MATCHES_PER_PAGE)

  return (
    <Shell>
      <Topbar title={t('topbar.home')} titleSize={30} />

      {jouerOpen && <JouerMode onClose={() => setJouerOpen(false)} />}

      <div className={styles.content}>

        {/* ── Section Jouer ── */}
        <div className={styles.jouerSection}>

          <svg className={styles.pitchBg} viewBox="0 0 800 320" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {[0,1,2,3,4,5,6,7,8,9].map(i => (
              <rect key={i} x={i*80} y={0} width={80} height={320} fill={i%2===0 ? '#3a8832' : '#449e3b'} />
            ))}
            <rect x="28" y="22" width="744" height="276" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2.5"/>
            <line x1="400" y1="22" x2="400" y2="298" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <circle cx="400" cy="160" r="62" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <circle cx="400" cy="160" r="5" fill="rgba(255,255,255,0.7)"/>
            <circle cx="400" cy="160" r="13" fill="white" opacity="0.6"/>
            <rect x="28" y="88" width="115" height="144" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <rect x="28" y="120" width="48" height="80" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <circle cx="98" cy="160" r="4" fill="rgba(255,255,255,0.65)"/>
            <path d="M 143 100 A 68 68 0 0 1 143 220" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" clipPath="url(#lpClip)"/>
            <defs>
              <clipPath id="lpClip"><rect x="143" y="0" width="800" height="320"/></clipPath>
              <clipPath id="rpClip"><rect x="0" y="0" width="657" height="320"/></clipPath>
            </defs>
            <rect x="8" y="132" width="20" height="56" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <rect x="657" y="88" width="115" height="144" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <rect x="724" y="120" width="48" height="80" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <circle cx="702" cy="160" r="4" fill="rgba(255,255,255,0.65)"/>
            <path d="M 657 100 A 68 68 0 0 0 657 220" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" clipPath="url(#rpClip)"/>
            <rect x="772" y="132" width="20" height="56" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <path d="M 28 22 A 16 16 0 0 1 44 38" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <path d="M 772 22 A 16 16 0 0 0 756 38" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <path d="M 28 298 A 16 16 0 0 0 44 282" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <path d="M 772 298 A 16 16 0 0 1 756 282" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
          </svg>

          <div className={styles.pitchContent}>
            <div className={styles.matchChoiceBtns}>
              <button
                className={`${styles.choiceBtn} ${selectedMatch ? styles.choiceBtnSelected : ''}`}
                onClick={() => setMatchPickOpen(true)}
              >
                {t('home.scheduledMatch')}
                {selectedMatch && <span className={styles.selectedBadge}>vs {selectedMatch.vs}</span>}
              </button>
              <div className={styles.orSep}>
                <div className={styles.orLine} />
                <span className={styles.orText}>{t('home.or')}</span>
                <div className={styles.orLine} />
              </div>
              <button className={styles.addMatchBtn} onClick={() => setJoinOpen(true)}>
                <span className={styles.addEmoji}>⚽</span>
                <span className={styles.addLine}>{t('home.addMatch')}</span>
              </button>
            </div>

            <button
              className={`${styles.jouerBtn} ${!selectedMatch ? styles.jouerBtnDisabled : ''}`}
              onClick={() => selectedMatch && setJouerOpen(true)}
              disabled={!selectedMatch}
            >
              <span className={styles.jouerIcon}>▶</span>
              {t('home.play')}
            </button>
            {!selectedMatch && (
              <div className={styles.jouerHint}>{t('home.selectToPlay')}</div>
            )}
          </div>
        </div>

        {/* ── Grid : Mes matchs + Amis ── */}
        <div className={styles.grid}>

          <div className={styles.card}>
            <div className={styles.cardHeader}>{t('home.myMatches')}</div>
            <div className={styles.cardBody}>
              <div className={styles.matchSearch}>
                <LoginInput
                  value={matchSearch}
                  onChange={(val) => { setMatchSearch(val); setMatchPage(0) }}
                  placeholder={t('home.searchLogin')}
                  className={styles.searchInput}
                />
              </div>
              {pageSlice.map((m, i) => (
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
              {filtered.length === 0 && <div className={styles.noMatch}>{t('home.noMatch')}</div>}
              {totalPages > 1 && (
                <div className={styles.matchNav}>
                  <button className={styles.navBtn} onClick={() => setMatchPage(p => Math.max(0, p-1))} disabled={matchPage === 0}>←</button>
                  <span className={styles.navInfo}>{matchPage + 1} / {totalPages}</span>
                  <button className={styles.navBtn} onClick={() => setMatchPage(p => Math.min(totalPages-1, p+1))} disabled={matchPage === totalPages-1}>→</button>
                </div>
              )}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span>{t('home.favFriends')}</span>
              <span className={styles.counter}>{t('home.counter', { count: teammates.length })}</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.teamNote}>Ajoutés selon le nombre de parties ensemble</div>
              {teammates.map(t => (
                <div key={t.login} className={styles.teammateRow}>
                  <Avatar initials={t.name} size={32} bg="var(--beige)" round />
                  <span className={styles.teammateName}>{t.name}</span>
                  <button
                    className={styles.queueBtn}
                    onClick={() => setJoinOpen(true)}
                  >
                    {t('home.addQueue')}
                  </button>
                </div>
              ))}
              {teammates.length < 5 && (
                <div className={styles.addTeammate}>
                  <LoginInput
                    value={newTeammate}
                    onChange={setNewTeammate}
                    placeholder={t('home.loginPlayer')}
                    className={styles.addInput}
                  />
                  <button className={styles.addBtn} onClick={addTeammate}>{t('home.addPlayer')}</button>
                </div>
              )}
            </div>
          </div>

        </div>

        <PerformanceChart />

      </div>

      {/* ── Popup : choisir un match prévu ── */}
      <Modal open={matchPickOpen} onClose={() => setMatchPickOpen(false)} title={t('home.scheduledMatchesTitle')}>
        <div className={styles.matchPickList}>
          {upcomingMatches.map(m => (
            <button
              key={m.id}
              className={`${styles.matchPickItem} ${selectedMatch?.id === m.id ? styles.matchPickSelected : ''}`}
              onClick={() => { setSelectedMatch(m); setMatchPickOpen(false) }}
            >
              <div className={styles.matchPickVs}>vs <strong>{m.vs}</strong></div>
              <div className={styles.matchPickSub}>{m.format} · {m.mode} · {m.label}</div>
            </button>
          ))}
          {upcomingMatches.length === 0 && (
            <div className={styles.noMatch}>{t('home.noScheduled')}</div>
          )}
        </div>
        {selectedMatch && (
          <div className={styles.clearMatch}>
            <button className={styles.clearBtn} onClick={() => { setSelectedMatch(null); setMatchPickOpen(false) }}>
              {t('home.deselect')}
            </button>
          </div>
        )}
      </Modal>

      <AddMatchModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        user={user}
        prevTeam={null}
      />
    </Shell>
  )
}
