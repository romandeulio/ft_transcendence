from .models import Stats

def update_stats_after_match(match):
    score_p1 = match.score_player1
    score_p2 = match.score_player2
    p1_won = score_p1 > score_p2
    draw = score_p1 == score_p2

    players = []

    if match.match_type in ('SOLO', 'TEAM'):
        if match.player1:
            players.append((
                match.player1,
                p1_won,
                not p1_won and not draw,
                match.gamelles_player1,
                match.demis_player1,
            ))
        if match.player2:
            players.append((
                match.player2,
                not p1_won and not draw,
                p1_won,
                match.gamelles_player2,
                match.demis_player2,
            ))
        if match.match_type == 'TEAM':
            if match.player1_teammate:
                players.append((
                    match.player1_teammate,
                    p1_won,
                    not p1_won and not draw,
                    match.gamelles_player1,
                    match.demis_player1,
                ))
            if match.player2_teammate:
                players.append((
                    match.player2_teammate,
                    not p1_won and not draw,
                    p1_won,
                    match.gamelles_player2,
                    match.demis_player2,
                ))

    for user, won, lost, gamelles, demis in players:
        stats, _ = Stats.objects.get_or_create(user=user)
        stats.total_matches += 1
        if won:
            stats.total_wins += 1
            stats.series_wins += 1
            stats.series_losses = 0
        elif lost:
            stats.total_losses += 1
            stats.series_losses += 1
            stats.series_wins = 0
        stats.total_gamelles += gamelles
        stats.total_demis += demis

        if match.is_ranked and match.match_type == 'SOLO':
            if user == match.player1:
                stats.elo_solo = match.elo_solo_player1_after
            elif user == match.player2:
                stats.elo_solo = match.elo_solo_player2_after
        elif match.is_ranked and match.match_type == 'TEAM':
            if user == match.player1:
                stats.elo_team = match.elo_team_p1_after
            elif user == match.player1_teammate:
                stats.elo_team = match.elo_team_p1tm_after
            elif user == match.player2:
                stats.elo_team = match.elo_team_p2_after
            elif user == match.player2_teammate:
                stats.elo_team = match.elo_team_p2tm_after

        stats.save()