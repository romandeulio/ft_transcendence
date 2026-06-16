import uuid
from django.db import models

class Stats(models.Model):
    class Meta:
        db_table = 'stats'
        managed   = False

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        'users.User',
        on_delete=models.CASCADE,
        related_name='stats',
    )
    total_matches = models.IntegerField(default=0)
    total_wins = models.IntegerField(default=0)
    total_losses = models.IntegerField(default=0)
    total_gamelles = models.IntegerField(default=0)
    total_demis = models.IntegerField(default=0)
    elo_solo = models.IntegerField(default=1000)
    elo_team = models.IntegerField(default=1000)
    series_wins = models.IntegerField(default=0)
    series_losses = models.IntegerField(default=0)
    total_bets = models.IntegerField(default=0)
    total_wins_bets = models.IntegerField(default=0)
    total_losses_bets = models.IntegerField(default=0)
    total_amount_won = models.IntegerField(default=0)
    total_amount_lost = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)