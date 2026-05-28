"""
Modèle utilisateur personnalisé — à compléter par Thaïs.

On étend AbstractUser pour pouvoir ajouter des champs custom plus tard
(avatar, bio, ELO, wallet, 2FA, OAuth 42, etc.) sans migration complexe.

AUTH_USER_MODEL = 'users.CustomUser' est déjà configuré dans settings.py.
"""

from django.contrib.auth.models import AbstractUser
from django.db import models


class CustomUser(AbstractUser):
    """
    Squelette minimal pour débloquer le démarrage du backend.
    Les champs métier (avatar, bio, elo_solo, elo_team, wallet, 2FA...)
    sont à ajouter ici par Thaïs.
    """

    # -------------------------------------------------------------------------
    # Champs ELO — ajoutés par Sydney (nécessaires pour la logique matches)
    # Thaïs : tu peux compléter avatar, bio, wallet, 2FA, etc. à la suite
    # -------------------------------------------------------------------------
    elo_solo = models.IntegerField(
        default=1000,
        help_text="ELO individuel 1v1. Mis à jour à chaque match SOLO classé validé.",
    )
    elo_team = models.IntegerField(
        default=1000,
        help_text="ELO personnel en 2v2. Indépendant du partenaire.",
    )

    # TODO Thaïs : compléter ici
    #   avatar          = models.ImageField(upload_to='avatars/', null=True, blank=True)
    #   bio             = models.TextField(blank=True, default='')
    #   wallet_tokens   = models.PositiveIntegerField(default=100)
    #   is_2fa_enabled  = models.BooleanField(default=False)
    #   totp_secret     = models.CharField(max_length=64, blank=True, default='')

    def __str__(self):
        return self.username
