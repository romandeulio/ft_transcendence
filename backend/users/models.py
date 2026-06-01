import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager

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

class User(AbstractBaseUser, PermissionsMixin):

    # -------------------------------------------------------------------------
    # Champs ELO — ajoutés nécessaires pour la logique matches ??
    # -------------------------------------------------------------------------
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
    wallet_tokens = models.IntegerField(default=10)

    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]
    objects = UserManager()
    
    def __str__(self):
        return self.username
    
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