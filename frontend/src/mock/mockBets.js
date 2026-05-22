export const playerWins = {
  sydney:   32,
  roman:     8,
  thais:    22,
  jblanc:    3,
  ltcherp:  28,
  coraline: 15,
  kperez:    6,
  amorin:   11,
}

export const bets = [
  {
    id: 1,
    match: "sydney vs roman",
    p1: "sydney",
    p2: "roman",
    status: "live",
    context: "Match en cours — place 1",
    myBet: null,
    probP1: 65,
    pctBets: 58,
  },
  {
    id: 2,
    match: "thais vs jblanc",
    p1: "thais",
    p2: "jblanc",
    status: "soon",
    waitLabel: "dans ~8 min",
    context: "File d'attente — place 2",
    myBet: { player: "thais", amount: 50 },
    probP1: 72,
    pctBets: 71,
  },
  {
    id: 3,
    match: "ltcherp vs coraline",
    p1: "ltcherp",
    p2: "coraline",
    status: "soon",
    waitLabel: "dans ~16 min",
    context: "File d'attente — place 3",
    myBet: null,
    probP1: 48,
    pctBets: 44,
  },
]

export const betHistory = [
  { id:1, match:"sydney vs roman",    betOn:"sydney",   result:"gagné", delta:+75, date:'12/04' },
  { id:2, match:"thais vs jblanc",    betOn:"thais",    result:"perdu", delta:-50, date:'15/04' },
  { id:3, match:"roman vs amorin",    betOn:"roman",    result:"gagné", delta:+60, date:'18/04' },
  { id:4, match:"kperez vs coraline", betOn:"coraline", result:"perdu", delta:-30, date:'22/04' },
]

export const planningSlots = [
  { id: 10, time: "11:20", label: "Créneau libre — 11h20", p1: "?", p2: "?" },
  { id: 11, time: "11:40", label: "Créneau libre — 11h40", p1: "?", p2: "?" },
  { id: 12, time: "14:00", label: "Demain 14h — ltcherp vs thais", p1: "ltcherp", p2: "thais" },
  { id: 13, time: "16:00", label: "Demain 16h — roman vs kperez",  p1: "roman",   p2: "kperez" },
]
