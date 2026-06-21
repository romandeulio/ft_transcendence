"""
Vérifie et débloque les achievements après chaque validation de match.
Appelé depuis matches/views.py après update_stats_after_match.
"""
from django.db.models import Q
from .models import Achievement, UserAchievement


def _unlock(user, achievement_id):
    """Débloque un achievement s'il ne l'est pas déjà."""
    if not Achievement.objects.filter(id=achievement_id).exists():
        return
    UserAchievement.objects.get_or_create(
        user=user,
        achievement_id=achievement_id,
    )


def _has(user, achievement_id):
    return UserAchievement.objects.filter(
        user=user, achievement_id=achievement_id
    ).exists()


def check_achievements_after_match(match):
    """
    Vérifie tous les achievements pour tous les joueurs du match.
    Appelé juste après la validation du match.
    """
    from matches.models import Match

    players_info = _get_players_info(match)

    for user, is_p1, on_team1 in players_info:
        _check_for_player(user, match, is_p1, on_team1)


def _get_players_info(match):
    """Retourne [(user, is_p1, on_team1), ...] pour chaque joueur du match."""
    result = []
    if match.player1:
        result.append((match.player1, True, True))
    if match.player1_teammate:
        result.append((match.player1_teammate, False, True))
    if match.player2:
        result.append((match.player2, False, False))
    if match.player2_teammate:
        result.append((match.player2_teammate, False, False))
    return result


def _check_for_player(user, match, is_p1, on_team1):
    from matches.models import Match

    login = user.username
    winner = match.get_winner()
    won = (winner == 'player1_side' and on_team1) or \
          (winner == 'player2_side' and not on_team1)
    lost = (winner == 'player2_side' and on_team1) or \
           (winner == 'player1_side' and not on_team1)

    my_score = match.score_player1 if on_team1 else match.score_player2
    their_score = match.score_player2 if on_team1 else match.score_player1
    my_gamelles = match.gamelles_player1 if on_team1 else match.gamelles_player2
    my_demis = match.demis_player1 if on_team1 else match.demis_player2

    # Récupérer les stats cumulées depuis TOUS les matchs validés
    all_matches = Match.objects.filter(
        Q(player1__username=login) | Q(player2__username=login),
        status='VALIDATED'
    ).select_related('player1', 'player1_teammate', 'player2', 'player2_teammate').order_by('played_at')

    total_wins = 0
    total_losses = 0
    total_matches = 0
    total_gamelles = 0
    total_demis = 0
    current_streak = 0
    best_elo_solo = 1000
    wins_2v2 = 0
    matches_2v2 = 0
    series_losses_before = 0  # pour "résilient"

    for m in all_matches:
        total_matches += 1
        m_is_p1 = (m.player1.username == login)
        m_is_p1_tm = (m.player1_teammate and m.player1_teammate.username == login)
        m_on_team1 = m_is_p1 or m_is_p1_tm

        m_winner = m.get_winner()
        m_won = (m_winner == 'player1_side' and m_on_team1) or \
                (m_winner == 'player2_side' and not m_on_team1)
        m_lost = (m_winner == 'player2_side' and m_on_team1) or \
                 (m_winner == 'player1_side' and not m_on_team1)

        if m_on_team1:
            total_gamelles += m.gamelles_player1 or 0
            total_demis += m.demis_player1 or 0
        else:
            total_gamelles += m.gamelles_player2 or 0
            total_demis += m.demis_player2 or 0

        if m_won:
            total_wins += 1
            # "Résilient" : gagner après 5+ défaites d'affilée
            if current_streak <= -5:
                series_losses_before = abs(current_streak)
            current_streak = current_streak + 1 if current_streak > 0 else 1
        elif m_lost:
            total_losses += 1
            current_streak = current_streak - 1 if current_streak < 0 else -1

        if m.match_type == 'TEAM':
            matches_2v2 += 1
            if m_won:
                wins_2v2 += 1

        if m.is_ranked and m.match_type == 'SOLO':
            elo = (m.elo_solo_player1_after if m_is_p1 else m.elo_solo_player2_after) or 0
            best_elo_solo = max(best_elo_solo, elo)

    # ── Baptême du feu ──
    if total_matches >= 1:
        _unlock(user, 'bapteme')

    # ── Première victoire ──
    if total_wins >= 1:
        _unlock(user, 'first_win')

    # ── Victoire écrasante (10-0) ──
    if won and my_score == 10 and their_score == 0:
        _unlock(user, 'ecrasante')

    # ── Match serré (10-9) ──
    if won and my_score == 10 and their_score == 9:
        _unlock(user, 'serre')

    # ── Muraille (gagner sans encaisser, hors 10-0) ──
    if won and their_score == 0 and my_score != 10:
        _unlock(user, 'muraille')

    # ── Comeback (gagner alors que l'adversaire avait 7+) ──
    if won and their_score >= 7:
        _unlock(user, 'comeback')

    # ── Victoires cumulées ──
    if total_wins >= 10:
        _unlock(user, 'wins_10')
    if total_wins >= 50:
        _unlock(user, 'wins_50')
    if total_wins >= 100:
        _unlock(user, 'wins_100')

    # ── Matchs joués ──
    if total_matches >= 10:
        _unlock(user, 'matches_10')
    if total_matches >= 50:
        _unlock(user, 'matches_50')
    if total_matches >= 100:
        _unlock(user, 'matches_100')

    # ── Gamelles ──
    if total_gamelles >= 1:
        _unlock(user, 'first_gamelle')
    if total_gamelles >= 5:
        _unlock(user, 'gamelleur')
    if total_gamelles >= 20:
        _unlock(user, 'roi_gamelle')

    # ── Demis ──
    if total_demis >= 1:
        _unlock(user, 'first_demi')
    if total_demis >= 10:
        _unlock(user, 'barman')
    if total_demis >= 50:
        _unlock(user, 'patron_bar')

    # ── Séries ──
    if current_streak >= 3:
        _unlock(user, 'serie_3')
    if current_streak >= 5:
        _unlock(user, 'serie_5')
    if current_streak >= 10:
        _unlock(user, 'serie_10')

    # ── Résilient ──
    if won and series_losses_before >= 5:
        _unlock(user, 'resilient')

    # ── ELO ──
    if best_elo_solo >= 1100:
        _unlock(user, 'elo_1100')
    if best_elo_solo >= 1200:
        _unlock(user, 'elo_1200')
    if best_elo_solo >= 1500:
        _unlock(user, 'elo_1500')
    if best_elo_solo >= 2000:
        _unlock(user, 'elo_2000')

    # ── 2v2 ──
    if matches_2v2 >= 1:
        _unlock(user, 'first_2v2')
    if wins_2v2 >= 10:
        _unlock(user, 'duo_choc')
    if wins_2v2 >= 25:
        _unlock(user, 'capitaine')

    # ── Saisons (first_season) ──
    if match.season_id:
        _unlock(user, 'first_season')


def check_season_achievements(season):
    """
    Appelé quand une saison est clôturée.
    Vérifie top3, champion, multi-champion.
    """
    from seasons.views import _build_ranking
    from seasons.models import SeasonReward

    for ranking_type in ('SOLO', 'TEAM'):
        ranking = _build_ranking(season, ranking_type)
        for entry in ranking:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                player = User.objects.get(username=entry['username'])
            except User.DoesNotExist:
                continue

            if entry['rank'] <= 3:
                _unlock(player, 'top3_season')
            if entry['rank'] == 1:
                _unlock(player, 'champion_season')

                # Multi-champion : vérifier si 3+ saisons en #1
                champion_count = SeasonReward.objects.filter(
                    player=player,
                    tier='TOP1',
                ).values('season_id').distinct().count()
                if champion_count >= 3:
                    _unlock(player, 'multi_champion')


def check_bet_achievements(user, bet):
    """
    Appelé après résolution d'un pari.
    """
    from bets.models import Bet

    # Premier pari
    _unlock(user, 'first_bet')

    # Jackpot (gagné 1000+)
    if bet.result == 'won' and bet.payout and bet.payout >= 1000:
        _unlock(user, 'jackpot')

    # Millionnaire
    if hasattr(user, 'wallet_tokens') and user.wallet_tokens >= 50000:
        _unlock(user, 'millionnaire')
