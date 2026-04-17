from django.db import models
from django.conf import settings

class Match(models.Model):

	class Status(models.TextChoices):
		PENDING   = 'PENDING',   'En attente de validation'
		VALIDATED = 'VALIDATED', 'Validé'
		CANCELLED = 'CANCELLED', 'Annulé'

    class MatchType(models.TextChoices):
		SOLO = 'SOLO', '1v1 — individuel'
		TEAM = 'TEAM', '2v2 — équipe'

	match_type = models.CharField(
        max_length=10,
        choices=MatchType.choices,
        default=MatchType.SOLO,
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )

	player1 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='matches_as_player1',
    )
    player2 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='matches_as_player2',
    )

	team1 = models.ForeignKey(
        'organizations.Organization',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='matches_as_team1',
    )
    team2 = models.ForeignKey(
        'organizations.Organization',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='matches_as_team2',
    )

	score_player1 = models.IntegerField(default=0)
    score_player2 = models.IntegerField(default=0)

	elo_solo_player1_before = models.IntegerField(default=1000)
    elo_solo_player1_after  = models.IntegerField(default=1000)
    elo_solo_player2_before = models.IntegerField(default=1000)
    elo_solo_player2_after  = models.IntegerField(default=1000)

    elo_team_player1_before = models.IntegerField(default=1000)
    elo_team_player1_after  = models.IntegerField(default=1000)
    elo_team_player2_before = models.IntegerField(default=1000)
    elo_team_player2_after  = models.IntegerField(default=1000)

	season = models.ForeignKey(
        'seasons.Season',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='matches',
    )

    played_at  = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

	class Meta:
        ordering = ['-played_at'] #trie automatique du plus récent au plus ancien

	def __str__(self):
        if self.match_type == self.MatchType.SOLO:
            return f"{self.player1} vs {self.player2} ({self.score_player1}-{self.score_player2})"
        return f"{self.team1} vs {self.team2} ({self.score_player1}-{self.score_player2})"

	def get_winner(self):
        if self.status != self.Status.VALIDATED:
            return None
        if self.score_player1 > self.score_player2:
            return self.player1 if self.match_type == self.MatchType.SOLO else self.team1
        if self.score_player2 > self.score_player1:
            return self.player2 if self.match_type == self.MatchType.SOLO else self.team2
        return None
