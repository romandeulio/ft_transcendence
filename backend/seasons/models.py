from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone


class Season(models.Model):

    class Status(models.TextChoices):
        UPCOMING = 'UPCOMING', 'À venir'
        ACTIVE   = 'ACTIVE',   'En cours'
        FINISHED = 'FINISHED', 'Terminée'

    name       = models.CharField(max_length=100, unique=True)  # ex: "Saison 1 — Hiver 2025"
    start_date = models.DateField()
    end_date   = models.DateField()  # généralement start_date + 3 mois

    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.UPCOMING,
    )

    # Jetons distribués en fin de saison au top du classement
    rewards_distributed = models.BooleanField(
        default=False,
        help_text="True quand les récompenses de fin de saison ont été envoyées aux wallets.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"

    def clean(self):
        if self.start_date and self.end_date:
            if self.end_date <= self.start_date:
                raise ValidationError("La date de fin doit être après la date de début.")

    def is_current(self):
        """Retourne True si aujourd'hui est dans la plage de la saison."""
        today = timezone.now().date()
        return self.start_date <= today <= self.end_date

    @classmethod
    def get_active(cls):
        """Retourne la saison active, ou None s'il n'y en a pas."""
        return cls.objects.filter(status=cls.Status.ACTIVE).first()


class SeasonReward(models.Model):
    """
    Récompense attribuée à un joueur en fin de saison.
    Il existe deux classements distincts : solo (1v1) et team (2v2).
    Un joueur peut donc recevoir jusqu'à deux récompenses par saison
    (une pour chaque classement où il est dans le top).
    """

    class Tier(models.TextChoices):
        TOP1  = 'TOP1',  'Top 1'
        TOP3  = 'TOP3',  'Top 3'
        TOP10 = 'TOP10', 'Top 10'

    class RankingType(models.TextChoices):
        SOLO = 'SOLO', 'Classement 1v1'
        TEAM = 'TEAM', 'Classement 2v2'

    season = models.ForeignKey(
        Season,
        on_delete=models.CASCADE,
        related_name='rewards',
    )
    player = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='season_rewards',
    )
    ranking_type = models.CharField(
        max_length=5,
        choices=RankingType.choices,
        help_text="Classement concerné : solo (1v1) ou team (2v2).",
    )
    tier = models.CharField(
        max_length=5,
        choices=Tier.choices,
    )
    tokens_awarded = models.PositiveIntegerField(
        help_text="Nombre de jetons attribués pour cette récompense.",
    )
    elo_at_end = models.IntegerField(
        help_text="ELO du joueur dans ce classement au moment de la clôture.",
    )
    rank_at_end = models.PositiveIntegerField(
        help_text="Position dans le classement au moment de la clôture.",
    )

    awarded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['season', 'ranking_type', 'rank_at_end']
        # Un joueur ne peut avoir qu'une récompense par classement par saison
        unique_together = [('season', 'player', 'ranking_type')]

    def __str__(self):
        return (
            f"{self.player} — {self.season.name} — "
            f"{self.get_ranking_type_display()} — "
            f"{self.get_tier_display()} ({self.tokens_awarded} jetons)"
        )
