"""
API REST des paris.

  GET    /api/bets/available/   parties ouvertes aux paris (live) + cotes
  POST   /api/bets/            poser un pari { reservation, side, amount }
  GET    /api/bets/mine/        historique de mes paris
  DELETE /api/bets/<id>/        annuler un de mes paris (tant que ouvert)
"""
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from planning.models import Reservation
from .models import Bet
from . import services
from .serializers import serialize_available, serialize_history


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def available_bets(request):
    """Parties en cours sur lesquelles on peut parier (hors 2v1)."""
    reservations = (
        Reservation.objects
        .filter(status=Reservation.Status.IN_PROGRESS)
        .filter(match_type__in=['SOLO', 'TEAM'])
        .select_related(
            'player1', 'player1_teammate',
            'player2', 'player2_teammate',
        )
    )
    data = [serialize_available(r, request.user) for r in reservations]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def place_bet(request):
    """Poser un pari : { reservation: <uuid>, side: 'p1'|'p2', amount: int }."""
    reservation_id = request.data.get('reservation')
    side = request.data.get('side')
    amount = request.data.get('amount')

    if not reservation_id:
        return Response(
            {'detail': "Champ 'reservation' requis."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reservation = get_object_or_404(
        Reservation.objects.select_related(
            'player1', 'player1_teammate',
            'player2', 'player2_teammate',
        ),
        pk=reservation_id,
    )

    try:
        bet = services.place_bet(request.user, reservation, side, amount)
    except services.BetError as exc:
        return Response(
            {'detail': exc.messages[0] if exc.messages else str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(serialize_history(bet), status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_bets(request):
    """Historique des paris de l'utilisateur (ouverts + résolus)."""
    bets = (
        Bet.objects
        .filter(user=request.user)
        .select_related(
            'reservation', 'reservation__player1', 'reservation__player1_teammate',
            'reservation__player2', 'reservation__player2_teammate',
            'match', 'match__player1', 'match__player1_teammate',
            'match__player2', 'match__player2_teammate',
            'predicted_winner',
        )
    )
    return Response([serialize_history(b) for b in bets])


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def cancel_bet(request, pk):
    """Annuler un pari ouvert (remboursement de la mise)."""
    bet = get_object_or_404(Bet.objects.select_related('reservation'), pk=pk)
    try:
        services.cancel_bet(request.user, bet)
    except services.BetError as exc:
        return Response(
            {'detail': exc.messages[0] if exc.messages else str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)
