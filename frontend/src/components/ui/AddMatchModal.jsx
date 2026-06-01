import { useState, useEffect } from 'react'
import Modal from './Modal'
import LoginInput from './LoginInput'
import styles from './AddMatchModal.module.css'

export default function AddMatchModal({ open, onClose, onConfirm, user, prevTeam }) {
  const [step,        setStep]        = useState(1)
  const [joinMode,    setJoinMode]    = useState('compet')
  const [joinFormat,  setJoinFormat]  = useState('1v1')
  const [redPlayers,  setRedPlayers]  = useState(['', ''])
  const [bluePlayers, setBluePlayers] = useState([user?.login ?? '', ''])
  const [takeWin,     setTakeWin]     = useState(null)

  useEffect(() => {
    if (open) setBluePlayers([user?.login ?? '', ''])
  }, [open, user?.login])

  const reset = () => {
    setStep(1); setJoinMode('compet'); setJoinFormat('1v1')
    setRedPlayers(['', '']); setBluePlayers([user?.login ?? '', '']); setTakeWin(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleConfirm = () => {
    onConfirm?.({ mode: joinMode, format: joinFormat, redPlayers, bluePlayers, takeWin })
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Ajouter un match">
      {step === 1 && (
        <div>
          <div className={styles.stepLabel}>Étape 1 / 4 — Mode de jeu</div>
          <div className={styles.modeBtns}>
            <button className={`${styles.modeBtn} ${joinMode === 'compet' ? styles.modeBtnCompet : ''}`} onClick={() => setJoinMode('compet')}>🏆 Compétition</button>
            <button className={`${styles.modeBtn} ${joinMode === 'chill'  ? styles.modeBtnChill  : ''}`} onClick={() => setJoinMode('chill')}>😎 Chill</button>
          </div>
          <div className={styles.modeNote}>
            {joinMode === 'compet' ? 'ELO pris en compte · Résultats officiels' : "Partie détendue · Pas d'impact ELO"}
          </div>
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
            {joinFormat === 'Seul' ? "Étape 3 / 3 — File d'attente" : 'Étape 3 / 4 — Joueurs'}
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
              <button className={styles.confirmBtn} onClick={handleConfirm}>Rejoindre la file ✓</button>
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
            {prevTeam ? (
              <div className={styles.prevSlotDuel}>
                <span className={styles.prevSlotName}>{prevTeam.p1}</span>
                <span className={styles.prevSlotVs}>vs</span>
                <span className={styles.prevSlotName}>{prevTeam.p2}</span>
                {prevTeam.format && <span className={styles.prevSlotMeta}>{prevTeam.format}</span>}
              </div>
            ) : (
              <div className={styles.noMatch}>Aucun créneau précédent disponible</div>
            )}
          </div>
          <div className={styles.stepActions}>
            <button className={styles.backBtn} onClick={() => setStep(3)}>← Retour</button>
            <button
              className={styles.confirmBtn}
              onClick={handleConfirm}
              disabled={takeWin === null}
              style={takeWin === null ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >
              Confirmer ✓
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
