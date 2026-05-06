import styles from './Card.module.css'

export default function Card({ title, right, children }) {
  return (
    <div className={styles.card}>
      {(title || right) && (
        <div className={styles.header}>
          {title && <div className={styles.title}>{title}</div>}
          {right && <div>{right}</div>}
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </div>
  )
}
