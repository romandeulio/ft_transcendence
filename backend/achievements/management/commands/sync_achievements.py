"""
Commande de rattrapage : recalcule tous les achievements pour tous les joueurs
en se basant sur l'historique complet des matchs, saisons et paris.

Usage : docker compose exec backend python manage.py sync_achievements
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db.models import Q

User = get_user_model()


class Command(BaseCommand):
    help = 'Recalcule et débloque les achievements pour tous les joueurs'

    def handle(self, *args, **options):
        from matches.models import Match
        from achievements.service import _unlock

        users = User.objects.all()
        total_unlocked = 0

        for user in users:
            login = user.username
            all_matches = Match.objects.filter(
                Q(player1__username=login) | Q(player2__username=login),
                status='VALIDATED'
            ).select_related(
                'player1', 'player1_teammate', 'player2', 'player2_teammate'
            ).order_by('played_at')

            if not all_matches.exists():
                continue

            total_wins = 0
            total_losses = 0
            total_matches_count = 0
            total_gamelles = 0
            total_demis = 0
            current_streak = 0
            best_elo_solo = 1000
            wins_2v2 = 0
            matches_2v2 = 0
            had_5_loss_streak = False
            has_ecrasante = False
            has_serre = False
            has_muraille = False
            has_comeback = False
            has_season = False

            for m in all_matches:
                total_matches_count += 1
                m_is_p1 = (m.player1.username == login)
                m_is_p1_tm = (m.player1_teammate and m.player1_teammate.username == login)
                m_on_team1 = m_is_p1 or m_is_p1_tm

                m_winner = m.get_winner()
                m_won = (m_winner == 'player1_side' and m_on_team1) or \
                        (m_winner == 'player2_side' and not m_on_team1)
                m_lost = (m_winner == 'player2_side' and m_on_team1) or \
                         (m_winner == 'player1_side' and not m_on_team1)

                my_score = m.score_player1 if m_on_team1 else m.score_player2
                their_score = m.score_player2 if m_on_team1 else m.score_player1

                if m_on_team1:
                    total_gamelles += m.gamelles_player1 or 0
                    total_demis += m.demis_player1 or 0
                else:
                    total_gamelles += m.gamelles_player2 or 0
                    total_demis += m.demis_player2 or 0

                if m_won:
                    total_wins += 1
                    if current_streak <= -5:
                        had_5_loss_streak = True
                    current_streak = current_streak + 1 if current_streak > 0 else 1

                    # Victoire écrasante
                    if my_score == 10 and their_score == 0:
                        has_ecrasante = True
                    # Match serré
                    if my_score == 10 and their_score == 9:
                        has_serre = True
                    # Muraille
                    if their_score == 0 and my_score != 10:
                        has_muraille = True
                    # Comeback
                    if their_score >= 7:
                        has_comeback = True

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

                if m.season_id:
                    has_season = True

            # Déblocage
            before = total_unlocked

            if total_matches_count >= 1:
                _unlock(user, 'bapteme')
            if total_wins >= 1:
                _unlock(user, 'first_win')
            if has_ecrasante:
                _unlock(user, 'ecrasante')
            if has_serre:
                _unlock(user, 'serre')
            if has_muraille:
                _unlock(user, 'muraille')
            if has_comeback:
                _unlock(user, 'comeback')
            if total_wins >= 10:
                _unlock(user, 'wins_10')
            if total_wins >= 50:
                _unlock(user, 'wins_50')
            if total_wins >= 100:
                _unlock(user, 'wins_100')
            if total_matches_count >= 10:
                _unlock(user, 'matches_10')
            if total_matches_count >= 50:
                _unlock(user, 'matches_50')
            if total_matches_count >= 100:
                _unlock(user, 'matches_100')
            if total_gamelles >= 1:
                _unlock(user, 'first_gamelle')
            if total_gamelles >= 5:
                _unlock(user, 'gamelleur')
            if total_gamelles >= 20:
                _unlock(user, 'roi_gamelle')
            if total_demis >= 1:
                _unlock(user, 'first_demi')
            if total_demis >= 10:
                _unlock(user, 'barman')
            if total_demis >= 50:
                _unlock(user, 'patron_bar')
            if current_streak >= 3:
                _unlock(user, 'serie_3')
            if current_streak >= 5:
                _unlock(user, 'serie_5')
            if current_streak >= 10:
                _unlock(user, 'serie_10')
            if had_5_loss_streak:
                _unlock(user, 'resilient')
            if best_elo_solo >= 1100:
                _unlock(user, 'elo_1100')
            if best_elo_solo >= 1200:
                _unlock(user, 'elo_1200')
            if best_elo_solo >= 1500:
                _unlock(user, 'elo_1500')
            if best_elo_solo >= 2000:
                _unlock(user, 'elo_2000')
            if matches_2v2 >= 1:
                _unlock(user, 'first_2v2')
            if wins_2v2 >= 10:
                _unlock(user, 'duo_choc')
            if wins_2v2 >= 25:
                _unlock(user, 'capitaine')
            if has_season:
                _unlock(user, 'first_season')

            self.stdout.write(f'  {login}: {total_matches_count} matchs, '
                              f'{total_wins}W/{total_losses}L, '
                              f'{total_gamelles} gamelles, {total_demis} demis, '
                              f'elo={best_elo_solo}')

        # Saisons clôturées
        self._check_closed_seasons()

        # Paris
        self._check_bets()

        self.stdout.write(self.style.SUCCESS('Sync achievements terminé.'))

    def _check_closed_seasons(self):
        from seasons.models import Season, SeasonReward
        from seasons.views import _build_ranking
        from achievements.service import _unlock

        closed = Season.objects.filter(status='FINISHED')
        for season in closed:
            for ranking_type in ('SOLO', 'TEAM'):
                ranking = _build_ranking(season, ranking_type)
                for entry in ranking:
                    try:
                        player = User.objects.get(username=entry['username'])
                    except User.DoesNotExist:
                        continue
                    if entry['rank'] <= 3:
                        _unlock(player, 'top3_season')
                    if entry['rank'] == 1:
                        _unlock(player, 'champion_season')
                        champion_count = SeasonReward.objects.filter(
                            player=player, tier='TOP1',
                        ).values('season_id').distinct().count()
                        if champion_count >= 3:
                            _unlock(player, 'multi_champion')

    def _check_bets(self):
        from achievements.service import _unlock
        try:
            from bets.models import Bet
        except ImportError:
            return

        for user in User.objects.all():
            user_bets = Bet.objects.filter(user=user)
            if user_bets.exists():
                _unlock(user, 'first_bet')
            won_bets = user_bets.filter(result='won')
            for b in won_bets:
                if b.payout and b.payout >= 1000:
                    _unlock(user, 'jackpot')
                    break
            if hasattr(user, 'wallet_tokens') and user.wallet_tokens and user.wallet_tokens >= 50000:
                _unlock(user, 'millionnaire')
