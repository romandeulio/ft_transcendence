# ft_transcendence — Public API Documentation

## Overview

Public REST API for ft_transcendence. Allows external clients (Discord bots, TV displays, mobile apps) to interact with match and ranking data.

**Base URL:** `https://localhost/api/public/`

## Authentication

All requests require an API key passed via the `X-API-Key` header.

```
X-API-Key: your_api_key_here
```

A default full-access API key is created automatically at startup from the `PUBLIC_API_KEY` variable in `.env`. You can use it immediately after `make`.

### Key types

| Type | Access |
|------|--------|
| Read-only (`is_full_access: false`) | GET endpoints only |
| Full access (`is_full_access: true`) | GET, POST, PUT, DELETE |

### Creating an API key

API keys are managed via JWT-authenticated endpoints:

```bash
# Create a key (requires JWT auth via cookie or Authorization header)
POST /api/public/keys/
Content-Type: application/json

{"name": "My bot", "is_full_access": true}
```

The key is returned **once** in the response. Store it securely.

```bash
# List your keys
GET /api/public/keys/

# Revoke a key
PATCH /api/public/keys/<id>/revoke/
```

## Rate Limiting

Each API key is limited to **200 requests per hour** (configurable per key). When exceeded, the API returns `403 Forbidden` with a descriptive error message. The counter resets after one hour of inactivity.

---

## Endpoints

### 1. GET /api/public/ranking/

Returns the ELO ranking for the active season.

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `type` | `solo` | `solo` or `team` |
| `season` | active | Season UUID (optional) |

**Example:**

```bash
curl -H "X-API-Key: YOUR_KEY" https://localhost/api/public/ranking/?type=solo
```

**Response** `200 OK`:

```json
[
  {
    "rank": 1,
    "username": "player1",
    "elo": 1200,
    "wins": 15,
    "losses": 3,
    "avatar_url": "/media/avatars/player1.jpg"
  }
]
```

---

### 2. GET /api/public/matches/

Returns all validated matches.

**Query parameters:**

| Parameter | Description |
|-----------|-------------|
| `season` | Filter by season UUID |
| `type` | Filter by match type: `SOLO`, `TEAM`, `TWO_V_ONE` |

**Example:**

```bash
curl -H "X-API-Key: YOUR_KEY" https://localhost/api/public/matches/
```

**Response** `200 OK`:

```json
[
  {
    "id": "uuid",
    "match_type": "SOLO",
    "status": "VALIDATED",
    "is_ranked": true,
    "player1": "alice",
    "player2": "bob",
    "score_player1": 10,
    "score_player2": 7,
    "gamelles_player1": 1,
    "gamelles_player2": 0,
    "demis_player1": 0,
    "demis_player2": 1,
    "winner": "player1_side",
    "elo_solo_player1_before": 1000,
    "elo_solo_player1_after": 1015,
    "elo_solo_player2_before": 1000,
    "elo_solo_player2_after": 985,
    "season": "Season 1",
    "played_at": "2026-06-22T10:00:00+02:00"
  }
]
```

---

### 3. POST /api/public/matches/

Create a new match. Requires a **full access** API key.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_type` | string | yes | `SOLO`, `TEAM`, or `TWO_V_ONE` |
| `is_ranked` | boolean | no | Default: `true` |
| `player1` | string | yes | Username of player 1 |
| `player2` | string | yes | Username of player 2 |
| `player1_teammate` | string | no | Required for TEAM/TWO_V_ONE |
| `player2_teammate` | string | no | Required for TEAM |
| `score_player1` | integer | yes | Score of player 1 |
| `score_player2` | integer | yes | Score of player 2 |
| `gamelles_player1` | integer | no | Default: 0 |
| `gamelles_player2` | integer | no | Default: 0 |
| `demis_player1` | integer | no | Default: 0 |
| `demis_player2` | integer | no | Default: 0 |

**Example:**

```bash
curl -X POST -H "X-API-Key: YOUR_KEY" -H "Content-Type: application/json" \
  https://localhost/api/public/matches/ \
  -d '{"match_type":"SOLO","is_ranked":false,"player1":"alice","player2":"bob","score_player1":10,"score_player2":5}'
```

**Response** `201 Created`: Full match object (same format as GET).

---

### 4. PUT /api/public/matches/{id}/

Update an existing match. Requires a **full access** API key.

**URL parameter:** `id` — Match UUID

**Request body:** Any match field to update (partial update supported).

**Example:**

```bash
curl -X PUT -H "X-API-Key: YOUR_KEY" -H "Content-Type: application/json" \
  https://localhost/api/public/matches/82c51bb6-ad86-400a-aec8-0980d52cc559/ \
  -d '{"score_player1":10,"score_player2":8}'
```

**Response** `200 OK`: Updated match object.

---

### 5. DELETE /api/public/matches/{id}/

Delete a match. Requires a **full access** API key.

**URL parameter:** `id` — Match UUID

**Example:**

```bash
curl -X DELETE -H "X-API-Key: YOUR_KEY" \
  https://localhost/api/public/matches/82c51bb6-ad86-400a-aec8-0980d52cc559/
```

**Response** `204 No Content`

---

## Error Responses

| Status | Meaning |
|--------|---------|
| `400` | Bad request (invalid parameters) |
| `401` | Invalid or missing API key |
| `403` | Key revoked, expired, or rate limit exceeded |
| `404` | Resource not found |

All errors return JSON:

```json
{"detail": "Description of the error."}
```

---

## Quick Start

```bash
# 1. Log in to the site and go to Settings or use JWT to create a key
curl -X POST -H "Authorization: Bearer YOUR_JWT" -H "Content-Type: application/json" \
  https://localhost/api/public/keys/ \
  -d '{"name":"my-bot","is_full_access":true}'

# 2. Use the returned key
curl -H "X-API-Key: RETURNED_KEY" https://localhost/api/public/ranking/
```
