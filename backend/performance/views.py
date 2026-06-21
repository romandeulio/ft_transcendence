from collections import defaultdict

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q, Max
from django.db.models.functions import TruncWeek, TruncMonth, TruncDate

from stats.models import Stats
from stats.serializers import StatsSerializer


class StatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        players_param = request.query_params.get('players', '').strip()
        if players_param:
            from matches.models import Match
            from django.db.models import Q, Min
            from django.utils import timezone

            logins = [l.strip() for l in players_param.split(',') if l.strip()]
            rows = Stats.objects.filter(user__username__in=logins).select_related('user')
            result = []
            for s in rows:
                total = s.total_wins + s.total_losses
                login = s.user.username
                first = Match.objects.filter(
                    Q(player1__username=login) | Q(player2__username=login),
                    status='VALIDATED'
                ).aggregate(first=Min('played_at'))['first']
                if first and timezone.is_naive(first):
                    first = timezone.make_aware(first, timezone.utc)
                months = max(1, (timezone.now() - first).days / 30) if first else 1
                result.append({
                    'login':             login,
                    'elo_solo':          s.elo_solo,
                    'elo_team':          s.elo_team,
                    'total_wins':        s.total_wins,
                    'total_losses':      s.total_losses,
                    'winrate':           round(s.total_wins / total * 100, 1) if total > 0 else 0,
                    'series_wins':       s.series_wins,
                    'series_losses':     s.series_losses,
                    'total_matches':     s.total_matches,
                    'total_gamelles':    s.total_gamelles,
                    'matches_per_month': round(s.total_matches / months, 1),
                })
            return Response(result)
        try:
            stats = Stats.objects.get(user=request.user)
        except Stats.DoesNotExist:
            return Response({"error": "Stats not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(StatsSerializer(stats).data)


class PerformanceHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        players_param = request.query_params.get('players', '').strip()
        x          = request.query_params.get('x', 'matches')
        y          = request.query_params.get('y', 'elo')
        date_from  = request.query_params.get('date_from')
        date_to    = request.query_params.get('date_to')
        limit_raw  = request.query_params.get('limit')
        limit      = int(limit_raw) if limit_raw and limit_raw.isdigit() else None

        if not players_param:
            return Response([])

        logins = [l.strip() for l in players_param.split(',') if l.strip()]

        player_series = {login: self._series(login, x, y, date_from, date_to, limit) for login in logins}

        all_periods = sorted(set().union(*[s.keys() for s in player_series.values()]))
        output = [
            {'period': str(p), **{login: player_series[login].get(p) for login in logins}}
            for p in all_periods
        ]
        return Response(output)

    def _series(self, login, x, y, date_from=None, date_to=None, limit=None):
        if y == 'elo':
            return self._elo_series(login, x, date_from, date_to, limit)
        return self._match_series(login, x, y, date_from, date_to, limit)

    def _elo_series(self, login, x, date_from=None, date_to=None, limit=None):
        from matches.models_ranking import RankingHistory
        qs = RankingHistory.objects.filter(
            user__username=login, mode='SOLO', scope='global'
        ).order_by('recorded_at')
        if date_from:
            qs = qs.filter(recorded_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(recorded_at__date__lte=date_to)

        if x == 'matches':
            if limit:
                entries = list(qs.order_by('-recorded_at')[:limit])[::-1]
            else:
                entries = list(qs)
            return {i + 1: e.score_after for i, e in enumerate(entries)}

        if x == 'days':
            entries = (
                qs.annotate(p=TruncDate('recorded_at'))
                  .values('p')
                  .annotate(elo=Max('score_after'))
                  .order_by('p')
            )
            return {str(e['p']): e['elo'] for e in entries}

        if x == 'seasons':
            result = {}
            for rh in qs.filter(season__isnull=False).select_related('season').order_by('recorded_at'):
                result[rh.season.name] = rh.score_after
            return result

        trunc = TruncWeek if x == 'weeks' else TruncMonth
        fmt   = '%Y-W%W'  if x == 'weeks' else '%Y-%m'
        entries = (
            qs.annotate(p=trunc('recorded_at'))
              .values('p')
              .annotate(elo=Max('score_after'))
              .order_by('p')
        )
        return {e['p'].strftime(fmt): e['elo'] for e in entries}

    def _match_series(self, login, x, y, date_from=None, date_to=None, limit=None):
        from matches.models import Match
        qs = (
            Match.objects.filter(status='VALIDATED')
            .filter(Q(player1__username=login) | Q(player2__username=login))
            .order_by('played_at')
        )
        if date_from:
            qs = qs.filter(played_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(played_at__date__lte=date_to)
        qs = qs.values(
                'player1__username', 'score_player1', 'score_player2',
                'gamelles_player1', 'gamelles_player2',
                'played_at', 'season__name',
            )

        def extract(e):
            is_p1  = e['player1__username'] == login
            my     = e['score_player1']    if is_p1 else e['score_player2']
            their  = e['score_player2']    if is_p1 else e['score_player1']
            goals  = e['gamelles_player1'] if is_p1 else e['gamelles_player2']
            return my > their, goals

        def pick(d, y):
            total = d['wins'] + d['losses']
            return {
                'wins':    d['wins'],
                'losses':  d['losses'],
                'winrate': round(d['wins'] / total * 100, 1) if total else 0,
                'goals':   d['goals'],
            }[y]

        if x == 'matches':
            if limit:
                entries = list(qs.order_by('-played_at')[:limit])[::-1]
            else:
                entries = list(qs)
            cum = defaultdict(int)
            result = {}
            for i, e in enumerate(entries):
                won, goals = extract(e)
                cum['wins']   += int(won)
                cum['losses'] += int(not won)
                cum['goals']  += goals
                result[i + 1]  = pick(cum, y)
            return result

        def period_key(e):
            if x == 'seasons':
                return e['season__name'] or 'Hors saison'
            played = timezone.localtime(e['played_at']) if timezone.is_aware(e['played_at']) else e['played_at']
            if x == 'weeks':
                return played.strftime('%Y-W%W')
            if x == 'days':
                return str(played.date())
            return played.strftime('%Y-%m')

        buckets = defaultdict(lambda: defaultdict(int))
        for e in qs:
            p = period_key(e)
            won, goals = extract(e)
            buckets[p]['wins']   += int(won)
            buckets[p]['losses'] += int(not won)
            buckets[p]['goals']  += goals

        return {p: pick(buckets[p], y) for p in sorted(buckets)}


class RankHistoryView(APIView):
    """
    Évolution du classement du joueur connecté pour une saison donnée.
    Calcule directement depuis les matchs (pas de dépendance à RankingHistory).
    ?season=<id>&type=solo|team (défaut: solo)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from matches.models import Match

        season_id = request.query_params.get('season', '').strip()
        if not season_id:
            return Response([])

        mode = request.query_params.get('type', 'solo').upper()
        if mode not in ('SOLO', 'TEAM'):
            return Response([])

        user = request.user

        all_matches = Match.objects.filter(
            season_id=season_id,
            status='VALIDATED',
            is_ranked=True,
            match_type=mode,
        ).select_related(
            'player1', 'player2', 'player1_teammate', 'player2_teammate',
        ).order_by('played_at')

        elo_snapshot = {}
        user_history = []
        user_match_idx = 0

        for m in all_matches:
            if mode == 'SOLO':
                elo_snapshot[m.player1_id] = m.elo_solo_player1_after
                elo_snapshot[m.player2_id] = m.elo_solo_player2_after
                involved = {m.player1_id, m.player2_id}
            else:
                elo_snapshot[m.player1_id] = m.elo_team_p1_after
                if m.player1_teammate_id:
                    elo_snapshot[m.player1_teammate_id] = m.elo_team_p1tm_after
                elo_snapshot[m.player2_id] = m.elo_team_p2_after
                if m.player2_teammate_id:
                    elo_snapshot[m.player2_teammate_id] = m.elo_team_p2tm_after
                involved = {m.player1_id, m.player1_teammate_id, m.player2_id, m.player2_teammate_id}

            if user.id in involved:
                user_match_idx += 1
                user_elo = elo_snapshot.get(user.id, 1000)
                rank = sum(1 for elo in elo_snapshot.values() if elo > user_elo) + 1
                user_history.append({
                    'match': user_match_idx,
                    'elo':   user_elo,
                    'rank':  rank,
                })

        return Response(user_history)
