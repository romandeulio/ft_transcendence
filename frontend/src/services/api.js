const BASE = '/api'

// Fetch authentifié — ajoute automatiquement le header Bearer
export function authFetch(url, options = {}) {
  const token = localStorage.getItem('access_token') || localStorage.getItem('token')
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
}

// Transforme un match API en ligne affichable pour Profil / Accueil
export function matchToRow(m, username) {
  // Detect team membership — player1_teammate is on team1, not team2
  const onTeam1 = m.player1 === username || m.player1_teammate === username
  let vs
  if (m.match_type === 'TEAM') {
    vs = onTeam1
      ? [m.player2, m.player2_teammate].filter(Boolean).join(' & ')
      : [m.player1, m.player1_teammate].filter(Boolean).join(' & ')
  } else {
    vs = onTeam1 ? m.player2 : m.player1
  }
  const myScore    = onTeam1 ? m.score_player1 : m.score_player2
  const theirScore = onTeam1 ? m.score_player2 : m.score_player1
  const isWin = (onTeam1 && m.winner === 'player1_side') || (!onTeam1 && m.winner === 'player2_side')

  let eloDelta = null
  if (m.is_ranked) {
    const [before, after] = m.match_type === 'SOLO'
      ? [onTeam1 ? m.elo_solo_player1_before : m.elo_solo_player2_before,
         onTeam1 ? m.elo_solo_player1_after  : m.elo_solo_player2_after]
      : [onTeam1 ? m.elo_team_p1_before : m.elo_team_p2_before,
         onTeam1 ? m.elo_team_p1_after  : m.elo_team_p2_after]
    if (before != null && after != null) eloDelta = after - before
  }
  const eloStr = eloDelta != null ? (eloDelta >= 0 ? `+${eloDelta}` : `${eloDelta}`) : '—'

  const d = new Date(m.played_at)
  const date = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`

  const isDraw = myScore != null && theirScore != null && myScore === theirScore
  return { vs: vs ?? '?', score: `${myScore ?? '?'}-${theirScore ?? '?'}`, result: isDraw ? 'Egalité' : (isWin ? 'Victoire' : 'Défaite'), elo: eloStr, date }
}

export async function apiRegister({ username, email, password }) {
  const res = await fetch(`${BASE}/register/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw data
  return data
}

export async function apiLogin({ email, password, totp_code }) {
  const body = { email, password }
  if (totp_code) body.totp_code = totp_code
  const res = await fetch(`${BASE}/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw data
  return data
}

export async function apiRefresh() {
  const refresh = localStorage.getItem('refresh_token')
  if (!refresh) throw new Error('Pas de refresh token')
  const res = await fetch(`${BASE}/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  const data = await res.json()
  if (!res.ok) throw data
  return data
}