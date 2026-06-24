*This project has been created as part of the 42 curriculum by cprot, ltcherep, tvandoor, rodeulio, scavalli.*

---

# ft_transcendence — Foosball Management Platform

A full-stack web application for managing foosball (babyfoot) at École 42. The platform centralizes everything around the foosball tables: real-time table availability, virtual betting, seasonal ELO rankings, and tournament organization — all in one place, for all players on campus.

---

## Table of Contents

1. [Description](#description)
2. [Instructions](#instructions)
3. [Team Information](#team-information)
4. [Project Management](#project-management)
5. [Technical Stack](#technical-stack)
6. [Architecture](#architecture)
7. [Database Schema](#database-schema)
8. [Features List](#features-list)
9. [Modules](#modules)
10. [Individual Contributions](#individual-contributions)
11. [Resources](#resources)

---

## Description

**Project name:** Babyfoot42

**ft_transcendence** is the final project of the 42 Common Core, built by a team of 5 over several weeks. It is a multi-user web application that centralizes everything around the foosball tables at École 42: table availability, virtual betting, competitive seasonal rankings, and BDE-organized tournaments — all in one real-time platform accessible from any browser.

The application is built around four core pillars:

- **Planning** — See in real-time who is playing, reserve a time slot, and join a waiting queue. The queue is visible to all connected users and updates live.
- **Betting** — Bet virtual tokens on ongoing matches. Each user has a personal wallet, with a full transaction history. Bets close automatically when a match starts, and winnings are distributed proportionally.
- **Seasonal Rankings** — An ELO-based ranking system. Admins decide when a season starts and ends; closing a season triggers an ELO reset and distributes token rewards to the top players. Past season histories are preserved and browsable.
- **Tournaments** — The BDE (student association) can organize foosball tournaments with automatic time slot reservation, bracket generation, and live result tracking.

**Key technical features:**
- Real-time updates via WebSockets (live queue, live ranking, instant notifications)
- Full authentication system: email/password + OAuth 42 + 2FA (OTP)
- Advanced role system: admin, user, bde
- Public API with API key authentication and rate limiting
- Full internationalization: French, English, Spanish, Hebrew (with RTL layout)
- Deployed in Docker containers, accessible via HTTPS on a single command

---

## Instructions

### Prerequisites

- **Docker** 24+ and **Docker Compose v2** (`docker compose` plugin)
- **`make`**
- A **`.env`** file filled from `.env.example` (see configuration below)

> All runtime dependencies (Python 3.12, Node 20, PostgreSQL 16, Redis 7, Nginx) are handled inside Docker — nothing to install locally.

### Configuration

```bash
cp .env.example .env
```

Required variables to fill in `.env`:

| Variable | Description |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials |
| `DJANGO_SECRET_KEY` | Generate with the command in `.env.example` |
| `DEBUG` | `True` for dev, `False` for production |
| `ALLOWED_HOSTS` | e.g. `localhost,127.0.0.1` |
| `SITE_URL` | e.g. `https://localhost` |
| `REDIS_HOST` / `REDIS_PORT` | Default: `redis` / `6379` |
| `CORS_ALLOWED_ORIGINS` | e.g. `https://localhost` |
| `OAUTH_42_CLIENT_ID` / `OAUTH_42_CLIENT_SECRET` / `OAUTH_42_REDIRECT_URI` | 42 OAuth app credentials |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | Admin dashboard credentials |

> `.env` is gitignored — never commit it.

### Run

**1. Clone**

```bash
git clone <repo-url> ft_transcendence && cd ft_transcendence
```

**2. Configure** `.env` (see above)

**3. Start**

```bash
make
# equivalent to: docker compose up --build -d
```

The application is available at **https://localhost** (port 443).  
Accept the self-signed certificate in your browser on first visit.

**4. Useful Makefile commands**

```bash
make up        # Build and start all containers
make down      # Stop containers
make restart   # Stop then start
make clean     # Stop + remove containers, networks, volumes
make fclean    # Full clean (images included)
make re        # Full rebuild from scratch
make logs      # Stream logs
make ps        # Container status
make backup    # Trigger a manual database backup
make seed      # Seed test users
```

**5. Accessing services**

| Service | URL / Command |
|---|---|
| Frontend | https://localhost |
| API | https://localhost/api/ |
| WebSocket | wss://localhost/ws/ |
| Status page | https://localhost/status |
| Admin dashboard | https://localhost/api/admin/ |
| Backend shell | `make exec-backend` |
| Database shell | `make exec-db` |

### Browser Compatibility

Tested and supported on: **Google Chrome** (primary), Firefox, Safari.  
No browser console errors or warnings in production mode.

---

## Team Information

| Member | 42 Login | Role(s) | Responsibilities |
|---|---|---|---|
| Coraline | `cprot` | PM / Scrum Master, DevOps | Organized sprints and team coordination; designed and maintained the full Docker/Nginx infrastructure; implemented i18n, RTL, Privacy Policy and Terms of Service page, documentation, tests QA, help frontend. |
| Léa | `ltcherep` | Product Owner, Frontend | Defined frontend product vision; developed the core React interfaces (ranking, profile, betting, admin); built the design system (22+ components) and analytics dashboard. |
| Thaïs | `tvandoor` | Tech Lead, Database | Defined backend product vision; designed the full DB schema; implemented authentication (email/password, OAuth 42, 2FA), advanced permissions, and GDPR compliance. |
| Roman | `rodeulio` | Fullstack Developer (Real-time) | Implemented all WebSocket consumers (live queue, notifications, ranking); developed the full betting system backend (bets, wallet, transactions). |
| Sydney | `scavalli` | Backend Developer, API | Implemented match logic and ELO calculation, seasons, planning, tournaments, and the public API with key authentication and rate limiting. |

---

## Project Management

### Organization

- **Sprint cadence**: weekly team syncs to review progress and unblock issues
- **Work breakdown**: features were divided by domain (auth, real-time, planning, betting, etc.) and assigned to members based on their role
- **Code reviews**: each significant feature was reviewed by at least one other team member before merge

### Tools

- **Version control**: Git with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, etc.)
- **Task tracking**: shared document with a feature backlog and status
- **Communication**: Discord (daily async, weekly voice sync)

### Conventions

- All frontend API calls use relative URLs (e.g., `fetch("/api/matches/")`) — never absolute `localhost:8000` URLs
- Linting enforced: ESLint (frontend), flake8 (backend)
- `.env` never committed; `.env.example` always kept up to date

---

## Technical Stack

| Layer | Technology | Linter / Convention |
|---|---|---|
| Frontend | React (Vite) | ESLint + Prettier |
| Backend | Django + Django Channels | flake8 |
| Database | PostgreSQL | — |
| Cache / WS broker | Redis | — |
| Reverse proxy | Nginx | — |
| Containerization | Docker + Docker Compose | — |
| Commits | Conventional Commits | — |

### Justification of Key Choices

- **React**: component-based architecture suited for a real-time multi-view app; excellent ecosystem for state management and i18n.
- **Django**: batteries-included Python framework with a robust ORM, built-in admin, and Django Channels for WebSocket support.
- **PostgreSQL**: relational model fits our data well (users, matches, bets, seasons, tournaments all have clear foreign-key relationships). Reliable, transactional, and mature.
- **Redis**: required by Django Channels as a channel layer for WebSocket message brokering. Also provides fast in-memory caching.
- **Nginx**: handles HTTPS termination, security headers, CORS, and routes traffic to the correct service (frontend on `/`, API on `/api/`, WebSockets on `/ws/`). All traffic is same-origin from the browser's perspective.

---

## Architecture

```
Browser (https://localhost)
         |
         | HTTPS port 443
         v
   Nginx — reverse proxy
   (HTTPS, security headers, CORS, routing)
         |
    _____|_____________________
   |                           |
   v                           v
Frontend — React/Vite    Backend — Django
(port 5173, internal)    (port 8000, internal)
                         REST API + WebSockets
                               |
                    ___________|___________
                   |                       |
                   v                       v
              PostgreSQL               Redis
              (database)         (WebSocket broker)
```

**Golden rule**: the frontend always uses relative URLs. `fetch("/api/matches/")` ✓ — never `fetch("http://localhost:8000/...")` ✗.

### Security

- HTTPS only — port 80 is not exposed
- TLS 1.2 / 1.3 with self-signed certificate
- 6 Nginx security headers: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`
- Strict CORS: no cross-origin requests allowed
- Passwords hashed and salted (Django's PBKDF2)
- JWT tokens stored in secure, HttpOnly cookies
- All user input validated on both frontend and backend

---

## Database Schema

### Tables

| Table | Description | Key Relations |
|---|---|---|
| `users` | Comptes utilisateurs (email, hash mdp, OAuth 42, avatar, wallet, rôle, ban, GDPR) | — |
| `stats` | Statistiques globales par utilisateur (ELO solo/team, wins, losses, gamelles, paris) | → `users` |
| `seasons` | Saisons (nom, dates, statut : UPCOMING/ACTIVE/FINISHED, flag rewards) | — |
| `matches` | Matchs (type : SOLO/TEAM/FUN, classé, statut, scores, ELO avant/après pour les 4 joueurs) | → `users`, `seasons` |
| `season_stats` | Snapshot des stats par saison (ELO, wins, losses en fin de saison) | → `users`, `seasons` |
| `season_rewards` | Récompenses en tokens distribuées en fin de saison | → `users`, `seasons` |
| `rankings` | Classement live (ELO, position, scope, mode SOLO/TEAM) | → `users`, `seasons` |
| `ranking_history` | Historique des variations de classement match par match | → `users`, `seasons`, `matches` |
| `reservations` | Réservations de table (type, statut, joueurs, match lié) | → `users`, `matches` |
| `queue` | File d'attente en temps réel (type, statut, joueurs, timestamp) | → `users` |
| `bets` | Paris individuels (montant, gagnant prédit, résultat, payout, cotes) | → `users`, `matches`, `reservations` |
| `wallet_transactions` | Journal complet des transactions (type : bet/win/deposit/refund, montant) | → `users` |
| `tournaments` | Métadonnées des tournois (nom, team_size, dates, statut, prize) | → `users` (créateur) |
| `tournament_registrations` | Inscriptions joueurs/équipes à un tournoi | → `users`, `tournaments` |
| `tournament_teams` | Équipes constituées après lancement du tournoi (seed, joueurs) | → `tournaments`, `tournament_registrations` |
| `tournament_matches` | Matchs du bracket (round, position, scores, winner, queue entry) | → `tournaments`, `tournament_teams`, `queue` |
| `achievements` | Catalogue des succès disponibles (catégorie, icône, ordre) | — |
| `user_achievements` | Succès débloqués par utilisateur (avec timestamp) | → `users`, `achievements` |
| `api_keys` | Clés API (rate limit, accès complet, expiration, owner) | → `users` |

### Key Relations

```
users ──< stats (1:1)
users ──< matches (player1, player2, teammates)
users ──< bets ──> matches
users ──< wallet_transactions
users ──< reservations ──> matches
users ──< queue
users ──< user_achievements ──> achievements

seasons ──< matches
seasons ──< season_stats ──> users
seasons ──< season_rewards ──> users
seasons ──< rankings ──> users
seasons ──< ranking_history ──> users

tournaments ──< tournament_registrations ──> users
tournaments ──< tournament_teams ──< tournament_matches
queue ──> tournament_matches
```

---

## Features List

### Authentication & Users
| Feature | Description | Author(s) |
|---|---|---|
| Email / password registration | Secure sign-up with hashed + salted password | Thaïs |
| Login / logout | JWT-based session, HttpOnly cookie | Thaïs |
| OAuth 42 | "Login with 42" button, auto account creation on first login | Thaïs |
| 2FA (OTP) | 6-digit code via email, activatable in settings | Sydney |
| Profile editing | Change username, avatar upload, display stats | Léa |
| Friends system | Add/remove friends, see online status | Léa |
| GDPR export | Export all personal data as JSON or CSV | Thaïs |
| GDPR delete | Full account anonymization on request | Thaïs |

### Planning
| Feature | Description | Author(s) |
|---|---|---|
| Live table view | See in real time who is currently playing | Roman (WS) + Sydney (backend) |
| Slot reservation | Reserve a time slot on the foosball table | Sydney |
| Waiting queue | Join the queue; position updates live for all users | Roman (WS) + Sydney (backend) + Léa (frontend) |

### Betting
| Feature | Description | Author(s) |
|---|---|---|
| Place a bet | Bet virtual tokens on an ongoing match | Roman |
| Bet closing | Bets close automatically when a match starts | Roman |
| Winnings distribution | Proportional payout to winners | Roman |
| Anti-cheat | Players cannot bet on their own match | Roman |
| Refund | Automatic refund if a match is cancelled | Roman |
| Wallet | Personal token wallet, initial balance on registration | Roman |
| Transaction history | Full log of all credits/debits | Roman |

### Rankings & Seasons
| Feature | Description | Author(s) |
|---|---|---|
| ELO ranking | Live ELO leaderboard (solo + team), updates after each validated match | Sydney |
| Seasonal reset | Admin closes a season, triggering ELO reset and reward distribution | Sydney |
| Season rewards | Top players receive token rewards at season end | Sydney |
| Season history | Browse rankings and stats from past seasons | Sydney + Léa |
| Performance charts | ELO curve over time, win/loss bar charts, comparison between players | Léa + Sydney |

### Tournaments
| Feature | Description | Author(s) |
|---|---|---|
| Create tournament | BDE members can create a tournament with name, format, and participants | Thais |
| Bracket generation | Automatic bracket based on participants | Thais |
| Result tracking | Record match results, advance brackets | Thais + Léa (frontend) |
| Tournament page | View bracket, standings, and schedule | Thais + Léa |

### Admin
| Feature | Description | Author(s) |
|---|---|---|
| User management | CRUD on users, ban/unban | Thaïs |
| ELO, Bets | Manage ELO and bets of users | Sydney |
| Season management | Create/close seasons, trigger reward distribution | Sydney |
| Admin dashboard | Overview of platform activity | Léa + Sydney |

### Search & Discovery
| Feature | Description | Author(s) |
|---|---|---|
| User search | Search players by username | Léa |
| Match filters | Filter match history by date, season, result, type | Léa |
| Leaderboard filters | Sort ranking by ELO, wins, win rate | Léa |
| Bet filters | Filter bets by status (pending, won, lost) | Léa |
| Pagination | All lists paginated | Léa |

### Public API
| Feature | Description | Author(s) |
|---|---|---|
| API key auth | Access controlled via `X-API-Key` header | Sydney |
| Rate limiting | Per-key request throttling | Sydney |
| `GET /api/public/ranking/` | Retrieve current leaderboard | Sydney |
| `GET /api/public/matches/` | List matches | Sydney |
| `POST /api/public/matches/` | Create a match | Sydney |
| `PUT /api/public/matches/:id/` | Update a match | Sydney |
| `DELETE /api/public/matches/:id/` | Delete a match | Sydney |

### Infrastructure & DevOps
| Feature | Description | Author(s) |
|---|---|---|
| Docker Compose | All services containerized, launched with one command | Coraline |
| HTTPS | Nginx with self-signed TLS 1.2/1.3 certificate | Coraline |
| Security headers | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-Content-Type-Options | Coraline |
| Health endpoint | `GET /health` checks PostgreSQL + Redis status | Coraline |
| Status page | `/status` page showing state of each service | Coraline |
| Automated backups | `pg_dump` via cron at 2am, stored in Docker volume `backup_data` | Coraline |

### Accessibility & i18n
| Feature | Description | Author(s) |
|---|---|---|
| Multilingual UI | 4 languages: French, English, Spanish, Hebrew | Coraline |
| Language switcher | Header toggle, preference persisted | Coraline |
| RTL layout | Full mirror layout for Hebrew (sidebar, text alignment, icons) | Coraline |
| Browser support | Tested on Chrome (primary), Firefox, Safari | All |

### Design System
| Feature | Description | Author(s) |
|---|---|---|
| Reusable components | 22+ components: Modal, Card, Avatar, Toggle, ProgressBar, Pill, StatCard, BetButton, AvatarEditor, LanguageSwitcher, etc. | Léa |
| Consistent palette | Unified color system, typography, and icons | Léa |

### Legal
| Feature | Description | Author(s) |
|---|---|---|
| Privacy Policy | Full page, accessible from footer | Coraline |
| Terms of Service | Full page, accessible from footer | Coraline |

---

## Modules

Total: **28 points** (minimum required: 14)

### Web — 11 pts

| Module | Type | Pts | Implementation |
|---|---|---|---|
| Framework frontend (React) + backend (Django) | Major | 2 | React handles the entire UI (ranking, betting, planning, profiles). Django handles all REST API endpoints and business logic. Communication via REST + WebSockets. |
| ORM (Django ORM) | Minor | 1 | All database interactions go through Django's ORM. No raw SQL in application code. Models: User, Match, Bet, Wallet, Season, Reservation, Tournament. |
| Real-time WebSockets | Major | 2 | Django Channels + Redis channel layer. Live queue updates, real-time notifications, live ranking refresh after each match. Graceful handling of connection/disconnection. |
| Notification system | Minor | 1 | Real-time in-app notifications via WebSocket: game invitation received (`invite_received`), invitation accepted/declined (`invite_response`), invitation cancelled (`cancel_invite`), win claim sent to opponent (`win_invite`), win claim declined (`win_claim_declined`), match cancelled (`match_cancelled`), opponent left (`p2_left`), game ended with result (`game_ended`), betting market updated (`market_update`), betting market closed when game starts (`market_closed`), duplicate session detected (`session_superseded`). Undelivered notifications are queued and replayed on reconnect. |
| Real-time collaborative features | Minor | 1 | Shared live match state edited collaboratively over WebSocket: both players act on the same `game_id` session (`state.games[game_id]`), sending `score_update` actions that mutate a shared score and rebroadcast `game_state` to every connected client in real time. Includes collaborative game flow events — invitations (`invite_received`/`invite_response`), win claims requiring opponent confirmation (`win_invite`/`win_claim_declined`), and synchronized game end (`game_ended`). Built on Django Channels + Redis with a shared in-memory game state. |
| Advanced search | Minor | 1 | User search with filters integrated in the Profile page friends panel: search players by username, see real-time online/offline status, add or remove friends, paginated results. |
| Public API | Major | 2 | Documented API secured with `X-API-Key` header and rate limiting. 5 endpoints covering GET/POST/PUT/DELETE on matches and GET on rankings. |
| Custom design system | Minor | 1 | 17+ reusable components with a coherent color palette, typography, and icon set. Minimum 10 reusable components exceeded. |

### User Management — 7 pts

| Module | Type | Pts | Implementation |
|---|---|---|---|
| Standard user management | Major | 2 | Registration and login via email/password. Profile page with editable username and avatar. Friends system with online status. Stats and match history displayed on profile. |
| OAuth 42 | Minor | 1 | "Login with 42" button redirects to the 42 intranet. On first login, an account is created automatically using the intra login and email. |
| 2FA (Two-Factor Authentication) | Minor | 1 | OTP-based 2FA (via email). Activated from user settings. On login, a 6-digit code is required after password validation. |
| Advanced permissions | Major | 2 | Three roles: **admin** (manage users, seasons, matches, dashboard), **bde** (create and manage tournaments), and **user** (play, bet, reserve). Different views and available actions per role. Admin panel with CRUD on users. |
| User activity analytics dashboard | Minor | 1 | ELO curve over time, performance history, per-season stats, multi-player comparison. Filterable by date period. Endpoints at `/api/performance/`. Visualized with `PerformanceChart` and `ComparisonBarChart` components. |

### Data & Analytics — 4 pts

| Module | Type | Pts | Implementation |
|---|---|---|---|
| Advanced analytics dashboard with data visualization | Major | 2 | Interactive graphs: ELO curve (line chart), win/loss stats (bar chart), activity by period. Real-time updates. Export to CSV/PDF. Filters by date, season, player. |
| Data export / import | Minor | 1 | Export leaderboard to CSV. Export season stats. Bulk of comparaison charts. |
| GDPR compliance | Minor | 1 | "Export my data" button → JSON or CSV (profile, matches, bets, wallet, stats). "Delete my account" button → full anonymization of personal data. |

### Accessibility & Internationalization — 3 pts

| Module | Type | Pts | Implementation |
|---|---|---|---|
| Multiple languages (FR, EN, ES, HE) | Minor | 1 | Full UI translated into 4 languages via `react-i18next`. Language switcher in the header. No hardcoded text in components. |
| Additional browser support (Firefox, Safari) | Minor | 1 | Tested and corrected on Firefox and Safari in addition to Chrome. Known browser-specific limitations documented. |
| RTL support (Hebrew) | Minor | 1 | Complete mirror layout for Hebrew: sidebar on the right, right-aligned text, reversed icons. Seamless switch between LTR and RTL. |

### DevOps — 1 pt

| Module | Type | Pts | Implementation |
|---|---|---|---|
| Health check, status page & automated backups | Minor | 1 | `GET /health` endpoint checks PostgreSQL and Redis connectivity. `/status` page displays the state of each service. `pg_dump` backup script runs nightly at 2am via cron, stored in persistent Docker volume `backup_data`. |

### Module of Choice — 2 pts

| Module | Type | Pts | Justification |
|---|---|---|---|
| Virtual betting system with wallet | Major | 2 | See below. |

**Justification for the Betting System (Custom Major Module — 2 pts)**

We chose to implement a virtual betting system as our "Module of Choice" at Major level for the following reasons:

1. **Technical complexity**: the betting system involves multiple interconnected concerns — a dynamic odds engine computing live odds from each player's Elo rating and the distribution of other players' bets, real-time WebSocket events to open/close betting windows, atomic database transactions to prevent race conditions on concurrent bets, proportional winnings calculation, anti-cheat logic (players cannot bet on their own matches), and automatic refunds on cancelled matches. The dynamic odds calculation was by far the hardest part, since odds must recalculate in real time and stay balanced as new bets come in. This required careful design across both the backend (`bets/` app, `wallet_transactions` table) and the frontend (live bet UI, wallet display).

2. **Value added to the project**: betting adds a compelling social and competitive layer. Users have a stake in every match they watch, which increases engagement. The wallet system (with tokens earned from season rewards and betting) creates an economy that ties together the Planning, Ranking, and Tournament modules.

3. **Real-time dimension**: bets are placed on *live* matches, meaning the system must coordinate tightly with WebSockets (`realtime/` consumer) to ensure betting windows open and close in sync with actual match state changes. Betting windows close automatically after five points, and bets are settled or fully refunded depending on the outcome (refund on cancelled or aborted matches).

---

## Individual Contributions

### Coraline (cprot) — PM / Scrum Master & DevOps
- Set up and maintained the entire Docker infrastructure: `docker-compose.yml` with 6 services (PostgreSQL, Redis, Django backend, React frontend, Nginx, backup)
- Configured Nginx: HTTPS (TLS 1.2/1.3), self-signed certificate, security headers, CORS, routing (`/`, `/api/`, `/ws/`)
- Integrated `react-i18next` multi-language support (FR, EN, ES, HE)
- Implemented RTL layout for Hebrew, including CSS direction and component mirroring
- Built Privacy Policy (`/privacy-policy`) and Terms of Service (`/terms-of-service`) pages with relevant content, linked from the footer
- Performed QA testing (manual validation of features across Chrome, Firefox, Safari) and wrote this README
- Help with frontend
- **Challenge**: the biggest difficulty was organizational — coordinating 5 people across parallel workstreams, keeping the backlog consistent, resolving blockers without slowing the team down, and ensuring every feature was properly tested before merge. QA on a multi-user real-time app (concurrent WebSocket sessions, live queue state, simultaneous bet resolution) required testing multiple browser sessions at once, which was time-consuming but critical to catch race conditions and edge cases.

### Léa (ltcherep) — Product Owner & Tech Lead Frontend
- Defined and prioritized the frontend product backlog
- Developed Ranking page (ELO leaderboard with filters and sorting), Profile page (stats, match history, friends), Admin dashboard, Betting/Wallet UI
- Built the analytics performance dashboard with `PerformanceChart` and `ComparisonBarChart` components
- Created the full design system: 22+ reusable components, shared color palette, typography
- **Challenge**: building a consistent design system from scratch (not using a library like Material-UI) while maintaining development velocity required upfront investment in component architecture that paid off later.

### Thaïs (tvandoor) — Product Owner & Tech Lead Backend
- Designed the full PostgreSQL schema (16 tables, all relations, constraints, indexes)
- Implemented the `users/` app: registration, login, JWT session management, OAuth 42 flow, advanced permissions
- Implemented GDPR features: data export and full anonymization
- Secured all backend endpoints: input validation, permission decorators, rate limiting on auth routes
- Wrote `postgres/init.sql` (the authoritative DB schema)
- **Challenge**: the real difficulty was the sheer volume of things to learn before writing a single line of code. JWT, HttpOnly cookies, OAuth flow, relational constraints, tournament bracket logic — none of these were familiar going in. Every feature started with a research and understanding phase, and that density of learning is what made the project so rewarding.

### Roman (rodeulio) — Fullstack Developer (Real-time)
- Implemented all WebSocket consumers in `realtime/` (Django Channels): live queue, live notifications, live ranking update broadcast
- Developed the entire `bets/` backend app: bet creation, validation, automatic closing on match start, proportional winnings distribution, anti-cheat, refund logic, wallet mutations with atomic transactions
- Developed Betting frontend page: real-time bet interface, wallet display, transaction history
- Implemented the notification system consumer
- **Challenge**: ensuring that bet resolution is atomic (no tokens lost or duplicated) when multiple users simultaneously win a bet required careful use of `select_for_update()` and Django's transaction management.

### Sydney (scavalli) — Backend Developer & API
- Implemented `matches/` app: match recording (SOLO, TEAM, FUN), ELO calculation (K-factor, expected score formula), result validation
- Developed `seasons/` app: season lifecycle (UPCOMING → ACTIVE → FINISHED), end-of-season ELO snapshot, token reward distribution to top players
- Implemented `planning/` app: time slot reservation logic, queue management (join, leave, auto-advance)
- Built `tournaments/` app: tournament creation, bracket generation, team management, result progression
- Developed `public_api/` app: 5 documented endpoints, API key model, per-key rate limiting with Django REST Framework throttling
- **Challenge**: ELO recalculation needed to be consistent and not retroactively affect past seasons. Keeping `season_stats` snapshots separate from live stats was the key architectural decision.

---

## Backup & Disaster Recovery

### Automated Backups

The backup service uses `pg_dump` to create a timestamped SQL dump, stored in the persistent Docker volume `backup_data` at `/backups/`. Backups run nightly at **2am via cron**.

```
backup_YYYYMMDD_HHMMSS.sql
```

The backup container starts only after PostgreSQL passes its health check (`condition: service_healthy`).

### List Available Backups

```bash
docker run --rm -v transcendence_backup_data:/backups alpine ls /backups/
```

### Restore From a Backup

**1. Copy the dump out of the Docker volume**

```bash
docker run --rm -v transcendence_backup_data:/backups \
  -v $(pwd):/out alpine \
  cp /backups/backup_YYYYMMDD_HHMMSS.sql /out/
```

**2. Restore into PostgreSQL**

```bash
docker exec -i transcendence_postgresql \
  psql -U $POSTGRES_USER -d $POSTGRES_DB \
  < backup_YYYYMMDD_HHMMSS.sql
```

Estimated recovery time: under **5 minutes** for a standard database.

> The `backup_data` volume persists across `docker compose down`. To wipe all data: `docker compose down -v`.

---

## Resources

### Documentation

- [Django documentation](https://docs.djangoproject.com/)
- [Django Channels documentation](https://channels.readthedocs.io/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [React documentation](https://react.dev/)
- [react-i18next documentation](https://react.i18next.com/)
- [Nginx documentation](https://nginx.org/en/docs/)
- [Docker Compose reference](https://docs.docker.com/compose/compose-file/)
- [pyotp (OTP/2FA)](https://github.com/pyauth/pyotp)
- [ELO rating system (Wikipedia)](https://en.wikipedia.org/wiki/Elo_rating_system)
- [42 OAuth API](https://api.intra.42.fr/apidoc)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [GDPR compliance checklist](https://gdpr.eu/checklist/)

### AI Usage

AI tools (primarily Claude) were used during this project as a support tool, in line with the 42 AI guidelines: each team member reflected on their problem before prompting, systematically reviewed and questioned any generated output, and sought peer review before integrating anything into the codebase.

AI was used for the following tasks:

- **Debugging support**: helping diagnose specific errors by explaining error messages and suggesting leads to investigate (e.g., WebSocket connection issues, Nginx proxy configuration) — root causes were always identified and understood by the developer before applying a fix
- **Documentation assistance**: supporting the writing of this README and the Privacy Policy / Terms of Service pages — all content was written, reviewed, and validated by the team
- **i18n support**: suggesting initial translation drafts for ES and HE locale files, reviewed and corrected by team members before use
- **Ideas and explanations**: getting technical explanations on concepts (ELO formula, OTP flow, JWT cookie flags) to better understand before implementing from scratch

Only AI-generated content that every responsible team member fully understood and could explain was kept. No code or content was copy-pasted without being read, understood, tested, and validated. All team members are able to explain their respective implementations.
