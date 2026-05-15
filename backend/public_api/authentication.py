"""
Authentification par clé API — Public API ft_transcendence
===========================================================

Usage côté client :
	X-API-Key: <votre_clé>

Si la clé est valide :
  - request.auth = instance APIKey
  - request.user = owner de la clé (ou None si pas de owner assigné)

Le rate limiting est appliqué ici à chaque requête authentifiée :
  - Fenêtre glissante d'une heure
  - Compteur reset si la dernière requête date de plus d'une heure
  - HTTP 403 si le quota est dépassé
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import APIKey


class APIKeyAuthentication(BaseAuthentication):

	def authenticate(self, request):
		key = request.META.get('HTTP_X_API_KEY')
		if not key:
			# Pas de header X-API-Key → DRF tente les autres backends (JWT, etc.)
			return None

		try:
			api_key = APIKey.objects.select_related('owner').get(key=key)
		except APIKey.DoesNotExist:
			raise AuthenticationFailed("Clé API invalide.")

		if not api_key.is_active:
			raise AuthenticationFailed("Clé API révoquée.")

		if api_key.is_expired:
			raise AuthenticationFailed("Clé API expirée.")

		# --- Rate limiting (fenêtre d'une heure) ---
		now = timezone.now()
		one_hour_ago = now - timedelta(hours=1)

		if (
			api_key.last_request_at is None
			or api_key.last_request_at < one_hour_ago
		):
			# Nouvelle fenêtre : reset du compteur
			api_key.requests_this_hour = 1
		else:
			if api_key.requests_this_hour >= api_key.rate_limit:
				raise AuthenticationFailed(
					f"Rate limit atteint ({api_key.rate_limit} requêtes/heure). "
					"Réessayez dans moins d'une heure."
				)
			api_key.requests_this_hour += 1

		api_key.last_request_at = now
		api_key.save(update_fields=['requests_this_hour', 'last_request_at'])

		# request.user peut être None si pas de owner — DRF gère AnonymousUser
		return (api_key.owner, api_key)

	def authenticate_header(self, request):
		return 'X-API-Key'
