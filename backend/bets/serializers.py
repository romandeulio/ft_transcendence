"""
Bet serialisation for the REST API.

Plain functions returning dicts rather than ModelSerializers: the payloads
aggregate game + market + the user's own bet, and follow the front-end contract
(Paris.jsx: match, p1, p2, probP1, pctBets, myBet...).
"""
from .models import Bet
from .services import reservation_market, is_launched, betting_open


def _side_label(player, teammate):
    if player and teammate:
        return f"{player.username} & {teammate.username}"
    if player:
        return player.username
    return "—"


def _bet_side(target, predicted_winner_id):
    """'p1' / 'p2' depending on the predicted leader's side (target = reservation or match)."""
    if predicted_winner_id in {target.player1_id, target.player1_teammate_id}:
        return 'p1'
    return 'p2'


def market_payload(reservation):
    """
    A game's market, independent of any user (odds, probabilities, pools).
    Used for the REST snapshot and the group WebSocket broadcasts.
    """
    market = reservation_market(reservation)
    p1 = _side_label(reservation.player1, reservation.player1_teammate)
    p2 = _side_label(reservation.player2, reservation.player2_teammate)
    total = market['staked1'] + market['staked2']
    pct1 = round(100 * market['staked1'] / total) if total else 50

    return {
        'reservation_id': str(reservation.id),
        'match_type': reservation.match_type,
        'is_ranked': reservation.is_ranked,
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
        'launched': is_launched(reservation),
        'open': betting_open(reservation),
    }


def serialize_available(reservation, user):
    """A game open for betting, as seen by `user` (market + the user's own bet)."""
    payload = market_payload(reservation)

    my_bet = None
    mine = Bet.objects.filter(
        user=user, reservation=reservation, result__isnull=True
    ).first()
    if mine:
        my_bet = {
            'id': str(mine.id),
            'side': _bet_side(reservation, mine.predicted_winner_id),
            'amount': mine.amount,
            'odds': float(mine.odds) if mine.odds is not None else None,
        }

    payload['bettable'] = user.pk not in (
        reservation.player1_id, reservation.player2_id,
        reservation.player1_teammate_id, reservation.player2_teammate_id,
    )
    payload['my_bet'] = my_bet
    return payload


def serialize_history(bet):
    """A single bet from the user's history."""
    # Resolved bet: the official Match carries both the players AND the final
    # score, so prefer it over the reservation to keep names and score aligned.
    target = bet.match or bet.reservation
    if target:
        p1 = _side_label(target.player1, target.player1_teammate)
        p2 = _side_label(target.player2, target.player2_teammate)
        match = f"{p1} vs {p2}"
        side = _bet_side(target, bet.predicted_winner_id)
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
        delta = None

    score = None
    if bet.match:
        score = f"{bet.match.score_player1}-{bet.match.score_player2}"

    return {
        'id': str(bet.id),
        'match': match,
        'side': side,
        'bet_on': bet_on,
        'score': score,
        'amount': bet.amount,
        'odds': float(bet.odds) if bet.odds is not None else None,
        'result': bet.result,
        'payout': bet.payout,
        'delta': delta,
        'created_at': bet.created_at,
    }
