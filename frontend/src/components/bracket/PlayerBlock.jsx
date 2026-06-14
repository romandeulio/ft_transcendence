import { useTranslation } from 'react-i18next'
import styles from './PlayerBlock.module.css'
import Avatar from '../ui/Avatar'

export default function PlayerBlock({ name, winner, eliminated, tbd, onClick }) {
  const { t } = useTranslation()
  let cls = styles.player
  if (winner) cls += ' ' + styles.winner
  else if (eliminated) cls += ' ' + styles.eliminated
  else if (tbd) cls += ' ' + styles.tbd
  if (onClick) cls += ' ' + styles.clickable

  return (
    <div
      className={cls}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={event => {
        if (!onClick || !['Enter', ' '].includes(event.key)) return
        event.preventDefault()
        onClick()
      }}
    >
      {!tbd && <Avatar initials={name || '?'} size={22} bg={winner ? 'var(--green-pale)' : 'var(--beige)'} />}
      <span className={styles.name}>{tbd ? t('bracket.tbd') : name}</span>
    </div>
  )
}
