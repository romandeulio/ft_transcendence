"""
Betting odds computation.

Two distinct notions, not to be confused:
  - the DISPLAYED odds: dynamic, recomputed on demand;
  - a BET's odds: frozen at placement time (snapshot stored in bets.odds),
    this is the value that guarantees the payout.

Step 1: probability derived from ELO, shifted by the stake distribution.
Step 2 (WebSocket): the live score is blended in as well.
"""

ELO_DIVISOR = 400.0
MIN_PROB = 0.01
MAX_PROB = 0.99
ODDS_CAP = 100.0

W_ELO = 0.45
W_POOL = 0.25
W_SCORE = 0.30


def expected_score(elo_a, elo_b):
    """Probability that side A beats side B based on ELO (standard formula)."""
    return 1.0 / (1.0 + 10 ** ((elo_b - elo_a) / ELO_DIVISOR))


def _clamp(p):
    return min(max(p, MIN_PROB), MAX_PROB)


def score_prob(score1, score2):
    """
    Probability that side 1 wins given the current score (Laplace smoothing).
    0-0 -> 0.5; a lead shortens the leading side's odds.
    """
    s1 = max(score1 or 0, 0)
    s2 = max(score2 or 0, 0)
    return _clamp((s1 + 1) / (s1 + s2 + 2))


def blended_prob(p_elo, staked_side1, staked_side2, p_score=None):
    """
    Dynamic probability of side 1 = weighted average of: ELO (baseline), stake
    distribution (market effect), and live score (when known). Weights are
    renormalised over the available components only.
    """
    weights = [W_ELO]
    probs = [p_elo]

    total = (staked_side1 or 0) + (staked_side2 or 0)
    if total > 0:
        weights.append(W_POOL)
        probs.append(staked_side1 / total)

    if p_score is not None:
        weights.append(W_SCORE)
        probs.append(p_score)

    wsum = sum(weights)
    p = sum(w * pr for w, pr in zip(weights, probs)) / wsum
    return _clamp(p)


def prob_to_odds(p):
    """
    Fair odds (no bookmaker margin) from a probability, capped.
    Rounded to 2 decimals to match bets.odds NUMERIC(5,2), always >= 1.00.
    """
    p = _clamp(p)
    return round(min(max(1.0 / p, 1.0), ODDS_CAP), 2)
