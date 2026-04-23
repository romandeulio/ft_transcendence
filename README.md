# ft_transcendence

## Team

| Member | Role |
|--------|------|
| Sydney | Backend, Public API |
| Thaïs | Auth, OAuth, 2FA |
| Léa | Frontend, Design |
| Roman | WebSockets, Betting |
| Coraline | DevOps, Search, Frontend |

---

## Stack

...

---

## Architecture

...

---

## Database Schema

...

---

## Modules

...

---

## Setup

...

---

# Backup System

Automated PostgreSQL backups are handled by a dedicated backup container that runs after PostgreSQL is confirmed healthy.

## How It Works

The backup service uses `pg_dump` to create a timestamped SQL dump of the database.

It starts only after PostgreSQL passes its healthcheck (`condition: service_healthy`), ensuring data consistency.

Dumps are stored in the persistent Docker volume `backup_data` at:

```bash
/backups/
```

## Backup File Naming

```bash
backup_YYYYMMDD_HHMMSS.sql
```

## Required Environment Variables (`.env`)

```env
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
```

Backups run automatically every night at **2am via cron**.

---

# Disaster Recovery

## List Available Backups

```bash
docker run --rm -v transcendence_backup_data:/backups alpine ls /backups/
```

## Restore From a Backup

### 1. Copy the dump out of the Docker volume

```bash
docker run --rm -v transcendence_backup_data:/backups \
  -v $(pwd):/out alpine \
  cp /backups/backup_YYYYMMDD_HHMMSS.sql /out/
```

### 2. Restore into PostgreSQL

```bash
docker exec -i transcendence_postgresql \
  psql -U $POSTGRES_USER -d $POSTGRES_DB \
  < backup_YYYYMMDD_HHMMSS.sql
```

## Estimated Recovery Time

Less than **5 minutes** for a standard database.

## Backup Storage

Stored in Docker volume:

```bash
backup_data
```

Persistent across:

```bash
docker-compose down
```

⚠️ The volume is **not** deleted by `docker-compose down`.

To intentionally wipe all data:

```bash
docker-compose down -v
```