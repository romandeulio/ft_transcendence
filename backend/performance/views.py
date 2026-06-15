from collections import defaultdict

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q, Max
from django.db.models.functions import TruncWeek, TruncMonth

from .models import Stats
from .serializers import StatsSerializer


class StatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        players_param = request.query_params.get('players', '').strip()
        if players_param:
            logins = [l.strip() for l in players_param.split(',') if l.strip()]
            rows = Stats.objects.filter(user__username__in=logins).select_related('user')
            result = []
            for s in rows:
                total = s.total_wins + s.total_losses
                result.append({
                    'login':          s.user.username,
                    'elo_solo':       s.elo_solo,
                    'elo_team':       s.elo_team,
                    'total_wins':     s.total_wins,
                    'total_losses':   s.total_losses,
                    'winrate':        round(s.total_wins / total * 100, 1) if total > 0 else 0,
                    'series_wins':    s.series_wins,
                    'series_losses':  s.series_losses,
                    'total_matches':  s.total_matches,
                    'total_gamelles': s.total_gamelles,
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
        x = request.query_params.get('x', 'matches')
        y = request.query_params.get('y', 'elo')

        if not players_param:
            return Response([])

        logins = [l.strip() for l in players_param.split(',') if l.strip()]

        player_series = {login: self._series(login, x, y) for login in logins}

        all_periods = sorted(set().union(*[s.keys() for s in player_series.values()]))
        output = [
            {'period': str(p), **{login: player_series[login].get(p) for login in logins}}
            for p in all_periods
        ]
        return Response(output)

    def _series(self, login, x, y):
        if y == 'elo':
            return self._elo_series(login, x)
        return self._match_series(login, x, y)

    def _elo_series(self, login, x):
        from matches.models_ranking import RankingHistory
        qs = RankingHistory.objects.filter(
            user__username=login, mode='SOLO', scope='global'
        ).order_by('recorded_at')

        if x == 'matches':
            return {i + 1: e.score_after for i, e in enumerate(qs)}

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

    def _match_series(self, login, x, y):
        from matches.models import Match
        qs = (
            Match.objects.filter(status='VALIDATED')
            .filter(Q(player1__username=login) | Q(player2__username=login))
            .order_by('played_at')
            .values(
                'player1__username', 'score_player1', 'score_player2',
                'gamelles_player1', 'gamelles_player2',
                'played_at', 'season__name',
            )
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
                'streak':  d['wins'],
            }[y]

        if x == 'matches':
            cum = defaultdict(int)
            result = {}
            for i, e in enumerate(qs):
                won, goals = extract(e)
                cum['wins']   += int(won)
                cum['losses'] += int(not won)
                cum['goals']  += goals
                result[i + 1]  = pick(cum, y)
            return result

        def period_key(e):
            if x == 'seasons':
                return e['season__name'] or 'Hors saison'
            if x == 'weeks':
                return e['played_at'].strftime('%Y-W%W')
            return e['played_at'].strftime('%Y-%m')

        buckets = defaultdict(lambda: defaultdict(int))
        for e in qs:
            p = period_key(e)
            won, goals = extract(e)
            buckets[p]['wins']   += int(won)
            buckets[p]['losses'] += int(not won)
            buckets[p]['goals']  += goals

        return {p: pick(buckets[p], y) for p in sorted(buckets)}
