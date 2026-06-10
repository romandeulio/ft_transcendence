# backend/app/matches/models_ranking.py

import uuid
from django.db import models
from django.conf import settings


class Ranking(models.Model):

    class Mode(models.TextChoices):
        SOLO = 'SOLO', '1v1'
        TEAM = 'TEAM', '2v2'

    class Scope(models.TextChoices):
        SEASON = 'season', 'Saisonnier'
        GLOBAL = 'global', 'Global'

    id     = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='rankings',
    )
    season = models.ForeignKey(
        'seasons.Season',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='rankings',
        help_text="NULL pour le scope global.",
    )
    mode  = models.CharField(max_length=10, choices=Mode.choices)
    scope = models.CharField(max_length=10, choices=Scope.choices)
    score  = models.IntegerField(default=1000)
    wins   = models.IntegerField(default=0)
    losses = models.IntegerField(default=0)

    class Meta:
        unique_together = ('user', 'season', 'mode', 'scope')
        ordering = ['-score']
        db_table = 'rankings'

    def __str__(self):
        season_label = str(self.season) if self.season else 'global'
        return f"{self.user.username} — {self.mode} {self.scope} ({season_label}) : {self.score}"

    @property
    def win_rate(self):
        total = self.wins + self.losses
        if total == 0:
            return None
        return round(self.wins / total * 100, 1)


class RankingHistory(models.Model):

    class Mode(models.TextChoices):
        SOLO = 'SOLO', '1v1'
        TEAM = 'TEAM', '2v2'

    class Scope(models.TextChoices):
        SEASON = 'season', 'Saisonnier'
        GLOBAL = 'global', 'Global'

    id    = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='ranking_history',
    )
    match = models.ForeignKey(
        'matches.Match',
        on_delete=models.CASCADE,
        related_name='ranking_history',
    )
    season = models.ForeignKey(
        'seasons.Season',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='ranking_history',
    )
    mode  = models.CharField(max_length=10, choices=Mode.choices)
    scope = models.CharField(max_length=10, choices=Scope.choices)

    score_before = models.IntegerField()
    score_after  = models.IntegerField()
    score_delta  = models.IntegerField()

    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ranking_history'
        ordering = ['-recorded_at']

    def __str__(self):
        sign = '+' if self.score_delta >= 0 else ''
        return (
            f"{self.user.username} — {self.mode} {self.scope} "
            f"match#{self.match_id} : "
            f"{self.score_before} → {self.score_after} ({sign}{self.score_delta})"
        )