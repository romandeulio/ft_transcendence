import requests
import os
import uuid
from urllib.parse import urlencode
from django.conf import settings

from .models import User
from .serializers import RegisterSerializer, UserSerializer

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework.parsers import MultiPartParser, FormParser
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_decode
from django.shortcuts import get_object_or_404
from django.shortcuts import redirect as django_redirect

def get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {'access_token': str(refresh.access_token), 'refresh_token': str(refresh)}
def set_auth_cookies(response, tokens):
    access_max_age = int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
    refresh_max_age = int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
    cookie_options = {
        'httponly': True,
        'secure': settings.JWT_COOKIE_SECURE,
        'samesite': settings.JWT_COOKIE_SAMESITE,
        'path': '/',
    }
    response.set_cookie(
        settings.JWT_ACCESS_COOKIE_NAME,
        tokens['access_token'],
        max_age=access_max_age,
        **cookie_options,
    )
    response.set_cookie(
        settings.JWT_REFRESH_COOKIE_NAME,
        tokens['refresh_token'],
        max_age=refresh_max_age,
        **cookie_options,
    )
    return response

def delete_auth_cookies(response):
    cookie_options = {
        'samesite': settings.JWT_COOKIE_SAMESITE,
        'path': '/',
    }
    response.delete_cookie(settings.JWT_ACCESS_COOKIE_NAME, **cookie_options)
    response.delete_cookie(settings.JWT_REFRESH_COOKIE_NAME, **cookie_options)
    return response
#register
class  RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "message": "Compte créé. Vérifiez votre email pour activer votre compte."
            },
            status=status.HTTP_201_CREATED
        )

#connexion mail/mdp
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        password = request.data.get('password')
        totp_code = request.data.get('totp_code')
        try:
            user = User.objects.get(email=email)
            if not user.is_active:
                return Response({'error': 'Account not activated'}, status=403)
        except User.DoesNotExist:
            return Response({'error': 'Bad email or password'}, status= 401)

        if not user.check_password(password):
            return Response({'error': 'Bad email or password'}, status=401)

        # Vérifier le ban
        ban = user.ban_info()
        if ban:
            return Response({'error': 'banned', 'ban': ban}, status=403)

        if user.is_2fa_enabled:
            if not totp_code:
                return Response({'requires_2fa': True}, status=200)
            if not user.verify_totp(totp_code):
                return Response({'error': 'Code 2FA invalide'}, status=401)

        response = Response({'detail': 'Login successful'})
        return set_auth_cookies(response, get_tokens(user))

class OAuth42LoginView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        # Redirige le navigateur vers la page de login 42
        query = urlencode({
            "client_id": settings.OAUTH_42_CLIENT_ID,
            "redirect_uri": settings.OAUTH_42_REDIRECT_URI,
            "response_type": "code",
        })
        url = f"https://api.intra.42.fr/oauth/authorize?{query}"
        return django_redirect(url)

# --- OAuth 42 ---
class OAuth42CallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        code = request.query_params.get('code')
        if not code:
            return django_redirect(f'{settings.SITE_URL}/login?error=no_code')

        try:
            token_res = requests.post('https://api.intra.42.fr/oauth/token', data={
                'grant_type':    'authorization_code',
                'client_id':     settings.OAUTH_42_CLIENT_ID,
                'client_secret': settings.OAUTH_42_CLIENT_SECRET,
                'code':          code,
                'redirect_uri':  settings.OAUTH_42_REDIRECT_URI,
            })
            token_res.raise_for_status()
            access_token = token_res.json().get('access_token')

            profile = requests.get('https://api.intra.42.fr/v2/me', headers={
                'Authorization': f'Bearer {access_token}'
            }).json()
            avatar_link = profile.get("image", {}).get("link")
            avatar_url = None

            if avatar_link:
                response = requests.get(avatar_link)

                if response.status_code == 200:
                    filename = f"avatars/{profile['id']}.jpg"
                    filepath = os.path.join(settings.MEDIA_ROOT, filename)

                    os.makedirs(os.path.dirname(filepath), exist_ok=True)

                    with open(filepath, "wb") as f:
                        f.write(response.content)

                    avatar_url = f"/media/{filename}"
            user, _ = User.objects.get_or_create(
                oauth_42_id=str(profile['id']),
                defaults={
                    'email':      profile.get('email', f"{profile['login']}@42.fr"),
                    'username':   profile['login'],
                    'avatar_url': avatar_url,
                    'is_active':  True,
                }
            )

            # Vérifier le ban
            ban = user.ban_info()
            if ban:
                if ban['type'] == 'permanent':
                    return django_redirect(f"{settings.SITE_URL}/banned?type=permanent")
                else:
                    return django_redirect(
                        f"{settings.SITE_URL}/banned?type=temporary&until={ban['until']}"
                    )

            tokens = get_tokens(user)
            response = django_redirect(f"{settings.SITE_URL}/login-success")
            return set_auth_cookies(response, get_tokens(user))

        except Exception as e:
            import traceback
            traceback.print_exc()
            return django_redirect(f'{settings.SITE_URL}/login?error=oauth_failed')

class CookieTokenRefreshView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
        if not raw_refresh:
            return Response({'detail': 'Refresh token missing'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            refresh = RefreshToken(raw_refresh)
            access = str(refresh.access_token)
        except TokenError:
            return Response({'detail': 'Refresh token invalid'}, status=status.HTTP_401_UNAUTHORIZED)

        response = Response({'detail': 'Token refreshed'})
        response.set_cookie(
            settings.JWT_ACCESS_COOKIE_NAME,
            access,
            max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
            httponly=True,
            secure=settings.JWT_COOKIE_SECURE,
            samesite=settings.JWT_COOKIE_SAMESITE,
            path='/',
        )
        return response

class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        return delete_auth_cookies(Response({'detail': 'Logged out'}))

# 2FA
class Enable2FAView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        secret = user.generate_totp_secret()
        return Response({'totp_uri': user.get_totp_uri(), 'secret': secret})

    def put(self, request):
        """Confirmer le 2FA avec un premier code valide"""
        code = request.data.get('code')
        if not request.user.verify_totp(code):
            return Response({'error': 'Code invalide'}, status=400)
        request.user.is_2fa_enabled = True
        request.user.save()
        return Response({'status': '2FA activé'})

# Activation par email
class ActivateAccountView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, uidb64, token):
        try:
            uid = urlsafe_base64_decode(uidb64).decode()
            user = get_object_or_404(User, pk=uid)
        except Exception:
            return Response(
                {"error": "Invalid activation link"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if default_token_generator.check_token(user, token):
            user.is_active = True
            user.save()
            return Response({"message": "Account activated"}, status=status.HTTP_200_OK)

        return Response({"error": "Invalid token"}, status=status.HTTP_400_BAD_REQUEST)

class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class UserListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = User.objects.filter(is_active=True).exclude(pk=request.user.pk).values('username', 'avatar_url')
        return Response([{'login': u['username'], 'name': u['username'], 'avatar_url': u['avatar_url']} for u in users])

class AvatarUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request):
        file = request.FILES.get('avatar')
        if not file:
            return Response({'error': 'Aucun fichier'}, status=400)

        # Vérifier que c'est bien une image
        if not file.content_type.startswith('image/'):
            return Response({'error': 'Fichier invalide'}, status=400)

        # Vérifier la taille (max 2 Mo)
        if file.size > 2 * 1024 * 1024:
            return Response({'error': 'Image trop lourde (max 2 Mo)'}, status=400)

        user = request.user
        # Supprimer l'ancienne photo si elle existe
        if user.avatar_url and 'media/' in user.avatar_url:
            old_path = os.path.join(settings.MEDIA_ROOT, user.avatar_url.split('/media/')[-1])
            if os.path.exists(old_path):
                os.remove(old_path)

        # Sauvegarder le fichier
        ext       = file.name.split('.')[-1].lower()
        filename  = f"avatars/{user.id}.{ext}"
        filepath  = os.path.join(settings.MEDIA_ROOT, filename)

        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'wb+') as f:
            for chunk in file.chunks():
                f.write(chunk)

        # Mettre à jour l'URL dans la BDD
        user.avatar_url = f"/media/{filename}"
        user.save(update_fields=['avatar_url'])

        return Response({'avatar_url': user.avatar_url})

    def delete(self, request):
        user = request.user
        if user.avatar_url and 'media/' in user.avatar_url:
            path = os.path.join(settings.MEDIA_ROOT, user.avatar_url.split('/media/')[-1])
            if os.path.exists(path):
                os.remove(path)
        user.avatar_url = None
        user.save(update_fields=['avatar_url'])
        return Response({'avatar_url': None})

class UpdateProfileView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser]

    def put(self, request):
        user = request.user

        # Mise à jour email
        if request.data.get('email'):
            user.email = request.data['email']

        # Suppression avatar
        if request.data.get('delete_avatar') == 'true':
            if user.avatar_url and '/media/' in user.avatar_url:
                old_path = os.path.join(
                    settings.MEDIA_ROOT,
                    user.avatar_url.split('/media/')[-1]
                )
                if os.path.exists(old_path):
                    os.remove(old_path)
            user.avatar_url = None

        # Nouvel avatar
        elif 'avatar' in request.FILES:
            file = request.FILES['avatar']
            ext  = file.name.split('.')[-1].lower()

            # Supprimer l'ancienne image
            if user.avatar_url and '/media/' in (user.avatar_url or ''):
                old_path = os.path.join(
                    settings.MEDIA_ROOT,
                    user.avatar_url.split('/media/')[-1]
                )
                if os.path.exists(old_path):
                    os.remove(old_path)

            # Nom unique pour casser le cache navigateur
            filename = f"avatars/{user.id}_{uuid.uuid4().hex[:8]}.{ext}"
            filepath = os.path.join(settings.MEDIA_ROOT, filename)
            os.makedirs(os.path.dirname(filepath), exist_ok=True)

            with open(filepath, 'wb+') as f:
                for chunk in file.chunks():
                    f.write(chunk)

            user.avatar_url = f"/media/{filename}"

        user.save()
        return Response(UserSerializer(user).data)


class TicketView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        login_name = request.data.get('login', '').strip()
        description = request.data.get('description', '').strip()
        pages = request.data.get('pages', '')

        if not login_name or not description:
            return Response(
                {'error': 'Login et description sont requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        body_lines = [
            f"Login : {login_name}",
            f"Description : {description}",
        ]
        if pages:
            body_lines.append(f"Pages concernées : {pages}")

        subject = f"[Ticket] Bug report de {login_name}"
        body = "\n\n".join(body_lines)

        attachments = []
        for key in request.FILES:
            f = request.FILES[key]
            if f.content_type and f.content_type.startswith('image/'):
                attachments.append((f.name, f.read(), f.content_type))

        from django.core.mail import EmailMessage

        email = EmailMessage(
            subject=subject,
            body=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[settings.DEFAULT_FROM_EMAIL],
        )
        for name, content, mime in attachments:
            email.attach(name, content, mime)

        try:
            email.send(fail_silently=False)
        except Exception as e:
            return Response(
                {'error': f'Erreur envoi mail : {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({'message': 'Ticket envoyé'}, status=status.HTTP_201_CREATED)