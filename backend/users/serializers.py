from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['email', 'username', 'password']

    def validate_username(self, value):
        if not value.isalnum():
            raise serializers.ValidationError('Lettres et chiffres uniquement')
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)
