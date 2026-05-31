import { createContext, useContext, useState } from 'react'

const BetsContext = createContext(null)

export function BetsProvider({ children }) {
  const [bets,       setBets]       = useState([])
  const [betHistory, setBetHistory] = useState([])

  const addBet = (bet) =>
    setBets(prev => [...prev, { id: Date.now(), myBet: null, probP1: 50, pctBets: 50, ...bet }])

  const placeBet = (betId, player, amount) =>
    setBets(prev => prev.map(b => b.id === betId ? { ...b, myBet: { player, amount } } : b))

  const cancelBet = (betId) =>
    setBets(prev => prev.map(b => b.id === betId ? { ...b, myBet: null } : b))

  return (
    <BetsContext.Provider value={{ bets, betHistory, addBet, placeBet, cancelBet }}>
      {children}
    </BetsContext.Provider>
  )
}

export const useBets = () => useContext(BetsContext)
