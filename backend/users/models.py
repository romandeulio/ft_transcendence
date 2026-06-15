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
    ban_permanent = models.BooleanField(default=False)
    banned_until = models.DateTimeField(null=True, blank=True)
    wallet_tokens = models.IntegerField(default=10)

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

    def _aware_banned_until(self):
        """Retourne banned_until en timezone-aware (gère les colonnes TIMESTAMP sans tz)."""
        if self.banned_until is None:
            return None
        from django.utils import timezone
        if timezone.is_naive(self.banned_until):
            return timezone.make_aware(self.banned_until)
        return self.banned_until

    @property
    def is_banned(self):
        if self.ban_permanent:
            return True
        bu = self._aware_banned_until()
        if bu:
            from django.utils import timezone
            return bu > timezone.now()
        return False

    def ban_info(self):
        """Retourne un dict décrivant le ban, ou None si pas banni."""
        if self.ban_permanent:
            return {'type': 'permanent'}
        bu = self._aware_banned_until()
        if bu:
            from django.utils import timezone
            remaining = bu - timezone.now()
            if remaining.total_seconds() > 0:
                return {
                    'type': 'temporary',
                    'until': bu.isoformat(),
                    'remaining_seconds': int(remaining.total_seconds()),
                }
        return None
    
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