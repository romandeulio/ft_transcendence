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
    // Le endpoint renvoie 200 {refreshed: bool} (jamais 401) → on lit le payload,
    // pas le statut, pour éviter une erreur dans la console du navigateur.
    refreshPromise = fetch(`${BASE}/token/refresh/`, buildFetchOptions({ method: 'POST' }))
      .then(res => res.json().catch(() => ({})))
      .finally(() => {
        refreshPromise = null
      })
  }

  const data = await refreshPromise
  if (!data.refreshed) throw new Error('Session expired')
}

// Rafraîchit le cookie JWT — utilisé par AuthContext
export function apiRefresh() {
  return refreshAuthCookie()
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

// Verrou global : une fois la session morte (compte supprimé / refresh KO), on
// court-circuite les requêtes authentifiées pour ne pas inonder la console de
// 401 (chaque composant qui poll réessaierait sinon en boucle). Réarmé au login.
let sessionDead = false

export function resetAuthSession() {
  sessionDead = false
}

// Réponse 401 synthétique avec corps JSON (pour que les `.then(r => r.json())`
// des appelants ne lèvent pas sur un body vide).
function deadSessionResponse() {
  return new Response(
    JSON.stringify({ detail: 'Session expired' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  )
}

export async function authFetch(url, options = {}) {
  // Session déjà connue morte : aucune requête réseau (évite le spam de 401).
  if (sessionDead) return deadSessionResponse()

  const isJSON =
    !(options.body instanceof FormData) &&
    typeof options.body === 'string'

  const doFetch = () => fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isJSON ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })

  const res = await doFetch()
  if (res.status !== 401) return res

  // Ban : redirection immédiate vers la page de ban.
  try {
    const data = await res.clone().json()
    if (data.detail === 'User is banned') {
      localStorage.removeItem('user')
      const ban = data.ban || {}
      if (ban.type === 'temporary' && ban.until) {
        window.location.href = `/banned?type=temporary&until=${encodeURIComponent(ban.until)}`
      } else {
        window.location.href = '/banned?type=permanent'
      }
      return res
    }
  } catch {}

  // Pas un ban : tente un refresh silencieux puis rejoue UNE fois la requête.
  // Attention : le refresh JWT ne vérifie que la signature du token, pas
  // is_active — pour un compte supprimé il réussit mais la requête rejouée
  // reste 401. On traite donc « refresh KO » ET « toujours 401 après refresh »
  // comme une session morte.
  try {
    await refreshAuthCookie()
    const retry = await doFetch()
    if (retry.status !== 401) return retry
  } catch {}

  if (!sessionDead) {
    sessionDead = true
    // AuthContext écoute cet event → purge la session + affiche le modal.
    window.dispatchEvent(new CustomEvent('auth:session-expired'))
  }
  return res
}

// Erreur "métier" de tournoi : le backend répond 200 + en-tête X-Tournament-Error
// (au lieu d'un 400) pour ne pas laisser de ligne rouge dans la console. Renvoie
// le code d'erreur (ex. 'FULL', 'PAST_DATE') si présent, sinon null. Les handlers
// doivent traiter `tournamentError(res)` comme un échec malgré un res.ok à true.
export function tournamentError(res) {
  return res.headers.get('X-Tournament-Error')
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
  // `result` est une CLÉ stable (win/loss/draw) — traduite à l'affichage via i18n.
  return { vs: vs ?? '?', score: `${myScore ?? '?'}-${theirScore ?? '?'}`, result: isDraw ? 'draw' : (isWin ? 'win' : 'loss'), elo: eloStr, date }
}



