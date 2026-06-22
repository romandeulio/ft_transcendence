import secrets
from django.db import models
from django.conf import settings
from django.utils import timezone


def generate_api_key():
	"""Génère une clé aléatoire sécurisée de 40 caractères."""
	return secrets.token_urlsafe(30)


class APIKey(models.Model):
	"""
	Clé d'accès à la Public API (lecture seule pour les endpoints GET,
	accès complet pour les clés avec is_full_access=True).

	Cas d'usage typique : afficher le classement sur un écran TV
	à côté du baby-foot, sans avoir besoin d'un compte utilisateur.
	"""

	name = models.CharField(
		max_length=100,
		help_text="Nom descriptif de l'usage (ex: 'Écran TV couloir', 'Bot Discord').",
	)
	key = models.CharField(
		max_length=64,
		unique=True,
		default=generate_api_key,
		editable=False,
		help_text="Clé générée automatiquement. Non modifiable après création.",
	)
	owner = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='api_keys',
		help_text="Utilisateur responsable de cette clé (optionnel).",
	)

	is_active = models.BooleanField(
		default=True,
		help_text="Désactiver pour révoquer l'accès sans supprimer la clé.",
	)
	is_full_access = models.BooleanField(
		default=False,
		help_text="Si True : accès POST/PUT/DELETE. Si False : GET uniquement.",
	)

	# Rate limiting — nombre de requêtes sur la dernière heure
	requests_this_hour = models.PositiveIntegerField(default=0)
	rate_limit         = models.PositiveIntegerField(
		default=200,
		help_text="Nombre max de requêtes par heure pour cette clé.",
	)
	last_request_at = models.DateTimeField(null=True, blank=True)

	expires_at = models.DateTimeField(
		null=True, blank=True,
		help_text="Date d'expiration. Null = pas d'expiration.",
	)

	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		db_table = 'api_keys'
		managed = False
		ordering = ['-created_at']
		verbose_name     = 'Clé API'
		verbose_name_plural = 'Clés API'

	def __str__(self):
		return f"{self.name} ({'active' if self.is_active else 'révoquée'})"

	@property
	def is_expired(self):
		if self.expires_at is None:
			return False
		return timezone.now() > self.expires_at

	@property
	def is_valid(self):
		"""True si la clé est active et non expirée."""
		return self.is_active and not self.is_expired
