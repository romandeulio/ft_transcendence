"""
Public API — ft_transcendence
==============================

Deux types d'accès :
  1. Endpoints publics (X-API-Key) — pour afficher les données depuis l'extérieur
	 (écran TV, bot Discord, etc.)
  2. Gestion des clés (JWT standard) — pour créer / révoquer ses propres clés

Endpoints obligatoires (module Major) :
  GET    /api/public/ranking/
  GET    /api/public/matches/
  POST   /api/public/matches/
  PUT    /api/public/matches/<id>/
  DELETE /api/public/matches/<id>/
"""

from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from matches.models import Match
from matches.serializers import MatchCreateSerializer, MatchSerializer
from seasons.models import Season
from seasons.serializers import RankingEntrySerializer
from seasons.views import _build_ranking

from .authentication import APIKeyAuthentication
from .models import APIKey
from .permissions import HasFullAccessAPIKey, HasValidAPIKey
from .serializers import APIKeyCreateSerializer, APIKeyRevokeSerializer, APIKeySerializer


# ===========================================================================
# 1. ENDPOINTS PUBLICS — authentification par clé API (X-API-Key)
# ===========================================================================

class PublicRankingView(APIView):
	"""
	GET /api/public/ranking/?type=solo|team&season=<id>

	Retourne le classement ELO de la saison active (ou d'une saison précise).
	Accessible avec n'importe quelle clé API valide (read-only).
	"""
	authentication_classes = [APIKeyAuthentication]
	permission_classes     = [HasValidAPIKey]

	def get(self, request):
		ranking_type = request.query_params.get('type', 'solo').upper()
		if ranking_type not in ('SOLO', 'TEAM'):
			return Response(
				{'detail': "Paramètre 'type' invalide. Valeurs acceptées : solo, team."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		season_id = request.query_params.get('season')
		if season_id:
			season = get_object_or_404(Season, pk=season_id)
		else:
			season = Season.get_active()
			if season is None:
				return Response(
					{'detail': "Aucune saison active. Précisez ?season=<id>."},
					status=status.HTTP_404_NOT_FOUND,
				)

		ranking = _build_ranking(season, ranking_type)
		return Response(RankingEntrySerializer(ranking, many=True).data)


class PublicMatchListCreateView(APIView):
	"""
	GET  /api/public/matches/ — liste des matchs VALIDATED (read-only)
	POST /api/public/matches/ — créer un match (full_access requis)

	Filtres GET : ?season=<id>  ?type=SOLO|TEAM|TWO_V_ONE
	"""
	authentication_classes = [APIKeyAuthentication]

	def get_permissions(self):
		if self.request.method == 'POST':
			return [HasFullAccessAPIKey()]
		return [HasValidAPIKey()]

	def get(self, request):
		qs = Match.objects.filter(
			status=Match.Status.VALIDATED,
		).select_related(
			'player1', 'player1_teammate',
			'player2', 'player2_teammate',
			'season',
		)

		season_id = request.query_params.get('season')
		if season_id:
			qs = qs.filter(season_id=season_id)

		match_type = request.query_params.get('type')
		if match_type:
			qs = qs.filter(match_type=match_type.upper())

		return Response(MatchSerializer(qs, many=True).data)

	def post(self, request):
		serializer = MatchCreateSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		match = serializer.save()
		return Response(
			MatchSerializer(match).data,
			status=status.HTTP_201_CREATED,
		)


class PublicMatchDetailView(APIView):
	"""
	GET    /api/public/matches/<pk>/ — détail d'un match validé
	PUT    /api/public/matches/<pk>/ — modifier les scores / statut (full_access)
	DELETE /api/public/matches/<pk>/ — supprimer un match (full_access)
	"""
	authentication_classes = [APIKeyAuthentication]

	def get_permissions(self):
		if self.request.method == 'GET':
			return [HasValidAPIKey()]
		return [HasFullAccessAPIKey()]

	def _get_match(self, pk, validated_only=False):
		qs = Match.objects.select_related(
			'player1', 'player1_teammate',
			'player2', 'player2_teammate',
			'season',
		)
		if validated_only:
			qs = qs.filter(status=Match.Status.VALIDATED)
		return get_object_or_404(qs, pk=pk)

	def get(self, request, pk):
		match = self._get_match(pk, validated_only=True)
		return Response(MatchSerializer(match).data)

	def put(self, request, pk):
		match = self._get_match(pk)
		serializer = MatchSerializer(match, data=request.data, partial=True)
		serializer.is_valid(raise_exception=True)
		serializer.save()
		return Response(serializer.data)

	def delete(self, request, pk):
		match = self._get_match(pk)
		match.delete()
		return Response(status=status.HTTP_204_NO_CONTENT)


# ===========================================================================
# 2. GESTION DES CLÉS API — authentification JWT standard
# ===========================================================================

class APIKeyListCreateView(APIView):
	"""
	GET  /api/public/keys/ — liste mes clés API (sans afficher la clé brute)
	POST /api/public/keys/ — créer une clé (la clé brute n'est affichée qu'ici)
	"""
	permission_classes = [IsAuthenticated]

	def get(self, request):
		keys = APIKey.objects.filter(owner=request.user)
		return Response(APIKeySerializer(keys, many=True).data)

	def post(self, request):
		serializer = APIKeyCreateSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		api_key = serializer.save(owner=request.user)
		# On renvoie la clé brute UNE SEULE FOIS — elle ne sera plus jamais visible
		data = APIKeyCreateSerializer(api_key).data
		data['key'] = api_key.key
		return Response(data, status=status.HTTP_201_CREATED)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def api_key_revoke(request, pk):
	"""
	PATCH /api/public/keys/<pk>/revoke/
	Passe is_active → False. La clé reste en base pour l'historique.
	"""
	api_key = get_object_or_404(APIKey, pk=pk)

	if not request.user.is_staff and api_key.owner_id != request.user.pk:
		return Response(
			{'detail': "Vous ne pouvez révoquer que vos propres clés."},
			status=status.HTTP_403_FORBIDDEN,
		)

	if not api_key.is_active:
		return Response(
			{'detail': "Cette clé est déjà révoquée."},
			status=status.HTTP_400_BAD_REQUEST,
		)

	api_key.is_active = False
	api_key.save(update_fields=['is_active', 'updated_at'])

	return Response(APIKeySerializer(api_key).data)
