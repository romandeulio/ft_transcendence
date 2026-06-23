"""
Betting business logic: market (odds/pools), placement, cancellation, settlement.

Bets are placed on an IN_PROGRESS Reservation (the live game). Settlement is
triggered when the matching Match is validated: since the table-football setup
is single-table, the reservation is found unambiguously from the set of players.

"Mint" tokens: the stake is destroyed on placement, the payout created on
settlement (no house reserve). Every movement is logged in wallet_transactions
(type bet/win/refund, reference_id = the bet id).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum

from planning.models import Reservation
from .models import Bet, WalletTransaction
from .odds import expected_score, blended_prob, prob_to_odds, score_prob

User = get_user_model()

OPEN_STATUSES = (Reservation.Status.IN_PROGRESS,)


class BetError(ValidationError):
    """Business betting error (mapped to HTTP 400 by the view)."""
    pass


def _get_stat(player, attr):
    if player is None:
        return None
    stats = getattr(player, "stats", None)
    if not stats:
        return None
    return getattr(stats, attr, None)


def _avg(players, attr):
    vals = [_get_stat(p, attr) for p in players]
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else 1000


def _side_players(reservation):
    s1 = {reservation.player1_id, reservation.player1_teammate_id} - {None}
    s2 = {reservation.player2_id, reservation.player2_teammate_id} - {None}
    return s1, s2


def _user_side(reservation, user_id):
    s1, s2 = _side_players(reservation)
    if user_id in s1:
        return 'player1_side'
    if user_id in s2:
        return 'player2_side'
    return None


def _side_elos(reservation):
    if reservation.match_type == 'TEAM':
        e1 = _avg([reservation.player1, reservation.player1_teammate], 'elo_team')
        e2 = _avg([reservation.player2, reservation.player2_teammate], 'elo_team')
    else:
        e1 = _avg([reservation.player1], 'elo_solo')
        e2 = _avg([reservation.player2], 'elo_solo')
    return e1, e2


def staked_per_side(reservation):
    """Total open stakes on each side (t1, t2)."""
    s1, s2 = _side_players(reservation)
    rows = (
        Bet.objects
        .filter(reservation=reservation, result__isnull=True)
        .values('predicted_winner')
        .annotate(total=Sum('amount'))
    )
    t1 = t2 = 0
    for row in rows:
        pw = row['predicted_winner']
        if pw in s1:
            t1 += row['total'] or 0
        elif pw in s2:
            t2 += row['total'] or 0
    return t1, t2


def _uname(player):
    return getattr(player, 'username', None)


def _live_score(reservation):
    """
    (side1_score, side2_score) from the in-memory game state (QueueConsumer),
    matched by the set of players (single table). None if not found.
    In-game: player1 = BLUE (scoreBlue), player2 = RED (scoreRed).
    """
    try:
        from realtime.consumers.queue import games
    except Exception:
        return None
    s1 = {_uname(reservation.player1), _uname(reservation.player1_teammate)} - {None}
    s2 = {_uname(reservation.player2), _uname(reservation.player2_teammate)} - {None}
    res_players = s1 | s2
    if not res_players:
        return None
    for g in games.values():
        gp = {
            g.get('player1'), g.get('player1_teammate'),
            g.get('player2'), g.get('player2_teammate'),
        } - {None}
        if gp != res_players:
            continue
        p1_score = g.get('scoreBlue', 0)
        p2_score = g.get('scoreRed', 0)
        if g.get('player1') in s1:
            return p1_score, p2_score
        return p2_score, p1_score
    return None


def is_launched(reservation):
    """
    True if the game has started (an in-memory game exists for these players).
    Once launched, bets can no longer be cancelled.
    """
    return _live_score(reservation) is not None


CUTOFF_TOTAL_SCORE = 5


def betting_open(reservation):
    """Bets stay open while the combined score of both sides < CUTOFF_TOTAL_SCORE."""
    sc = _live_score(reservation)
    if sc is None:
        return True
    return (sc[0] + sc[1]) < CUTOFF_TOTAL_SCORE


def reservation_market(reservation):
    """Dynamic probability of side 1, odds for both sides, stakes per side."""
    e1, e2 = _side_elos(reservation)
    p_elo = expected_score(e1, e2)
    t1, t2 = staked_per_side(reservation)
    sc = _live_score(reservation)
    p_score = score_prob(sc[0], sc[1]) if sc else None
    prob1 = blended_prob(p_elo, t1, t2, p_score)
    return {
        'prob1': prob1,
        'odds1': prob_to_odds(prob1),
        'odds2': prob_to_odds(1.0 - prob1),
        'staked1': t1,
        'staked2': t2,
    }


def is_open(reservation):
    """A game accepts bets when it is IN_PROGRESS and not a 2v1."""
    return (
        reservation.status in OPEN_STATUSES
        and reservation.match_type != 'TWO_V_ONE'
    )


def _credit(user_id, amount, tx_type, reference_id):
    locked = User.objects.select_for_update().get(pk=user_id)
    locked.deposit_tokens(amount)
    WalletTransaction.objects.create(
        user_id=user_id, type=tx_type, amount=amount, reference_id=reference_id,
    )


def _debit(user_id, amount, tx_type, reference_id):
    locked = User.objects.select_for_update().get(pk=user_id)
    locked.withdraw_tokens(amount)
    WalletTransaction.objects.create(
        user_id=user_id, type=tx_type, amount=amount, reference_id=reference_id,
    )


def _broadcast_market(reservation):
    def _do():
        from .realtime import broadcast_market
        broadcast_market(reservation)
    transaction.on_commit(_do)


def _broadcast_closed(reservation):
    def _do():
        from .realtime import broadcast_closed
        broadcast_closed(reservation)
    transaction.on_commit(_do)


@transaction.atomic
def place_bet(user, reservation, side, amount):
    """Place a bet on `side` ('p1'/'p2') of the game. Debits the stake, freezes the odds."""
    if not is_open(reservation):
        raise BetError("Les paris sont fermés pour cette partie.")
    if not betting_open(reservation):
        raise BetError(
            f"Paris fermés : la partie est trop avancée "
            f"({CUTOFF_TOTAL_SCORE} points marqués)."
        )
    if side not in ('p1', 'p2'):
        raise BetError("Camp invalide (attendu 'p1' ou 'p2').")
    if amount is None or int(amount) <= 0:
        raise BetError("La mise doit être strictement positive.")
    amount = int(amount)

    if _user_side(reservation, user.pk) is not None:
        raise BetError("Vous ne pouvez pas parier sur votre propre partie.")

    if Bet.objects.filter(
        user=user, reservation=reservation, result__isnull=True
    ).exists():
        raise BetError(
            "Vous avez déjà un pari en cours sur cette partie. "
            "Annulez-le d'abord pour en placer un autre."
        )

    market = reservation_market(reservation)
    if side == 'p1':
        odds = market['odds1']
        predicted = reservation.player1_id
    else:
        odds = market['odds2']
        predicted = reservation.player2_id

    bet = Bet.objects.create(
        user=user,
        reservation=reservation,
        amount=amount,
        predicted_winner_id=predicted,
        odds=Decimal(str(odds)),
    )

    try:
        _debit(user.pk, amount, WalletTransaction.Type.BET, bet.id)
    except ValueError as exc:
        raise BetError(str(exc))

    _broadcast_market(reservation)
    return bet


@transaction.atomic
def cancel_bet(user, bet):
    """Cancel an open bet and refund the stake (while betting is still open)."""
    if bet.user_id != user.pk:
        raise BetError("Ce pari ne vous appartient pas.")
    if bet.result is not None:
        raise BetError("Ce pari est déjà résolu et ne peut plus être annulé.")
    if bet.reservation is None or not is_open(bet.reservation):
        raise BetError("Les paris sont fermés : annulation impossible.")
    if is_launched(bet.reservation):
        raise BetError("Le match est lancé : impossible d'annuler le pari.")

    reservation = bet.reservation
    _credit(bet.user_id, bet.amount, WalletTransaction.Type.REFUND, bet.id)
    bet.delete()
    _broadcast_market(reservation)


def _match_players(match):
    return {
        match.player1_id, match.player2_id,
        match.player1_teammate_id, match.player2_teammate_id,
    } - {None}


def _find_reservation_for_match(match):
    """
    Find the reservation matching a match (same players) among those that still
    have open bets. Single table -> no ambiguity.
    """
    players = _match_players(match)
    if not players:
        return None
    candidates = (
        Reservation.objects
        .filter(bets__result__isnull=True)
        .distinct()
        .order_by('-started_at')
    )
    for r in candidates:
        rp = {
            r.player1_id, r.player2_id,
            r.player1_teammate_id, r.player2_teammate_id,
        } - {None}
        if rp == players:
            return r
    return None


def _refund(bet):
    _credit(bet.user_id, bet.amount, WalletTransaction.Type.REFUND, bet.id)
    bet.result = Bet.Result.REFUNDED
    bet.payout = bet.amount
    bet.save(update_fields=['match', 'result', 'payout'])


@transaction.atomic
def resolve_for_match(match):
    """
    Settle the bets of the game matching `match` (validated).
    Winners: credited round(stake * odds). Losers: 0 (already debited).
    Draw (no winner): refunded. Returns the number of bets processed.
    """
    reservation = _find_reservation_for_match(match)
    if reservation is None:
        return 0

    winner_side = match.get_winner()
    bets = list(
        Bet.objects.select_for_update()
        .filter(reservation=reservation, result__isnull=True)
    )
    for bet in bets:
        bet.match_id = match.id
        if winner_side is None:
            _refund(bet)
            continue
        bet_side = _user_side(reservation, bet.predicted_winner_id)
        if bet_side == winner_side:
            payout = int(round(bet.amount * float(bet.odds)))
            _credit(bet.user_id, payout, WalletTransaction.Type.WIN, bet.id)
            bet.result = Bet.Result.WON
            bet.payout = payout
        else:
            bet.result = Bet.Result.LOST
            bet.payout = 0
        bet.save(update_fields=['match', 'result', 'payout'])

        # Betting achievements
        try:
            from achievements.service import check_bet_achievements
            from django.contrib.auth import get_user_model
            fresh_user = get_user_model().objects.get(pk=bet.user_id)
            check_bet_achievements(fresh_user, bet)
        except Exception:
            pass

    _broadcast_closed(reservation)
    return len(bets)


@transaction.atomic
def refund_reservation(reservation):
    """Refund every open bet of a reservation (cancellation)."""
    bets = list(
        Bet.objects.select_for_update()
        .filter(reservation=reservation, result__isnull=True)
    )
    for bet in bets:
        _refund(bet)
    _broadcast_closed(reservation)
    return len(bets)


@transaction.atomic
def refund_for_match(match):
    """Refund the bets of the game whose match was cancelled."""
    reservation = _find_reservation_for_match(match)
    if reservation is None:
        return 0
    return refund_reservation(reservation)


@transaction.atomic
def refund_open_bets_for_user(user_id):
    """Refund every open bet placed by a user.

    Used when an account is deleted/anonymised: their pending stakes are
    returned and marked "refunded" rather than left dangling.
    """
    bets = list(
        Bet.objects.select_for_update()
        .filter(user_id=user_id, result__isnull=True)
    )
    reservations = set()
    for bet in bets:
        if bet.reservation_id:
            reservations.add(bet.reservation)
        _refund(bet)
    for reservation in reservations:
        _broadcast_market(reservation)
    return len(bets)
