"""
Système de rangs ELO pour ft_transcendence.

Les rangs sont basés sur l'ELO saisonnier du joueur.
ELO de départ : 1000 (Argent, milieu de la plage 900-1099).

Utilisation :
    from seasons.ranks import get_rank, RANKS

    rank = get_rank(1350)
    rank.name          # 'Platine'
    rank.label         # 'Platine'
    rank.min_elo       # 1300
    rank.max_elo       # 1499   (None si pas de plafond)
    rank.color         # '#00bfff'
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Rank:
    name: str       # identifiant interne
    label: str      # nom affiché
    min_elo: int
    max_elo: int | None  # None = pas de plafond (rang max)
    color: str      # couleur hex pour le front


# Ordre croissant — NE PAS changer l'ordre, get_rank() en dépend
RANKS: list[Rank] = [
    Rank(name='FER',      label='Fer',      min_elo=0,    max_elo=699,  color='#8d9094'),
    Rank(name='BRONZE',   label='Bronze',   min_elo=700,  max_elo=899,  color='#cd7f32'),
    Rank(name='ARGENT',   label='Argent',   min_elo=900,  max_elo=1099, color='#c0c0c0'),
    Rank(name='OR',       label='Or',       min_elo=1100, max_elo=1299, color='#ffd700'),
    Rank(name='PLATINE',  label='Platine',  min_elo=1300, max_elo=1499, color='#00bfff'),
    Rank(name='DIAMANT',  label='Diamant',  min_elo=1500, max_elo=1799, color='#b9f2ff'),
    Rank(name='MAITRE',   label='Maître',   min_elo=1800, max_elo=1999, color='#9b59b6'),
    Rank(name='CHAMPION', label='Champion', min_elo=2000, max_elo=None, color='#e74c3c'),
]

# Accès rapide par nom
RANKS_BY_NAME: dict[str, Rank] = {r.name: r for r in RANKS}


def get_rank(elo: int) -> Rank:
    """
    Retourne le rang correspondant à un ELO donné.
    Toujours un résultat : en dessous de 0 → Fer, au-dessus de 2000 → Champion.
    """
    for rank in reversed(RANKS):
        if elo >= rank.min_elo:
            return rank
    return RANKS[0]  # fallback : Fer


def get_rank_progress(elo: int) -> dict:
    """
    Retourne le rang actuel + la progression vers le rang suivant.

    Exemple de retour :
    {
        'current': Rank(name='OR', ...),
        'next': Rank(name='PLATINE', ...),
        'progress_pct': 64,   # % d'avancement dans la plage actuelle
        'elo_needed': 72,     # ELO manquants pour monter
    }
    """
    current = get_rank(elo)
    current_index = RANKS.index(current)

    if current_index == len(RANKS) - 1:
        # Rang max atteint
        return {
            'current': current,
            'next': None,
            'progress_pct': 100,
            'elo_needed': 0,
        }

    next_rank = RANKS[current_index + 1]
    range_size = next_rank.min_elo - current.min_elo
    progress = elo - current.min_elo
    progress_pct = round((progress / range_size) * 100)
    elo_needed = next_rank.min_elo - elo

    return {
        'current': current,
        'next': next_rank,
        'progress_pct': progress_pct,
        'elo_needed': elo_needed,
    }
