from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)

        raw_token = request.COOKIES.get(settings.JWT_ACCESS_COOKIE_NAME)
        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        try:
            return self.get_user(validated_token), validated_token
        except AuthenticationFailed:
            # Token structurally valid but user no longer exists (e.g. after DB wipe).
            # Return None so AllowAny views stay accessible with stale cookies.
            return None
