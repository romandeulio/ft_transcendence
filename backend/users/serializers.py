from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.cache import cache
from .models import User
from django.conf import settings
from django.core.validators import validate_email as django_validate_email
from django.core.mail import send_mail
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.core.mail import send_mail
from django.conf import settings
import requests
import json
import os

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True,required=True)
    class Meta:
        model = User
        fields = ['email', 'username', 'password', 'password2']

    def get_42_token(self):
        token = cache.get('42_token')
        if token:
            return token
        response = requests.post(
            "https://api.intra.42.fr/oauth/token",
            data={
                "grant_type": "client_credentials",
                "client_id": settings.OAUTH_42_CLIENT_ID,
                "client_secret": settings.OAUTH_42_CLIENT_SECRET,
            },
            timeout=5,
        )
        response.raise_for_status()
        data = response.json()
        token = data["access_token"]
        expires_in = data["expires_in"]
        cache.set("42_token", token, expires_in - 60)
        return token

    def get_42_user(self, username):
        try:
            token = self.get_42_token()

            response = requests.get(
                f"https://api.intra.42.fr/v2/users/{username}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=5,
            )

            if response.status_code == 404:
                return None

            response.raise_for_status()
            return response.json()

        except requests.RequestException:
            return None

    def validate_username(self, value):
        if self.get_42_user(value) == None:
            raise serializers.ValidationError('Not a valid 42 login')
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already in use")
        return value

    def validate_password2(self, value):
        if value != self.initial_data.get('password'):
            raise serializers.ValidationError("Passwords don't match")
        return value


    def validate_email(self, value):
        try:
            django_validate_email(value)
        except ValidationError:
            raise serializers.ValidationError("Invalid email format")
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already in use")
        return value

    def create(self, validated_data):
        user_42 = self.get_42_user(validated_data["username"])
        validated_data.pop("password2")
        has_piscine = any(
            c["cursus"]["name"] == "C Piscine"
            for c in user_42.get("cursus_users", [])
        )

        has_42cursus = any(
            c["cursus"]["name"] == "42cursus"
            for c in user_42.get("cursus_users", [])
        )

        if user_42.get("staff?"):
            role = "bocalien"
        elif user_42.get("alumni?"):
            role = "alumnni"
        elif has_piscine and not has_42cursus:
            role = "piscineux"
        elif has_42cursus:
            role = "stud"
        else:
            role = "user"
        if role != "bocalien":
            for group in user_42.get("groups", []):
                name = group.get("name", "").lower()
                if "bde" in name:
                    role = "bde"
        user = User.objects.create_user(email=validated_data['email'], username=validated_data['username'], password=validated_data['password'])
        user.role = role
        user.save(update_fields=["role"])
        avatar_link = user_42.get("image", {}).get("link")

        if avatar_link:
            response = requests.get(avatar_link)

            if response.status_code == 200:
                ext = avatar_link.split(".")[-1].split("?")[0]
                if ext not in ["jpg", "jpeg", "png", "webp"]:
                    ext = "jpg"

                filename = f"avatars/{user.id}.{ext}"
                filepath = os.path.join(settings.MEDIA_ROOT, filename)

                os.makedirs(os.path.dirname(filepath), exist_ok=True)

                with open(filepath, "wb") as f:
                    f.write(response.content)

                user.avatar_url = f"/media/{filename}"
                user.save(update_fields=["avatar_url"])

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)

        activation_link = (
            f"{settings.SITE_URL}/api/auth/activate/{uid}/{token}/"
        )

        send_mail(
            subject="Activation de votre compte",
            message=f"Activez votre compte : {activation_link}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        return user

# serializers.py — remplacer UserSerializer

#class UserSerializer(serializers.ModelSerializer):
#    class Meta:
#        model  = User
#        fields = [
#            'id',
#            'username',
#            'email',
#            'avatar_url',
#            'role',
#            'elo_solo',
#            'elo_team',
#            'wallet_tokens',
#            'is_2fa_enabled',
#        ]

class UserSerializer(serializers.ModelSerializer):
    elo_solo = serializers.IntegerField(source="stats.elo_solo", read_only=True)
    elo_team = serializers.IntegerField(source="stats.elo_team", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "avatar_url",
            "role",
            "elo_solo",
            "elo_team",
            "wallet_tokens",
            "is_2fa_enabled",
        ]
