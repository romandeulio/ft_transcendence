#!/bin/bash

DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="backup_${DATE}.sql"

mkdir -p /backups
export PGPASSWORD=$POSTGRES_PASSWORD
pg_dump -h postgresql -U $POSTGRES_USER $POSTGRES_DB > /backups/$FILENAME

echo "Backup done : $FILENAME"