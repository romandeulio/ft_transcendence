export const players = [
  { id:1, login:"sydney",   name:"Sydney",   elo:1834, wins:42, losses:8,  rank:1 },
  { id:2, login:"thais",    name:"Thaïs",    elo:1691, wins:38, losses:11, rank:2 },
  { id:3, login:"roman",    name:"Roman",    elo:1580, wins:35, losses:14, rank:3 },
  { id:4, login:"amorin",   name:"amorin",   elo:1490, wins:31, losses:16, rank:4 },
  { id:5, login:"ltcherp",  name:"Léa",      elo:1412, wins:28, losses:18, rank:5, isMe:true },
  { id:6, login:"coraline", name:"Coraline", elo:1388, wins:26, losses:20, rank:6 },
  { id:7, login:"jblanc",   name:"jblanc",   elo:1341, wins:24, losses:21, rank:7 },
  { id:8, login:"kperez",   name:"kperez",   elo:1298, wins:22, losses:23, rank:8 },
]

export const me = players.find(p => p.isMe)
