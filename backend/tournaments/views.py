import csv, io, json, random, math
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Case, F, IntegerField, Q, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from planning.models import QueueEntry

from .models import Tournament, TournamentMatch, TournamentRegistration, TournamentRoundRobinsStandings, TournamentSwissStandings, TournamentTeam

from .serializers import RegistrationSerializer, TournamentCreateSerializer, TournamentMatchSerializer, TournamentRoundRobinsSerializer, TournamentSerializer, TournamentSwissStandingsSerializer, TournamentUpdateSerializer

User = get_user_model()

def _has_bde_access(request):
    if getattr(request.user, 'is_staff', False) or getattr(request.user, 'is_superuser', False):
        return True
    role = getattr(request.user, 'role', '') or ''
    return role.lower() in ('bde', 'bocalien')


def _require_bde(request):
    if _has_bde_access(request):
        return None
    return Response({'detail': 'Accès BDE requis.'}, status=status.HTTP_403_FORBIDDEN)


def _make_queue_entry(team1, team2, team_size):
    kwargs = dict(
        player1=team1.player1,
        player2=team2.player1,
        match_type='TEAM' if team_size == 2 else 'SOLO',
        is_ranked=False,
        status=QueueEntry.Status.WAITING,
    )
    if team_size == 2:
        kwargs['player1_teammate'] = team1.player2
        kwargs['player2_teammate'] = team2.player2
    return QueueEntry.objects.create(**kwargs)


def _schedule_ready_match(match):
    if not match.is_ready or match.queue_entry_id or match.is_bye:
        return match
    team_size = match.tournament.team_size
    entry = _make_queue_entry(match.team1, match.team2, team_size)
    match.queue_entry = entry
    match.save(update_fields=['queue_entry'])
    return match


def _total_rounds(bracket_size):
    rounds = 0
    while bracket_size > 1:
        bracket_size //= 2
        rounds += 1
    return rounds


def _source_match_for_slot(match, slot):
    if match.round_number <= 1:
        return None
    source_position = (
        (match.bracket_position * 2 - 1) if slot == 'team1'
        else (match.bracket_position * 2)
    )
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
    match.is_bye = True
    match.status = TournamentMatch.Status.DONE
    match.save(update_fields=['winner', 'status', 'is_bye'])
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
    ).filter(status=TournamentMatch.Status.PENDING):
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


def _build_single_elimination(tournament, teams):
    # Taille du bracket = plus petite puissance de 2 >= au nombre d'équipes
    # réellement inscrites (et non au maximum théorique), pour éviter les
    # rounds entiers de matchs vides quand il y a moins de joueurs que prévu.
    team_count   = max(2, len(teams))
    bracket_size = 1
    while bracket_size < team_count:
        bracket_size *= 2
    rounds       = _total_rounds(bracket_size)

    for round_number in range(1, rounds + 1):
        matches_count = bracket_size // (2 ** round_number)
        for position in range(1, matches_count + 1):
            TournamentMatch.objects.create(
                tournament=tournament,
                round_number=round_number,
                bracket_position=position,
            )

    first_round = list(
        tournament.bracket_matches.filter(round_number=1).order_by('bracket_position')
    )
    team_slots = teams + [None] * (bracket_size - len(teams))
    for index, match in enumerate(first_round):
        match.team1 = team_slots[index * 2]
        match.team2 = team_slots[index * 2 + 1]
        match.save(update_fields=['team1', 'team2'])

    tournament.status = Tournament.Status.ONGOING
    tournament.save(update_fields=['status'])
    _propagate_byes(tournament)


def _build_round_robin(tournament, teams):
    n = len(teams)

    if n % 2 == 1:
        teams = teams + [None]
        n += 1

    half    = n // 2
    pool    = list(range(1, n))
    fixed   = 0
    rounds  = n - 1

    for round_number in range(1, rounds + 1):
        indices = [fixed] + pool
        pairs   = [(indices[i], indices[n - 1 - i]) for i in range(half)]

        for position, (i, j) in enumerate(pairs, start=1):
            t1 = teams[i]
            t2 = teams[j]
            is_bye = (t1 is None or t2 is None)
            match = TournamentMatch.objects.create(
                tournament=tournament,
                round_number=round_number,
                bracket_position=position,
                team1=t1,
                team2=t2,
                is_bye=is_bye,
                status=TournamentMatch.Status.DONE if is_bye else TournamentMatch.Status.PENDING,
            )
            if is_bye:
                match.winner = t1 if t1 else t2
                match.save(update_fields=['winner'])

        pool = [pool[-1]] + pool[:-1]

    real_teams = [t for t in teams if t is not None]
    for team in real_teams:
        TournamentRoundRobinsStandings.objects.create(
            tournament=tournament,
            team=team,
        )

    tournament.status = Tournament.Status.ONGOING
    tournament.save(update_fields=['status'])

    _schedule_round_robin_round(tournament, round_number=1)


def _schedule_round_robin_round(tournament, round_number):
    matches = tournament.bracket_matches.select_related(
        'team1__player1', 'team1__player2',
        'team2__player1', 'team2__player2',
    ).filter(
        round_number=round_number,
        status=TournamentMatch.Status.PENDING,
        is_bye=False,
    )
    for match in matches:
        _schedule_ready_match(match)


def _check_round_robin_done(tournament):
    pending = tournament.bracket_matches.filter(
        status=TournamentMatch.Status.PENDING,
        is_bye=False,
    ).exists()
    if not pending:
        tournament.status = Tournament.Status.DONE
        tournament.save(update_fields=['status'])


def _update_round_robin_standing(match):
    if not match.winner:
        return
    loser_team = match.team2 if match.winner_id == match.team1_id else match.team1

    TournamentRoundRobinsStandings.objects.filter(
        tournament=match.tournament, team=match.winner
    ).update(
        wins=F('wins') + 1,
        points=F('points') + 3,
    )
    TournamentRoundRobinsStandings.objects.filter(
        tournament=match.tournament, team=loser_team
    ).update(losses=F('losses') + 1)


def _build_swiss_round(tournament, round_number):
    teams = list(tournament.teams.select_related('player1', 'player2').all())

    if round_number == 1:
        random.shuffle(teams)
    else:
        standings = {
            s.team_id: s.wins
            for s in tournament.swiss_standing.select_related('team').all()
        }
        teams.sort(key=lambda t: standings.get(t.id, 0), reverse=True)

    played_pairs = set()
    for m in tournament.bracket_matches.exclude(
        status=TournamentMatch.Status.PENDING
    ).filter(is_bye=False):
        if m.team1_id and m.team2_id:
            played_pairs.add(frozenset([m.team1_id, m.team2_id]))

    paired   = []
    unpaired = list(teams)

    while len(unpaired) >= 2:
        team = unpaired.pop(0)
        matched = False
        for i, opponent in enumerate(unpaired):
            if frozenset([team.id, opponent.id]) not in played_pairs:
                paired.append((team, opponent))
                unpaired.pop(i)
                matched = True
                break
        if not matched:
            paired.append((team, unpaired.pop(0)))

    bye_team = unpaired[0] if unpaired else None

    for position, (t1, t2) in enumerate(paired, start=1):
        TournamentMatch.objects.create(
            tournament=tournament,
            round_number=round_number,
            bracket_position=position,
            team1=t1,
            team2=t2,
            swiss_round=round_number,
        )
        match = tournament.bracket_matches.filter(
            round_number=round_number, bracket_position=position
        ).select_related(
            'team1__player1', 'team1__player2',
            'team2__player1', 'team2__player2',
        ).first()
        if match:
            _schedule_ready_match(match)

    if bye_team:
        pos = len(paired) + 1
        TournamentMatch.objects.create(
            tournament=tournament,
            round_number=round_number,
            bracket_position=pos,
            team1=bye_team,
            team2=None,
            swiss_round=round_number,
            is_bye=True,
            status=TournamentMatch.Status.DONE,
            winner=bye_team,
        )
        TournamentSwissStandings.objects.filter(
            tournament=tournament, team=bye_team
        ).update(wins=F('wins') + 1)


def _update_swiss_standing(match):
    if not match.winner or match.is_bye:
        return
    loser_team = match.team2 if match.winner_id == match.team1_id else match.team1

    TournamentSwissStandings.objects.filter(
        tournament=match.tournament, team=match.winner
    ).update(wins=F('wins') + 1)

    TournamentSwissStandings.objects.filter(
        tournament=match.tournament, team=loser_team
    ).update(losses=F('losses') + 1)


def _swiss_round_complete(tournament, round_number):
    return not tournament.bracket_matches.filter(
        swiss_round=round_number,
        status=TournamentMatch.Status.PENDING,
        is_bye=False,
    ).exists()


def _max_swiss_rounds(n_teams):
    return math.ceil(math.log2(n_teams)) if n_teams > 1 else 1

def _get_valid_registrations(tournament):
    if tournament.team_size == 1:
        return list(
            tournament.registrations
            .select_related('player1')
            .all()
            .order_by('registered_at')
        )
    return list(
        tournament.registrations
        .select_related('player1', 'player2')
        .filter(player2__isnull=False)
        .order_by('registered_at')
    )


def _create_teams(tournament, registrations):
    teams = []
    for seed, reg in enumerate(registrations, start=1):
        team = TournamentTeam.objects.create(
            tournament=tournament,
            registration=reg,
            player1=reg.player1,
            player2=reg.player2 if tournament.team_size == 2 else None,
            seed=seed,
        )
        teams.append(team)
    return teams


def _build_and_start_tournament(tournament):
    fmt = tournament.format
    regs = _get_valid_registrations(tournament)

    min_teams = {'SINGLE_ELIMINATION': 2, 'ROUND_ROBIN': 3, 'SWISS': 4}
    if len(regs) < min_teams.get(fmt, 2):
        return f"Il faut au moins {min_teams[fmt]} équipes pour lancer ce format."

    max_teams = tournament.max_players // tournament.team_size
    if len(regs) > max_teams:
        return "Il y a trop d'équipes inscrites pour la capacité du tournoi."

    random.shuffle(regs)
    teams = _create_teams(tournament, regs)

    if fmt == 'SINGLE_ELIMINATION':
        _build_single_elimination(tournament, teams)
    elif fmt == 'ROUND_ROBIN':
        _build_round_robin(tournament, teams)
    elif fmt == 'SWISS':
        for team in teams:
            TournamentSwissStandings.objects.create(tournament=tournament, team=team)
        tournament.status = Tournament.Status.ONGOING
        tournament.save(update_fields=['status'])
        _build_swiss_round(tournament, round_number=1)
    else:
        return f"Format inconnu : {fmt}"

    return None

def _parse_import_file(file):
    name    = file.name.lower()
    content = file.read().decode('utf-8', errors='replace')
    pairs   = []

    if name.endswith('.json'):
        data = json.loads(content)
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    p1 = (item.get('player1') or '').strip()
                    p2 = (item.get('player2') or '').strip() or None
                    if p1:
                        pairs.append((p1, p2))
                elif isinstance(item, str):
                    pairs.append((item.strip(), None))
    else:
        reader = csv.reader(io.StringIO(content))
        for row in reader:
            row = [c.strip() for c in row if c.strip()]
            if not row:
                continue
            if row[0].lower() in ('player1', 'player', 'login'):
                continue
            p1 = row[0]
            p2 = row[1] if len(row) > 1 else None
            pairs.append((p1, p2))

    return pairs

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bde_unlock(request):
    if _has_bde_access(request):
        return Response({'ok': True})
    return Response({'detail': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)


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
            .filter(status__in=[
                Tournament.Status.OPEN,
                Tournament.Status.ONGOING,
                Tournament.Status.DONE,
            ])
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
        if not _has_bde_access(request):
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
        blocked = {'start_date', 'deadline', 'max_players', 'format', 'team_size'} & set(serializer.validated_data.keys())
        if blocked:
            return Response(
                {'detail': 'Ces champs ne peuvent plus être modifiés après le lancement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    tournament = serializer.save()
    return Response(TournamentSerializer(tournament).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_tournament(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    if not _has_bde_access(request):
        return Response({'detail': 'Accès BDE requis.'}, status=status.HTTP_403_FORBIDDEN)

    if tournament.status != Tournament.Status.OPEN:
        return Response(
            {'detail': 'Le tournoi a déjà été lancé ou fermé.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    regs = _get_valid_registrations(tournament)
    min_teams = {'SINGLE_ELIMINATION': 2, 'ROUND_ROBIN': 3, 'SWISS': 4}
    needed = min_teams.get(tournament.format, 2)
    if len(regs) < needed:
        return Response(
            {
                'detail': f'Il faut au moins {needed} équipes complètes pour lancer ce format.',
                'code': 'NOT_ENOUGH_TEAMS',
                'needed': needed,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        error = _build_and_start_tournament(tournament)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

    return Response(TournamentSerializer(tournament).data)


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
        rounds.setdefault(match.round_number, []).append(
            TournamentMatchSerializer(match).data
        )

    response_data = {
        'tournament': TournamentSerializer(tournament).data,
        'rounds': [
            {'round': rn, 'matches': rm}
            for rn, rm in rounds.items()
        ],
    }

    if tournament.format == 'SWISS':
        standings = tournament.swiss_standing.select_related(
            'team__player1', 'team__player2'
        ).order_by('-wins')
        response_data['standings'] = TournamentSwissStandingsSerializer(standings, many=True).data

    elif tournament.format == 'ROUND_ROBIN':
        standings = tournament.round_robin_standing.select_related(
            'team__player1', 'team__player2'
        ).order_by('-points', '-wins')
        response_data['standings'] = TournamentRoundRobinsSerializer(standings, many=True).data

    return Response(response_data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def swiss_next_round(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    denied = _require_bde(request)
    if denied:
        return denied

    if tournament.format != 'SWISS':
        return Response(
            {'detail': 'Ce tournoi n\'est pas au format Swiss.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if tournament.status != Tournament.Status.ONGOING:
        return Response(
            {'detail': 'Le tournoi n\'est pas en cours.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    last_round = (
        tournament.bracket_matches
        .order_by('-swiss_round')
        .values_list('swiss_round', flat=True)
        .first()
    ) or 0

    if not _swiss_round_complete(tournament, last_round):
        return Response(
            {'detail': f'Le round {last_round} n\'est pas encore terminé.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    n_teams    = tournament.teams.count()
    max_rounds = _max_swiss_rounds(n_teams)

    if last_round >= max_rounds:
        tournament.status = Tournament.Status.DONE
        tournament.save(update_fields=['status'])
        return Response(
            {'detail': 'Tous les rounds sont terminés. Tournoi clôturé.'},
            status=status.HTTP_200_OK,
        )

    with transaction.atomic():
        _build_swiss_round(tournament, round_number=last_round + 1)

    return Response(TournamentSerializer(tournament).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def import_players(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    denied = _require_bde(request)
    if denied:
        return denied

    if tournament.status != Tournament.Status.OPEN:
        return Response(
            {'detail': 'Les inscriptions sont fermées.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    file = request.FILES.get('file')
    if not file:
        return Response({'detail': 'Aucun fichier fourni.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        pairs = _parse_import_file(file)
    except Exception as e:
        return Response(
            {'detail': f'Erreur de parsing : {e}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not pairs:
        return Response({'detail': 'Aucun joueur trouvé dans le fichier.'}, status=status.HTTP_400_BAD_REQUEST)

    created  = []
    skipped  = []
    errors   = []

    max_teams    = tournament.max_players // tournament.team_size
    current_regs = tournament.registrations.count()

    with transaction.atomic():
        for p1_login, p2_login in pairs:
            if current_regs >= max_teams:
                skipped.append(f"{p1_login} (tournoi complet)")
                continue

            try:
                player1 = User.objects.get(username=p1_login)
            except User.DoesNotExist:
                errors.append(f"Joueur introuvable : {p1_login}")
                continue

            already = TournamentRegistration.objects.filter(
                tournament=tournament
            ).filter(Q(player1=player1) | Q(player2=player1))
            if already.exists():
                skipped.append(f"{p1_login} (déjà inscrit)")
                continue

            player2 = None
            if p2_login and tournament.team_size == 2:
                try:
                    player2 = User.objects.get(username=p2_login)
                except User.DoesNotExist:
                    errors.append(f"Partenaire introuvable : {p2_login} (inscription solo pour {p1_login})")
                else:
                    already2 = TournamentRegistration.objects.filter(
                        tournament=tournament
                    ).filter(Q(player1=player2) | Q(player2=player2))
                    if already2.exists():
                        errors.append(f"{p2_login} déjà inscrit — {p1_login} inscrit en solo")
                        player2 = None

            TournamentRegistration.objects.create(
                tournament=tournament,
                player1=player1,
                player2=player2,
            )
            created.append(p1_login if not player2 else f"{p1_login} & {p2_login}")
            current_regs += 1

    return Response({
        'created': created,
        'skipped': skipped,
        'errors':  errors,
    }, status=status.HTTP_201_CREATED)


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
        return Response(
            {'detail': "Ce match n'a pas encore deux équipes."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    score_team1 = request.data.get('score_team1')
    score_team2 = request.data.get('score_team2')
    winner_id   = request.data.get('winner_team')

    if score_team1 is not None and score_team2 is not None:
        try:
            score_team1 = int(score_team1)
            score_team2 = int(score_team2)
        except (TypeError, ValueError):
            return Response({'detail': 'Les scores doivent être des nombres.'}, status=status.HTTP_400_BAD_REQUEST)
        if score_team1 == score_team2:
            return Response(
                {'detail': 'Un match de tournoi ne peut pas finir sur une égalité.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        winner = match.team1 if score_team1 > score_team2 else match.team2
    elif winner_id:
        winner = get_object_or_404(TournamentTeam, pk=winner_id, tournament=match.tournament)
        if winner.pk not in (match.team1_id, match.team2_id):
            return Response(
                {'detail': 'Le gagnant doit être une des deux équipes du match.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        score_team1 = score_team2 = None
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
        match.winner      = winner
        match.status      = TournamentMatch.Status.DONE
        match.save(update_fields=['score_team1', 'score_team2', 'winner', 'status', 'queue_entry'])

        if old_queue_entry:
            old_queue_entry.delete()

        fmt = match.tournament.format
        if fmt == 'SINGLE_ELIMINATION':
            _advance_winner(match)
            _propagate_byes(match.tournament)
        elif fmt == 'ROUND_ROBIN':
            _update_round_robin_standing(match)
            _check_round_robin_done(match.tournament)
        elif fmt == 'SWISS':
            _update_swiss_standing(match)

    return Response(TournamentMatchSerializer(match).data)


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
        return Response(
            {'detail': 'Ce match ne peut pas encore être planifié.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        if not match.queue_entry_id:
            _schedule_ready_match(match)
        latest = QueueEntry.objects.filter(
            status=QueueEntry.Status.WAITING
        ).order_by('-joined_at').first()
        match.queue_entry.status    = QueueEntry.Status.WAITING
        match.queue_entry.joined_at = (
            (latest.joined_at if latest else timezone.now()) + timedelta(seconds=1)
        )
        match.queue_entry.save(update_fields=['status', 'joined_at'])

    return Response(TournamentMatchSerializer(match).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def register_to_tournament(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)

    if tournament.status != Tournament.Status.OPEN:
        return Response({'detail': 'Les inscriptions sont fermées.'}, status=status.HTTP_400_BAD_REQUEST)

    if tournament.deadline:
        deadline = tournament.deadline
        if timezone.is_naive(deadline):
            deadline = timezone.make_aware(deadline)
        if deadline < timezone.now():
            return Response(
                {'detail': "La date limite d'inscription est dépassée."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    already = TournamentRegistration.objects.filter(
        tournament=tournament
    ).filter(Q(player1=request.user) | Q(player2=request.user))
    if already.exists():
        return Response({'detail': 'Vous êtes déjà inscrit.'}, status=status.HTTP_400_BAD_REQUEST)

    max_teams = tournament.max_players // tournament.team_size
    if tournament.registrations.count() >= max_teams:
        return Response({'detail': 'Le tournoi est complet.'}, status=status.HTTP_400_BAD_REQUEST)

    partner_login = (request.data.get('partner') or '').strip()

    if tournament.team_size == 1:
        reg = TournamentRegistration.objects.create(
            tournament=tournament,
            player1=request.user,
            player2=None,
        )
        return Response(RegistrationSerializer(reg).data, status=status.HTTP_201_CREATED)

    player2 = None
    if partner_login:
        try:
            player2 = User.objects.get(username=partner_login)
        except User.DoesNotExist:
            return Response({'detail': 'Partenaire introuvable.'}, status=status.HTTP_400_BAD_REQUEST)
        if player2 == request.user:
            return Response(
                {'detail': 'Vous ne pouvez pas vous inscrire avec vous-même.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
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


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def force_team(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    denied = _require_bde(request)
    if denied:
        return denied

    if tournament.status != Tournament.Status.OPEN:
        return Response(
            {'detail': 'Les équipes ne peuvent plus être modifiées après le lancement.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    player1_login = (request.data.get('player1') or '').strip()
    player2_login = (request.data.get('player2') or '').strip()

    if not player1_login:
        return Response({'detail': 'Login joueur 1 requis.'}, status=status.HTTP_400_BAD_REQUEST)

    if tournament.team_size == 2 and not player2_login:
        return Response({'detail': 'Deux logins sont requis en 2v2.'}, status=status.HTTP_400_BAD_REQUEST)

    if player1_login == player2_login:
        return Response(
            {'detail': 'Une équipe doit contenir deux joueurs différents.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        player1 = User.objects.get(username=player1_login)
    except User.DoesNotExist:
        return Response({'detail': f'Joueur introuvable : {player1_login}'}, status=status.HTTP_400_BAD_REQUEST)

    player2 = None
    if player2_login:
        try:
            player2 = User.objects.get(username=player2_login)
        except User.DoesNotExist:
            return Response({'detail': f'Joueur introuvable : {player2_login}'}, status=status.HTTP_400_BAD_REQUEST)

    players = [player1] + ([player2] if player2 else [])

    with transaction.atomic():
        existing = TournamentRegistration.objects.filter(
            tournament=tournament
        ).filter(
            Q(player1__in=players) | Q(player2__in=players)
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


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def remove_registration(request, pk, reg_id):
    tournament = get_object_or_404(Tournament, pk=pk)
    denied = _require_bde(request)
    if denied:
        return denied

    if tournament.status != Tournament.Status.OPEN:
        return Response(
            {'detail': 'Les inscriptions ne peuvent plus être modifiées après le lancement.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reg = get_object_or_404(TournamentRegistration, pk=reg_id, tournament=tournament)
    reg.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def accept_teammate_invite(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    if tournament.status != Tournament.Status.OPEN:
        return Response({'detail': 'Les inscriptions sont fermées.'}, status=status.HTTP_400_BAD_REQUEST)

    if tournament.team_size == 1:
        return Response(
            {'detail': 'Ce tournoi est en 1v1, pas d\'invitation de coéquipier.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    inviter_login = (request.data.get('inviter') or '').strip()
    if not inviter_login:
        return Response({'detail': 'Inviteur requis.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        inviter = User.objects.get(username=inviter_login)
    except User.DoesNotExist:
        return Response({'detail': 'Joueur introuvable.'}, status=status.HTTP_400_BAD_REQUEST)

    j2 = request.user
    if j2 == inviter:
        return Response(
            {'detail': 'Vous ne pouvez pas vous inviter vous-même.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tournament_registrations(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    regs = tournament.registrations.select_related('player1', 'player2').all()
    return Response(RegistrationSerializer(regs, many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tournament_solo(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)

    if tournament.team_size == 1:
        return Response([])

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


@api_view(['GET', 'DELETE'])
@permission_classes([IsAuthenticated])
def my_registration(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    reg = TournamentRegistration.objects.filter(
        tournament=tournament
    ).filter(Q(player1=request.user) | Q(player2=request.user)).first()
    if not reg:
        return Response(None)
    if request.method == 'DELETE':
        reg.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response(RegistrationSerializer(reg).data)