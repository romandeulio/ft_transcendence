import Avatar from './Avatar'
import styles from './QueueItem.module.css'

export default function QueueItem({ pos, p1, p2, wait, isMe, isNow }) {
  let cls = styles.item
  if (isNow) cls += ' ' + styles.now
  else if (isMe) cls += ' ' + styles.me

  return (
    <div className={cls}>
      <div className={styles.pos}>{pos}</div>
      <div className={styles.players}>
        <Avatar initials={p1} size={28} bg={isNow ? '#C8EEC0' : isMe ? 'var(--orange-pale)' : 'var(--beige)'} />
        <span className={styles.name}>{p1}</span>
        <span className={styles.vs}>vs</span>
        <Avatar initials={p2} size={28} bg={isNow ? '#C8EEC0' : isMe ? 'var(--orange-pale)' : 'var(--beige)'} />
        <span className={styles.name}>{p2}</span>
      </div>
      <div className={styles.wait}>
        {isNow ? <span className={styles.live}>En jeu</span> : wait}
      </div>
    </div>
  )
}
