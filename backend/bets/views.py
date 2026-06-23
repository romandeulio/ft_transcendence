"""
Betting REST API.

  GET    /api/bets/available/   games currently open for betting (live) + odds
  POST   /api/bets/            place a bet { reservation, side, amount }
  GET    /api/bets/mine/        the caller's bet history
  DELETE /api/bets/<id>/        cancel one of the caller's bets (while still open)
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
    """Ongoing games that can be bet on (2v1 games excluded)."""
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
    """Place a bet: { reservation: <uuid>, side: 'p1'|'p2', amount: int }."""
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
    """The user's bet history (open + resolved)."""
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
    """Cancel an open bet (refunds the stake)."""
    bet = get_object_or_404(Bet.objects.select_related('reservation'), pk=pk)
    try:
        services.cancel_bet(request.user, bet)
    except services.BetError as exc:
        return Response(
            {'detail': exc.messages[0] if exc.messages else str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)
