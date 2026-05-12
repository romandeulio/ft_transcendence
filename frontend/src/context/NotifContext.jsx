import { createContext, useContext, useState } from 'react'

const NotifContext = createContext(null)

export function NotifProvider({ children }) {
  const [notifs, setNotifs] = useState([])

  const push = (msg) => setNotifs(prev => [...prev, { id: Date.now(), msg }])
  const dismiss = (id) => setNotifs(prev => prev.filter(n => n.id !== id))

  return (
    <NotifContext.Provider value={{ notifs, push, dismiss }}>
      {children}
    </NotifContext.Provider>
  )
}

export const useNotif = () => useContext(NotifContext)
