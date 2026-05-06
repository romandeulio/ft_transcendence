import styles from './StatCard.module.css'

export default function StatCard({ color = 'var(--orange-pale)', label, value, sub }) {
  return (
    <div className={styles.card} style={{ background: color }}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {sub && <div className={styles.sub}>{sub}</div>}
    </div>
  )
}
