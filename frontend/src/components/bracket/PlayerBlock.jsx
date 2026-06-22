import { useTranslation } from 'react-i18next'
import styles from './PlayerBlock.module.css'
import Avatar from '../ui/Avatar'

export default function PlayerBlock({ name, winner, eliminated, tbd, bye, onClick }) {
  const { t } = useTranslation()
  let cls = styles.player
  if (winner) cls += ' ' + styles.winner
  else if (eliminated) cls += ' ' + styles.eliminated
  else if (tbd || bye) cls += ' ' + styles.tbd
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
      {!tbd && !bye && <Avatar initials={name || '?'} size={22} bg={winner ? 'var(--green-pale)' : 'var(--beige)'} />}
      <span className={styles.name}>{bye ? t('bracket.bye') : tbd ? t('bracket.tbd') : name}</span>
    </div>
  )
}
