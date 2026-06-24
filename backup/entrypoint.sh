#!/bin/bash
# Cron runs jobs with an empty environment, so it never sees the POSTGRES_*
# variables injected via env_file. We persist them to a file at container
# startup; backup.sh sources this file so the nightly cron job has DB creds.
printenv | grep -E '^(POSTGRES_|PG)' > /etc/backup.env

exec cron -f
