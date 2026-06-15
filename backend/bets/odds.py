"""
Calcul des cotes de paris.

Deux notions distinctes, à ne pas confondre :
  - la cote AFFICHÉE : dynamique, recalculée à la demande ;
  - la cote d'un PARI : figée au moment de la pose (snapshot écrit dans
    bets.odds), c'est elle qui garantit le gain.

Étape 1 : proba dérivée de l'ELO, décalée par la répartition des mises.
Étape 2 (WebSocket) : on blendera aussi le score live.
"""

ELO_DIVISOR = 400.0
MIN_PROB = 0.01
MAX_PROB = 0.99
ODDS_CAP = 100.0

# Poids de la répartition des paris dans la proba dynamique (0 = ELO pur).
W_POOL = 0.30
W_ELO = 1.0 - W_POOL


def expected_score(elo_a, elo_b):
    """Proba que le camp A batte le camp B selon l'ELO (formule standard)."""
    return 1.0 / (1.0 + 10 ** ((elo_b - elo_a) / ELO_DIVISOR))


def _clamp(p):
    return min(max(p, MIN_PROB), MAX_PROB)


def blended_prob(p_elo, staked_side1, staked_side2):
    """
    Proba dynamique du camp 1 : baseline ELO décalée par l'argent misé.
    Le camp le plus chargé voit sa proba monter → sa cote baisse (effet marché).
    Si aucun pari n'est encore posé, on retombe sur l'ELO pur.
    """
    total = (staked_side1 or 0) + (staked_side2 or 0)
    if total <= 0:
        return _clamp(p_elo)
    share1 = staked_side1 / total
    return _clamp(W_ELO * p_elo + W_POOL * share1)


def prob_to_odds(p):
    """
    Cote équitable (sans marge) à partir d'une proba, plafonnée.
    Arrondie à 2 décimales pour coller à bets.odds NUMERIC(5,2), toujours >= 1.00.
    """
    p = _clamp(p)
    return round(min(max(1.0 / p, 1.0), ODDS_CAP), 2)
