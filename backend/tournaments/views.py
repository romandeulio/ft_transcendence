from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Tournament, TournamentRegistration
from .serializers import RegistrationSerializer, TournamentCreateSerializer, TournamentSerializer

User = get_user_model()

BDE_PASSWORD = getattr(settings, 'BDE_PASSWORD', 'bde42')


# ---------------------------------------------------------------------------
# POST /api/tournaments/bde-unlock/
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bde_unlock(request):
    pwd = request.data.get('password', '')
    if pwd == BDE_PASSWORD:
        return Response({'ok': True})
    return Response({'detail': 'Mot de passe incorrect.'}, status=status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# GET  /api/tournaments/   → tournoi actif (OPEN ou ONGOING)
# POST /api/tournaments/   → créer un tournoi (BDE uniquement)
# ---------------------------------------------------------------------------

class TournamentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tournament = Tournament.objects.filter(
            status__in=[Tournament.Status.OPEN, Tournament.Status.ONGOING]
        ).first()
        if not tournament:
            return Response(None)
        return Response(TournamentSerializer(tournament).data)

    def post(self, request):
        bde_pwd = request.data.get('bde_password', '')
        if bde_pwd != BDE_PASSWORD:
            return Response({'detail': 'Accès BDE requis.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = TournamentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tournament = serializer.save(created_by=request.user)
        return Response(TournamentSerializer(tournament).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# POST /api/tournaments/<pk>/register/
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def register_to_tournament(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)

    if tournament.status != Tournament.Status.OPEN:
        return Response({'detail': 'Les inscriptions sont fermées.'}, status=status.HTTP_400_BAD_REQUEST)

    if tournament.deadline and tournament.deadline < timezone.now():
        return Response({'detail': "La date limite d'inscription est dépassée."}, status=status.HTTP_400_BAD_REQUEST)

    already = TournamentRegistration.objects.filter(
        tournament=tournament
    ).filter(Q(player1=request.user) | Q(player2=request.user))
    if already.exists():
        return Response({'detail': 'Vous êtes déjà inscrit.'}, status=status.HTTP_400_BAD_REQUEST)

    max_teams = tournament.max_players // 2
    if tournament.registrations.count() >= max_teams:
        return Response({'detail': 'Le tournoi est complet.'}, status=status.HTTP_400_BAD_REQUEST)

    partner_login = (request.data.get('partner') or '').strip()
    player2 = None
    if partner_login:
        try:
            player2 = User.objects.get(username=partner_login)
        except User.DoesNotExist:
            return Response({'detail': 'Partenaire introuvable.'}, status=status.HTTP_400_BAD_REQUEST)
        if player2 == request.user:
            return Response({'detail': 'Vous ne pouvez pas vous inscrire avec vous-même.'}, status=status.HTTP_400_BAD_REQUEST)
        partner_taken = TournamentRegistration.objects.filter(
            tournament=tournament
        ).filter(Q(player1=player2) | Q(player2=player2))
        if partner_taken.exists():
            return Response({'detail': 'Ce partenaire est déjà inscrit.'}, status=status.HTTP_400_BAD_REQUEST)

    reg = TournamentRegistration.objects.create(
        tournament=tournament,
        player1=request.user,
        player2=player2,
    )
    return Response(RegistrationSerializer(reg).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# GET /api/tournaments/<pk>/registrations/  → liste d'attente complète
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tournament_registrations(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    regs = tournament.registrations.select_related('player1', 'player2').all()
    return Response(RegistrationSerializer(regs, many=True).data)


# ---------------------------------------------------------------------------
# GET /api/tournaments/<pk>/solo/  → inscrits sans partenaire (hors moi)
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tournament_solo(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    solo = tournament.registrations.filter(player2__isnull=True).select_related('player1')
    data = [
        {
            'login': r.player1.username,
            'since': r.registered_at.strftime('%d/%m/%Y'),
        }
        for r in solo
        if r.player1 != request.user
    ]
    return Response(data)


# ---------------------------------------------------------------------------
# GET /api/tournaments/<pk>/my-registration/
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_registration(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    reg = TournamentRegistration.objects.filter(
        tournament=tournament
    ).filter(Q(player1=request.user) | Q(player2=request.user)).first()
    if not reg:
        return Response(None)
    return Response(RegistrationSerializer(reg).data)
