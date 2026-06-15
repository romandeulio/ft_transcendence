import uuid
from django.db import models
from django.conf import settings


class Bet(models.Model):
    """
    Pari sur un match. Table externe (postgres/init.sql) → managed=False.

    Le pari porte sur un CAMP : `predicted_winner` stocke le joueur "leader"
    du camp choisi (player1 ou player2 du match), ce qui identifie le côté.
    `odds` est la cote figée à la pose ; `payout`/`result` sont renseignés à
    la résolution.
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
    match = models.ForeignKey(
        'matches.Match',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bets',
        db_column='match_id',
    )

    amount = models.IntegerField()

    # Joueur "leader" du camp parié (player1 ou player2 du match).
    predicted_winner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bets_predicted',
        db_column='predicted_winner',
    )

    # Cote figée au moment de la pose : payout = round(amount * odds).
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
    Grand livre des mouvements de jetons. Table externe → managed=False.
    Une ligne par mouvement ; `reference_id` pointe vers le pari concerné.
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
    # Magnitude positive du mouvement ; le `type` donne le sens (mise vs gain).
    amount = models.IntegerField()
    reference_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wallet_transactions'
        managed = False
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.type} {self.amount} ({self.user_id})"
