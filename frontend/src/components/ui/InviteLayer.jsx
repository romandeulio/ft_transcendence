import { useEffect, useRef, useState } from 'react'
import { useQueue } from '../../context/QueueContext'
import { useTranslation } from 'react-i18next'
import { isFriend, addFriend } from '../../services/friends'
import styles from './InviteLayer.module.css'

export default function InviteLayer() {
  const { t } = useTranslation()
  const { pendingInvites, inviteResults, respondToInvite, dismissInviteResult,
          friendNotifications, dismissFriendNotification } = useQueue()
  const [addedFriends, setAddedFriends] = useState({})
  const timersRef = useRef({})
  const [hiddenInviteIds, setHiddenInviteIds] = useState([])

  // Auto-dismiss inviteResults after 60s
  useEffect(() => {
    inviteResults.forEach(res => {
      const key = `res-${res.inviteId}`
      if (!timersRef.current[key]) {
        timersRef.current[key] = setTimeout(() => {
          dismissInviteResult(res.inviteId)
          delete timersRef.current[key]
        }, 60000)
      }
    })
    Object.keys(timersRef.current).forEach(key => {
      if (key.startsWith('res-') && !inviteResults.find(r => `res-${r.inviteId}` === key)) {
        clearTimeout(timersRef.current[key])
        delete timersRef.current[key]
      }
    })
  }, [inviteResults, dismissInviteResult])

  // Auto-hide pending invite cards from overlay after 60s (they stay in Accueil section)
  useEffect(() => {
    pendingInvites.forEach(inv => {
      const key = `inv-${inv.inviteId}`
      if (!timersRef.current[key] && !hiddenInviteIds.includes(inv.inviteId)) {
        timersRef.current[key] = setTimeout(() => {
          setHiddenInviteIds(prev => [...prev, inv.inviteId])
          delete timersRef.current[key]
        }, 60000)
      }
    })
    // Clean up timers for invites that were accepted/declined
    setHiddenInviteIds(prev => prev.filter(id => pendingInvites.find(i => i.inviteId === id)))
    Object.keys(timersRef.current).forEach(key => {
      if (key.startsWith('inv-') && !pendingInvites.find(i => `inv-${i.inviteId}` === key)) {
        clearTimeout(timersRef.current[key])
        delete timersRef.current[key]
      }
    })
  }, [pendingInvites]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleInvites = pendingInvites.filter(inv => !hiddenInviteIds.includes(inv.inviteId))

  if (!visibleInvites.length && !inviteResults.length && !friendNotifications.length) return null

  return (
    <div className={styles.layer}>
      {visibleInvites.map(inv => (
        <div key={inv.inviteId} className={styles.inviteCard}>
          <div className={styles.inviteFrom}>{inv.from}</div>
          <div className={styles.inviteText}>
            {inv.isWinClaim
              ? t('invite.winClaimReceived', { player: inv.from })
              : inv.slot?.type === 'tournament_teammate'
                ? t('invite.tournamentTeammate')
                : t('invite.received', {
                    format: inv.slot?.format || '1v1',
                    mode: inv.slot?.is_ranked ? t('addMatch.competition') : t('addMatch.chill'),
                  })}
          </div>
          {(inv.slot?.format === '2v2' || inv.slot?.match_type === 'TEAM') && (
            <div className={styles.inviteTeams}>
              {(inv.slot.team1 || []).filter(Boolean).join(' & ') || '...'}
              {' vs '}
              {(inv.slot.team2 || []).filter(Boolean).join(' & ') || (inv.slot.takeWin ? '...' : '?')}
            </div>
          )}
          <div className={styles.inviteActions}>
            <button
              className={styles.acceptBtn}
              onClick={() => respondToInvite(inv.inviteId, true, inv.slot, inv.from, inv.isWinClaim, inv.slotId)}
            >
              {t('invite.accept')}
            </button>
            <button
              className={styles.declineBtn}
              onClick={() => respondToInvite(inv.inviteId, false, inv.slot, inv.from, inv.isWinClaim, inv.slotId)}
            >
              {t('invite.decline')}
            </button>
          </div>
        </div>
      ))}

      {friendNotifications.map(notif => (
        <div key={notif.id} className={styles.friendCard}>
          <div className={styles.friendCardHeader}>
            <span className={styles.friendCardTitle}>{t('friend.added')}</span>
            <button className={styles.dismissBtn} onClick={() => dismissFriendNotification(notif.id)}>✕</button>
          </div>
          <div className={styles.friendCardFrom}>{notif.from}</div>
          <div className={styles.friendCardText}>
            {t('friend.addedYou')}
          </div>
          <div className={styles.friendCardActions}>
            <button
              className={styles.addBackBtn}
              disabled={addedFriends[notif.from] || isFriend(notif.from)}
              onClick={() => {
                addFriend(notif.from)
                setAddedFriends(p => ({ ...p, [notif.from]: true }))
                dismissFriendNotification(notif.id)
              }}
            >
              {addedFriends[notif.from] || isFriend(notif.from) ? t('friend.alreadyAdded') : t('friend.addBack')}
            </button>
            <button className={styles.friendDismissBtn} onClick={() => dismissFriendNotification(notif.id)}>
              {t('friend.ignore')}
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
            {res.winClaimDeclined
              ? t('invite.winClaimDeclined')
              : res.inviteCancelled
                ? t('invite.inviteCancelled', { player: res.target })
                : res.chain
                  ? t('invite.chainCancelled')
                  : res.cancelled
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
