const KEY = 'favTeammates'

export const getFriends = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}

export const isFriend = (login) => getFriends().some(f => f.login === login)

export const addFriend = (login) => {
  const friends = getFriends()
  if (isFriend(login)) return false
  const next = [...friends, { login, name: login }]
  localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('favTeammatesChanged'))
  return true
}

export const removeFriend = (login) => {
  const next = getFriends().filter(f => f.login !== login)
  localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('favTeammatesChanged'))
}
