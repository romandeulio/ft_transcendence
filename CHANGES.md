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
