import styles from './ProgressBar.module.css'

export default function ProgressBar({ pct = 50 }) {
  return (
    <div className={styles.track}>
      <div className={styles.fill} style={{ width: `${pct}%` }} />
    </div>
  )
}
