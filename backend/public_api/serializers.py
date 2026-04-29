from rest_framework import serializers
from .models import APIKey


class APIKeySerializer(serializers.ModelSerializer):
    """
    Lecture d'une clé API.
    La clé en elle-même n'est affichée qu'à la création (voir APIKeyCreateSerializer).
    Ensuite on ne la montre plus — juste les métadonnées.
    """

    owner      = serializers.StringRelatedField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_valid   = serializers.BooleanField(read_only=True)

    class Meta:
        model  = APIKey
        fields = [
            'id',
            'name',
            'owner',
            'is_active',
            'is_full_access',
            'rate_limit',
            'requests_this_hour',
            'last_request_at',
            'expires_at',
            'is_expired',
            'is_valid',
            'created_at',
        ]
        read_only_fields = [
            'id', 'owner', 'requests_this_hour',
            'last_request_at', 'created_at',
        ]


class APIKeyCreateSerializer(serializers.ModelSerializer):
    """
    Création d'une clé API (POST /api/public/keys/).
    C'est le seul moment où la clé générée est renvoyée en clair.
    Le owner est assigné automatiquement dans la view (request.user).
    """

    # Champ en lecture seule : renvoyé uniquement à la création
    key = serializers.CharField(read_only=True)

    class Meta:
        model  = APIKey
        fields = [
            'name',
            'is_full_access',
            'rate_limit',
            'expires_at',
            'key',  # affiché une seule fois à la création
        ]


class APIKeyRevokeSerializer(serializers.ModelSerializer):
    """
    Révocation d'une clé (PATCH /api/public/keys/<id>/revoke/).
    Passe is_active à False sans supprimer la clé.
    """

    class Meta:
        model  = APIKey
        fields = ['is_active']
