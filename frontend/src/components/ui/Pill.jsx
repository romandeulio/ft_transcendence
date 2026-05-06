import styles from './Pill.module.css'

export default function Pill({ label, type = 'default' }) {
  return <span className={`${styles.pill} ${styles[type]}`}>{label}</span>
}
