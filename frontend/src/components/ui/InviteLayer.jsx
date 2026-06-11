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
          {(inv.slot?.format === '2v2' || inv.slot?.match_type === 'TEAM') && (
            <div className={styles.inviteTeams}>
              {(inv.slot.team1 || []).filter(Boolean).join(' & ')}
              {' vs '}
              {(inv.slot.team2 || []).filter(Boolean).join(' & ')}
            </div>
          )}
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

      {inviteResults.map((res, i) => (
        <div
          key={`${res.inviteId}-${i}`}
          className={`${styles.resultCard} ${res.accepted ? styles.resultAccepted : styles.resultDeclined}`}
        >
          <span>
            {res.cancelled
              ? t('invite.matchCancelled', { player: res.target })
              : !res.accepted
                ? t('invite.declined', { player: res.target })
                : res.partial
                  ? t('invite.acceptedPartial', { player: res.target, count: res.count, total: res.total })
                  : t('invite.accepted', { player: res.target })}
          </span>
          <button className={styles.dismissBtn} onClick={() => dismissInviteResult(res.inviteId)}>✕</button>
        </div>
      ))}
    </div>
  )
}
