import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
import pyotp
from stats.models import Stats

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

        Stats.objects.get_or_create(user=user)

        return user
    

class User(AbstractBaseUser):

    class Meta:
        db_table = 'users'
        managed   = False

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

    def anonymize(self):
        """Anonymise le compte (RGPD) au lieu d'un hard delete.

        On conserve la ligne et son id pour ne pas casser l'historique des matchs
        (FK SET_NULL → '?') : le compte devient inactif, ses données personnelles
        sont effacées et son pseudo remplacé par un identifiant neutre. Utilisé
        par la suppression RGPD (self-service) ET par la suppression admin.
        """
        import os
        from django.conf import settings

        if self.avatar_url:
            path = os.path.join(settings.MEDIA_ROOT, self.avatar_url.replace('/media/', ''))
            if os.path.exists(path):
                os.remove(path)

        old_username = self.username

        self.username = f"del{str(self.id)[:5]}"
        self.email = f"{uuid.uuid4()}@deleted.invalid"
        self.set_unusable_password()
        self.avatar_url = None
        self.oauth_42_id = None
        self.totp_secret = None
        self.is_2fa_enabled = False
        self.is_active = False
        self.last_login = None
        self.banned_until = None
        self.gdpr_deleted = True
        self.save()

        # ORDRE CRITIQUE : on ferme les WS du joueur (dont le WS paris, via son
        # groupe dédié) AVANT d'annuler son activité. `_cancel_open_activity`
        # rembourse les paris et appelle `_broadcast_closed` → un `market_closed`
        # part vers le groupe `bets`. Si ce broadcast précédait la fermeture, le
        # bets consumer du joueur le relaierait au front, qui déclencherait un
        # poll authentifié (loadHistory/refreshUser) → 401. En notifiant d'abord,
        # le `account.deleted` est déjà dans le canal du bets consumer quand le
        # `market_closed` y arrive → FIFO ferme la connexion (4002) d'abord.
        self._kick_live_session(old_username)
        self._cancel_open_activity()

    def _cancel_open_activity(self):
        """Annule l'activité en cours du joueur et rembourse les paris liés.

        Un compte supprimé en plein match ne doit plus pouvoir clôturer de
        score : ses matchs PENDING et ses parties live (Reservation IN_PROGRESS)
        sont annulés, tous les paris correspondants — y compris ses propres mises
        ouvertes sur d'autres parties — sont remboursés. Tolérant aux pannes pour
        ne jamais bloquer la suppression.
        """
        from matches.models import Match

        pending = Match.objects.filter(status=Match.Status.PENDING).filter(
            models.Q(player1_id=self.id)
            | models.Q(player2_id=self.id)
            | models.Q(player1_teammate_id=self.id)
            | models.Q(player2_teammate_id=self.id)
        )
        for match in pending:
            match.status = Match.Status.CANCELLED
            match.save(update_fields=['status', 'updated_at'])
            try:
                from bets.services import refund_for_match
                refund_for_match(match)
            except Exception:
                pass

        # Parties live en cours (fenêtre de paris ouverte) : on annule la
        # réservation et on rembourse les paris ouverts.
        try:
            from planning.models import Reservation
            from bets.services import refund_reservation

            live = Reservation.objects.filter(
                status=Reservation.Status.IN_PROGRESS,
            ).filter(
                models.Q(player1_id=self.id)
                | models.Q(player2_id=self.id)
                | models.Q(player1_teammate_id=self.id)
                | models.Q(player2_teammate_id=self.id)
            )
            for r in live:
                refund_reservation(r)
                r.status = Reservation.Status.CANCELLED
                r.save(update_fields=['status'])
        except Exception:
            pass

        # Créneaux en file d'attente (WAITING/CALLED) : on les annule pour que le
        # joueur supprimé disparaisse de la file persistée et qu'aucun adversaire
        # ne puisse lancer un match avec un compte inexistant.
        try:
            from planning.models import QueueEntry

            QueueEntry.objects.filter(
                status__in=[QueueEntry.Status.WAITING, QueueEntry.Status.CALLED]
            ).filter(
                models.Q(player1_id=self.id)
                | models.Q(player2_id=self.id)
                | models.Q(player1_teammate_id=self.id)
                | models.Q(player2_teammate_id=self.id)
            ).update(status=QueueEntry.Status.CANCELLED)
        except Exception:
            pass

        try:
            from bets.services import refund_open_bets_for_user
            refund_open_bets_for_user(self.id)
        except Exception:
            pass

    def _kick_live_session(self, username):
        """Notifie la session WebSocket du joueur supprimé pour fermer sa partie
        en cours et le déconnecter (il ne peut plus modifier de score)."""
        if not username:
            return
        try:
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer

            channel_layer = get_channel_layer()
            if channel_layer is not None:
                # ORDRE CRITIQUE : on notifie d'abord le WS paris (groupe dédié),
                # PUIS le WS file d'attente. Le `market_closed` de la partie
                # annulée est un effet aval du `account.deleted` reçu par le queue
                # consumer (group_send vers le groupe `bets`). En enfilant le
                # `account.deleted` du bets consumer AVANT de réveiller le queue
                # consumer, on garantit qu'il est dans le canal du bets consumer
                # avant que le `market_closed` n'y soit ajouté → l'ordre FIFO du
                # canal ferme la connexion (4002) d'abord. Le front pose alors son
                # verrou de session (killAuthSession) et n'émet plus de poll
                # authentifié → aucun 401. (L'ordre inverse laissait le
                # market_closed passer devant : cf. trace 686ms vs 718ms.)
                async_to_sync(channel_layer.group_send)(
                    f"bets_user_{username}", {"type": "account.deleted"}
                )
                async_to_sync(channel_layer.group_send)(
                    f"user_{username}", {"type": "account.deleted"}
                )
        except Exception:
            pass