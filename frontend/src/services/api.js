const BASE = '/api/auth'

let refreshPromise = null

function buildFetchOptions(options = {}) {
  const headers = { ...(options.headers || {}) }
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  return {
    ...options,
    credentials: 'include',
    headers,
  }
}

async function refreshAuthCookie() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE}/token/refresh/`, buildFetchOptions({ method: 'POST' }))
      .finally(() => {
        refreshPromise = null
      })
  }

  const res = await refreshPromise
  if (!res.ok) throw new Error('Session expired')
}

// Fetch authentifié — les JWT HttpOnly sont envoyés via cookies same-origin.
{/*export function authFetch(url, options = {}) {
  return fetch(url, buildFetchOptions(options)).then(async res => {
    // Détection ban : le backend renvoie 401 avec detail "User is banned"
    if (res.status === 401) {
      const clone = res.clone()
      try {
        const data = await clone.json()
        if (data.detail === 'User is banned' || (typeof data.detail === 'object' && data.detail?.detail === 'User is banned')) {
          localStorage.removeItem('user')
          const ban = data.ban || data.detail?.ban || {}
          if (ban.type === 'permanent') {
            window.location.href = '/banned?type=permanent'
          } else if (ban.type === 'temporary' && ban.until) {
            window.location.href = `/banned?type=temporary&until=${encodeURIComponent(ban.until)}`
          } else {
            window.location.href = '/banned?type=permanent'
          }
          return res
        }
      } catch {}
    }

    if (res.status !== 401 || url === `${BASE}/token/refresh/`) {
      return res
    }

    try {
      await refreshAuthCookie()
      return fetch(url, buildFetchOptions(options))
    } catch {
      return res
    }
  })
}*/}

export function authFetch(url, options = {}) {
  const isJSON =
    !(options.body instanceof FormData) &&
    typeof options.body === 'string'
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isJSON ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  }).then(async (res) => {

    // ❗ BAN HANDLING (tu peux garder ça)
    if (res.status === 401) {
      try {
        const data = await res.clone().json()

        if (data.detail === 'User is banned') {
          localStorage.removeItem('user')

          const ban = data.ban || {}

          if (ban.type === 'permanent') {
            window.location.href = '/banned?type=permanent'
          } else if (ban.type === 'temporary' && ban.until) {
            window.location.href =
              `/banned?type=temporary&until=${encodeURIComponent(ban.until)}`
          } else {
            window.location.href = '/banned?type=permanent'
          }

          return res
        }
      } catch {}
    }

    return res
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
    credentials: 'include',
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw data
  return data
}

export async function apiRefresh() {
  const res = await fetch(`${BASE}/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
  const data = await res.json()
  if (!res.ok) throw data
  return data
}
