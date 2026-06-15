import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
import pyotp

class UserManager(BaseUserManager):
    def create_user(self, email, username, password=None):
        if not email:
            raise ValueError("Email required")
        
        user = self.model(
            email=self.normalize_email(email),
            username=username
        )

        user.set_password(password)
        user.save()
        return user
    

class User(AbstractBaseUser):

    # -------------------------------------------------------------------------
    # Champs ELO — ajoutés nécessaires pour la logique matches ??
    # -------------------------------------------------------------------------
    class Meta:
        db_table = 'users'
        managed   = False
    elo_solo = models.IntegerField(
        default=1000,
        help_text="ELO individuel 1v1. Mis à jour à chaque match SOLO classé validé.",
    )
    elo_team = models.IntegerField(
        default=1000,
        help_text="ELO personnel en 2v2. Indépendant du partenaire.",
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    username = models.CharField(max_length=8, unique=True)
    email = models.EmailField(unique=True)

    role = models.CharField(
        max_length=15,
        default="user"
    )

    is_2fa_enabled = models.BooleanField(default=False)
    totp_secret = models.TextField(null=True, blank=True)

    oauth_42_id = models.TextField(unique=True, null=True, blank=True)

    gdpr_deleted = models.BooleanField(default=False)
    wallet_tokens = models.IntegerField(default=10000)

    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=False)
    avatar_url = models.CharField(
        max_length=500,
        blank=True,
        null=True
    )
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]
    objects = UserManager()
    
    def __str__(self):
        return self.username

    # -------------------------------------------------------------------------
    # Wallet de jetons (paris) — système "mint" : les jetons sont créés au
    # crédit (gain de pari) et détruits au débit (mise). Pas de réserve maison.
    # -------------------------------------------------------------------------
    def deposit_tokens(self, amount: int):
        """Crédite le wallet (création de jetons). amount doit être > 0."""
        if amount is None or amount <= 0:
            return
        self.wallet_tokens = (self.wallet_tokens or 0) + amount
        self.save(update_fields=['wallet_tokens'])

    def withdraw_tokens(self, amount: int):
        """
        Débite le wallet (destruction de jetons). amount doit être > 0.
        Lève ValueError si le solde est insuffisant.
        À appeler sous transaction + select_for_update pour éviter les courses.
        """
        if amount is None or amount <= 0:
            return
        if (self.wallet_tokens or 0) < amount:
            raise ValueError("Solde de jetons insuffisant.")
        self.wallet_tokens -= amount
        self.save(update_fields=['wallet_tokens'])

    def generate_totp_secret(self):
        self.totp_secret = pyotp.random_base32()
        self.save()
        return self.totp_secret

    def verify_totp(self, code: str) -> bool:
        if not self.totp_secret:
            return False
        return pyotp.TOTP(self.totp_secret).verify(code)

    def get_totp_uri(self) -> str:
        return pyotp.totp.TOTP(self.totp_secret).provisioning_uri(
            name=self.email, issuer_name='ft_transcendence'
        )