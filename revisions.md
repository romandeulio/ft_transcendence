# 🎯 Révisions ft_transcendence — soutenance

> Document de révision personnel (Coraline). Construit à partir du **vrai code** du dépôt.
> Mes domaines à maîtriser à fond : **DevOps/config (Docker, nginx)**, **frontend**, **WebSockets/temps réel**.
> Le reste (back métier, DB, auth) : savoir **expliquer le rôle et les liens**, pas chaque ligne.

---

## ⚠️ 0. À régler / assumer AVANT l'éval

1. **Pages Privacy Policy & Terms of Service** — le sujet dit : pages absentes/vides = **rejet du projet**.
   - Aujourd'hui : aucune route `/privacy` ni `/terms` dans `App.jsx`, et dans `Footer.jsx` les liens « privacy » et « rgpd » sont des `<span>` morts (pas de `<Link>`).
   - **C'est ma responsabilité (trame).** → à créer (pages + routes + liens footer), contenu réel non placeholder.

2. **Pas de migrations Django (règle du projet).** À assumer comme un choix d'archi :
   - Schéma = uniquement `postgres/init.sql` (joué au 1er démarrage de Postgres).
   - Tous les modèles sont `managed = False` → Django mappe, ne crée/modifie jamais les tables.
   - `entrypoint.sh` (qui ferait `migrate`) **n'est pas branché** (pas de `ENTRYPOINT` dans le Dockerfile) → il ne tourne pas. **Le supprimer** pour éviter de tromper un correcteur.
   - Conséquence : `/admin/` Django et les sessions ne sont pas adossés à des tables → non utilisés (auth = JWT stateless). L'admin "métier" est la page React `Admin.jsx`.

3. **Secret en dur** : `EMAIL_HOST_PASSWORD` est écrit en clair dans `settings.py` → le déplacer dans `.env`.

---

## 1. Le trajet d'une requête (LA question d'archi — savoir la réciter)

```
Navigateur (https://localhost:443)
   │  TLS 1.2/1.3, certificat auto-signé
   ▼
NGINX  — reverse proxy, "same-origin"        (nginx/nginx.conf)
   ├── /            → frontend:5173   React/Vite (HMR via WebSocket)
   ├── /api/        → backend:8000    Django REST
   ├── /ws/         → backend:8000    WebSocket (header Upgrade)
   ├── /health      → backend:8000    app/health.py
   └── /media/      → fichiers (avatars)
        ▼
BACKEND = Daphne (serveur ASGI) — sert HTTP **et** WebSocket dans UN seul process
   ├── HTTP  → Django REST           (app/urls.py)
   └── WS    → Channels              (app/asgi.py → JWTAuthMiddleware → routing)
        ▼
PostgreSQL (données)   +   Redis (channel layer WS + cache token 42)
```

**Règle d'or "same-origin"** : le front fait toujours des **URLs relatives** (`/api/...`, `/ws/...`), jamais `http://localhost:8000`. Tout passe par `https://localhost` via nginx → pas de CORS côté navigateur, cookies JWT envoyés naturellement.

**Pourquoi le backend est sur 2 réseaux Docker** (`backend_net` + `frontend_net`) : il parle à Postgres/Redis (back) **et** reçoit le trafic proxifié par nginx (front).

---

## 2. 🟢 DevOps / Configuration

### 2.1 Services Docker — `docker-compose.yml`
6 services :

| Service | Image / build | Rôle | Réseau(x) | Ports exposés |
|---|---|---|---|---|
| `postgresql` | postgres:15 | base de données | backend_net | — |
| `redis` | redis:7-alpine | channel layer WS + cache | backend_net | — |
| `backup` | build ./backup | `pg_dump` cron nuit | backend_net | — |
| `backend` | build ./backend | Django + Daphne (ASGI) | backend_net + frontend_net | — |
| `frontend` | build ./frontend | React + Vite (dev) | frontend_net | — |
| `nginx` | build ./nginx | reverse proxy HTTPS | frontend_net | **443**, 8008→80 |

À savoir expliquer :
- **Seul nginx expose des ports** → tout le reste est interne (sécurité).
- `healthcheck` Postgres (`pg_isready`) + `depends_on: condition: service_healthy` → le backend attend une DB prête.
- **Volumes nommés** : `postgres_data` (persistance DB), `backup_data` (dumps).
- **Bind-mounts de dev** : `./backend:/app`, `./frontend:/app` (hot-reload). Le volume **anonyme `/app/node_modules`** : empêche le bind-mount d'écraser les `node_modules` installés dans l'image.
- `init.sql` monté en lecture seule dans `/docker-entrypoint-initdb.d/` → exécuté **une seule fois** à la création du volume Postgres.

### 2.2 Makefile
- `make up` = `docker compose up --build -d` (build + détaché).
- `make down` (stop), `make clean` (`down -v` → **supprime les volumes** donc la DB), `make fclean` (+ images), `make re` (rebuild from scratch).
- `make seed` / `make unseed` : joueurs de test (commande Django `seed_users`).
- `make backup` : déclenche un dump manuel.
- `make exec-backend/-frontend/-db`, `make logs`, `make ps`.

### 2.3 nginx — sécurité (`nginx/nginx.conf` + `nginx/Dockerfile`)
- **Certificat auto-signé** généré dans le `Dockerfile` avec `openssl` (CN=localhost).
- **HTTPS strict** : `listen 80` → `return 301 https://...` (aucun fallback HTTP). TLS 1.2/1.3 uniquement.
- **6 headers de sécurité** (savoir les nommer + à quoi ils servent) :
  | Header | Rôle |
  |---|---|
  | `X-Content-Type-Options: nosniff` | empêche le navigateur de "deviner" le type MIME |
  | `X-Frame-Options: DENY` | anti-clickjacking (pas d'iframe) |
  | `Strict-Transport-Security` (HSTS) | force HTTPS pour les visites futures |
  | `Referrer-Policy` | limite les infos de provenance envoyées |
  | `Permissions-Policy` | coupe caméra/micro/géoloc/paiement/usb |
  | `Content-Security-Policy` (CSP) | whiteliste les sources de scripts/styles/connexions |
- **CSP — le `'unsafe-inline'` dans `script-src`** : nécessaire en **dev** à cause des scripts inline injectés par le HMR de Vite. En prod (`npm run build`, tout bundlé en fichiers externes) on pourrait le retirer.
- **CSP — `connect-src 'self' wss://localhost wss://localhost:5173`** : autorise les WebSockets.
- **Proxy WebSocket** (`location /ws/`) : `proxy_http_version 1.1` + `proxy_set_header Upgrade $http_upgrade` + `Connection "upgrade"` → c'est ce qui réalise le passage HTTP → WebSocket. Le `location /` (front) a les mêmes headers car le **HMR de Vite** passe aussi par WS.
- **`proxy_set_header X-Forwarded-For $remote_addr`** : on **écrase** la valeur envoyée par le client (sinon le throttling DRF est contournable en falsifiant l'en-tête). `$remote_addr` = vraie IP.

### 2.4 Dockerfiles
- `backend/Dockerfile` : `python:3.12-slim`, installe `postgresql-client`, `pip install -r requirements.txt`, `CMD daphne -b 0.0.0.0 -p 8000 app.asgi:application`.
- `frontend/Dockerfile` : `node:20-alpine`, `npm ci`, `CMD npm run dev` (Vite). En prod : `npm run build` → statiques.
- `nginx/Dockerfile` : nginx:alpine + openssl (cert).
- `backup/Dockerfile` + `backup.sh` : `cron` qui lance `pg_dump` chaque nuit à 2h → `/backups`. (Module DevOps « backups ».)

### 2.5 Environnement & secrets
- `.env` (gitignoré) vs `.env.example` : creds Postgres, `DJANGO_SECRET_KEY`, OAuth 42, config cookies JWT, Redis, `BDE_PASSWORD`.
- Lu via `python-decouple` → `config('VAR', default=...)` dans `settings.py`.

---

## 3. 🟢 Frontend (React + Vite)

### 3.1 Squelette
| Fichier | Rôle |
|---|---|
| `src/main.jsx` | point d'entrée : monte `<App/>`, charge i18n + styles globaux |
| `src/App.jsx` | arbre de **Providers** (Auth → Notif → Bets → Queue) + **routing** React Router ; `PrivateRoute` protège les pages (redirige `/login` si pas de `user`) |
| `vite.config.js` | serveur dev (port 5173, host 0.0.0.0), proxy `/api` et `/ws`, `allowedHosts` |
| `eslint.config.js` | norme imposée (React + hooks) |

### 3.2 État global = Contexts
- `context/AuthContext.jsx` — utilisateur courant, login/logout, refresh. Hook `useAuth()`.
- `context/QueueContext.jsx` — **branché sur `ws/queue/`** : file d'attente live, parties, invitations. **Pont avec ma partie WebSocket.**
- `context/BetsContext.jsx` — branché sur `ws/bets/` : marchés/cotes live.
- `context/NotifContext.jsx` — notifications.

### 3.3 Hook WebSocket — `hooks/useWebSocket.js` (à connaître par cœur)
- **URL absolue auto** : `wss:` si page en `https:`, sinon `ws:` (`buildAbsoluteUrl`).
- **Reconnexion auto** avec **backoff exponentiel** (1s → max 30s).
- **Reconnexion immédiate** sur `online` / `focus` / `visibilitychange` (sinon une invite reçue hors-ligne n'arriverait qu'au prochain backoff).
- **`onMessageRef` (ref, pas le state `data`)** : pour ne perdre **aucun** message arrivé en rafale. Un state unique serait écrasé par le batching React (ex. la salve `queue_state` + `invite_received` à la reconnexion). → point technique fort.

### 3.4 Services & pages
- `services/api.js` :
  - `authFetch()` : fetch **same-origin** (cookies JWT envoyés) avec **refresh auto sur 401**, dédup du refresh via `refreshPromise`.
  - `matchToRow()` : formatage d'un match API → ligne affichable (scores, victoire/défaite, delta ELO).
  - `apiLogin / apiRegister / apiRefresh`.
- Pages : `Accueil`, `Planning` (file d'attente, ma zone), `Paris`, `Tournois`, `Classement`, `Profil`, `Admin`, `Status` (page de health), `Login`/`Register`/`LoginSuccess`, `Ticket`, `Parametres`.
- **i18n** : `i18n/index.js` + locales `fr / en / es / he`. Le `he` (hébreu) = **RTL** (module accessibilité). Sélecteur : `LanguageSwitcher.jsx`.

---

## 4. 🟢 WebSockets / Temps réel (ma partie la plus technique)

Architecture en **mixins** autour d'un état mémoire partagé.

### 4.1 L'entrée
- `app/asgi.py` — `ProtocolTypeRouter` : `http` → Django, `websocket` → `JWTAuthMiddleware(URLRouter(...))`.
- `realtime/middleware.py` — **auth WS** : lit le JWT depuis le query param `?token=` **ou** le cookie `access_token` → peuple `scope["user"]`. Gère aussi les invités (`ws_username`).
- `realtime/routing.py` — 2 routes : `ws/queue/` → `QueueConsumer`, `ws/bets/` → `BetConsumer`.

### 4.2 État partagé — `realtime/state.py` (souvent challengé)
Structures : `queue`, `games`, `invites`, `win_invites`, `online_users`, `pending_invites`, `completed_game_ids`.
- **Règle d'or** : toujours accéder via `state.queue` (jamais `from state import queue`), sinon une réassignation n'est pas vue par les autres mixins (piège des globals Python).
- **Hypothèse** : *un seul process Daphne* → état mémoire cohérent. **Redis ne sert qu'à diffuser** entre clients (channel layer), pas à stocker cet état.
- **Limite assumée** : ne scale pas en multi-process (à dire honnêtement si on demande).

### 4.3 Consumer file d'attente — `consumers/queue.py`
- `connect / disconnect / receive` + table `ACTIONS` : un message front `{"action": "join"}` → méthode `_on_join`.
- **Cycle de vie d'une partie** : `join → game_open → score_update → game_end`.
- **Invitations** : directes + « take-the-winner » (le gagnant enchaîne). Registre serveur (`state.invites`, `state.win_invites`) → le créneau s'active même si l'invitant est hors-ligne.
- **Livraison différée hors-ligne** : `pending_invites` + `_deliver_pending` (notifs one-shot consommées vs invitations gardées jusqu'à réponse).
- `_cascade_cancel_takewins` : annulation en chaîne des matchs « qui prend le gagnant » dépendants.
- **Mixins** :
  - `consumers/_queue_serialize.py` — construit le snapshot : fusionne **file mémoire** + `QueueEntry` **en base** + score live, puis `_broadcast_queue` (sérialise **une fois** et diffuse → pas 1 requête DB par client).
  - `consumers/_queue_handlers.py` — traduit les events internes `*_msg` en JSON envoyé au navigateur (le "contrat" lu par le front). Aucun état ici.
  - `consumers/_queue_bets.py` — **pont paris** : crée/ferme la `Reservation IN_PROGRESS` (fenêtre de paris), pousse les cotes vers le groupe `bets`. Accès DB isolés en `@database_sync_to_async`.

### 4.4 Consumer paris — `consumers/bets.py`
- **Lecture seule** : diffuse les marchés (cotes/pools). La **pose de pari passe par l'API REST** `/api/bets/`, pas par le WS.
- Messages : `bets_state` (snapshot connexion), `market_update`, `market_closed`.

**Scénario type d'éval** — « parie sur un navigateur, montre la cote bouger sur l'autre » :
`POST /api/bets/` → `bets/services.py` (transaction atomique sur le wallet) → `group_send("bets", market_update_msg)` → tous les clients WS reçoivent `market_update`.

---

## 5. 🔵 Backend — vue d'ensemble

### 5.1 Noyau Django
- `app/settings.py` :
  - **DRF** : auth par cookie JWT (`CookieJWTAuthentication`), permission `IsAuthenticated` par défaut, pagination (20/page), **throttling** (`anon 100/h`, `user 1000/h`, `public_api 200/h`).
  - **SIMPLE_JWT** : access 1 jour, refresh 30 jours, rotation + (blacklist non installée).
  - **CHANNEL_LAYERS** : `channels_redis` (Redis).
  - **CACHES** : Redis db 1 (cache du token 42).
  - CORS (`CORS_ALLOW_CREDENTIALS=True`), OAuth 42, email.
- `app/urls.py` — carte des endpoints (qui répond à quoi).
- `app/health.py` — `/health` teste Postgres + Redis (module DevOps health check, affiché par la page `Status.jsx`).

### 5.2 Les apps (qui fait quoi + le lien clé)
| App | Rôle | Lien clé |
|---|---|---|
| `users/` | auth email/mdp + **OAuth 42** + **2FA TOTP** + rôles/permissions + **RGPD** | `AUTH_USER_MODEL`, cookies JWT |
| `matches/` | enregistrement matchs, **ELO** (`elo.py`), classement (`ranking_service.py`) | écrit `matches`, met à jour ELO |
| `planning/` | `Reservation` + `QueueEntry` (file persistée) | **lu par mes consumers WS** |
| `seasons/` | saisons (reset 3 mois, récompenses) | |
| `bets/` | paris + wallet : cotes (`odds.py`), logique (`services.py`), push WS (`realtime.py`) | **transactions atomiques** + push groupe `bets` |
| `tournaments/` | tournois, brackets, équipes | crée des `QueueEntry` |
| `organizations/` | module organization system | |
| `public_api/` | API publique : clé d'accès (`authentication.py`), rate limiting, 5+ endpoints | |
| `performance/` | table `stats` agrégées (dashboard analytics) | |

### 5.3 Point d'archi : `managed = False` + `init.sql`
Tous les modèles : `managed = False` + `db_table` explicite, **aucune migration**.
→ Source de vérité du schéma = `postgres/init.sql`. Django ne fait que mapper. (cf. §0.2)

---

## 6. 🔵 Base de données — `postgres/init.sql`

### 6.1 Tables principales (UUID en PK partout)
- **`users`** (centre) : `username` (max 8), email, password (hashé), `role` (CHECK), 2FA (`is_2fa_enabled`, `totp_secret`), `oauth_42_id`, `avatar_url`, `gdpr_deleted`, `wallet_tokens` (déf. 10000), `elo_solo`/`elo_team` (déf. 1000).
- **`stats`** : agrégats par user (matchs, wins, gamelles, demis, ELO, stats de paris).
- **`seasons`** : nom, dates, statut (UPCOMING/ACTIVE/FINISHED), `rewards_distributed`.
- **`matches`** : player1/2 (+ teammates), scores, gamelles, demis, **ELO before/after** (solo & team), `season_id`, `match_type` (SOLO/TEAM/FUN), `status`.
- **`rankings`** + **`ranking_history`** : classement par (user, season, mode, scope) + historique des deltas.
- **`reservations`** : fenêtre de jeu/paris (`IN_PROGRESS`/`DONE`/`CANCELLED`), 4 joueurs, `match_id`.
- **`queue`** : file d'attente (`WAITING`/...), 4 joueurs, `joined_at`.
- **`wallet_transactions`** : grand livre (`bet`/`win`/`deposit`/`refund`), montant, `reference_id`.
- **`bets`** : user, reservation, montant (>0), `predicted_winner`, `result`, `payout`, `odds` (≥1.00).
- **`tournaments`** → **`tournament_registrations`** → **`tournament_teams`** → **`tournament_matches`** (bracket : round, position, team1/2, winner, score, `queue_entry_id`).

### 6.2 Triggers PL/pgSQL (le correcteur peut demander)
- `check_no_self_bet` — **anti-triche** : interdit de parier sur un match où l'on joue.
- `check_fun_not_ranked` — un match FUN ne peut pas être classé.
- `update_updated_at` — met à jour `updated_at` sur les `tournament_matches`.

### 6.3 Index notables
`rankings(scope, mode, score DESC)`, `ranking_history(user_id, recorded_at DESC)`, `queue(status, joined_at)`, `reservations(status)`, `bets(match_id)`, `users(oauth_42_id)`, brackets de tournoi.

---

## 7. 🔵 Auth transverse (touche mon front)

- **JWT en cookies HttpOnly** : `users/authentication.py` (`CookieJWTAuthentication`) lit le token dans le cookie si pas de header `Bearer`. Côté front, `api.js` envoie `credentials: 'same-origin'` + refresh auto sur 401.
- **WS auth** : `realtime/middleware.py` — token par `?token=` OU cookie.
- **Mots de passe** : hashés + salés (Django `set_password` + validators).
- `JWT_COOKIE_SECURE`, `JWT_COOKIE_SAMESITE`, `CSRF_TRUSTED_ORIGINS`.

---

## 8. Ordre de révision conseillé

1. **Réciter le trajet d'une requête** (§1) à voix haute.
2. **Ma config** (§2) : nginx + compose, être imbattable (headers, same-origin, réseaux, volumes).
3. **Mes WebSockets** (§4) : dérouler `join → game_open → score → game_end` + un cycle d'invitation « take-the-winner ».
4. **Mon front** (§3) : Providers + `useWebSocket` (refs, backoff, reconnexion) + `authFetch`.
5. **Vue d'ensemble back/DB/auth** (§5-6-7) : niveau « j'explique le rôle et les liens ».
6. **Régler le §0** : pages Privacy/Terms, secret email, nettoyer `entrypoint.sh`/`admin`.

---

## 9. Questions pièges probables (entraîne-toi à répondre)

- *Pourquoi same-origin et pas du CORS classique ?* → tout via nginx sur un seul domaine → cookies envoyés, pas de pré-flight, surface réduite.
- *Comment le HTTP devient-il du WebSocket ?* → header `Upgrade` + `Connection: upgrade` proxifiés par nginx, `proxy_http_version 1.1`.
- *Daphne sert HTTP et WS en même temps ?* → oui, serveur **ASGI** ; `ProtocolTypeRouter` route selon le protocole.
- *À quoi sert Redis ici ?* → channel layer pour diffuser les messages WS entre connexions + cache du token OAuth 42.
- *Où sont stockées vos données de file d'attente ?* → état **live en mémoire** (`state.py`) + entrées **persistées** (`QueueEntry`) fusionnées au snapshot.
- *Pourquoi `managed = False` et aucune migration ?* → règle projet ; schéma maîtrisé en SQL pur (`init.sql`) avec triggers/contraintes.
- *Comment empêchez-vous de parier sur soi-même ?* → trigger SQL `check_no_self_bet` (défense côté DB, en plus du back).
- *Que se passe-t-il si un joueur se déconnecte en plein match ?* → le slot/partie active est conservé, les notifs sont mises en file (`pending_invites`) et re-livrées à la reconnexion.
- *CSP `unsafe-inline`, c'est pas dangereux ?* → nécessaire seulement en dev (HMR Vite) ; retirable en prod après build.
