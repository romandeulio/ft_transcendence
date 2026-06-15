"""
Logique métier des paris : marché (cotes/pools), pose, annulation, résolution.

Jetons "mint" : la mise est détruite à la pose, le gain est créé à la
résolution (pas de réserve maison). Chaque mouvement est journalisé dans
wallet_transactions (type bet/win/refund, reference_id = id du pari).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum

from matches.models import Match
from .models import Bet, WalletTransaction
from .odds import expected_score, blended_prob, prob_to_odds

User = get_user_model()

# Fenêtre de paris : un match est ouvert tant qu'il est PENDING (hors 2v1/FUN).
# (Le cutoff au score arrivera à l'étape WebSocket.)


class BetError(ValidationError):
    """Erreur métier de pari (mappée en 400 par la vue)."""
    pass


# ---------------------------------------------------------------------------
# Helpers camps / ELO / pools
# ---------------------------------------------------------------------------

def _avg(players, attr):
    vals = [getattr(p, attr) for p in players if p is not None]
    return sum(vals) / len(vals) if vals else 1000


def _side_players(match):
    s1 = {match.player1_id, match.player1_teammate_id} - {None}
    s2 = {match.player2_id, match.player2_teammate_id} - {None}
    return s1, s2


def _user_side(match, user_id):
    s1, s2 = _side_players(match)
    if user_id in s1:
        return 'player1_side'
    if user_id in s2:
        return 'player2_side'
    return None


def _side_elos(match):
    if match.match_type == Match.MatchType.TEAM:
        e1 = _avg([match.player1, match.player1_teammate], 'elo_team')
        e2 = _avg([match.player2, match.player2_teammate], 'elo_team')
    else:  # SOLO
        e1 = _avg([match.player1], 'elo_solo')
        e2 = _avg([match.player2], 'elo_solo')
    return e1, e2


def staked_per_side(match):
    """Total des mises ouvertes sur chaque camp (t1, t2)."""
    s1, s2 = _side_players(match)
    rows = (
        Bet.objects
        .filter(match=match, result__isnull=True)
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


def match_market(match):
    """Proba dynamique du camp 1, cotes des deux camps, mises par camp."""
    e1, e2 = _side_elos(match)
    p_elo = expected_score(e1, e2)
    t1, t2 = staked_per_side(match)
    prob1 = blended_prob(p_elo, t1, t2)
    return {
        'prob1': prob1,
        'odds1': prob_to_odds(prob1),
        'odds2': prob_to_odds(1.0 - prob1),
        'staked1': t1,
        'staked2': t2,
    }


def is_open(match):
    """Un match accepte des paris s'il est PENDING et n'est pas un 2v1."""
    return (
        match.status == Match.Status.PENDING
        and match.match_type != Match.MatchType.TWO_V_ONE
    )


# ---------------------------------------------------------------------------
# Mint / burn + journalisation
# ---------------------------------------------------------------------------

def _credit(user_id, amount, tx_type, reference_id):
    locked = User.objects.select_for_update().get(pk=user_id)
    locked.deposit_tokens(amount)
    WalletTransaction.objects.create(
        user_id=user_id, type=tx_type, amount=amount, reference_id=reference_id,
    )


def _debit(user_id, amount, tx_type, reference_id):
    locked = User.objects.select_for_update().get(pk=user_id)
    locked.withdraw_tokens(amount)  # lève ValueError si solde insuffisant
    WalletTransaction.objects.create(
        user_id=user_id, type=tx_type, amount=amount, reference_id=reference_id,
    )


# ---------------------------------------------------------------------------
# Pose / annulation
# ---------------------------------------------------------------------------

@transaction.atomic
def place_bet(user, match, side, amount):
    """Pose un pari sur `side` ('p1'/'p2') du match. Débite la mise, fige la cote."""
    if not is_open(match):
        raise BetError("Les paris sont fermés pour ce match.")
    if side not in ('p1', 'p2'):
        raise BetError("Camp invalide (attendu 'p1' ou 'p2').")
    if amount is None or int(amount) <= 0:
        raise BetError("La mise doit être strictement positive.")
    amount = int(amount)

    if _user_side(match, user.pk) is not None:
        raise BetError("Vous ne pouvez pas parier sur votre propre match.")

    if Bet.objects.filter(user=user, match=match, result__isnull=True).exists():
        raise BetError(
            "Vous avez déjà un pari en cours sur ce match. "
            "Annulez-le d'abord pour en placer un autre."
        )

    market = match_market(match)
    if side == 'p1':
        odds = market['odds1']
        predicted = match.player1_id
    else:
        odds = market['odds2']
        predicted = match.player2_id

    bet = Bet.objects.create(
        user=user,
        match=match,
        amount=amount,
        predicted_winner_id=predicted,
        odds=Decimal(str(odds)),
    )

    try:
        _debit(user.pk, amount, WalletTransaction.Type.BET, bet.id)
    except ValueError as exc:
        raise BetError(str(exc))  # rollback de la transaction (bet annulé)

    return bet


@transaction.atomic
def cancel_bet(user, bet):
    """Annule un pari ouvert et rembourse la mise (tant que le match est PENDING)."""
    if bet.user_id != user.pk:
        raise BetError("Ce pari ne vous appartient pas.")
    if bet.result is not None:
        raise BetError("Ce pari est déjà résolu et ne peut plus être annulé.")
    if bet.match is None or not is_open(bet.match):
        raise BetError("Les paris sont fermés : annulation impossible.")

    _credit(bet.user_id, bet.amount, WalletTransaction.Type.REFUND, bet.id)
    bet.delete()


# ---------------------------------------------------------------------------
# Résolution / remboursement
# ---------------------------------------------------------------------------

def _refund(bet):
    _credit(bet.user_id, bet.amount, WalletTransaction.Type.REFUND, bet.id)
    bet.result = Bet.Result.REFUNDED
    bet.payout = bet.amount
    bet.save(update_fields=['result', 'payout'])


@transaction.atomic
def resolve_for_match(match):
    """
    Résout les paris du match validé.
    Gagnants : crédités de round(mise * cote). Perdants : 0 (déjà débités).
    Match nul (pas de vainqueur) : remboursé. Retourne le nombre de paris traités.
    """
    winner_side = match.get_winner()  # 'player1_side' | 'player2_side' | None
    bets = list(
        Bet.objects.select_for_update()
        .filter(match=match, result__isnull=True)
    )
    for bet in bets:
        if winner_side is None:  # match nul → remboursement
            _refund(bet)
            continue
        bet_side = _user_side(match, bet.predicted_winner_id)
        if bet_side == winner_side:
            payout = int(round(bet.amount * float(bet.odds)))
            _credit(bet.user_id, payout, WalletTransaction.Type.WIN, bet.id)
            bet.result = Bet.Result.WON
            bet.payout = payout
        else:
            bet.result = Bet.Result.LOST
            bet.payout = 0
        bet.save(update_fields=['result', 'payout'])
    return len(bets)


@transaction.atomic
def refund_for_match(match):
    """Rembourse tous les paris ouverts d'un match (annulation)."""
    bets = list(
        Bet.objects.select_for_update()
        .filter(match=match, result__isnull=True)
    )
    for bet in bets:
        _refund(bet)
    return len(bets)
