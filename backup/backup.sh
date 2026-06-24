#!/bin/bash

# Load DB credentials persisted by entrypoint.sh (needed when run from cron,
# which does not inherit the container environment). Harmless when run via
# `docker exec` (the variables are simply re-set to the same values).
[ -f /etc/backup.env ] && . /etc/backup.env

DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="backup_${DATE}.sql"

mkdir -p /backups
export PGPASSWORD=$POSTGRES_PASSWORD
pg_dump -h postgresql -U $POSTGRES_USER $POSTGRES_DB > /backups/$FILENAME

echo "Backup done : $FILENAME"
