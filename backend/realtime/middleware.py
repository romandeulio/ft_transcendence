from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from django.contrib.auth import get_user_model
from urllib.parse import parse_qs

User = get_user_model()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query_string = scope["query_string"].decode()
        
        scope["user"] = AnonymousUser()

        if query_string:
            query_params = parse_qs(query_string)
            token_list = query_params.get("token")
            token = token_list[0] if token_list else None
            
            if token:
                try:
                    access_token = AccessToken(token)
                    user = User.objects.get(id=access_token["user_id"])
                    scope["user"] = user
                except Exception as e:
                    print(f"JWT auth error: {e}")
                    pass

        return await super().__call__(scope, receive, send)