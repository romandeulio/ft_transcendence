from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response

from matches.models import Match
from .models import Season, SeasonReward
from .serializers import (
	RankingEntrySerializer,
	SeasonCreateSerializer,
	SeasonRewardSerializer,
	SeasonSerializer,
)
User = get_user_model()

# ---------------------------------------------------------------------------
# Constantes de récompenses (jetons attribués par tier)
# Adaptez les valeurs selon votre équilibre économique.
# ---------------------------------------------------------------------------
REWARD_TOKENS = {
	SeasonReward.Tier.TOP1:  500,
	SeasonReward.Tier.TOP3:  250,
	SeasonReward.Tier.TOP10: 100,
}


# ---------------------------------------------------------------------------
# GET /api/seasons/    POST /api/seasons/
# ---------------------------------------------------------------------------

class SeasonListCreateView(generics.ListCreateAPIView):
	"""
	GET  — liste toutes les saisons (toutes permissions authentifiées).
	POST — créer une nouvelle saison (staff uniquement).
	"""
	permission_classes = [IsAuthenticated]

	def get_serializer_class(self):
		if self.request.method == 'POST':
			return SeasonCreateSerializer
		return SeasonSerializer

	def get_queryset(self):
		return Season.objects.prefetch_related('rewards').all()

	def create(self, request, *args, **kwargs):
		if not request.user.is_staff:
			return Response(
				{'detail': "Seul un admin peut créer une saison."},
				status=status.HTTP_403_FORBIDDEN,
			)
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		season = serializer.save()
		return Response(
			SeasonSerializer(season).data,
			status=status.HTTP_201_CREATED,
		)


# ---------------------------------------------------------------------------
# GET /api/seasons/<pk>/
# ---------------------------------------------------------------------------

class SeasonDetailView(generics.RetrieveAPIView):
	"""GET — détail d'une saison avec ses récompenses."""
	serializer_class   = SeasonSerializer
	permission_classes = [IsAuthenticated]
	queryset = Season.objects.prefetch_related('rewards')


# ---------------------------------------------------------------------------
# PATCH /api/seasons/<pk>/activate/
# ---------------------------------------------------------------------------

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def season_activate(request, pk):
	"""
	Passe une saison UPCOMING → ACTIVE (staff uniquement).
	Si une autre saison est déjà ACTIVE, elle passe à FINISHED d'abord.
	"""
	if not request.user.is_staff:
		return Response(
			{'detail': "Seul un admin peut activer une saison."},
			status=status.HTTP_403_FORBIDDEN,
		)

	season = get_object_or_404(Season, pk=pk)

	if season.status != Season.Status.UPCOMING:
		return Response(
			{'detail': f"Statut actuel : '{season.get_status_display()}'. Seules les saisons UPCOMING peuvent être activées."},
			status=status.HTTP_400_BAD_REQUEST,
		)

	with transaction.atomic():
		# Clore la saison active courante s'il y en a une
		Season.objects.filter(status=Season.Status.ACTIVE).update(
			status=Season.Status.FINISHED
		)
		season.status = Season.Status.ACTIVE
		season.save(update_fields=['status', 'updated_at'])

	return Response(SeasonSerializer(season).data)


# ---------------------------------------------------------------------------
# PATCH /api/seasons/<pk>/close/
# ---------------------------------------------------------------------------

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def season_close(request, pk):
	"""
	Clore une saison ACTIVE (staff uniquement) :
	  1. Passe status → FINISHED
	  2. Calcule le classement solo et team
	  3. Distribue les récompenses (tokens) aux top joueurs
	  4. Marque rewards_distributed = True
	"""
	if not request.user.is_staff:
		return Response(
			{'detail': "Seul un admin peut clore une saison."},
			status=status.HTTP_403_FORBIDDEN,
		)

	season = get_object_or_404(Season, pk=pk)

	if season.status != Season.Status.ACTIVE:
		return Response(
			{'detail': "Seule une saison ACTIVE peut être clôturée."},
			status=status.HTTP_400_BAD_REQUEST,
		)

	if season.rewards_distributed:
		return Response(
			{'detail': "Les récompenses ont déjà été distribuées pour cette saison."},
			status=status.HTTP_400_BAD_REQUEST,
		)

	with transaction.atomic():
		season.status = Season.Status.FINISHED
		season.save(update_fields=['status', 'updated_at'])

		_distribute_rewards(season, SeasonReward.RankingType.SOLO)
		_distribute_rewards(season, SeasonReward.RankingType.TEAM)

		season.rewards_distributed = True
		season.save(update_fields=['rewards_distributed', 'updated_at'])

	return Response(SeasonSerializer(season).data)


def _distribute_rewards(season, ranking_type: str) -> None:
	"""
	Calcule le classement final d'un type (SOLO ou TEAM) et crée les SeasonReward.
	Les tokens sont ajoutés au wallet du joueur (champ wallet_tokens sur User,
	ajouté par Thaïs — on utilise getattr avec fallback 0 si pas encore présent).
	"""
	ranking = _build_ranking(season, ranking_type)

	for entry in ranking:
		tier = _get_tier(entry['rank'])
		if tier is None:
			break  # on ne récompense que le top 10

		tokens = REWARD_TOKENS[tier]
		player = User.objects.get(username=entry['username'])

		SeasonReward.objects.create(
			season=season,
			player=player,
			ranking_type=ranking_type,
			tier=tier,
			tokens_awarded=tokens,
			elo_at_end=entry['elo'],
			rank_at_end=entry['rank'],
		)

		# Créditer le wallet — le champ wallet_tokens est ajouté par Thaïs.
		# Si pas encore présent, on ne plante pas : on skip silencieusement.
		if hasattr(player, 'wallet_tokens'):
			player.wallet_tokens += tokens
			player.save(update_fields=['wallet_tokens'])


def _get_tier(rank: int):
	if rank == 1:
		return SeasonReward.Tier.TOP1
	if rank <= 3:
		return SeasonReward.Tier.TOP3
	if rank <= 10:
		return SeasonReward.Tier.TOP10
	return None


# ---------------------------------------------------------------------------
# GET /api/seasons/<pk>/ranking/?type=solo|team
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def season_ranking(request, pk):
	"""
	Classement saisonnier d'une saison.
	?type=solo (défaut) ou ?type=team
	Pour chaque joueur : ELO après son dernier match validé classé de la saison.
	"""
	season = get_object_or_404(Season, pk=pk)
	ranking_type = request.query_params.get('type', 'solo').upper()

	if ranking_type not in ('SOLO', 'TEAM'):
		return Response(
			{'detail': "Paramètre 'type' invalide. Valeurs acceptées : solo, team."},
			status=status.HTTP_400_BAD_REQUEST,
		)

	ranking = _build_ranking(season, ranking_type)
	serializer = RankingEntrySerializer(ranking, many=True)
	return Response(serializer.data)


def _build_ranking(season, ranking_type: str) -> list:
	"""
	Construit le classement pour un type donné (SOLO ou TEAM).

	Pour chaque joueur :
	  - ELO : valeur après son dernier match validé classé dans la saison
		(on itère dans l'ordre chronologique → la dernière entrée dans
		elo_map est bien l'ELO final).
	  - wins / losses : comptés sur tous les matchs classés validés de la saison.
	"""
	if ranking_type == 'SOLO':
		matches = Match.objects.filter(
			season=season,
			status=Match.Status.VALIDATED,
			is_ranked=True,
			match_type=Match.MatchType.SOLO,
		).select_related('player1', 'player2').order_by('played_at')

		elo_map  = {}   # player_id → (username, elo_after)
		wins_map = {}   # player_id → int
		loss_map = {}   # player_id → int

		for m in matches:
			winner = m.get_winner()  # 'player1_side' | 'player2_side' | None

			elo_map[m.player1_id] = (m.player1.username, m.elo_solo_player1_after)
			elo_map[m.player2_id] = (m.player2.username, m.elo_solo_player2_after)

			# Égalité → on n'incrémente ni wins ni losses
			if winner == 'player1_side':
				wins_map[m.player1_id] = wins_map.get(m.player1_id, 0) + 1
				loss_map[m.player2_id] = loss_map.get(m.player2_id, 0) + 1
			elif winner == 'player2_side':
				wins_map[m.player2_id] = wins_map.get(m.player2_id, 0) + 1
				loss_map[m.player1_id] = loss_map.get(m.player1_id, 0) + 1

	else:  # TEAM
		matches = Match.objects.filter(
			season=season,
			status=Match.Status.VALIDATED,
			is_ranked=True,
			match_type=Match.MatchType.TEAM,
		).select_related(
			'player1', 'player1_teammate',
			'player2', 'player2_teammate',
		).order_by('played_at')

		elo_map  = {}
		wins_map = {}
		loss_map = {}

		for m in matches:
			winner = m.get_winner()

			elo_map[m.player1_id] = (m.player1.username, m.elo_team_player1_after)
			elo_map[m.player1_teammate_id] = (
				m.player1_teammate.username, m.elo_team_player1_teammate_after
			)
			elo_map[m.player2_id] = (m.player2.username, m.elo_team_player2_after)
			if m.player2_teammate_id:
				elo_map[m.player2_teammate_id] = (
					m.player2_teammate.username, m.elo_team_player2_teammate_after
				)

			# Égalité → on n'incrémente ni wins ni losses
			if winner == 'player1_side':
				winners_pids = [m.player1_id, m.player1_teammate_id]
				losers_pids  = [m.player2_id, m.player2_teammate_id]
			elif winner == 'player2_side':
				winners_pids = [m.player2_id, m.player2_teammate_id]
				losers_pids  = [m.player1_id, m.player1_teammate_id]
			else:
				winners_pids = []
				losers_pids  = []

			for pid in winners_pids:
				if pid:
					wins_map[pid] = wins_map.get(pid, 0) + 1
			for pid in losers_pids:
				if pid:
					loss_map[pid] = loss_map.get(pid, 0) + 1

	return [
		{
			'rank':     i + 1,
			'username': username,
			'elo':      elo,
			'wins':     wins_map.get(pid, 0),
			'losses':   loss_map.get(pid, 0),
		}
		for i, (pid, (username, elo)) in enumerate(
			sorted(elo_map.items(), key=lambda kv: kv[1][1], reverse=True)
		)
	]
