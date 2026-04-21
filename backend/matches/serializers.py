from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Match

User = get_user_model()


class MatchSerializer(serializers.ModelSerializer):
    """
    Serializer complet — lecture seule pour les champs calculés (ELO, dates).
    Utilisé pour afficher le détail d'un match (GET /api/matches/<id>/).
    """

    # Affiche le username au lieu de l'id pour la lisibilité
    player1          = serializers.StringRelatedField(read_only=True)
    player1_teammate = serializers.StringRelatedField(read_only=True)
    player2          = serializers.StringRelatedField(read_only=True)
    player2_teammate = serializers.StringRelatedField(read_only=True)
    season           = serializers.StringRelatedField(read_only=True)

    # Champ calculé : gagnant du match
    winner = serializers.SerializerMethodField()

    class Meta:
        model  = Match
        fields = [
            'id',
            'match_type',
            'status',
            'is_ranked',
            # joueurs
            'player1', 'player1_teammate',
            'player2', 'player2_teammate',
            # scores
            'score_player1', 'score_player2',
            'winner',
            # ELO solo
            'elo_solo_player1_before', 'elo_solo_player1_after',
            'elo_solo_player2_before', 'elo_solo_player2_after',
            # ELO team
            'elo_team_player1_before',          'elo_team_player1_after',
            'elo_team_player1_teammate_before', 'elo_team_player1_teammate_after',
            'elo_team_player2_before',          'elo_team_player2_after',
            'elo_team_player2_teammate_before', 'elo_team_player2_teammate_after',
            # saison & dates
            'season',
            'played_at',
            'updated_at',
        ]
        read_only_fields = [
            'id', 'status',
            'elo_solo_player1_before', 'elo_solo_player1_after',
            'elo_solo_player2_before', 'elo_solo_player2_after',
            'elo_team_player1_before',          'elo_team_player1_after',
            'elo_team_player1_teammate_before', 'elo_team_player1_teammate_after',
            'elo_team_player2_before',          'elo_team_player2_after',
            'elo_team_player2_teammate_before', 'elo_team_player2_teammate_after',
            'played_at', 'updated_at',
        ]

    def get_winner(self, obj):
        return obj.get_winner()


class MatchCreateSerializer(serializers.ModelSerializer):
    """
    Serializer pour créer un match (POST /api/matches/).
    On passe les IDs des joueurs, pas les objets complets.
    Les champs ELO et status sont gérés par le backend, jamais par le front.
    """

    player1_id          = serializers.PrimaryKeyRelatedField(
        source='player1', queryset=User.objects.all(), required=True,
    )
    player2_id          = serializers.PrimaryKeyRelatedField(
        source='player2', queryset=User.objects.all(), required=True,
    )
    player1_teammate_id = serializers.PrimaryKeyRelatedField(
        source='player1_teammate', queryset=User.objects.all(),
        required=False, allow_null=True,
    )
    player2_teammate_id = serializers.PrimaryKeyRelatedField(
        source='player2_teammate', queryset=User.objects.all(),
        required=False, allow_null=True,
    )

    class Meta:
        model  = Match
        fields = [
            'match_type',
            'is_ranked',
            'player1_id', 'player1_teammate_id',
            'player2_id', 'player2_teammate_id',
            'score_player1', 'score_player2',
            'season',
        ]

    def validate(self, data):
        match_type = data.get('match_type', Match.MatchType.SOLO)
        is_ranked  = data.get('is_ranked', True)
        p1         = data.get('player1')
        p2         = data.get('player2')
        p1_tm      = data.get('player1_teammate')
        p2_tm      = data.get('player2_teammate')

        # TWO_V_ONE toujours non classé
        if match_type == Match.MatchType.TWO_V_ONE and is_ranked:
            raise serializers.ValidationError(
                "Un match 2v1 ne peut pas être classé."
            )

        # Coéquipiers requis selon le format
        if match_type in (Match.MatchType.TEAM, Match.MatchType.TWO_V_ONE) and not p1_tm:
            raise serializers.ValidationError(
                "player1_teammate_id est requis pour TEAM et TWO_V_ONE."
            )
        if match_type == Match.MatchType.TEAM and not p2_tm:
            raise serializers.ValidationError(
                "player2_teammate_id est requis pour TEAM."
            )

        # Pas de doublon de joueurs
        players = [p for p in [p1, p1_tm, p2, p2_tm] if p is not None]
        if len(players) != len(set(p.pk for p in players)):
            raise serializers.ValidationError(
                "Un même joueur ne peut pas apparaître deux fois dans le même match."
            )

        return data


class MatchValidateSerializer(serializers.ModelSerializer):
    """
    Serializer pour valider un match existant (PATCH /api/matches/<id>/validate/).
    Seuls les scores sont modifiables — le status passe à VALIDATED automatiquement
    dans la view.
    """

    class Meta:
        model  = Match
        fields = ['score_player1', 'score_player2']
