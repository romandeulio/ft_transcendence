from rest_framework import serializers
from django.utils import timezone
from .models import Tournament, TournamentMatch, TournamentRegistration, TournamentTeam, TournamentSwissStandings, TournamentRoundRobinsStandings

VALID_FORMATS = ['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS']

class TournamentSerializer(serializers.ModelSerializer):
    registered     = serializers.SerializerMethodField()
    date_label     = serializers.SerializerMethodField()
    deadline_label = serializers.SerializerMethodField()
    teams_count    = serializers.SerializerMethodField()

    class Meta:
        model  = Tournament
        fields = [
            'id', 'name', 'format', 'team_size',
            'start_date', 'deadline', 'max_players',
            'prize', 'status', 'registered', 'teams_count',
            'date_label', 'deadline_label', 'created_at',
        ]

    def get_registered(self, obj):
        if obj.team_size == 1:
            return obj.registrations.count()
        solo = obj.registrations.filter(player2__isnull=True).count()
        duos = obj.registrations.filter(player2__isnull=False).count()
        return solo + duos * 2

    def get_teams_count(self, obj):
        started = obj.teams.count()
        if started:
            return started
        if obj.team_size == 1:
            return obj.registrations.count()
        return obj.registrations.filter(player2__isnull=False).count()

    @staticmethod
    def _local(dt):
        # La colonne est un TIMESTAMP sans fuseau : Django la relit en datetime
        # naïf. On le rattache au fuseau courant avant tout affichage local,
        # sinon timezone.localtime() lève "cannot be applied to a naive datetime".
        if dt is None:
            return None
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return timezone.localtime(dt)

    def get_date_label(self, obj):
        if not obj.start_date:
            return ''
        return self._local(obj.start_date).strftime('%d/%m/%Y à %H:%M')

    def get_deadline_label(self, obj):
        if not obj.deadline:
            return None
        return self._local(obj.deadline).strftime('%d/%m/%Y')


class TournamentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Tournament
        fields = ['name', 'format', 'team_size', 'start_date', 'deadline', 'max_players', 'prize']
        extra_kwargs = {
            'deadline': {'required': False, 'allow_null': True},
            'prize':    {'required': False, 'allow_blank': True},
        }

    def validate_format(self, value):
        if value not in VALID_FORMATS:
            raise serializers.ValidationError(f"Format invalide. Choix : {VALID_FORMATS}")
        return value

    def validate_team_size(self, value):
        if value not in (1, 2):
            raise serializers.ValidationError("team_size doit être 1 ou 2.")
        return value

    def validate_start_date(self, value):
        if value and value <= timezone.now():
            raise serializers.ValidationError("La date de début doit être dans le futur.")
        return value

    def validate(self, data):
        fmt       = data.get('format', 'SINGLE_ELIMINATION')
        max_pl    = data.get('max_players', 16)
        team_size = data.get('team_size', 2)

        max_teams = max_pl // team_size
        if fmt == 'SINGLE_ELIMINATION' and max_teams < 2:
            raise serializers.ValidationError("Il faut au moins 2 équipes pour une élimination directe.")
        if fmt == 'SWISS' and max_teams < 4:
            raise serializers.ValidationError("Il faut au moins 4 équipes pour un tournoi suisse.")
        if fmt == 'ROUND_ROBIN' and max_teams < 3:
            raise serializers.ValidationError("Il faut au moins 3 équipes pour un round robin.")
        return data


class TournamentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Tournament
        fields = ['name', 'format', 'team_size', 'start_date', 'deadline', 'max_players', 'prize']
        extra_kwargs = {
            'name':        {'required': False},
            'format':      {'required': False},
            'team_size':   {'required': False},
            'start_date':  {'required': False},
            'deadline':    {'required': False, 'allow_null': True},
            'max_players': {'required': False},
            'prize':       {'required': False, 'allow_blank': True},
        }

    def validate_format(self, value):
        if value not in VALID_FORMATS:
            raise serializers.ValidationError(f"Format invalide. Choix : {VALID_FORMATS}")
        return value

    def validate_start_date(self, value):
        if value and value <= timezone.now():
            raise serializers.ValidationError("La date de début doit être dans le futur.")
        return value


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
    player2 = serializers.CharField()
    label   = serializers.SerializerMethodField()

    class Meta:
        model  = TournamentTeam
        fields = ['id', 'seed', 'player1', 'player2', 'label']

    def get_player2(self, obj):
        return obj.player2.username if obj.player2 else None

    def get_label(self, obj):
        if obj.player2:
            return f"{obj.player1.username} & {obj.player2.username}"
        return obj.player1.username


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
            'queue_entry_id', 'swiss_round', 'is_bye'
        ]

class TournamentSwissStandingsSerializer(serializers.ModelSerializer):
    team          = TournamentTeamSerializer(read_only=True)
    class Meta:
        model = TournamentSwissStandings
        fields = [
            'id', 'team', 'wins', 'losses'
        ]

class TournamentRoundRobinsSerializer(serializers.ModelSerializer):
    team          = TournamentTeamSerializer(read_only=True)
    class Meta:
        model = TournamentRoundRobinsStandings
        fields = [
            'id', 'team', 'wins', 'losses', 'points'
        ]