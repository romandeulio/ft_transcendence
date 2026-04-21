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

    # TODO Thaïs : ajouter les champs custom ici
    # Exemples :
    #   avatar        = models.ImageField(...)
    #   bio           = models.TextField(...)
    #   elo_solo      = models.IntegerField(default=1000)
    #   elo_team      = models.IntegerField(default=1000)
    #   is_2fa_enabled = models.BooleanField(default=False)

    def __str__(self):
        return self.username
