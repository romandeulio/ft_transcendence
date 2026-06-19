"""
Calcul ELO — ft_transcendence
==============================

Deux classements indépendants :
  - SOLO (1v1 classé)  → elo_solo sur User
  - TEAM (2v2 classé)  → elo_team sur User (ELO personnel,
						  indépendant du partenaire de la partie)

Formule ELO standard avec facteur K dynamique (plus élevé pour les débutants,
plus conservateur pour les joueurs expérimentés).

Usage :
	from matches.elo import compute_elo_changes
	compute_elo_changes(match, score_p1=10, score_p2=5)
"""

from django.db import transaction
from stats.models import Stats

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def k_factor(elo: int) -> int:
	"""
	Facteur K dynamique :
	  - < 1000  : K=40  (débutants, progressent vite)
	  - < 1500  : K=32  (joueurs intermédiaires)
	  - >= 1500 : K=24  (experts, classement plus stable)
	"""
	if elo < 1000:
		return 40
	if elo < 1500:
		return 32
	return 24


def expected_score(elo_a: int, elo_b: int) -> float:
	"""Probabilité de victoire de A contre B (formule ELO standard)."""
	return 1 / (1 + 10 ** ((elo_b - elo_a) / 400))


def new_elo(elo: int, expected: float, actual: float) -> int:
	"""
	Nouveau ELO après un résultat.
	actual : 1.0 = victoire, 0.0 = défaite (pas d'égalité au babyfoot)
	Plancher à 0 pour éviter un ELO négatif.
	"""
	k = k_factor(elo)
	return max(0, round(elo + k * (actual - expected)))

def get_stats(user):
    stats, _ = Stats.objects.get_or_create(user=user)
    return stats

# ---------------------------------------------------------------------------
# Calculs par type de match
# ---------------------------------------------------------------------------

def _compute_solo(match, score_p1: int, score_p2: int) -> None:
	"""
	Match SOLO classé (1v1).
	Lit elo_solo sur chaque joueur, calcule les nouveaux ELO,
	remplit les champs before/after du match et met à jour les joueurs.
	"""
	p1 = match.player1
	p2 = match.player2

	s1 = get_stats(p1)
	s2 = get_stats(p2)

	elo1 = s1.elo_solo
	elo2 = s2.elo_solo

	exp1 = expected_score(elo1, elo2)
	exp2 = 1.0 - exp1

	actual1 = 1.0 if score_p1 > score_p2 else 0.0
	actual2 = 1.0 - actual1

	new1 = new_elo(elo1, exp1, actual1)
	new2 = new_elo(elo2, exp2, actual2)

	# Champs du match
	match.elo_solo_player1_before = elo1
	match.elo_solo_player1_after  = new1
	match.elo_solo_player2_before = elo2
	match.elo_solo_player2_after  = new2

	# Mise à jour des joueurs
	s1.elo_solo = new1
	s2.elo_solo = new2

	s1.save(update_fields=["elo_solo"])
	s2.save(update_fields=["elo_solo"])


def _compute_team(match, score_p1: int, score_p2: int) -> None:
	"""
	Match TEAM classé (2v2).
	La force de l'équipe = moyenne ELO de ses deux joueurs.
	Chaque joueur reçoit la même variation, calculée avec son K individuel.
	"""
	p1    = match.player1
	p1_tm = match.player1_teammate
	p2    = match.player2
	p2_tm = match.player2_teammate
	sp1 = get_stats(p1)
	sp1tm = get_stats(p1_tm)
	sp2 = get_stats(p2)
	sp2tm = get_stats(p2_tm)
	elo_p1 = sp1.elo_team
	elo_p1_tm = sp1tm.elo_team
	elo_p2 = sp2.elo_team
	elo_p2_tm = sp2tm.elo_team

	team1_avg = (elo_p1 + elo_p1_tm) / 2
	team2_avg = (elo_p2 + elo_p2_tm) / 2

	exp1 = expected_score(team1_avg, team2_avg)
	exp2 = 1.0 - exp1

	actual1 = 1.0 if score_p1 > score_p2 else 0.0
	actual2 = 1.0 - actual1

	new_p1    = new_elo(elo_p1,    exp1, actual1)
	new_p1_tm = new_elo(elo_p1_tm, exp1, actual1)
	new_p2    = new_elo(elo_p2,    exp2, actual2)
	new_p2_tm = new_elo(elo_p2_tm, exp2, actual2)

	# Champs du match
	match.elo_team_p1_before   = elo_p1
	match.elo_team_p1_after    = new_p1
	match.elo_team_p1tm_before = elo_p1_tm
	match.elo_team_p1tm_after  = new_p1_tm
	match.elo_team_p2_before   = elo_p2
	match.elo_team_p2_after    = new_p2
	match.elo_team_p2tm_before = elo_p2_tm
	match.elo_team_p2tm_after  = new_p2_tm

	# Mise à jour des joueurs
	sp1.elo_team = new_p1
	sp1tm.elo_team = new_p1_tm
	sp2.elo_team = new_p2
	sp2tm.elo_team = new_p2_tm

	sp1.save(update_fields=["elo_team"])
	sp1tm.save(update_fields=["elo_team"])
	sp2.save(update_fields=["elo_team"])
	sp2tm.save(update_fields=["elo_team"])


# ---------------------------------------------------------------------------
# Point d'entrée public
# ---------------------------------------------------------------------------

@transaction.atomic
def compute_elo_changes(match, score_p1: int, score_p2: int) -> None:
	"""
	Calcule et applique les changements ELO pour un match validé.

	- Modifie les champs elo_*_before / elo_*_after sur l'objet match
	  (le save() final est fait dans la view, pas ici).
	- Met à jour elo_solo / elo_team directement sur chaque User.
	- Ne fait rien si le match n'est pas classé ou si c'est un TWO_V_ONE.
	"""
	if not match.is_ranked:
		return

	if match.match_type == 'SOLO':
		_compute_solo(match, score_p1, score_p2)
	elif match.match_type == 'TEAM':
		_compute_team(match, score_p1, score_p2)
	# TWO_V_ONE → jamais classé, rien à faire
