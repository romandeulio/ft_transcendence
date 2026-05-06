import styles from './BetButton.module.css'

export default function BetButton({ name, placed, mise, disabled, onClick }) {
  if (disabled) {
    return (
      <button className={`${styles.btn} ${styles.disabled}`} disabled>
        <span>{name}</span>
        <span className={styles.sub}>Paris fermés</span>
      </button>
    )
  }
  if (placed) {
    return (
      <button className={`${styles.btn} ${styles.placed}`} onClick={onClick}>
        <span>Déjà misé</span>
        <span className={styles.sub}>{mise} jetons</span>
      </button>
    )
  }
  return (
    <button className={`${styles.btn} ${styles.default}`} onClick={onClick}>
      <span>{name}</span>
      <span className={styles.sub}>Miser sur la partie</span>
    </button>
  )
}
