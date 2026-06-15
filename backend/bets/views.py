"""
API REST des paris.

  GET    /api/bets/available/   matchs ouverts aux paris (PENDING) + cotes
  POST   /api/bets/            poser un pari { match, side, amount }
  GET    /api/bets/mine/        historique de mes paris
  DELETE /api/bets/<id>/        annuler un de mes paris (tant que ouvert)
"""
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from matches.models import Match
from .models import Bet
from . import services
from .serializers import serialize_available, serialize_history


# ---------------------------------------------------------------------------
# GET /api/bets/available/
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def available_bets(request):
    """Matchs en attente (PENDING) sur lesquels on peut parier (hors 2v1)."""
    matches = (
        Match.objects
        .filter(status=Match.Status.PENDING)
        .exclude(match_type=Match.MatchType.TWO_V_ONE)
        .select_related(
            'player1', 'player1_teammate',
            'player2', 'player2_teammate',
        )
    )
    data = [serialize_available(m, request.user) for m in matches]
    return Response(data)


# ---------------------------------------------------------------------------
# POST /api/bets/
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def place_bet(request):
    """Poser un pari : { match: <uuid>, side: 'p1'|'p2', amount: int }."""
    match_id = request.data.get('match')
    side = request.data.get('side')
    amount = request.data.get('amount')

    if not match_id:
        return Response(
            {'detail': "Champ 'match' requis."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    match = get_object_or_404(
        Match.objects.select_related(
            'player1', 'player1_teammate',
            'player2', 'player2_teammate',
        ),
        pk=match_id,
    )

    try:
        bet = services.place_bet(request.user, match, side, amount)
    except services.BetError as exc:
        return Response(
            {'detail': exc.messages[0] if exc.messages else str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(serialize_history(bet), status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# GET /api/bets/mine/
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_bets(request):
    """Historique des paris de l'utilisateur (ouverts + résolus)."""
    bets = (
        Bet.objects
        .filter(user=request.user)
        .select_related(
            'match', 'match__player1', 'match__player1_teammate',
            'match__player2', 'match__player2_teammate',
            'predicted_winner',
        )
    )
    return Response([serialize_history(b) for b in bets])


# ---------------------------------------------------------------------------
# DELETE /api/bets/<id>/
# ---------------------------------------------------------------------------

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def cancel_bet(request, pk):
    """Annuler un pari ouvert (remboursement de la mise)."""
    bet = get_object_or_404(Bet.objects.select_related('match'), pk=pk)
    try:
        services.cancel_bet(request.user, bet)
    except services.BetError as exc:
        return Response(
            {'detail': exc.messages[0] if exc.messages else str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)
