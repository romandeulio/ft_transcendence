from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache

def health(request):
    status = {"status": "ok", "postgres": "ok", "redis": "ok"}

    # teste postgres
    try:
        connection.ensure_connection()
    except Exception:
        status["postgres"] = "error"
        status["status"] = "error"

    # teste redis
    try:
        cache.set("health", "ok", timeout=5)
    except Exception:
        status["redis"] = "error"
        status["status"] = "error"

    return JsonResponse(status)