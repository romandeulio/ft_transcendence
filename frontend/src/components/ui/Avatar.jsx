import styles from './Avatar.module.css'

export default function Avatar({ initials = '?', size = 32, bg = 'var(--beige)', color = 'var(--ink2)', round = false, src = null }) {
  const style = { width: size, height: size, background: bg, color, borderRadius: round ? '50%' : 6, fontSize: size * 0.38 }
  if (src) return <img src={src} style={{ ...style, objectFit: 'cover' }} alt={initials} className={styles.avatar} />
  return (
    <div className={styles.avatar} style={style}>
      {initials.slice(0, 2).toUpperCase()}
    </div>
  )
}
