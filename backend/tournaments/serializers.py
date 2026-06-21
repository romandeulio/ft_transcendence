from rest_framework import serializers
from .models import Tournament, TournamentMatch, TournamentRegistration, TournamentTeam


class TournamentSerializer(serializers.ModelSerializer):
    registered     = serializers.SerializerMethodField()
    date_label     = serializers.SerializerMethodField()
    deadline_label = serializers.SerializerMethodField()
    teams_count    = serializers.SerializerMethodField()

    class Meta:
        model  = Tournament
        fields = [
            'id', 'name', 'start_date', 'deadline', 'max_players',
            'prize', 'status', 'registered', 'teams_count',
            'date_label', 'deadline_label', 'created_at',
        ]

    def get_registered(self, obj):
        # Nombre de joueurs inscrits : solo = 1, duo = 2
        solo  = obj.registrations.filter(player2__isnull=True).count()
        duos  = obj.registrations.filter(player2__isnull=False).count()
        return solo + duos * 2

    def get_teams_count(self, obj):
        started = obj.teams.count()
        if started:
            return started
        return obj.registrations.filter(player2__isnull=False).count()

    def get_date_label(self, obj):
        if not obj.start_date:
            return ''
        return obj.start_date.strftime('%d/%m/%Y à %H:%M')

    def get_deadline_label(self, obj):
        if not obj.deadline:
            return None
        return obj.deadline.strftime('%d/%m/%Y')


class TournamentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Tournament
        fields = ['name', 'start_date', 'deadline', 'max_players', 'prize']


class TournamentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tournament
        fields = ['name', 'start_date', 'deadline', 'max_players', 'prize']
        extra_kwargs = {
            'name':        {'required': False},
            'start_date':  {'required': False},
            'deadline':    {'required': False, 'allow_null': True},
            'max_players': {'required': False},
            'prize':       {'required': False, 'allow_blank': True},
        }


class RegistrationSerializer(serializers.ModelSerializer):
    player1 = serializers.CharField(source='player1.username')
    player2 = serializers.SerializerMethodField()

    class Meta:
        model  = TournamentRegistration
        fields = ['id', 'player1', 'player2', 'registered_at']

    def get_player2(self, obj):
        return obj.player2.username if obj.player2 else None


class TournamentTeamSerializer(serializers.ModelSerializer):
    player1 = serializers.CharField(source='player1.username')
    player2 = serializers.CharField(source='player2.username')
    label   = serializers.SerializerMethodField()

    class Meta:
        model  = TournamentTeam
        fields = ['id', 'seed', 'player1', 'player2', 'label']

    def get_label(self, obj):
        return f"{obj.player1.username} & {obj.player2.username}"


class TournamentMatchSerializer(serializers.ModelSerializer):
    team1          = TournamentTeamSerializer(read_only=True)
    team2          = TournamentTeamSerializer(read_only=True)
    winner         = TournamentTeamSerializer(read_only=True)
    queue_entry_id = serializers.PrimaryKeyRelatedField(source='queue_entry', read_only=True)

    class Meta:
        model  = TournamentMatch
        fields = [
            'id', 'round_number', 'bracket_position',
            'team1', 'team2', 'winner',
            'score_team1', 'score_team2', 'status',
            'queue_entry_id',
        ]