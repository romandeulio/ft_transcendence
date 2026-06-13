import random
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Case, IntegerField, Q, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from planning.models import QueueEntry

from .models import Tournament, TournamentMatch, TournamentRegistration, TournamentTeam
from .serializers import (
    RegistrationSerializer,
    TournamentCreateSerializer,
    TournamentMatchSerializer,
    TournamentSerializer,
    TournamentUpdateSerializer,
)

User = get_user_model()

BDE_PASSWORD = getattr(settings, 'BDE_PASSWORD', 'bde42')


def _has_bde_access(request):
    if getattr(request.user, 'is_staff', False) or getattr(request.user, 'is_superuser', False):
        return True
    if getattr(request.user, 'role', '').lower() in ('bde', 'bocalien'):
        return True
    return request.data.get('bde_password') == BDE_PASSWORD


def _require_bde(request):
    if _has_bde_access(request):
        return None
    return Response({'detail': 'Accès BDE requis.'}, status=status.HTTP_403_FORBIDDEN)


def _next_power_of_two(value):
    return 1 << (value - 1).bit_length()


def _total_rounds(bracket_size):
    rounds = 0
    while bracket_size > 1:
        bracket_size //= 2
        rounds += 1
    return rounds


def _schedule_ready_match(match):
    if not match.is_ready or match.queue_entry_id:
        return match

    entry = QueueEntry.objects.create(
        player1=match.team1.player1,
        player1_teammate=match.team1.player2,
        player2=match.team2.player1,
        player2_teammate=match.team2.player2,
        match_type='TEAM',
        is_ranked=False,
        status=QueueEntry.Status.WAITING,
    )
    match.queue_entry = entry
    match.save(update_fields=['queue_entry'])
    return match


def _advance_winner(match):
    next_match = TournamentMatch.objects.filter(
        tournament=match.tournament,
        round_number=match.round_number + 1,
        bracket_position=(match.bracket_position + 1) // 2,
    ).first()

    if not next_match:
        match.tournament.status = Tournament.Status.DONE
        match.tournament.save(update_fields=['status'])
        return

    update_fields = []
    if match.bracket_position % 2 == 1:
        if next_match.team1_id != match.winner_id:
            next_match.team1 = match.winner
            update_fields.append('team1')
    else:
        if next_match.team2_id != match.winner_id:
            next_match.team2 = match.winner
            update_fields.append('team2')

    if update_fields:
        next_match.save(update_fields=update_fields)

    _schedule_ready_match(next_match)


def _source_match_for_slot(match, slot):
    if match.round_number <= 1:
        return None
    source_position = (match.bracket_position * 2 - 1) if slot == 'team1' else (match.bracket_position * 2)
    return TournamentMatch.objects.filter(
        tournament=match.tournament,
        round_number=match.round_number - 1,
        bracket_position=source_position,
    ).first()


def _slot_resolved_empty(match, slot):
    if getattr(match, f'{slot}_id'):
        return False
    source_match = _source_match_for_slot(match, slot)
    if source_match is None:
        return True
    return source_match.status == TournamentMatch.Status.DONE and not source_match.winner_id


def _auto_advance_bye(match):
    if match.status == TournamentMatch.Status.DONE or match.queue_entry_id:
        return False

    if match.team1_id and not match.team2_id:
        if not _slot_resolved_empty(match, 'team2'):
            return False
        match.winner = match.team1
    elif match.team2_id and not match.team1_id:
        if not _slot_resolved_empty(match, 'team1'):
            return False
        match.winner = match.team2
    else:
        return False

    match.status = TournamentMatch.Status.DONE
    match.save(update_fields=['winner', 'status'])
    _advance_winner(match)
    return True


def _resolve_empty_match(match):
    if match.status == TournamentMatch.Status.DONE or match.team1_id or match.team2_id:
        return False
    if not _slot_resolved_empty(match, 'team1') or not _slot_resolved_empty(match, 'team2'):
        return False
    match.status = TournamentMatch.Status.DONE
    match.save(update_fields=['status'])
    return True


def _schedule_tournament_ready_matches(tournament):
    for match in tournament.bracket_matches.select_related(
        'team1__player1', 'team1__player2',
        'team2__player1', 'team2__player2',
    ).filter(status=TournamentMatch.Status.PENDING).order_by('round_number', 'bracket_position'):
        _schedule_ready_match(match)


def _propagate_byes(tournament):
    changed = True
    while changed:
        changed = False
        matches = tournament.bracket_matches.select_related(
            'team1', 'team2', 'winner',
        ).order_by('round_number', 'bracket_position')
        for match in matches:
            if _resolve_empty_match(match):
                changed = True
                continue
            if _auto_advance_bye(match):
                changed = True

    _schedule_tournament_ready_matches(tournament)


def _build_and_start_tournament(tournament):
    complete_regs = list(
        tournament.registrations
        .select_related('player1', 'player2')
        .filter(player2__isnull=False)
        .order_by('registered_at')
    )
    if len(complete_regs) < 2:
        return 'Il faut au moins deux équipes complètes pour lancer le tournoi.'

    if tournament.registrations.filter(player2__isnull=True).exists():
        return 'Des joueurs sont encore inscrits sans partenaire.'

    max_teams = tournament.max_players // 2
    if len(complete_regs) > max_teams:
        return 'Il y a trop d’équipes inscrites pour la capacité du tournoi.'

    random.shuffle(complete_regs)
    bracket_size = max_teams
    rounds = _total_rounds(bracket_size)

    teams = []
    for seed, reg in enumerate(complete_regs, start=1):
        teams.append(TournamentTeam.objects.create(
            tournament=tournament,
            registration=reg,
            player1=reg.player1,
            player2=reg.player2,
            seed=seed,
        ))

    for round_number in range(1, rounds + 1):
        matches_count = bracket_size // (2 ** round_number)
        for position in range(1, matches_count + 1):
            TournamentMatch.objects.create(
                tournament=tournament,
                round_number=round_number,
                bracket_position=position,
            )

    first_round = list(tournament.bracket_matches.filter(round_number=1).order_by('bracket_position'))
    team_slots = teams + [None] * (bracket_size - len(teams))
    for index, match in enumerate(first_round):
        match.team1 = team_slots[index * 2]
        match.team2 = team_slots[index * 2 + 1]
        match.save(update_fields=['team1', 'team2'])

    tournament.status = Tournament.Status.ONGOING
    tournament.save(update_fields=['status'])

    _propagate_byes(tournament)

    return None


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
# GET  /api/tournaments/   → tournoi courant jusqu'à suppression BDE
# POST /api/tournaments/   → créer un tournoi (BDE uniquement)
# ---------------------------------------------------------------------------

class TournamentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        due = Tournament.objects.filter(
            status=Tournament.Status.OPEN,
            start_date__lte=timezone.now(),
        ).order_by('start_date').first()
        if due:
            with transaction.atomic():
                if not due.bracket_matches.exists():
                    _build_and_start_tournament(due)

        tournament = (
            Tournament.objects
            .filter(status__in=[Tournament.Status.OPEN, Tournament.Status.ONGOING, Tournament.Status.DONE])
            .annotate(
                status_priority=Case(
                    When(status__in=[Tournament.Status.OPEN, Tournament.Status.ONGOING], then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                )
            )
            .order_by('status_priority', '-created_at')
            .first()
        )
        if not tournament:
            return Response(None)
        return Response(TournamentSerializer(tournament).data)

    def post(self, request):
        bde_pwd = request.data.get('bde_password', '')
        if bde_pwd != BDE_PASSWORD:
            return Response({'detail': 'Accès BDE requis.'}, status=status.HTTP_403_FORBIDDEN)

        active_exists = Tournament.objects.filter(
            status__in=[Tournament.Status.OPEN, Tournament.Status.ONGOING]
        ).exists()
        if active_exists:
            return Response(
                {'detail': 'Un tournoi est déjà planifié ou en cours.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TournamentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tournament = serializer.save(created_by=request.user)
        return Response(TournamentSerializer(tournament).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# PATCH  /api/tournaments/<pk>/
# DELETE /api/tournaments/<pk>/
# ---------------------------------------------------------------------------

@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def update_tournament(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    denied = _require_bde(request)
    if denied:
        return denied

    if request.method == 'DELETE':
        queue_entry_ids = list(
            tournament.bracket_matches
            .exclude(queue_entry__isnull=True)
            .values_list('queue_entry_id', flat=True)
        )
        with transaction.atomic():
            QueueEntry.objects.filter(id__in=queue_entry_ids).delete()
            tournament.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if tournament.status == Tournament.Status.DONE:
        return Response(
            {'detail': 'Les tournois archivés ne sont pas modifiables.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = TournamentUpdateSerializer(tournament, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)

    if tournament.status != Tournament.Status.OPEN:
        blocked = {'start_date', 'deadline', 'max_players'} & set(serializer.validated_data.keys())
        if blocked:
            return Response(
                {'detail': 'Dates et capacité ne peuvent plus être modifiées après le lancement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    tournament = serializer.save()
    return Response(TournamentSerializer(tournament).data)


# ---------------------------------------------------------------------------
# POST /api/tournaments/<pk>/start/
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_tournament(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    if not _has_bde_access(request):
        return Response({'detail': 'Accès BDE requis.'}, status=status.HTTP_403_FORBIDDEN)

    if tournament.status != Tournament.Status.OPEN:
        return Response({'detail': 'Le tournoi a déjà été lancé ou fermé.'}, status=status.HTTP_400_BAD_REQUEST)

    complete_regs = list(
        tournament.registrations
        .select_related('player1', 'player2')
        .filter(player2__isnull=False)
        .order_by('registered_at')
    )
    if len(complete_regs) < 2:
        return Response(
            {'detail': 'Il faut au moins deux équipes complètes pour lancer le tournoi.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    solo_count = tournament.registrations.filter(player2__isnull=True).count()
    if solo_count:
        return Response(
            {'detail': 'Des joueurs sont encore inscrits sans partenaire.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        error = _build_and_start_tournament(tournament)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

    return Response(TournamentSerializer(tournament).data)


# ---------------------------------------------------------------------------
# GET /api/tournaments/<pk>/bracket/
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tournament_bracket(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    matches = tournament.bracket_matches.select_related(
        'team1__player1', 'team1__player2',
        'team2__player1', 'team2__player2',
        'winner__player1', 'winner__player2',
        'queue_entry',
    ).order_by('round_number', 'bracket_position')

    rounds = {}
    for match in matches:
        rounds.setdefault(match.round_number, []).append(TournamentMatchSerializer(match).data)

    return Response({
        'tournament': TournamentSerializer(tournament).data,
        'rounds': [
            {'round': round_number, 'matches': round_matches}
            for round_number, round_matches in rounds.items()
        ],
    })


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
# POST /api/tournaments/<pk>/force-team/
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def force_team(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    denied = _require_bde(request)
    if denied:
        return denied

    if tournament.status != Tournament.Status.OPEN:
        return Response({'detail': 'Les équipes ne peuvent plus être modifiées après le lancement.'}, status=status.HTTP_400_BAD_REQUEST)

    player1_login = (request.data.get('player1') or '').strip()
    player2_login = (request.data.get('player2') or '').strip()
    if not player1_login or not player2_login:
        return Response({'detail': 'Deux logins sont requis.'}, status=status.HTTP_400_BAD_REQUEST)
    if player1_login == player2_login:
        return Response({'detail': 'Une équipe doit contenir deux joueurs différents.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        player1 = User.objects.get(username=player1_login)
        player2 = User.objects.get(username=player2_login)
    except User.DoesNotExist:
        return Response({'detail': 'Un des joueurs est introuvable.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        existing = TournamentRegistration.objects.filter(
            tournament=tournament
        ).filter(
            Q(player1__in=[player1, player2]) | Q(player2__in=[player1, player2])
        )
        keep = existing.filter(player1=player1).first() or existing.first()
        existing.exclude(pk=getattr(keep, 'pk', None)).delete()

        if keep:
            keep.player1 = player1
            keep.player2 = player2
            keep.save(update_fields=['player1', 'player2'])
            reg = keep
        else:
            reg = TournamentRegistration.objects.create(
                tournament=tournament,
                player1=player1,
                player2=player2,
            )

    return Response(RegistrationSerializer(reg).data)


# ---------------------------------------------------------------------------
# DELETE /api/tournaments/<pk>/registrations/<reg_id>/
# ---------------------------------------------------------------------------

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def remove_registration(request, pk, reg_id):
    tournament = get_object_or_404(Tournament, pk=pk)
    denied = _require_bde(request)
    if denied:
        return denied

    if tournament.status != Tournament.Status.OPEN:
        return Response({'detail': 'Les inscriptions ne peuvent plus être modifiées après le lancement.'}, status=status.HTTP_400_BAD_REQUEST)

    reg = get_object_or_404(TournamentRegistration, pk=reg_id, tournament=tournament)
    reg.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# POST /api/tournaments/<pk>/accept-invite/  → J2 accepte l'invite d'équipe de J1
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def accept_teammate_invite(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    if tournament.status != Tournament.Status.OPEN:
        return Response({'detail': 'Les inscriptions sont fermées.'}, status=status.HTTP_400_BAD_REQUEST)

    inviter_login = (request.data.get('inviter') or '').strip()
    if not inviter_login:
        return Response({'detail': 'Inviteur requis.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        inviter = User.objects.get(username=inviter_login)
    except User.DoesNotExist:
        return Response({'detail': 'Joueur introuvable.'}, status=status.HTTP_400_BAD_REQUEST)

    j2 = request.user
    if j2 == inviter:
        return Response({'detail': 'Vous ne pouvez pas vous inviter vous-même.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        existing = TournamentRegistration.objects.filter(
            tournament=tournament
        ).filter(
            Q(player1__in=[inviter, j2]) | Q(player2__in=[inviter, j2])
        )
        keep = existing.filter(player1=inviter).first() or existing.first()
        existing.exclude(pk=getattr(keep, 'pk', None)).delete()

        if keep:
            keep.player1 = inviter
            keep.player2 = j2
            keep.save(update_fields=['player1', 'player2'])
            reg = keep
        else:
            reg = TournamentRegistration.objects.create(
                tournament=tournament,
                player1=inviter,
                player2=j2,
            )

    return Response(RegistrationSerializer(reg).data, status=status.HTTP_200_OK)


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


# ---------------------------------------------------------------------------
# PATCH /api/tournaments/matches/<match_id>/result/
# ---------------------------------------------------------------------------

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def tournament_match_result(request, match_id):
    match = get_object_or_404(
        TournamentMatch.objects.select_related(
            'tournament',
            'team1__player1', 'team1__player2',
            'team2__player1', 'team2__player2',
        ),
        pk=match_id,
    )
    if not _has_bde_access(request):
        return Response({'detail': 'Accès BDE requis.'}, status=status.HTTP_403_FORBIDDEN)

    if match.status != TournamentMatch.Status.PENDING:
        return Response({'detail': 'Ce match est déjà terminé.'}, status=status.HTTP_400_BAD_REQUEST)

    if not match.team1_id or not match.team2_id:
        return Response({'detail': 'Ce match n’a pas encore deux équipes.'}, status=status.HTTP_400_BAD_REQUEST)

    score_team1 = request.data.get('score_team1')
    score_team2 = request.data.get('score_team2')
    winner_id = request.data.get('winner_team')

    if score_team1 is not None and score_team2 is not None:
        try:
            score_team1 = int(score_team1)
            score_team2 = int(score_team2)
        except (TypeError, ValueError):
            return Response({'detail': 'Les scores doivent être des nombres.'}, status=status.HTTP_400_BAD_REQUEST)
        if score_team1 == score_team2:
            return Response({'detail': 'Un match de tournoi ne peut pas finir sur une égalité.'}, status=status.HTTP_400_BAD_REQUEST)
        winner = match.team1 if score_team1 > score_team2 else match.team2
    elif winner_id:
        winner = get_object_or_404(TournamentTeam, pk=winner_id, tournament=match.tournament)
        if winner.pk not in (match.team1_id, match.team2_id):
            return Response({'detail': 'Le gagnant doit être une des deux équipes du match.'}, status=status.HTTP_400_BAD_REQUEST)
    else:
        return Response(
            {'detail': 'Fournis score_team1/score_team2 ou winner_team.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        old_queue_entry = match.queue_entry
        if old_queue_entry:
            match.queue_entry = None
        match.score_team1 = score_team1
        match.score_team2 = score_team2
        match.winner = winner
        match.status = TournamentMatch.Status.DONE
        match.save(update_fields=['score_team1', 'score_team2', 'winner', 'status', 'queue_entry'])
        if old_queue_entry:
            old_queue_entry.delete()
        _advance_winner(match)
        _propagate_byes(match.tournament)

    return Response(TournamentMatchSerializer(match).data)


# ---------------------------------------------------------------------------
# PATCH /api/tournaments/matches/<match_id>/postpone/
# ---------------------------------------------------------------------------

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def postpone_tournament_match(request, match_id):
    match = get_object_or_404(
        TournamentMatch.objects.select_related(
            'team1__player1', 'team1__player2',
            'team2__player1', 'team2__player2',
        ),
        pk=match_id,
    )
    denied = _require_bde(request)
    if denied:
        return denied

    if not match.is_ready:
        return Response({'detail': 'Ce match ne peut pas encore être planifié.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        if not match.queue_entry_id:
            _schedule_ready_match(match)
        latest = QueueEntry.objects.filter(status=QueueEntry.Status.WAITING).order_by('-joined_at').first()
        match.queue_entry.status = QueueEntry.Status.WAITING
        match.queue_entry.joined_at = (latest.joined_at if latest else timezone.now()) + timedelta(seconds=1)
        match.queue_entry.save(update_fields=['status', 'joined_at'])

    return Response(TournamentMatchSerializer(match).data)
