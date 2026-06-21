from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError, AuthenticationFailed

# Paths d'auth où on ne bloque PAS les bannis (ces vues gèrent le ban elles-mêmes)
_AUTH_SKIP_BAN = (
    '/api/auth/login/',
    '/api/auth/register/',
    '/api/auth/oauth/42/login/',
    '/api/auth/oauth/42/callback/',
    '/api/auth/token/refresh/',
    '/api/auth/logout/',
    '/api/auth/ticket/',
    '/api/admin/',
)


def _raise_banned(user):
    """Lève AuthenticationFailed avec les infos de ban dans le detail."""
    ban = user.ban_info() or {}
    raise AuthenticationFailed({
        'detail': 'User is banned',
        'ban': ban,
    })


def _skip_ban_check(request):
    """Retourne True si le path est un endpoint d'auth/admin qui gère le ban lui-même."""
    path = request.path
    return any(path.startswith(p) for p in _AUTH_SKIP_BAN)


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header:
            try:
                result = super().authenticate(request)
                if result:
                    user, token = result
                    if user.is_banned and not _skip_ban_check(request):
                        _raise_banned(user)
                    return result
            except (InvalidToken, TokenError, AuthenticationFailed):
                pass
        if header:
            try:
                result = super().authenticate(request)
                if result:
                    user, token = result
                    if user.is_banned and not _skip_ban_check(request):
                        _raise_banned(user)
                    return result
            except (InvalidToken, TokenError, AuthenticationFailed):
                pass

        raw_token = request.COOKIES.get(settings.JWT_ACCESS_COOKIE_NAME)
        if not raw_token:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
            user = self.get_user(validated_token)
        except (InvalidToken, TokenError, AuthenticationFailed):
            user = self.get_user(validated_token)
        except (InvalidToken, TokenError, AuthenticationFailed):
            return None

        if user.is_banned and not _skip_ban_check(request):
            _raise_banned(user)

        return user, validated_token
        if user.is_banned and not _skip_ban_check(request):
            _raise_banned(user)

        return user, validated_token
