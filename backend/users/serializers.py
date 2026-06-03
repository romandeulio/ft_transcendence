from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.cache import cache
from .models import User
from django.conf import settings
import requests
import json

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['email', 'username', 'password']

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
        if not self.get_42_user(value):
            raise serializers.ValidationError('Not a valid 42 login')
        return value

    def create(self, validated_data):
        user_42 = self.get_42_user(validated_data["username"])

        with open("/tmp/user42.json", "w", encoding="utf-8") as f:
            json.dump(user_42, f, indent=4, ensure_ascii=False)

        return User.objects.create_user(**validated_data)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = "__all__"
