#!/bin/sh

set -e

echo "Waiting for PostgreSQL..."

while ! pg_isready -h postgresql -p 5432; do
    sleep 1
done

echo "PostgreSQL is ready"

python manage.py migrate --noinput

# Seed default Public API key from .env (idempotent)
if [ -n "$PUBLIC_API_KEY" ]; then
    python manage.py shell -c "
from public_api.models import APIKey
if not APIKey.objects.filter(key='$PUBLIC_API_KEY').exists():
    APIKey.objects.create(name='Default API Key', key='$PUBLIC_API_KEY', is_full_access=True, is_active=True)
    print('Public API key seeded.')
else:
    print('Public API key already exists.')
"
fi

exec "$@"
