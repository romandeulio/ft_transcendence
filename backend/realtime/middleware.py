from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.conf import settings
from rest_framework_simplejwt.tokens import AccessToken
from http.cookies import SimpleCookie
from urllib.parse import parse_qs

User = get_user_model()


@database_sync_to_async
def _get_user(user_id):
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        scope["user"] = AnonymousUser()
        scope["ws_username"] = None

        query_params = parse_qs(scope["query_string"].decode())

        token = (query_params.get("token") or [None])[0]
        if not token:
            cookie_header = dict(scope.get("headers", [])).get(b"cookie", b"").decode()
            cookies = SimpleCookie(cookie_header)
            token_cookie = cookies.get(settings.JWT_ACCESS_COOKIE_NAME)
            token = token_cookie.value if token_cookie else None
        if token:
            try:
                access_token = AccessToken(token)
                scope["user"] = await _get_user(access_token["user_id"])
            except Exception as e:
                print(f"JWT auth error: {e}")

        ws_username = (query_params.get("username") or [None])[0]
        if ws_username:
            scope["ws_username"] = ws_username.strip()[:32] or None

        return await super().__call__(scope, receive, send)
