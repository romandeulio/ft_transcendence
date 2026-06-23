export function getPlayerBadge(wins) {
  if (wins >= 50) return { labelKey: 'badge.elite',     bg: '#CD3122', color: '#fff' }
  if (wins >= 30) return { labelKey: 'badge.veteran',   bg: '#E6B447', color: '#1A2B5E' }
  if (wins >= 15) return { labelKey: 'badge.confirmed', bg: '#57722F', color: '#fff' }
  if (wins >=  5) return { labelKey: 'badge.amateur',   bg: '#4068DB', color: '#fff' }
  return                  { labelKey: 'badge.newPlayer', bg: '#7A8FD0', color: '#fff' }
}
