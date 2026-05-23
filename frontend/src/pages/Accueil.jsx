import { useState } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Avatar from '../components/ui/Avatar'
import Pill from '../components/ui/Pill'
import Modal from '../components/ui/Modal'
import JouerMode from '../components/ui/JouerMode'
import LoginInput from '../components/ui/LoginInput'
import PerformanceChart from '../components/ui/PerformanceChart'
import styles from './Accueil.module.css'

const PREV_SLOT_MATCH = { p1: 'sydney', p2: 'amorin', format: '1v1', mode: 'Compét' }

const MY_UPCOMING = [
  { id: 1, vs: 'coraline', format: '1v1', mode: 'Compétition', label: 'File d\'attente — place 2' },
]

const ALL_MATCHES = [
  { result: 'Victoire', vs: 'amorin',   score: '10-7', elo: '+18', date: '20 avr' },
  { result: 'Défaite',  vs: 'sydney',   score: '5-10', elo: '-14', date: '19 avr' },
  { result: 'Victoire', vs: 'coraline', score: '10-4', elo: '+16', date: '18 avr' },
  { result: 'Victoire', vs: 'jblanc',   score: '10-8', elo: '+12', date: '17 avr' },
  { result: 'Défaite',  vs: 'thais',    score: '4-10', elo: '-10', date: '16 avr' },
]

const INIT_TEAMMATES = [
  { login: 'thais',  name: 'Thaïs'  },
  { login: 'sydney', name: 'Sydney' },
  { login: 'roman',  name: 'Roman'  },
]

const MATCHES_PER_PAGE = 3

export default function Accueil() {
  const [jouerOpen,      setJouerOpen]      = useState(false)
  const [selectedMatch,  setSelectedMatch]  = useState(null)
  const [matchPickOpen,  setMatchPickOpen]  = useState(false)
  const [joinOpen,       setJoinOpen]       = useState(false)

  // Historique matchs
  const [matchSearch,    setMatchSearch]    = useState('')
  const [matchPage,      setMatchPage]      = useState(0)

  // Amis favoris
  const [teammates,      setTeammates]      = useState(INIT_TEAMMATES)
  const [newTeammate,    setNewTeammate]    = useState('')

  // Multi-step join queue
  const [step,        setStep]        = useState(1)
  const [joinMode,    setJoinMode]    = useState('compet')
  const [joinFormat,  setJoinFormat]  = useState('1v1')
  const [redPlayers,  setRedPlayers]  = useState(['', ''])
  const [bluePlayers, setBluePlayers] = useState(['ltcherp', ''])
  const [takeWin,     setTakeWin]     = useState(null)

  const resetJoin = () => {
    setStep(1); setJoinMode('compet'); setJoinFormat('1v1')
    setRedPlayers(['', '']); setBluePlayers(['ltcherp', '']); setTakeWin(null)
  }

  const addTeammate = () => {
    if (newTeammate.trim() && teammates.length < 5) {
      setTeammates(prev => [...prev, { login: newTeammate, name: newTeammate }])
      setNewTeammate('')
    }
  }

  const filtered = ALL_MATCHES.filter(m =>
    m.vs.toLowerCase().includes(matchSearch.toLowerCase())
  )
  const totalPages = Math.ceil(filtered.length / MATCHES_PER_PAGE)
  const pageSlice  = filtered.slice(matchPage * MATCHES_PER_PAGE, matchPage * MATCHES_PER_PAGE + MATCHES_PER_PAGE)

  return (
    <Shell>
      <Topbar title="Accueil" titleSize={30} />

      {jouerOpen && <JouerMode onClose={() => setJouerOpen(false)} />}

      <div className={styles.content}>

        {/* ── Section Jouer ── */}
        <div className={styles.jouerSection}>

          {/* Terrain SVG background */}
          <svg className={styles.pitchBg} viewBox="0 0 800 320" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {/* Grass stripes */}
            {[0,1,2,3,4,5,6,7,8,9].map(i => (
              <rect key={i} x={i*80} y={0} width={80} height={320} fill={i%2===0 ? '#3a8832' : '#449e3b'} />
            ))}
            {/* Outer border */}
            <rect x="28" y="22" width="744" height="276" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2.5"/>
            {/* Halfway line */}
            <line x1="400" y1="22" x2="400" y2="298" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            {/* Center circle */}
            <circle cx="400" cy="160" r="62" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            {/* Center spot */}
            <circle cx="400" cy="160" r="5" fill="rgba(255,255,255,0.7)"/>
            {/* Ball */}
            <circle cx="400" cy="160" r="13" fill="white" opacity="0.6"/>
            {/* Left penalty area */}
            <rect x="28" y="88" width="115" height="144" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            {/* Left goal area */}
            <rect x="28" y="120" width="48" height="80" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            {/* Left penalty spot */}
            <circle cx="98" cy="160" r="4" fill="rgba(255,255,255,0.65)"/>
            {/* Left penalty arc */}
            <path d="M 143 100 A 68 68 0 0 1 143 220" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" clipPath="url(#lpClip)"/>
            <defs>
              <clipPath id="lpClip"><rect x="143" y="0" width="800" height="320"/></clipPath>
              <clipPath id="rpClip"><rect x="0" y="0" width="657" height="320"/></clipPath>
            </defs>
            {/* Left goal */}
            <rect x="8" y="132" width="20" height="56" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            {/* Right penalty area */}
            <rect x="657" y="88" width="115" height="144" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            {/* Right goal area */}
            <rect x="724" y="120" width="48" height="80" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            {/* Right penalty spot */}
            <circle cx="702" cy="160" r="4" fill="rgba(255,255,255,0.65)"/>
            {/* Right penalty arc */}
            <path d="M 657 100 A 68 68 0 0 0 657 220" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" clipPath="url(#rpClip)"/>
            {/* Right goal */}
            <rect x="772" y="132" width="20" height="56" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            {/* Corner arcs */}
            <path d="M 28 22 A 16 16 0 0 1 44 38" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <path d="M 772 22 A 16 16 0 0 0 756 38" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <path d="M 28 298 A 16 16 0 0 0 44 282" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
            <path d="M 772 298 A 16 16 0 0 1 756 282" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2"/>
          </svg>

          {/* Contenu au-dessus du terrain */}
          <div className={styles.pitchContent}>
            <div className={styles.matchChoiceBtns}>
              <button
                className={`${styles.choiceBtn} ${selectedMatch ? styles.choiceBtnSelected : ''}`}
                onClick={() => setMatchPickOpen(true)}
              >
                📋 Match prévu
                {selectedMatch && <span className={styles.selectedBadge}>vs {selectedMatch.vs}</span>}
              </button>
              <div className={styles.orSep}>
                <div className={styles.orLine} />
                <span className={styles.orText}>OU</span>
                <div className={styles.orLine} />
              </div>
              <button className={styles.addMatchBtn} onClick={() => { resetJoin(); setJoinOpen(true) }}>
                <span className={styles.addEmoji}>⚽</span>
                <span className={styles.addTextGroup}>
                  <span className={styles.addLine}>Ajouter un</span>
                  <span className={styles.addLine}>match</span>
                </span>
              </button>
            </div>

            <button
              className={`${styles.jouerBtn} ${!selectedMatch ? styles.jouerBtnDisabled : ''}`}
              onClick={() => selectedMatch && setJouerOpen(true)}
              disabled={!selectedMatch}
            >
              <span className={styles.jouerIcon}>▶</span>
              Jouer
            </button>
            {!selectedMatch && (
              <div className={styles.jouerHint}>Sélectionne un match pour activer</div>
            )}
          </div>
        </div>

        {/* ── Grid : Mes matchs + Amis ── */}
        <div className={styles.grid}>

          {/* Mes matchs */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>Mes matchs</div>
            <div className={styles.cardBody}>
              <div className={styles.matchSearch}>
                <LoginInput
                  value={matchSearch}
                  onChange={(val) => { setMatchSearch(val); setMatchPage(0) }}
                  placeholder="Rechercher un login..."
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
              {filtered.length === 0 && <div className={styles.noMatch}>Aucun match trouvé</div>}
              {totalPages > 1 && (
                <div className={styles.matchNav}>
                  <button className={styles.navBtn} onClick={() => setMatchPage(p => Math.max(0, p-1))} disabled={matchPage === 0}>←</button>
                  <span className={styles.navInfo}>{matchPage + 1} / {totalPages}</span>
                  <button className={styles.navBtn} onClick={() => setMatchPage(p => Math.min(totalPages-1, p+1))} disabled={matchPage === totalPages-1}>→</button>
                </div>
              )}
            </div>
          </div>

          {/* Amis favoris */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span>Amis favoris</span>
              <span className={styles.counter}>{teammates.length} / 5</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.teamNote}>Ajoutés selon le nombre de parties ensemble</div>
              {teammates.map(t => (
                <div key={t.login} className={styles.teammateRow}>
                  <Avatar initials={t.name} size={32} bg="var(--beige)" round />
                  <span className={styles.teammateName}>{t.name}</span>
                  <button
                    className={styles.queueBtn}
                    onClick={() => { setRedPlayers([t.login, '']); resetJoin(); setJoinOpen(true) }}
                  >
                    Ajouter file d'attente
                  </button>
                </div>
              ))}
              {teammates.length < 5 && (
                <div className={styles.addTeammate}>
                  <LoginInput
                    value={newTeammate}
                    onChange={setNewTeammate}
                    placeholder="Login joueur..."
                    className={styles.addInput}
                  />
                  <button className={styles.addBtn} onClick={addTeammate}>+ Ajouter</button>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Graphique de performances */}
        <PerformanceChart />

      </div>

      {/* ── Popup : choisir un match prévu ── */}
      <Modal open={matchPickOpen} onClose={() => setMatchPickOpen(false)} title="Mes matchs prévus">
        <div className={styles.matchPickList}>
          {MY_UPCOMING.map(m => (
            <button
              key={m.id}
              className={`${styles.matchPickItem} ${selectedMatch?.id === m.id ? styles.matchPickSelected : ''}`}
              onClick={() => { setSelectedMatch(m); setMatchPickOpen(false) }}
            >
              <div className={styles.matchPickVs}>vs <strong>{m.vs}</strong></div>
              <div className={styles.matchPickSub}>{m.format} · {m.mode} · {m.label}</div>
            </button>
          ))}
          {MY_UPCOMING.length === 0 && (
            <div className={styles.noMatch}>Aucun match prévu. Ajoute-toi à la file d'attente.</div>
          )}
        </div>
        {selectedMatch && (
          <div className={styles.clearMatch}>
            <button className={styles.clearBtn} onClick={() => { setSelectedMatch(null); setMatchPickOpen(false) }}>
              ✕ Désélectionner
            </button>
          </div>
        )}
      </Modal>

      {/* ── Modal ajouter match (multi-step) ── */}
      <Modal open={joinOpen} onClose={() => { setJoinOpen(false); resetJoin() }} title="Ajouter un match">
        {step === 1 && (
          <div>
            <div className={styles.stepLabel}>Étape 1 / 4 — Mode de jeu</div>
            <div className={styles.modeBtns}>
              <button className={`${styles.modeBtn} ${joinMode === 'compet' ? styles.modeBtnCompet : ''}`} onClick={() => setJoinMode('compet')}>🏆 Compétition</button>
              <button className={`${styles.modeBtn} ${joinMode === 'chill'  ? styles.modeBtnChill  : ''}`} onClick={() => setJoinMode('chill')}>😎 Chill</button>
            </div>
            <div className={styles.modeNote}>{joinMode === 'compet' ? 'ELO pris en compte · Résultats officiels' : "Partie détendue · Pas d'impact ELO"}</div>
            <div className={styles.stepActions}>
              <button className={styles.nextBtn} onClick={() => setStep(2)}>Suivant →</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <div className={styles.stepLabel}>Étape 2 / 4 — Format</div>
            <div className={styles.formatBtns}>
              {['1v1', '2v2', 'Seul'].map(f => (
                <button key={f} className={`${styles.modeBtn} ${joinFormat === f ? styles.modeBtnCompet : ''}`} onClick={() => setJoinFormat(f)}>
                  {f === '1v1' ? '⚔️ 1v1' : f === '2v2' ? '👥 2v2' : '👤 Seul'}
                </button>
              ))}
            </div>
            <div className={styles.stepActions}>
              <button className={styles.backBtn} onClick={() => setStep(1)}>← Retour</button>
              <button className={styles.nextBtn} onClick={() => setStep(3)}>Suivant →</button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <div className={styles.stepLabel}>
              {joinFormat === 'Seul' ? 'Étape 3 / 3 — File d\'attente' : 'Étape 3 / 4 — Joueurs'}
            </div>
            {joinFormat === 'Seul' ? (
              <div className={styles.seulMsg}>
                Vous allez être redirigé en file d'attente afin de pouvoir rejoindre un match.
              </div>
            ) : (
              <div className={styles.teamsGrid}>
                <div className={styles.teamRed}>
                  <div className={styles.teamLabel}>🔴 Équipe Rouge</div>
                  {Array.from({ length: joinFormat === '2v2' ? 2 : 1 }).map((_, i) => (
                    <LoginInput
                      key={i}
                      value={redPlayers[i] || ''}
                      onChange={v => setRedPlayers(prev => { const n = [...prev]; n[i] = v; return n })}
                      placeholder={joinFormat === '2v2' ? `Joueur rouge ${i + 1}...` : 'Login joueur rouge...'}
                    />
                  ))}
                </div>
                <div className={styles.teamBlue}>
                  <div className={styles.teamLabel}>🔵 Équipe Bleue</div>
                  {Array.from({ length: joinFormat === '2v2' ? 2 : 1 }).map((_, i) => (
                    <LoginInput
                      key={i}
                      value={bluePlayers[i] || ''}
                      onChange={v => setBluePlayers(prev => { const n = [...prev]; n[i] = v; return n })}
                      placeholder={joinFormat === '2v2' ? `Joueur bleu ${i + 1}...` : 'Login joueur bleu...'}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className={styles.stepActions}>
              <button className={styles.backBtn} onClick={() => setStep(2)}>← Retour</button>
              {joinFormat === 'Seul' ? (
                <button className={styles.confirmBtn} onClick={() => { setJoinOpen(false); resetJoin() }}>
                  Rejoindre la file ✓
                </button>
              ) : (
                <button className={styles.nextBtn} onClick={() => setStep(4)}>Suivant →</button>
              )}
            </div>
          </div>
        )}
        {step === 4 && (
          <div>
            <div className={styles.stepLabel}>Étape 4 / 4 — Reprendre la gagne ?</div>
            <div className={styles.step4Question}>
              Voulez-vous reprendre la gagne de l'équipe qui joue actuellement avant vous ?
            </div>
            <div className={styles.ouiNonRow}>
              <button
                className={`${styles.nonBtn} ${takeWin === false ? styles.nonBtnActive : ''}`}
                onClick={() => setTakeWin(false)}
              >
                Non
              </button>
              <button
                className={`${styles.ouiBtn} ${takeWin === true ? styles.ouiBtnActive : ''}`}
                onClick={() => setTakeWin(true)}
              >
                Oui ✓
              </button>
            </div>
            <div className={styles.prevSlotTitle}>Créneau précédent</div>
            <div className={styles.prevSlotCard}>
              <div className={styles.prevSlotDuel}>
                <Avatar initials={PREV_SLOT_MATCH.p1} size={28} bg="var(--beige)" round />
                <span className={styles.prevSlotName}>{PREV_SLOT_MATCH.p1}</span>
                <span className={styles.prevSlotVs}>vs</span>
                <Avatar initials={PREV_SLOT_MATCH.p2} size={28} bg="var(--beige)" round />
                <span className={styles.prevSlotName}>{PREV_SLOT_MATCH.p2}</span>
              </div>
              <div className={styles.prevSlotMeta}>{PREV_SLOT_MATCH.format} · {PREV_SLOT_MATCH.mode}</div>
            </div>
            <div className={styles.stepActions}>
              <button className={styles.backBtn} onClick={() => setStep(3)}>← Retour</button>
              <button
                className={styles.confirmBtn}
                onClick={() => { setJoinOpen(false); resetJoin() }}
                disabled={takeWin === null}
                style={takeWin === null ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
              >
                Confirmer ✓
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Shell>
  )
}
