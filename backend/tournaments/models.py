from django.conf import settings
from django.db import models


class Tournament(models.Model):
    class Status(models.TextChoices):
        OPEN      = 'OPEN',      'Inscriptions ouvertes'
        ONGOING   = 'ONGOING',   'En cours'
        DONE      = 'DONE',      'Terminé'
        CANCELLED = 'CANCELLED', 'Annulé'

    name        = models.CharField(max_length=100)
    start_date  = models.DateTimeField()
    deadline    = models.DateTimeField(null=True, blank=True)
    max_players = models.IntegerField(
        choices=[(16, '16'), (32, '32')],
        default=16,
    )
    prize      = models.CharField(max_length=200, blank=True, default='')
    status     = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_tournaments',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"


class TournamentRegistration(models.Model):
    tournament    = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='registrations')
    player1       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tournament_registrations_as_p1',
    )
    player2       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='tournament_registrations_as_p2',
    )
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['registered_at']
        unique_together = [('tournament', 'player1')]

    def __str__(self):
        p2 = f" & {self.player2}" if self.player2 else " (solo)"
        return f"{self.player1}{p2} — {self.tournament.name}"


class TournamentTeam(models.Model):
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='teams')
    registration = models.OneToOneField(
        TournamentRegistration,
        on_delete=models.CASCADE,
        related_name='team',
    )
    player1 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tournament_teams_as_p1',
    )
    player2 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tournament_teams_as_p2',
    )
    seed = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['seed']
        unique_together = [
            ('tournament', 'seed'),
            ('tournament', 'player1'),
            ('tournament', 'player2'),
        ]

    def __str__(self):
        return f"{self.player1} & {self.player2}"


class TournamentMatch(models.Model):
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'En attente'
        DONE = 'DONE', 'Terminé'

    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='bracket_matches')
    round_number = models.PositiveIntegerField()
    bracket_position = models.PositiveIntegerField()
    team1 = models.ForeignKey(
        TournamentTeam,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='matches_as_team1',
    )
    team2 = models.ForeignKey(
        TournamentTeam,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='matches_as_team2',
    )
    winner = models.ForeignKey(
        TournamentTeam,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='won_tournament_matches',
    )
    score_team1 = models.PositiveIntegerField(null=True, blank=True)
    score_team2 = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    queue_entry = models.OneToOneField(
        'planning.QueueEntry',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='tournament_match',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['round_number', 'bracket_position']
        unique_together = [('tournament', 'round_number', 'bracket_position')]

    def __str__(self):
        return f"{self.tournament.name} R{self.round_number}#{self.bracket_position}"

    @property
    def is_ready(self):
        return bool(self.team1_id and self.team2_id and self.status == self.Status.PENDING)
