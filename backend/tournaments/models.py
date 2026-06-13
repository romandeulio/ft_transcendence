from django.db import models
from django.conf import settings
from django.db.models import Q


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
        choices=[(8, '8'), (16, '16'), (32, '32'), (64, '64')],
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
