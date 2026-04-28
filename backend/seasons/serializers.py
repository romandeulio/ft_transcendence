from rest_framework import serializers
from .models import Season, SeasonReward
from .ranks import get_rank, get_rank_progress


class SeasonRewardSerializer(serializers.ModelSerializer):
    """
    Lecture seule — les récompenses sont créées par le backend en fin de saison,
    jamais par le front.
    """

    player       = serializers.StringRelatedField(read_only=True)
    ranking_type = serializers.CharField(source='get_ranking_type_display', read_only=True)
    tier         = serializers.CharField(source='get_tier_display', read_only=True)

    class Meta:
        model  = SeasonReward
        fields = [
            'id',
            'player',
            'ranking_type',
            'tier',
            'tokens_awarded',
            'elo_at_end',
            'rank_at_end',
            'awarded_at',
        ]
        read_only_fields = fields


class SeasonSerializer(serializers.ModelSerializer):
    """
    Lecture d'une saison — utilisé pour GET /api/seasons/ et GET /api/seasons/<id>/.
    Inclut les récompenses associées et un indicateur si la saison est en cours.
    """

    rewards    = SeasonRewardSerializer(many=True, read_only=True)
    is_current = serializers.SerializerMethodField()

    class Meta:
        model  = Season
        fields = [
            'id',
            'name',
            'start_date',
            'end_date',
            'status',
            'rewards_distributed',
            'is_current',
            'rewards',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id', 'status', 'rewards_distributed', 'created_at', 'updated_at',
        ]

    def get_is_current(self, obj):
        return obj.is_current()


class SeasonCreateSerializer(serializers.ModelSerializer):
    """
    Création d'une saison (POST /api/seasons/) — réservé aux admins.
    Le status démarre toujours à UPCOMING.
    """

    class Meta:
        model  = Season
        fields = ['name', 'start_date', 'end_date']

    def validate(self, data):
        if data['end_date'] <= data['start_date']:
            raise serializers.ValidationError(
                "La date de fin doit être après la date de début."
            )
        return data


class RankingEntrySerializer(serializers.Serializer):
    """
    Représente une entrée dans le classement saisonnier.
    Construit dynamiquement depuis les données user, pas depuis un model direct.
    Utilisé pour GET /api/seasons/<id>/ranking/?type=solo|team
    """

    rank         = serializers.IntegerField()
    username     = serializers.CharField()
    elo          = serializers.IntegerField()
    rank_name    = serializers.SerializerMethodField()
    rank_color   = serializers.SerializerMethodField()
    progress_pct = serializers.SerializerMethodField()
    elo_needed   = serializers.SerializerMethodField()

    def get_rank_name(self, obj):
        return get_rank(obj['elo']).label

    def get_rank_color(self, obj):
        return get_rank(obj['elo']).color

    def get_progress_pct(self, obj):
        return get_rank_progress(obj['elo'])['progress_pct']

    def get_elo_needed(self, obj):
        return get_rank_progress(obj['elo'])['elo_needed']
