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
    # Le panneau d'administration s'authentifie par session (is_admin) et non via
    # request.user (JWT) : on lui accorde donc l'accès BDE complet.
    if request.session.get('is_admin', False):
        return True
    if getattr(request.user, 'is_staff', False) or getattr(request.user, 'is_superuser', False):
        return True
    role = getattr(request.user, 'role', '') or ''
    return role.lower() in ('bde', 'bocalien')


def _require_bde(request):
    if _has_bde_access(request):
        return None
    return Response({'detail': 'Accès BDE requis.'}, status=status.HTTP_403_FORBIDDEN)


def _user_error(detail, code, extra=None):
    # Erreurs "métier" attendues (date passée, tournoi plein, fichier invalide…)
    # renvoyées en HTTP 200 + en-tête X-Tournament-Error, et non en 400, pour
    # éviter une ligne rouge dans la console navigateur (même convention que
    # GDPR / token refresh / l'update profil). Le front lit l'en-tête (ou
    # data.code) et affiche le message traduit correspondant.
    data = {'detail': detail, 'code': code}
    if extra:
        data.update(extra)
    resp = Response(data)
    resp['X-Tournament-Error'] = code
    return resp


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
    # Les matchs de tournoi ne passent PLUS par la file d'attente : ils se jouent
    # hors-ligne (babyfoot) et seul le BDE valide le gagnant via le bracket. On ne
    # crée donc plus de QueueEntry pour eux. Le matchmaking classique (app planning)
    # n'est pas concerné par cette fonction.
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
        first = True
        for row in reader:
            row = [c.strip() for c in row if c.strip()]
            if not row:
                continue
            # On ne saute l'en-tête que sur la PREMIÈRE ligne non vide, sinon un
            # joueur réellement nommé "player1" serait pris pour un en-tête.
            if first:
                first = False
                if row[0].lower() in ('player1', 'player', 'player2', 'login', 'username'):
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
    return Response({'ok': False, 'detail': 'Accès refusé.'})


def _create_tournament(data, created_by):
    """Création partagée entre l'endpoint BDE (JWT) et l'admin (session).
    Retourne (tournament_data, None) en cas de succès, ou (None, (message, code)).
    `created_by` peut être None (champ nullable) pour une création admin."""
    active_exists = Tournament.objects.filter(
        status__in=[Tournament.Status.OPEN, Tournament.Status.CLOSED, Tournament.Status.ONGOING]
    ).exists()
    if active_exists:
        return None, ('Un tournoi est déjà planifié ou en cours.', 'ALREADY_PLANNED')

    serializer = TournamentCreateSerializer(data=data)
    if not serializer.is_valid():
        if 'start_date' in serializer.errors:
            return None, ('La date de début doit être dans le futur.', 'PAST_DATE')
        first = next(iter(serializer.errors.values()))
        msg   = first[0] if isinstance(first, (list, tuple)) else str(first)
        return None, (str(msg), 'INVALID')

    tournament = serializer.save(created_by=created_by)
    return TournamentSerializer(tournament).data, None


class TournamentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Le démarrage est désormais 100 % manuel (BDE) : on ne lance plus
        # automatiquement un tournoi dont la date de début est atteinte.
        tournament = (
            Tournament.objects
            .filter(status__in=[
                Tournament.Status.OPEN,
                Tournament.Status.CLOSED,
                Tournament.Status.ONGOING,
                Tournament.Status.DONE,
            ])
            .annotate(
                status_priority=Case(
                    When(status__in=[
                        Tournament.Status.OPEN,
                        Tournament.Status.CLOSED,
                        Tournament.Status.ONGOING,
                    ], then=Value(0)),
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

        data, error = _create_tournament(request.data, request.user)
        if error:
            return _user_error(error[0], error[1])
        return Response(data, status=status.HTTP_201_CREATED)


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
        return _user_error('Les tournois archivés ne sont pas modifiables.', 'ARCHIVED')

    serializer = TournamentUpdateSerializer(tournament, data=request.data, partial=True)
    if not serializer.is_valid():
        if 'start_date' in serializer.errors:
            return _user_error('La date de début doit être dans le futur.', 'PAST_DATE')
        first = next(iter(serializer.errors.values()))
        msg   = first[0] if isinstance(first, (list, tuple)) else str(first)
        return _user_error(str(msg), 'INVALID')

    # Tant que le tournoi n'est pas lancé (OPEN ou CLOSED), tout reste modifiable.
    # Une fois ONGOING (bracket construit), on verrouille les champs structurels.
    if tournament.status not in (Tournament.Status.OPEN, Tournament.Status.CLOSED):
        blocked = {'start_date', 'deadline', 'max_players', 'format', 'team_size'} & set(serializer.validated_data.keys())
        if blocked:
            return _user_error('Ces champs ne peuvent plus être modifiés après le lancement.', 'LOCKED_FIELDS')

    tournament = serializer.save()
    return Response(TournamentSerializer(tournament).data)


def _do_start_tournament(tournament):
    """Logique partagée entre l'endpoint BDE et l'admin pour démarrer un tournoi.
    Retourne (tournament_data, None) ou (None, (message, code, extra)).
    """
    if tournament.status != Tournament.Status.CLOSED:
        return None, ("Ferme d'abord les inscriptions avant de lancer le tournoi.", 'NOT_CLOSED', None)

    regs = _get_valid_registrations(tournament)
    needed = 2  # élimination directe : au moins 2 équipes
    if len(regs) < needed:
        return None, (
            f'Il faut au moins {needed} équipes complètes pour lancer ce format.',
            'NOT_ENOUGH_TEAMS',
            {'needed': needed},
        )

    with transaction.atomic():
        error = _build_and_start_tournament(tournament)
        if error:
            return None, (error, 'BUILD_ERROR', None)

    return TournamentSerializer(tournament).data, None


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_tournament(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    if not _has_bde_access(request):
        return Response({'detail': 'Accès BDE requis.'}, status=status.HTTP_403_FORBIDDEN)

    data, error = _do_start_tournament(tournament)
    if error:
        return _user_error(error[0], error[1], extra=error[2])
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def close_registrations(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    if not _has_bde_access(request):
        return Response({'detail': 'Accès BDE requis.'}, status=status.HTTP_403_FORBIDDEN)

    if tournament.status != Tournament.Status.OPEN:
        return _user_error('Les inscriptions ne sont pas ouvertes.', 'NOT_OPEN')

    tournament.status = Tournament.Status.CLOSED
    tournament.save(update_fields=['status'])
    return Response(TournamentSerializer(tournament).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reopen_registrations(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    if not _has_bde_access(request):
        return Response({'detail': 'Accès BDE requis.'}, status=status.HTTP_403_FORBIDDEN)

    if tournament.status != Tournament.Status.CLOSED:
        return _user_error('Les inscriptions ne sont pas fermées.', 'NOT_CLOSED')

    tournament.status = Tournament.Status.OPEN
    tournament.save(update_fields=['status'])
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
        return _user_error('Ce tournoi n\'est pas au format Swiss.', 'NOT_SWISS')
    if tournament.status != Tournament.Status.ONGOING:
        return _user_error('Le tournoi n\'est pas en cours.', 'NOT_ONGOING')

    last_round = (
        tournament.bracket_matches
        .order_by('-swiss_round')
        .values_list('swiss_round', flat=True)
        .first()
    ) or 0

    if not _swiss_round_complete(tournament, last_round):
        return _user_error(f'Le round {last_round} n\'est pas encore terminé.', 'ROUND_NOT_COMPLETE')

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


def _do_import_players(tournament, file):
    """Logique d'import partagée entre l'endpoint BDE (JWT) et l'admin (session).
    Retourne (result, None) en cas de succès — result = {created, skipped, errors} —
    ou (None, (message, code)) en cas d'erreur métier."""
    if tournament.status != Tournament.Status.OPEN:
        return None, ('Les inscriptions sont fermées.', 'REGISTRATIONS_CLOSED')

    if not file:
        return None, ('Aucun fichier fourni.', 'NO_FILE')

    try:
        pairs = _parse_import_file(file)
    except Exception as e:
        return None, (f'Erreur de parsing : {e}', 'PARSE_ERROR')

    if not pairs:
        return None, ('Aucun joueur trouvé dans le fichier.', 'NO_PLAYERS')

    created  = []
    skipped  = []
    errors   = []

    # Aucune limite de capacité à l'import (choix BDE) : on inscrit tout le monde,
    # c'est le lancement du tournoi qui contrôle le nombre d'équipes.
    with transaction.atomic():
        for p1_login, p2_login in pairs:
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

    return {'created': created, 'skipped': skipped, 'errors': errors}, None


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def import_players(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    denied = _require_bde(request)
    if denied:
        return denied

    result, error = _do_import_players(tournament, request.FILES.get('file'))
    if error:
        return _user_error(error[0], error[1])
    return Response(result, status=status.HTTP_201_CREATED)


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
        return _user_error('Ce match est déjà terminé.', 'MATCH_DONE')

    if not match.team1_id or not match.team2_id:
        return _user_error("Ce match n'a pas encore deux équipes.", 'INCOMPLETE_MATCH')

    score_team1 = request.data.get('score_team1')
    score_team2 = request.data.get('score_team2')
    winner_id   = request.data.get('winner_team')

    if score_team1 is not None and score_team2 is not None:
        try:
            score_team1 = int(score_team1)
            score_team2 = int(score_team2)
        except (TypeError, ValueError):
            return _user_error('Les scores doivent être des nombres.', 'INVALID_SCORE')
        if score_team1 == score_team2:
            return _user_error('Un match de tournoi ne peut pas finir sur une égalité.', 'TIE')
        winner = match.team1 if score_team1 > score_team2 else match.team2
    elif winner_id:
        winner = get_object_or_404(TournamentTeam, pk=winner_id, tournament=match.tournament)
        if winner.pk not in (match.team1_id, match.team2_id):
            return _user_error('Le gagnant doit être une des deux équipes du match.', 'INVALID_WINNER')
        score_team1 = score_team2 = None
    else:
        return _user_error('Fournis score_team1/score_team2 ou winner_team.', 'NO_RESULT')

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
        return _user_error('Ce match ne peut pas encore être planifié.', 'NOT_READY')

    # Les matchs de tournoi ne sont plus mis en file d'attente : la replanification
    # n'a plus d'objet (le match se joue hors-ligne, le BDE valide le résultat).
    # On répond sans rien modifier pour ne pas casser l'appel côté front.
    return Response(TournamentMatchSerializer(match).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def register_to_tournament(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)

    if tournament.status != Tournament.Status.OPEN:
        return _user_error('Les inscriptions sont fermées.', 'REGISTRATIONS_CLOSED')

    if tournament.deadline:
        deadline = tournament.deadline
        if timezone.is_naive(deadline):
            deadline = timezone.make_aware(deadline)
        if deadline < timezone.now():
            return _user_error("La date limite d'inscription est dépassée.", 'DEADLINE_PASSED')

    already = TournamentRegistration.objects.filter(
        tournament=tournament
    ).filter(Q(player1=request.user) | Q(player2=request.user))
    if already.exists():
        return _user_error('Vous êtes déjà inscrit.', 'ALREADY_REGISTERED')

    max_teams = tournament.max_players // tournament.team_size
    if tournament.registrations.count() >= max_teams:
        return _user_error('Le tournoi est complet.', 'FULL')

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
            return _user_error('Partenaire introuvable.', 'PARTNER_NOT_FOUND')
        if player2 == request.user:
            return _user_error('Vous ne pouvez pas vous inscrire avec vous-même.', 'SELF_PARTNER')
        partner_taken = TournamentRegistration.objects.filter(
            tournament=tournament
        ).filter(Q(player1=player2) | Q(player2=player2))
        if partner_taken.exists():
            return _user_error('Ce partenaire est déjà inscrit.', 'PARTNER_TAKEN')

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
        return _user_error('Les équipes ne peuvent plus être modifiées après le lancement.', 'LOCKED')

    player1_login = (request.data.get('player1') or '').strip()
    player2_login = (request.data.get('player2') or '').strip()

    if not player1_login:
        return _user_error('Login joueur 1 requis.', 'PLAYER1_REQUIRED')

    if tournament.team_size == 2 and not player2_login:
        return _user_error('Deux logins sont requis en 2v2.', 'TWO_LOGINS_REQUIRED')

    if player1_login == player2_login:
        return _user_error('Une équipe doit contenir deux joueurs différents.', 'SAME_PLAYER')

    try:
        player1 = User.objects.get(username=player1_login)
    except User.DoesNotExist:
        return _user_error(f'Joueur introuvable : {player1_login}', 'PLAYER_NOT_FOUND')

    player2 = None
    if player2_login:
        try:
            player2 = User.objects.get(username=player2_login)
        except User.DoesNotExist:
            return _user_error(f'Joueur introuvable : {player2_login}', 'PLAYER_NOT_FOUND')

    players = [player1] + ([player2] if player2 else [])

    # Bug fix : un ajout BDE ne doit pas dépasser la capacité du tournoi. Si aucun
    # des joueurs n'est déjà inscrit (= vraie nouvelle équipe) et que le tournoi
    # est complet, on refuse. Un ré-appariement de joueurs déjà inscrits passe.
    max_teams = tournament.max_players // tournament.team_size
    already_involved = TournamentRegistration.objects.filter(
        tournament=tournament
    ).filter(Q(player1__in=players) | Q(player2__in=players)).exists()
    if not already_involved and tournament.registrations.count() >= max_teams:
        return _user_error('Le tournoi est complet.', 'FULL')

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
        return _user_error('Les inscriptions ne peuvent plus être modifiées après le lancement.', 'LOCKED')

    reg = get_object_or_404(TournamentRegistration, pk=reg_id, tournament=tournament)
    reg.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def accept_teammate_invite(request, pk):
    tournament = get_object_or_404(Tournament, pk=pk)
    if tournament.status != Tournament.Status.OPEN:
        return _user_error('Les inscriptions sont fermées.', 'REGISTRATIONS_CLOSED')

    if tournament.team_size == 1:
        return _user_error('Ce tournoi est en 1v1, pas d\'invitation de coéquipier.', 'SOLO_TOURNAMENT')

    inviter_login = (request.data.get('inviter') or '').strip()
    if not inviter_login:
        return _user_error('Inviteur requis.', 'INVITER_REQUIRED')

    try:
        inviter = User.objects.get(username=inviter_login)
    except User.DoesNotExist:
        return _user_error('Joueur introuvable.', 'PLAYER_NOT_FOUND')

    j2 = request.user
    if j2 == inviter:
        return _user_error('Vous ne pouvez pas vous inviter vous-même.', 'SELF_INVITE')

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