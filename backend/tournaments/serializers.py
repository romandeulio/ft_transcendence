from datetime import timezone as dt_timezone
from rest_framework import serializers
from django.utils import timezone
from .models import Tournament, TournamentMatch, TournamentRegistration, TournamentTeam, TournamentSwissStandings, TournamentRoundRobinsStandings

# Seul le format à élimination directe est proposé (les formats Suisse et Round
# Robin ont été retirés). On garde une liste pour la validation.
VALID_FORMATS = ['SINGLE_ELIMINATION']
MIN_PLAYERS = 2

class TournamentSerializer(serializers.ModelSerializer):
    registered     = serializers.SerializerMethodField()
    date_label     = serializers.SerializerMethodField()
    deadline_label = serializers.SerializerMethodField()
    teams_count    = serializers.SerializerMethodField()
    start_date     = serializers.SerializerMethodField()
    deadline       = serializers.SerializerMethodField()

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
        # La colonne est un TIMESTAMP sans fuseau : avec USE_TZ=True, Django
        # écrit l'heure convertie en UTC (naïf). On relit donc ce naïf comme de
        # l'UTC, puis on repasse en heure locale — sinon l'affichage est décalé
        # du fuseau (ex. -2h l'été à Paris).
        if dt is None:
            return None
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, dt_timezone.utc)
        return timezone.localtime(dt)

    def get_start_date(self, obj):
        # ISO localisé (avec offset) pour que le front le rejoue correctement
        # dans un <input datetime-local> sans décalage de fuseau.
        local = self._local(obj.start_date)
        return local.isoformat() if local else None

    def get_deadline(self, obj):
        local = self._local(obj.deadline)
        return local.isoformat() if local else None

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

    def validate_max_players(self, value):
        # Plus de plafond 16/32 : on accepte tout nombre raisonnable, pair pour
        # garder un bracket d'élimination directe propre.
        if value is None or value < MIN_PLAYERS:
            raise serializers.ValidationError(f"Il faut au moins {MIN_PLAYERS} joueurs.")
        if value % 2 != 0:
            raise serializers.ValidationError("Le nombre de joueurs doit être pair.")
        return value

    def validate_start_date(self, value):
        if value and value <= timezone.now():
            raise serializers.ValidationError("La date de début doit être dans le futur.")
        return value

    def validate(self, data):
        max_pl    = data.get('max_players', 16)
        team_size = data.get('team_size', 2)

        max_teams = max_pl // team_size
        if max_teams < 2:
            raise serializers.ValidationError("Il faut au moins 2 équipes pour une élimination directe.")
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

    def validate_max_players(self, value):
        if value is None or value < MIN_PLAYERS:
            raise serializers.ValidationError(f"Il faut au moins {MIN_PLAYERS} joueurs.")
        if value % 2 != 0:
            raise serializers.ValidationError("Le nombre de joueurs doit être pair.")
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