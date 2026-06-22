from django.conf import settings
from django.db import models
import uuid


class Tournament(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Status(models.TextChoices):
        OPEN      = 'OPEN',      'Inscriptions ouvertes'
        ONGOING   = 'ONGOING',   'En cours'
        DONE      = 'DONE',      'Terminé'
        CANCELLED = 'CANCELLED', 'Annulé'

    name        = models.CharField(max_length=100)
    format      = models.CharField(max_length=20, default='SINGLE_ELIMINATION')
    team_size   = models.IntegerField(choices=[(1, '1'), (2, '2')], default=2)
    start_date  = models.DateTimeField()
    deadline    = models.DateTimeField(null=True, blank=True)
    max_players = models.IntegerField(choices=[(16, '16'), (32, '32')], default=16)
    prize       = models.CharField(max_length=200, blank=True, default='')
    status      = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN)
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_tournaments',
        db_column='created_by',
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed  = False
        db_table = 'tournaments'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"


class TournamentRegistration(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='registrations', db_column='tournament_id')
    player1    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tournament_registrations_as_p1', db_column='player1_id')
    player2    = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='tournament_registrations_as_p2', db_column='player2_id')
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed         = False
        db_table        = 'tournament_registrations'
        ordering        = ['registered_at']
        unique_together = [('tournament', 'player1')]

    def __str__(self):
        p2 = f" & {self.player2}" if self.player2 else " (solo)"
        return f"{self.player1}{p2} — {self.tournament.name}"


class TournamentTeam(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tournament   = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='teams', db_column='tournament_id')
    registration = models.OneToOneField(TournamentRegistration, on_delete=models.CASCADE, related_name='team', db_column='registration_id')
    player1      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tournament_teams_as_p1', db_column='player1_id')
    player2      = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='tournament_teams_as_p2', db_column='player2_id')
    seed         = models.PositiveIntegerField()
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed         = False
        db_table        = 'tournament_teams'
        ordering        = ['seed']
        unique_together = [
            ('tournament', 'seed'),
            ('tournament', 'player1'),
            ('tournament', 'player2'),
        ]

    def __str__(self):
        return f"{self.player1} & {self.player2}"


class TournamentMatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'En attente'
        DONE    = 'DONE',    'Terminé'

    tournament       = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='bracket_matches', db_column='tournament_id')
    round_number     = models.PositiveIntegerField()
    bracket_position = models.PositiveIntegerField()
    team1            = models.ForeignKey(TournamentTeam, null=True, blank=True, on_delete=models.SET_NULL, related_name='matches_as_team1', db_column='team1_id')
    team2            = models.ForeignKey(TournamentTeam, null=True, blank=True, on_delete=models.SET_NULL, related_name='matches_as_team2', db_column='team2_id')
    winner           = models.ForeignKey(TournamentTeam, null=True, blank=True, on_delete=models.SET_NULL, related_name='won_tournament_matches', db_column='winner_id')
    score_team1      = models.PositiveIntegerField(null=True, blank=True)
    score_team2      = models.PositiveIntegerField(null=True, blank=True)
    status           = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    queue_entry      = models.OneToOneField('planning.QueueEntry', null=True, blank=True, on_delete=models.SET_NULL, related_name='tournament_match', db_column='queue_entry_id')
    swiss_round      = models.IntegerField(null=True, blank=True)
    is_bye           = models.BooleanField(default=False)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        managed         = False
        db_table        = 'tournament_matches'
        ordering        = ['round_number', 'bracket_position']
        unique_together = [('tournament', 'round_number', 'bracket_position')]

    def __str__(self):
        return f"{self.tournament.name} R{self.round_number}#{self.bracket_position}"

    @property
    def is_ready(self):
        return bool(self.team1 and self.team2 and self.status == self.Status.PENDING)

class TournamentSwissStandings(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    class Meta:
        managed         = False
        db_table        = 'tournament_swiss_standings'
    
    tournament       = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='swiss_standing', db_column='tournament_id')
    team             = models.ForeignKey(TournamentTeam, null=True, blank=True, on_delete=models.SET_NULL, db_column='team_id')
    wins             = models.IntegerField(default=0)
    losses           = models.IntegerField(default=0)

class TournamentRoundRobinsStandings(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    class Meta:
        managed         = False
        db_table        = 'tournament_round_robin_standings'
    
    tournament       = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='round_robin_standing', db_column='tournament_id')
    team             = models.ForeignKey(TournamentTeam, null=True, blank=True, on_delete=models.SET_NULL, db_column='team_id')
    wins             = models.IntegerField(default=0)
    losses           = models.IntegerField(default=0)
    points           = models.IntegerField(default=0)
