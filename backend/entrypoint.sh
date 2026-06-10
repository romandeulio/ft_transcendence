#!/bin/sh

set -e

echo "Waiting for PostgreSQL..."

while ! pg_isready -h postgresql -p 5432; do
    sleep 1
done

echo "PostgreSQL is ready"

python manage.py migrate --noinput

exec "$@"