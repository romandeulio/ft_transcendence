"""
Permissions pour la Public API.

HasValidAPIKey      → clé active et non expirée (GET)
HasFullAccessAPIKey → clé avec is_full_access=True (POST / PUT / DELETE)
"""

from rest_framework.permissions import BasePermission

from .models import APIKey


class HasValidAPIKey(BasePermission):
	message = "Une clé API valide est requise (header : X-API-Key: <clé>)."

	def has_permission(self, request, view):
		return isinstance(request.auth, APIKey)


class HasFullAccessAPIKey(BasePermission):
	message = (
		"Cette opération nécessite une clé API avec accès complet "
		"(is_full_access=True). Contactez un admin pour upgrader votre clé."
	)

	def has_permission(self, request, view):
		return (
			isinstance(request.auth, APIKey)
			and request.auth.is_full_access
		)
