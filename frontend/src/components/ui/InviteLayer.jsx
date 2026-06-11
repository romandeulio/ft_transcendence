import { useQueue } from '../../context/QueueContext'
import { useTranslation } from 'react-i18next'
import styles from './InviteLayer.module.css'

export default function InviteLayer() {
  const { t } = useTranslation()
  const { pendingInvites, inviteResults, respondToInvite, dismissInviteResult } = useQueue()

  if (!pendingInvites.length && !inviteResults.length) return null

  return (
    <div className={styles.layer}>
      {pendingInvites.map(inv => (
        <div key={inv.inviteId} className={styles.inviteCard}>
          <div className={styles.inviteFrom}>{inv.from}</div>
          <div className={styles.inviteText}>
            {t('invite.received', {
              format: inv.slot?.format || '1v1',
              mode: inv.slot?.is_ranked ? t('addMatch.competition') : t('addMatch.chill'),
            })}
          </div>
          <div className={styles.inviteActions}>
            <button
              className={styles.acceptBtn}
              onClick={() => respondToInvite(inv.inviteId, true, inv.slot, inv.from)}
            >
              {t('invite.accept')}
            </button>
            <button
              className={styles.declineBtn}
              onClick={() => respondToInvite(inv.inviteId, false, inv.slot, inv.from)}
            >
              {t('invite.decline')}
            </button>
          </div>
        </div>
      ))}

      {inviteResults.map(res => (
        <div
          key={res.inviteId}
          className={`${styles.resultCard} ${res.accepted ? styles.resultAccepted : styles.resultDeclined}`}
        >
          <span>
            {res.accepted
              ? t('invite.accepted', { player: res.target })
              : t('invite.declined', { player: res.target })}
          </span>
          <button className={styles.dismissBtn} onClick={() => dismissInviteResult(res.inviteId)}>✕</button>
        </div>
      ))}
    </div>
  )
}
