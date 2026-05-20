import styles from './Toggle.module.css'

export default function Toggle({ on, onChange }) {
  return (
    <button
      className={`${styles.toggle} ${on ? styles.on : styles.off}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      type="button"
    >
      <span className={styles.knob} />
    </button>
  )
}
