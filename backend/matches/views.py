from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .elo import compute_elo_changes
from .models import Match
from .serializers import (
	MatchCreateSerializer,
	MatchSerializer,
	MatchValidateSerializer,
)


# ---------------------------------------------------------------------------
# GET /api/matches/   POST /api/matches/
# ---------------------------------------------------------------------------

class MatchListCreateView(generics.ListCreateAPIView):
	"""
	GET  — liste paginée des matchs.
	Filtres optionnels : ?player=username  ?season=id  ?status=  ?type=  ?ranked=
	POST — créer un match (status PENDING, ELO calculé à la validation).
	"""
	permission_classes = [IsAuthenticated]

	def get_serializer_class(self):
		if self.request.method == 'POST':
			return MatchCreateSerializer
		return MatchSerializer

	def get_queryset(self):
		qs = Match.objects.select_related(
			'player1', 'player1_teammate',
			'player2', 'player2_teammate',
			'season',
		)
		params = self.request.query_params

		# ?player=username  → matchs où ce joueur apparaît (n'importe quel rôle)
		player = params.get('player')
		if player:
			qs = qs.filter(
				Q(player1__username=player)          |
				Q(player2__username=player)          |
				Q(player1_teammate__username=player) |
				Q(player2_teammate__username=player)
			)

		season = params.get('season')
		if season:
			qs = qs.filter(season_id=season)

		match_status = params.get('status')
		if match_status:
			qs = qs.filter(status=match_status.upper())

		match_type = params.get('type')
		if match_type:
			qs = qs.filter(match_type=match_type.upper())

		ranked = params.get('ranked')
		if ranked is not None:
			qs = qs.filter(is_ranked=(ranked.lower() == 'true'))

		return qs

	def create(self, request, *args, **kwargs):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		match = serializer.save()
		return Response(
			MatchSerializer(match).data,
			status=status.HTTP_201_CREATED,
		)


# ---------------------------------------------------------------------------
# GET /api/matches/<pk>/
# ---------------------------------------------------------------------------

class MatchDetailView(generics.RetrieveAPIView):
	"""GET — détail d'un match."""
	serializer_class   = MatchSerializer
	permission_classes = [IsAuthenticated]
	queryset = Match.objects.select_related(
		'player1', 'player1_teammate',
		'player2', 'player2_teammate',
		'season',
	)


# ---------------------------------------------------------------------------
# PATCH /api/matches/<pk>/validate/
# ---------------------------------------------------------------------------

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def match_validate(request, pk):
	"""
	Valide un match PENDING :
	  1. Vérifie le statut
	  2. Met à jour les scores
	  3. Calcule l'ELO si is_ranked=True (SOLO ou TEAM)
	  4. Passe status → VALIDATED
	Tout est atomique.
	"""
	match = get_object_or_404(
		Match.objects.select_related(
			'player1', 'player1_teammate',
			'player2', 'player2_teammate',
		),
		pk=pk,
	)

	if match.status != Match.Status.PENDING:
		return Response(
			{'detail': (
				f"Impossible de valider : statut actuel "
				f"'{match.get_status_display()}'."
			)},
			status=status.HTTP_400_BAD_REQUEST,
		)

	serializer = MatchValidateSerializer(match, data=request.data, partial=True)
	serializer.is_valid(raise_exception=True)

	score_p1 = serializer.validated_data.get('score_player1', match.score_player1)
	score_p2 = serializer.validated_data.get('score_player2', match.score_player2)

	with transaction.atomic():
		match.score_player1 = score_p1
		match.score_player2 = score_p2

		# Calcul ELO avant le save pour remplir les champs before/after
		if match.is_ranked:
			compute_elo_changes(match, score_p1, score_p2)

		match.status = Match.Status.VALIDATED
		match.save()

	return Response(MatchSerializer(match).data)


# ---------------------------------------------------------------------------
# PATCH /api/matches/<pk>/cancel/
# ---------------------------------------------------------------------------

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def match_cancel(request, pk):
	"""
	Annule un match PENDING.
	Autorisé : staff Django ou l'un des joueurs impliqués dans le match.
	"""
	match = get_object_or_404(Match, pk=pk)

	if match.status != Match.Status.PENDING:
		return Response(
			{'detail': "Seuls les matchs en attente peuvent être annulés."},
			status=status.HTTP_400_BAD_REQUEST,
		)

	user = request.user
	involved = {
		match.player1_id,
		match.player2_id,
		match.player1_teammate_id,
		match.player2_teammate_id,
	}
	if not user.is_staff and user.pk not in involved:
		return Response(
			{'detail': "Vous n'êtes pas autorisé à annuler ce match."},
			status=status.HTTP_403_FORBIDDEN,
		)

	match.status = Match.Status.CANCELLED
	match.save(update_fields=['status', 'updated_at'])

	return Response(MatchSerializer(match).data)
