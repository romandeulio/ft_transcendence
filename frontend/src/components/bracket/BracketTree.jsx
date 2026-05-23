import PlayerBlock from './PlayerBlock'
import styles from './BracketTree.module.css'

const BRACKET_DATA = {
  quarters: [
    { p1: 'sydney',  p2: 'kperez',   winner: 'sydney', done: true  },
    { p1: 'thais',   p2: 'coraline', winner: 'thais',  done: true  },
    { p1: 'roman',   p2: 'jblanc',   winner: 'roman',  done: true  },
    { p1: 'amorin',  p2: 'ltcherp',  winner: null,     done: false },
  ],
  semis: [
    { p1: null, p2: null, winner: null, done: false },
    { p1: null, p2: null, winner: null, done: false },
  ],
  final: { p1: null, p2: null, winner: null, done: false },
}

function MatchBlock({ match, isFinal = false }) {
  return (
    <div className={`${styles.match} ${isFinal ? styles.final : ''}`}>
      {isFinal && <div className={styles.crown}>🏆</div>}
      <PlayerBlock
        name={match.p1}
        winner={match.done && match.winner === match.p1}
        eliminated={match.done && match.winner !== match.p1}
        tbd={!match.p1}
      />
      <div className={styles.sep} />
      <PlayerBlock
        name={match.p2}
        winner={match.done && match.winner === match.p2}
        eliminated={match.done && match.winner !== match.p2}
        tbd={!match.p2}
      />
    </div>
  )
}

export default function BracketTree() {
  return (
    <div className={styles.tree}>

      {/* ── Quarts de finale ── */}
      <div className={styles.round}>
        <div className={styles.roundLabel}>Quarts de finale</div>
        <div className={styles.slots}>
          {BRACKET_DATA.quarters.map((m, i) => (
            <div key={i} className={styles.slot1}>
              <MatchBlock match={m} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Connecteurs Q → S ── */}
      <div className={styles.connectors}>
        <svg viewBox="0 0 40 400" preserveAspectRatio="none" width="40" height="320">
          <path d="M0 50 L20 50 L20 100 L40 100"  stroke="var(--beige)" strokeWidth="2" fill="none"/>
          <path d="M0 150 L20 150 L20 100 L40 100" stroke="var(--beige)" strokeWidth="2" fill="none"/>
          <path d="M0 250 L20 250 L20 300 L40 300" stroke="var(--beige)" strokeWidth="2" fill="none"/>
          <path d="M0 350 L20 350 L20 300 L40 300" stroke="var(--beige)" strokeWidth="2" fill="none"/>
        </svg>
      </div>

      {/* ── Demi-finales ── */}
      <div className={styles.round}>
        <div className={styles.roundLabel}>Demi-finales</div>
        <div className={styles.slots}>
          {BRACKET_DATA.semis.map((m, i) => (
            <div key={i} className={styles.slot2}>
              <MatchBlock match={m} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Connecteurs S → F ── */}
      <div className={styles.connectors}>
        <svg viewBox="0 0 40 400" preserveAspectRatio="none" width="40" height="320">
          <path d="M0 100 L20 100 L20 200 L40 200" stroke="var(--beige)" strokeWidth="2" fill="none"/>
          <path d="M0 300 L20 300 L20 200 L40 200" stroke="var(--beige)" strokeWidth="2" fill="none"/>
        </svg>
      </div>

      {/* ── Finale ── */}
      <div className={styles.round}>
        <div className={styles.roundLabel}>Finale</div>
        <div className={styles.slots}>
          <div className={styles.slot4}>
            <MatchBlock match={BRACKET_DATA.final} isFinal />
          </div>
        </div>
      </div>

    </div>
  )
}
