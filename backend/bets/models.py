import uuid
from django.db import models
from django.conf import settings


class Bet(models.Model):
    """
    A bet on an ongoing game (Reservation IN_PROGRESS) = the betting window.
    External table (postgres/init.sql) -> managed=False.

    A bet targets a SIDE: `predicted_winner` stores the "leader" player of the
    chosen side (player1 or player2), which identifies that side.
    `match` is filled in at resolution (the official Match that settles it).
    `odds` is frozen at placement; `payout`/`result` are set at resolution.
    """

    class Result(models.TextChoices):
        WON      = 'won',      'Gagné'
        LOST     = 'lost',     'Perdu'
        REFUNDED = 'refunded', 'Remboursé'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='bets',
        db_column='user_id',
    )

    reservation = models.ForeignKey(
        'planning.Reservation',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bets',
        db_column='reservation_id',
    )

    match = models.ForeignKey(
        'matches.Match',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bets',
        db_column='match_id',
    )

    amount = models.IntegerField()

    predicted_winner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bets_predicted',
        db_column='predicted_winner',
    )

    odds = models.DecimalField(max_digits=5, decimal_places=2)

    result = models.CharField(
        max_length=10,
        choices=Result.choices,
        null=True, blank=True,
    )
    payout = models.IntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bets'
        managed = False
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user_id} mise {self.amount} (cote {self.odds})"

    @property
    def is_open(self):
        return self.result is None


class WalletTransaction(models.Model):
    """
    Ledger of token movements. External table -> managed=False.
    One row per movement; `reference_id` points to the related bet.
    """

    class Type(models.TextChoices):
        BET     = 'bet',     'Mise'
        WIN     = 'win',     'Gain'
        DEPOSIT = 'deposit', 'Dépôt'
        REFUND  = 'refund',  'Remboursement'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='wallet_transactions',
        db_column='user_id',
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    amount = models.IntegerField()
    reference_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wallet_transactions'
        managed = False
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.type} {self.amount} ({self.user_id})"
