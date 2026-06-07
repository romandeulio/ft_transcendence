import requests
from django.conf import settings

from .models import User
from .serializers import RegisterSerializer, UserSerializer

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_decode
from django.shortcuts import get_object_or_404

def get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}

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
        
        if user.is_2fa_enabled:
            if not totp_code:
                return Response({'requires_2fa': True}, status=200)
            if not user.verify_totp(totp_code):
                return Response({'error': 'Code 2FA invalide'}, status=401)
        
        return Response(get_tokens(user))

# --- OAuth 42 ---
class OAuth42CallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        code = request.query_params.get('code')
        if not code:
            return Response({'error': 'Code manquant'}, status=400)

        # Échange du code contre un token 42
        token_res = requests.post('https://api.intra.42.fr/oauth/token', data={
            'grant_type': 'authorization_code',
            'client_id': settings.OAUTH_42_CLIENT_ID,
            'client_secret': settings.OAUTH_42_CLIENT_SECRET,
            'code': code,
            'redirect_uri': settings.OAUTH_42_REDIRECT_URI,
        })
        access_token = token_res.json().get('access_token')

        # Récupération du profil 42
        profile = requests.get('https://api.intra.42.fr/v2/me', headers={
            'Authorization': f'Bearer {access_token}'
        }).json()

        user, created = User.objects.get_or_create(
            oauth_42_id=str(profile['id']),
            defaults={
                'email': profile.get('email', f"{profile['login']}@42.fr"),
                'username': profile['login'],
                'avatar_url': profile.get('image', {}).get('link'),
            }
        )
        return Response(get_tokens(user))

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