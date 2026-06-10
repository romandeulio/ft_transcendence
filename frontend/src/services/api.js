const BASE = '/api'

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