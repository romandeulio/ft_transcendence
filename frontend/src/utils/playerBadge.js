export function getPlayerBadge(wins) {
  if (wins >= 50) return { label: 'Élite',      bg: '#CD3122', color: '#fff' }
  if (wins >= 30) return { label: 'Vétéran',    bg: '#E6B447', color: '#1A2B5E' }
  if (wins >= 15) return { label: 'Confirmé',   bg: '#57722F', color: '#fff' }
  if (wins >=  5) return { label: 'Amateur',    bg: '#4068DB', color: '#fff' }
  return                  { label: 'New Player', bg: '#7A8FD0', color: '#fff' }
}
