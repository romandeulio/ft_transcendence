import { useTranslation } from 'react-i18next'
import styles from './PlayerBlock.module.css'
import Avatar from '../ui/Avatar'

export default function PlayerBlock({ name, winner, eliminated, tbd }) {
  const { t } = useTranslation()
  let cls = styles.player
  if (winner) cls += ' ' + styles.winner
  else if (eliminated) cls += ' ' + styles.eliminated
  else if (tbd) cls += ' ' + styles.tbd

  return (
    <div className={cls}>
      {!tbd && <Avatar initials={name || '?'} size={22} bg={winner ? 'var(--green-pale)' : 'var(--beige)'} />}
      <span className={styles.name}>{tbd ? t('bracket.tbd') : name}</span>
    </div>
  )
}
