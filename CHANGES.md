
# Changelog — Session du 14 juin 2026

---

## Patch 4 — Déconnexion/reconnexion robuste, file zombie, "Mon match" pour tous les participants

> Depuis le commit `02d785a` — *Merge branch 'frontend-tournois'*

---

### 1. Reconnexion — slots préservés et état de jeu restauré

Quand un joueur se reconnecte (sans refresh), ses créneaux et sa partie en cours sont désormais restaurés proprement.

**Backend `queue.py`**
- `disconnect()` ne supprime plus les créneaux qui ont un adversaire accepté (`p2` renseigné), une partie active (`id` dans `games`) ou un créneau takeWin en attente — le slot reste visible dans la file pendant la déco.
- `connect()` envoie un message `game_state` si l'utilisateur était participant d'une partie active, permettant au frontend de resynchroniser les scores et le timer.
- `join` (upsert) : quand un client reconnecté envoie `join` pour son slot, les champs serveur déjà renseignés (`p2`, `player2`, coéquipiers, etc.) sont préservés — évite d'écraser des données arrivées pendant la déco.

**Frontend `QueueContext.jsx`**
- Au reconnect, le slot correspondant à la partie active (`activeGame?.gameId`) n'est pas re-soumis au backend via `join` — la partie est déjà trackée côté serveur.
- La restauration de `invitesSentRef` depuis `mySlots` (slots `pending_invite`) permet à J1 de continuer à traiter les réponses d'invitation après une déco/reco.

---

### 2. Livraison offline complète (5 types de notifications)

Tous les messages importants sont maintenant stockés dans `pending_invites` quand le destinataire est hors-ligne, et livrés à la reconnexion.

| Type | Stocké offline | Comportement à la reco |
|---|---|---|
| `match_cancelled` | ✓ | consommé (ONE_SHOT) |
| `win_claim_declined` | ✓ | consommé (ONE_SHOT) |
| `invite_response` | ✓ | consommé (ONE_SHOT) |
| `p2_left` | ✓ | consommé (ONE_SHOT) |
| `game_ended` | ✓ | consommé (ONE_SHOT) |
| invitation régulière | ✓ | persistante (survit plusieurs déco/reco) |
| `win_invite` | ✓ | persistante |

- Les ONE_SHOT sont retirés de `pending_invites` à la première livraison.
- `cancel_invite` nettoie le `pending_invites` de la cible.
- `leave` (annulation de slot) notifie les participants hors-ligne via `pending_invites`.

---

### 3. Scénario 5.2 — Fin de partie pendant déco de J1

**Problème** : J1 et J2 jouent → J1 déco sans refresh → J2 termine la partie → J1 reconnecte → slot zombie apparaît dans la file, impossible à supprimer.

**Causes** :
1. Le slot mort revenait via `refreshPersistedQueue` (API REST → DB non mise à jour par le WS).
2. JouerMode restait ouvert car l'auto-close attendait `game_ended` mais pouvait rater la fenêtre de timing.

**Fixes `QueueContext.jsx`** :
- `game_ended` handler : `setQueue(prev => prev.filter(...))` retire immédiatement le slot de la file React.
- `completedGameIdsRef` : ref toujours à jour, utilisée dans `refreshPersistedQueue` pour filtrer les slots terminés avant de les injecter depuis la DB — le zombie ne revient plus.

**Fixes `Accueil.jsx`** :
- Nouvel effet `[connected]` : à la reconnexion WS (`connected` passe false→true), si JouerMode est ouvert, il est fermé immédiatement. Si la partie est encore vivante, `game_state` arrive et J1 peut re-cliquer Jouer.
- Effet `[activeGame?.gameId]` (gardé) : auto-close via refs (`jouerOpenRef`, `selectedMatchRef`) quand `activeGame` passe de `gameId` → null — couvre le cas où J2 termine pendant que J1 est connecté.

---

### 4. Scores en direct dans le planning (`_queue_payload`)

`_queue_payload` dans `queue.py` enrichit chaque slot actif avec `live: true`, `scoreBlue`, `scoreRed` depuis le dict `games`. La timeline dans `Planning.jsx` affiche les scores en temps réel pour les parties en cours.

**Frontend `Planning.jsx`** : rendu des scores live avec `.liveScore`, `.liveScoreBlue`, `.liveScoreRed`.
**Frontend `Planning.module.css`** : nouveaux styles `.liveMatchContent`, `.liveScore`, `.liveScoreBlue`, `.liveScoreRed`, `.liveScoreSep`.

---

### 5. "Mon match" pour tous les participants (pas seulement p1)

Dans la timeline Planning, tous les participants d'un créneau (p1, p2, équipiers) voient maintenant :
- Le badge **"Mon match"** (`.mineLabelText`).
- Le slot surligné (`.slotMine`).
- Le bouton **✕** pour annuler leur participation.

Le bouton ✕ distingue owner et non-owner :
- **Owner (p1)** → `leaveQueue(slotId)` (supprime le slot, notifie tout le monde).
- **Non-owner (J2 / coéquipier)** → `cancelAsP2(slotId)` (envoie `leave_as_p2`, notifie J1 + les autres).

`cancelAsP2` est maintenant exposé dans `useQueue()` et destructuré dans `Planning.jsx`.

---

### 6. `JouerMode` — resynchronisation du timer au reconnect

Quand `startTime` arrive après le mount (reconnexion ou rejoindre une partie déjà démarrée), l'elapsed est recalculé depuis `startTime`. Évite que le chrono reparte à zéro après une déco.

---

### 7. Fix `CookieJWTAuthentication` — token valide mais utilisateur supprimé

`get_user()` lançait `AuthenticationFailed` quand l'utilisateur n'existait plus en base (ex : après un `make re`). La méthode attrape maintenant cette exception et retourne `None`, ce qui laisse les vues `AllowAny` (login, register) accessibles même avec un cookie JWT périmé.

---

### Nouvelles clés i18n (4 langues)

| Clé | Exemple (fr) |
|---|---|
| `queue.myMatch` | "Mon match" |
| `queue.mySlotTitle` | "Mon créneau" |
| `queue.pendingAccept` | "En cours d'acceptation" |
| `queue.noPending` | "Aucune invitation en cours" |
| `queue.pendingVs` | "vs {{opponent}}" |
| `queue.cancelInvite` | "✕ Annuler" |

---

### Fichiers modifiés (patch 4)

```
backend/
  realtime/consumers/queue.py    ← disconnect preserve, connect restore, offline delivery,
                                    game_ended offline, upsert join, live scores
  users/authentication.py        ← fix AuthenticationFailed sur user inexistant

frontend/src/
  components/ui/
    JouerMode.jsx                ← resync timer au reconnect (startTime tardif)
  context/
    QueueContext.jsx             ← completedGameIdsRef, setQueue on game_ended,
                                    filteredPersisted, skip activeGame slot au reconnect,
                                    cancelAsP2 exposé, close-on-reconnect via connected
  i18n/locales/
    fr.json / en.json / es.json / he.json
  pages/
    Accueil.jsx                  ← jouerOpenRef/selectedMatchRef/prevConnectedRef,
                                    effet [connected] close-on-reconnect,
                                    effet [activeGame?.gameId] auto-close,
                                    syntheticActiveMatch, isParticipantOfActiveGame
    Planning.jsx                 ← isParticipant, badge "Mon match", slotMine,
                                    bouton ✕ pour tous participants, cancelAsP2,
                                    cancelTargetSlot, live scores affichés
    Planning.module.css          ← .slotMine, .mineLabel, .mineLabelText, .editSlotBtn,
                                    .liveScore, .liveScoreBlue/.Red/.Sep
```

---

# Changelog — Session du 12 juin 2026

---

## Patch 3 — takeWin par invitation, offline delivery, corrections UI

> Depuis le commit `5946643` — *fix: 2v2 bugs, takeWin invites, login redirect, seed users*

### 1. "Reprendre la gagne" — flux par invitation obligatoire

Le créneau `takeWin` n'affecte plus automatiquement le gagnant comme adversaire. À la fin d'un match, le gagnant reçoit une **invitation WS `win_invite`** qu'il doit accepter ou refuser.

- **Refus** : le créneau takeWin est annulé, le propriétaire reçoit `win_claim_declined`, les créneaux en aval sont supprimés en cascade.
- **Acceptation** : le slot est rempli avec le gagnant (côté bleu ou rouge selon qui est absent).
- `queue.py` : nouvelles structures `win_invites`, `online_users`, `pending_invites` ; nouvelle action `win_claim_response` ; `game_end` supporte `winner`, `winner_teammate`, `match_type`, `completed=True`.
- `QueueContext.jsx` : handlers `win_invite` et `win_claim_declined` ; `signalGameEnd` transmet le gagnant dès la fin du match.
- `InviteLayer.jsx` : carte d'invitation différente pour les win claims.

---

### 2. Livraison des invitations hors-ligne

Quand un utilisateur est déconnecté au moment où on lui envoie une invitation (match ou win claim), le message est stocké dans `pending_invites` et livré dès sa reconnexion.

- `queue.py` : `connect()` consomme `pending_invites` à la connexion ; `invite` et `win_invite` vérifient `online_users` avant d'envoyer.
- `cancel_invite` nettoie aussi le stockage offline.

---

### 3. Annulation en cascade des créneaux takeWin (`parentSlotId`)

Chaque créneau takeWin enregistre maintenant `parentSlotId` (l'id du match dont il dépend). Quand un match est annulé ou qu'une égalité est déclarée, `_cascade_cancel_takewins` remonte la chaîne et supprime récursivement tous les créneaux dépendants.

- `queue.py` : méthode `_cascade_cancel_takewins` ; `leave` et `leave_as_p2` l'appellent.
- `QueueContext.jsx` : `match_cancelled` retire maintenant le slot concerné de `mySlots` + flag `chain`.
- `Accueil.jsx` / `Planning.jsx` : `parentSlotId` et `createdAt` ajoutés à la construction du slot.

---

### 4. Limite de 3 matchs en attente

Un utilisateur ne peut pas avoir plus de 3 matchs en attente simultanément (ni être invité dans un match si la cible dépasse déjà 3).

- `Accueil.jsx` et `Planning.jsx` : vérification `userPendingCount() >= 3` + vérification des cibles invitées.
- Nouvelles clés i18n `home.maxMatches` / `home.targetMaxMatches`.

---

### 5. Égalité → annulation automatique

Quand un match se termine sur une égalité, `JouerMode` affiche un avertissement et appelle `onTieCancel` au lieu de `onComplete`. Le slot est retiré de la file et les créneaux en aval sont annulés.

- `JouerMode.jsx` : prop `onTieCancel`, warning `.tieCancelWarning`, noms de joueurs affichés à la place des labels "Bleu / Rouge".
- `Accueil.jsx` : `handleTieCancel` déclenche `leaveQueue` + `closeGame`.

---

### 6. Corrections UI — matchs prévus, modale, planning

- **`vsColor`** : indicateurs bleu/rouge (`.dotBlue` / `.dotRed`) dans la liste des matchs (`Accueil`) et sur les cartes du planning (`Planning`).
- **`prevTeam`** utilise désormais le dernier slot de la file (`lastQueueSlot`) et transmet `is_ranked` — le bouton "Reprendre la gagne" est désactivé si le mode diffère.
- **`AddMatchModal`** : mode Chill saute l'étape takeWin ; format "Seul" retiré en mode `initialOpponent` ; sélecteur de couleur visible dès l'étape 3 si `takeWin=true` ; message d'avertissement `takeWinWarning` ; retour étape 4 → étape 2 pour Chill/initialOpponent.
- **`InviteLayer`** : auto-dismiss résultats après 60 s ; cartes d'invitation masquées après 60 s (persistent dans la section Accueil) ; nouveaux types de notification (`winClaimDeclined`, `inviteCancelled`, `chainCancelled`).
- **Carte "Invitations en cours"** ajoutée dans `Accueil` avec boutons Accepter / Refuser inline.
- **Avatar dans la Sidebar** : affiche la photo si `user.avatar_url` est défini.
- **`Profil.jsx`** : upload avatar appelle directement l'API (synchrone) avec cache-buster `?v=`.
- **`Parametres.jsx`** : fallback `localStorage.getItem('token')` pour le token d'avatar.
- Suppression `django-ratelimit` de `requirements.txt`.

---

### Nouvelles clés i18n (4 langues)

| Clé | Exemple (fr) |
|---|---|
| `home.awaitingConfirmation` | "En attente de confirmation des autres joueurs" |
| `home.maxMatches` | "Tu as déjà 3 matchs en attente, annules-en un avant d'en créer un nouveau." |
| `home.targetMaxMatches` | "{{player}} a déjà 3 matchs en attente et ne peut pas être invité(e)." |
| `home.pendingInvites` / `home.noPendingInvites` | "Invitations en cours" / "Aucune invitation en attente" |
| `invite.offline` | "{{player}} n'est pas connecté(e), invitation annulée" |
| `invite.winClaimReceived` | "{{player}} t'invite à reprendre ta gagne dans son prochain match" |
| `invite.winClaimDeclined` | "Un gagnant a refusé de reprendre la gagne — le match a été annulé" |
| `invite.inviteCancelled` | "{{player}} a annulé son invitation" |
| `invite.chainCancelled` | "Un match de la chaîne a été annulé — ton créneau a été supprimé" |
| `addMatch.opponent` | "Adversaire" |
| `addMatch.takeWinWarning` | "⚠️ Attention : si le(s) gagnant(s) n'accepte(nt) pas ton invitation, le match sera annulé." |
| `game.tieCancelWarning` | "Ce match va être annulé — les reprises de gagne associées seront supprimées." |

---

### Fichiers modifiés (patch 3)

```
backend/
  realtime/consumers/queue.py    ← win_invites, offline delivery, cascade cancel
  requirements.txt               ← suppression django-ratelimit

frontend/src/
  components/
    layout/Sidebar.jsx           ← avatar image si avatar_url
    layout/Sidebar.module.css    ← .avatarImg
    ui/AddMatchModal.jsx         ← chill skip, takeWinWarning, locked opponent
    ui/AddMatchModal.module.css  ← .takeWinWarning
    ui/InviteLayer.jsx           ← auto-dismiss, win claim, nouvelles notifs
    ui/JouerMode.jsx             ← onTieCancel, noms joueurs, warning égalité
    ui/JouerMode.module.css      ← .tieCancelWarning
  context/
    QueueContext.jsx             ← win_invite, offline, cascade, signalGameEnd
  i18n/locales/
    fr.json / en.json / es.json / he.json
  pages/
    Accueil.jsx                  ← vsColor, lastQueueSlot, limite 3, tie cancel, carte invitations
    Accueil.module.css           ← .dotBlue/.dotRed, .inviteRow*
    Parametres.jsx               ← fallback token, cache-buster avatar
    Planning.jsx                 ← limite 3, parentSlotId, dotBlue/dotRed
    Planning.module.css          ← .dotBlue/.dotRed
    Profil.jsx                   ← upload avatar direct API
```

---

# Changelog — Session du 11 juin 2026

---

## Patch 2 — Corrections post-merge (même session)

> Depuis le commit `94df8f7` — *feat: merge front back db 1 - matchs 1v1 ok !*

### 1. Notifications d'annulation de match

Quand J1 supprime un match (via `leaveQueue`) ou qu'un participant le quitte (`cancelAsP2`), tous les autres participants reçoivent désormais une notification toast "{{player}} a annulé le match" via leur groupe WS personnel.

- `backend/realtime/consumers/queue.py` : action `leave` notifie J2/J3/J4 via `match_cancelled_msg` ; action `leave_as_p2` notifie J1 via `p2_left` (inchangé) + notifie J3/J4 via `match_cancelled_msg`.
- `QueueContext.jsx` : gère le type `match_cancelled` → injecte dans `inviteResults`.
- `InviteLayer.jsx` : affiche `invite.matchCancelled` dans les toasts.

---

### 2. Validation des logins (AddMatchModal)

- **Champs vides** : le bouton Confirmer est bloqué si un joueur requis est absent — message inline rouge.
- **Doublons** : bloque si le même login apparaît deux fois (même équipe ou équipes adverses).
- **Login inexistant** : `handleAddMatch` dans Accueil appelle `/api/auth/users/` avant d'envoyer l'invitation et affiche un toast d'erreur pour tout login introuvable.

- `AddMatchModal.jsx` : état `validationError`, vérification sync avant `onConfirm`.
- `AddMatchModal.module.css` : style `.validationError`.
- `Accueil.jsx` : validation async d'existence en tête de `handleAddMatch`.

---

### 3. "Reprendre la gagne" — vérification coéquipier 2v2

`prevTeam` passé à `AddMatchModal` incluait seulement `p1`/`p2` ; il inclut maintenant `team1` et `team2`. Le check `userIsInPrevTeam` (qui testait déjà `team1?.includes(u)`) fonctionne donc correctement pour les binômes.

---

### 4. Affichage des matchs prévus en 2v2

`myUpcoming.vs` et `invitedUpcoming.vs` dans `Accueil.jsx` affichaient seulement le capitaine adverse. Ils affichent désormais toute l'équipe : `"J3 & J4"` pour un slot 2v2.

---

### 5. Correction "player2_teammate_id requis pour TEAM" (takeWin 2v2)

Quand un slot `takeWin` attend le gagnant d'un match 2v2, le coéquipier du gagnant n'était pas propagé.

- `queue.py` : `game_end` calcule `winner_teammate` et l'injecte dans le slot takeWin (`slot["player2_teammate"]`) ainsi que dans `game_ended_msg`.
- `QueueContext.jsx` : le handler `game_ended` met à jour le slot local avec `player2_teammate`.
- `Accueil.jsx` : `handleMatchComplete` incluait déjà `slot.player2_teammate` dans le corps de la requête — ça fonctionne maintenant car la donnée est présente.

---

### Nouvelles clés i18n (4 langues)

| Clé | Exemple (fr) |
|---|---|
| `invite.matchCancelled` | "{{player}} a annulé le match" |
| `addMatch.missingPlayers` | "Tous les joueurs doivent être renseignés." |
| `addMatch.duplicatePlayer` | "Un joueur ne peut apparaître qu'une seule fois." |

---

### Fichiers modifiés (patch 2)

```
backend/realtime/consumers/queue.py
frontend/src/
  context/QueueContext.jsx
  components/ui/
    AddMatchModal.jsx
    AddMatchModal.module.css
    InviteLayer.jsx
  pages/Accueil.jsx
  i18n/locales/fr.json / en.json / es.json / he.json
```

---

> Commit : `5e028ee` — *fix(front/ws/db/back): match 1v1 + friends ok*  
> Branche : `main`  
> Fichiers modifiés : **23** · +992 / −311 lignes

---

## Nouvelles fonctionnalités

### Système d'invitations (WebSocket)

Quand J1 ajoute un match avec un adversaire nommé, au lieu d'entrer directement en file, une invitation est envoyée à J2 via WebSocket. J2 doit accepter ou refuser avant que le créneau soit créé.

**Backend** — [`backend/realtime/consumers/queue.py`](backend/realtime/consumers/queue.py)
- Chaque connexion rejoint un groupe personnel `user_{username}`
- Nouvelle action `invite` : envoie l'invitation au groupe `user_{target}`
- Nouvelle action `invite_response` : renvoie la réponse à `user_{from_user}`
- Handlers `invite_msg` et `invite_response_msg`

**Frontend** — [`frontend/src/context/QueueContext.jsx`](frontend/src/context/QueueContext.jsx)
- Nouvel état `pendingInvites` (invitations reçues, côté J2)
- Nouvel état `inviteResults` (notifications accept/refus, côté J1)
- `invitesSentRef` — ref pour éviter les closures obsolètes
- `sendInvite(target, slot)` : envoie l'invitation WS, ajoute le slot en `pending_invite` dans `mySlots` de J1
- `respondToInvite(inviteId, accepted, slot, fromUser)` : envoie la réponse ; si accepté, J1 passe son slot de `pending_invite` → `taken` puis appelle `join`
- `dismissInviteResult(inviteId)` : ferme une notification

**Composant flottant** — [`frontend/src/components/ui/InviteLayer.jsx`](frontend/src/components/ui/InviteLayer.jsx) *(nouveau)*
- Affiché dans [`Shell.jsx`](frontend/src/components/layout/Shell.jsx), en bas à droite de l'écran
- Carte pour chaque invitation reçue avec boutons Accepter / Refuser
- Notification verte/rouge une fois la réponse connue (côté J1)

**Pages** — [`Accueil.jsx`](frontend/src/pages/Accueil.jsx) · [`Planning.jsx`](frontend/src/pages/Planning.jsx)
- `sendInvite` intégré dans `handleAddMatch` / `handleJoinConfirm`
- L'invitation est envoyée **avant** tout appel REST, pour tous les modes de match

---

### Amis favoris — classement automatique

La section "Amis favoris" n'est plus manuelle. Elle affiche automatiquement le **top 5 des joueurs contre lesquels tu as le plus joué**, calculé depuis l'historique de matchs validés.

**[`Accueil.jsx`](frontend/src/pages/Accueil.jsx)**
- `topOpponents` calculé via `useMemo` sur `matches` — compte toutes les occurrences dans `m.vs`
- Suppression des états `teammates`, `newTeammate`, `allPlayers` et des fonctions `addTeammate` / `removeTeammate`
- Suppression du fetch `GET /api/auth/users/` (plus nécessaire ici)
- Affichage : rang `#1–#5`, avatar, login, nombre de parties, bouton "Inviter à jouer"

**[`Accueil.module.css`](frontend/src/pages/Accueil.module.css)**
- Suppression des styles `.addTeammate`, `.addInput`, `.addBtn`, `.removeBtn`
- Ajout `.rankBadge`, `.gamesCount`

---

### Quick-add ami — choix du mode conservé

Cliquer sur "Inviter à jouer" depuis "Amis favoris" ouvre désormais la modale à **l'étape 1 (Chill / Compétition)**, puis étape 2 (format), puis directement étape 4 (couleur). L'adversaire est pré-rempli et l'étape takeWin est sautée.

**[`AddMatchModal.jsx`](frontend/src/components/ui/AddMatchModal.jsx)**
- `initialOpponent` : pré-remplit `redPlayers[0]`, `takeWin = false`, démarre à `step = 1`
- Bouton "Suivant" à l'étape 2 saute à l'étape 4 si `initialOpponent` est défini
- Même logique appliquée au raccourci clavier Enter

---

## Corrections de bugs

### Doublon de match pour J2 après acceptation d'invitation

Quand J2 acceptait une invitation, le même match apparaissait deux fois dans "Mes matchs prévus" :
- une fois depuis `mySlots` (ajouté par `respondToInvite`)
- une fois depuis la file globale (J2 était `p2` du slot de J1)

**Fix — [`QueueContext.jsx`](frontend/src/context/QueueContext.jsx)**  
`respondToInvite` n'ajoute plus rien à `mySlots` côté J2. L'affichage passe uniquement par `invitedUpcoming` (filtre sur `queue` global).

---

### Historique — les victoires n'apparaissaient pas (mode takeWin)

Pour les slots `takeWin`, le champ `player2` n'était jamais renseigné (seul `p2` l'était), donc `handleMatchComplete` sortait en avance.

**Fix — [`QueueContext.jsx`](frontend/src/context/QueueContext.jsx)**  
Le handler `game_ended` met maintenant à jour **les deux** : `p2` et `player2`.  
Fallback ajouté dans [`Accueil.jsx`](frontend/src/pages/Accueil.jsx) : `effectivePlayer2 = slot?.player2 || slot?.p2`.

---

### PerformanceChart — message permanent "Sélectionne un joueur"

Le message s'affichait même sans avoir interagi avec le graphique.

**Fix — [`PerformanceChart.jsx`](frontend/src/components/ui/PerformanceChart.jsx)**  
Message conditionnel : visible uniquement si `selected.length === 0 && players.length > 0`.

---

### Interdiction de prendre la gagne sur son propre match

**Fix — [`AddMatchModal.jsx`](frontend/src/components/ui/AddMatchModal.jsx)**  
Le bouton "Oui" de l'étape takeWin est désactivé si l'utilisateur est déjà participant du match précédent (`userIsInPrevTeam`).

---

### Erreur login — message d'erreur affiché

**Fix — [`Login.jsx`](frontend/src/pages/Login.jsx)** + **[`Login.module.css`](frontend/src/pages/Login.module.css)**  
État `error` ajouté, affiché entre le champ mot de passe et le bouton, effacé à chaque frappe.

---

### "Déjà dans la file" au deuxième match

Le backend refusait le deuxième `POST /api/planning/queue/join/`. Le message d'erreur est désormais détecté et le `joinQueue` WebSocket est quand même appelé.

---

## Internationalisation

Nouvelles clés ajoutées dans les 4 langues (`fr` · `en` · `es` · `he`) :

| Clé | Exemple (fr) |
|---|---|
| `login.error` | "Email ou mot de passe incorrect." |
| `invite.received` | "t'invite à un match {{format}} · {{mode}}" |
| `invite.accept` / `invite.decline` | "Accepter ✓" / "Refuser" |
| `invite.accepted` / `invite.declined` | "{{player}} a accepté ton invitation ✓" |
| `invite.sent` | "✅ Invitation envoyée à {{player}}" |
| `invite.pendingLabel` | "En attente d'acceptation" |
| `home.favFriendsNote` | "Top 5 des joueurs avec lesquels tu as le plus joué" |
| `home.noFavFriends` | "Joue des matchs pour voir ton classement ici." |
| `addMatch.alreadyParticipant` | "Tu es déjà participant de ce match" |
| `home.waiting` | "En attente" |

**Pages Register et Login** : sélecteur de langue ajouté, toutes les chaînes traduites.

---

## Fichiers modifiés — récapitulatif

```
backend/
  realtime/consumers/queue.py        ← invitations WS
  users/urls.py                      ← route /api/auth/users/
  users/views.py                     ← vue listing joueurs

frontend/src/
  components/
    layout/Shell.jsx                 ← <InviteLayer />
    ui/AddMatchModal.jsx             ← initialOpponent, takeWin lock, skip step
    ui/AddMatchModal.module.css
    ui/InviteLayer.jsx               ← NOUVEAU
    ui/InviteLayer.module.css        ← NOUVEAU
    ui/PerformanceChart.jsx          ← fix message permanent
  context/
    QueueContext.jsx                 ← invitations, fix doublon J2, fix player2
  i18n/locales/
    fr.json / en.json / es.json / he.json
  pages/
    Accueil.jsx                      ← topOpponents, sendInvite, effectivePlayer2
    Accueil.module.css
    Login.jsx                        ← message d'erreur
    Login.module.css
    Planning.jsx                     ← sendInvite
    Profil.jsx                       ← coéquipiers favoris
    Profil.module.css
    Register.jsx                     ← langue
    Register.module.css
```
