# backend/app/matches/ranking_service.py

from django.db import transaction
from .models_ranking import Ranking, RankingHistory


@transaction.atomic
def update_rankings_after_match(match):
    if not match.is_ranked or match.match_type == 'FUN':
        return

    # Construire la liste des joueurs avec leur delta ELO
    players = _get_players_with_deltas(match)

    for player, delta, won in players:
        for scope in [Ranking.Scope.SEASON, Ranking.Scope.GLOBAL]:
            season = match.season if scope == Ranking.Scope.SEASON else None

            # Récupérer ou créer le ranking
            ranking, _ = Ranking.objects.get_or_create(
                user=player,
                season=season,
                mode=match.match_type,
                scope=scope,
                defaults={'score': 1000, 'wins': 0, 'losses': 0},
            )

            score_before = ranking.score
            score_after  = ranking.score + delta

            # Mettre à jour le cache
            ranking.score = score_after
            if won:
                ranking.wins += 1
            else:
                ranking.losses += 1
            ranking.save()

            # Insérer dans l'historique
            RankingHistory.objects.create(
                user=player,
                match=match,
                season=season,
                mode=match.match_type,
                scope=scope,
                score_before=score_before,
                score_after=score_after,
                score_delta=delta,
            )


def _get_players_with_deltas(match):
    p1_won = match.score_player1 > match.score_player2

    if match.match_type == 'SOLO':
        return [
            (match.player1, match.elo_solo_p1_after - match.elo_solo_p1_before, p1_won),
            (match.player2, match.elo_solo_p2_after - match.elo_solo_p2_before, not p1_won),
        ]

    # TEAM
    return [
        (match.player1,          match.elo_team_p1_after   - match.elo_team_p1_before,   p1_won),
        (match.player1_teammate, match.elo_team_p1tm_after  - match.elo_team_p1tm_before, p1_won),
        (match.player2,          match.elo_team_p2_after    - match.elo_team_p2_before,   not p1_won),
        (match.player2_teammate, match.elo_team_p2tm_after  - match.elo_team_p2tm_before, not p1_won),
    ]