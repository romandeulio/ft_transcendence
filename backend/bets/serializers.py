"""
Sérialisation des paris pour l'API REST.

En fonctions simples (dicts) plutôt qu'en ModelSerializer : les payloads
agrègent match + marché + pari de l'utilisateur, et collent au contrat du
front (Paris.jsx : match, p1, p2, probP1, pctBets, myBet...).
"""
from .models import Bet
from .services import match_market


def _side_label(player, teammate):
    if player and teammate:
        return f"{player.username} & {teammate.username}"
    if player:
        return player.username
    return "—"


def _bet_side(match, predicted_winner_id):
    """'p1' / 'p2' selon le camp du leader prédit."""
    if predicted_winner_id in {match.player1_id, match.player1_teammate_id}:
        return 'p1'
    return 'p2'


def serialize_available(match, user):
    """Un match ouvert aux paris, vu par `user`."""
    market = match_market(match)
    p1 = _side_label(match.player1, match.player1_teammate)
    p2 = _side_label(match.player2, match.player2_teammate)
    total = market['staked1'] + market['staked2']
    pct1 = round(100 * market['staked1'] / total) if total else 50

    my_bet = None
    mine = Bet.objects.filter(
        user=user, match=match, result__isnull=True
    ).first()
    if mine:
        my_bet = {
            'id': str(mine.id),
            'side': _bet_side(match, mine.predicted_winner_id),
            'amount': mine.amount,
            'odds': float(mine.odds) if mine.odds is not None else None,
        }

    return {
        'match_id': str(match.id),
        'match_type': match.match_type,
        'is_ranked': match.is_ranked,
        'status': 'live',
        'match': f"{p1} vs {p2}",
        'p1': p1,
        'p2': p2,
        'odds_p1': market['odds1'],
        'odds_p2': market['odds2'],
        'prob_p1': round(100 * market['prob1']),
        'pct_bets_p1': pct1,
        'pool_p1': market['staked1'],
        'pool_p2': market['staked2'],
        # bettable=False si l'utilisateur joue ce match.
        'bettable': user.pk not in (
            match.player1_id, match.player2_id,
            match.player1_teammate_id, match.player2_teammate_id,
        ),
        'my_bet': my_bet,
    }


def serialize_history(bet):
    """Un pari de l'historique de l'utilisateur."""
    m = bet.match
    if m:
        p1 = _side_label(m.player1, m.player1_teammate)
        p2 = _side_label(m.player2, m.player2_teammate)
        match = f"{p1} vs {p2}"
        side = _bet_side(m, bet.predicted_winner_id)
        bet_on = p1 if side == 'p1' else p2
    else:
        match = "—"
        side = None
        bet_on = bet.predicted_winner.username if bet.predicted_winner else "—"

    if bet.result == Bet.Result.WON:
        delta = (bet.payout or 0) - bet.amount
    elif bet.result == Bet.Result.LOST:
        delta = -bet.amount
    elif bet.result == Bet.Result.REFUNDED:
        delta = 0
    else:
        delta = None  # pari encore ouvert

    return {
        'id': str(bet.id),
        'match': match,
        'side': side,
        'bet_on': bet_on,
        'amount': bet.amount,
        'odds': float(bet.odds) if bet.odds is not None else None,
        'result': bet.result,
        'payout': bet.payout,
        'delta': delta,
        'created_at': bet.created_at,
    }
