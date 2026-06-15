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

# Poids des composantes de la proba dynamique. Renormalisés selon ce qui est
# disponible : sans paris et/ou sans score live, on retombe proprement sur le
# sous-ensemble présent (ELO seul → proba ELO pure).
W_ELO = 0.45
W_POOL = 0.25
W_SCORE = 0.30


def expected_score(elo_a, elo_b):
    """Proba que le camp A batte le camp B selon l'ELO (formule standard)."""
    return 1.0 / (1.0 + 10 ** ((elo_b - elo_a) / ELO_DIVISOR))


def _clamp(p):
    return min(max(p, MIN_PROB), MAX_PROB)


def score_prob(score1, score2):
    """
    Proba que le camp 1 l'emporte vu le score courant (lissage de Laplace).
    0-0 → 0.5 ; l'avance d'un camp raccourcit sa cote.
    """
    s1 = max(score1 or 0, 0)
    s2 = max(score2 or 0, 0)
    return _clamp((s1 + 1) / (s1 + s2 + 2))


def blended_prob(p_elo, staked_side1, staked_side2, p_score=None):
    """
    Proba dynamique du camp 1 = moyenne pondérée de : ELO (baseline), répartition
    des mises (effet marché), et score live (si connu). Les poids sont renormalisés
    sur les seules composantes disponibles.
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
    Cote équitable (sans marge) à partir d'une proba, plafonnée.
    Arrondie à 2 décimales pour coller à bets.odds NUMERIC(5,2), toujours >= 1.00.
    """
    p = _clamp(p)
    return round(min(max(1.0 / p, 1.0), ODDS_CAP), 2)
