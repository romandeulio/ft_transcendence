import uuid
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError


class Match(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

	class Status(models.TextChoices):
		PENDING   = 'PENDING',   'En attente de validation'
		VALIDATED = 'VALIDATED', 'Validé'
		CANCELLED = 'CANCELLED', 'Annulé'

	class MatchType(models.TextChoices):
		SOLO      = 'SOLO',      '1v1 — individuel'
		TEAM      = 'TEAM',      '2v2 — équipes ad-hoc'
		TWO_V_ONE = 'FUN',		'2v1 — match libre uniquement'

	match_type = models.CharField(
		max_length=10,
		choices=MatchType.choices,
		default=MatchType.SOLO,
	)
	status = models.CharField(
		max_length=10,
		choices=Status.choices,
		default=Status.PENDING,
	)

	# Si False : match libre, aucun impact sur l'ELO ni le classement saisonnier.
	# Applicable à tous les formats (1v1, 2v2, 2v1).
	# Un TWO_V_ONE est TOUJOURS is_ranked=False.
	is_ranked = models.BooleanField(default=True)

	# --- Joueurs ---
	# Côté 1
	player1 = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='matches_as_player1',
	)
	player1_teammate = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='matches_as_player1_teammate',
		help_text="Coéquipier de player1. Renseigné pour TEAM et TWO_V_ONE.",
	)
	# Côté 2
	player2 = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='matches_as_player2',
	)
	player2_teammate = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='matches_as_player2_teammate',
		help_text="Coéquipier de player2. Renseigné uniquement pour TEAM.",
	)

	# --- Scores ---
	score_player1 = models.IntegerField(default=0)
	score_player2 = models.IntegerField(default=0)

	# --- Gamelles (buts marqués via le gardien adverse) ---
	gamelles_player1 = models.IntegerField(default=0)
	gamelles_player2 = models.IntegerField(default=0)

	demis_player1 = models.IntegerField(default=0)
	demis_player2 = models.IntegerField(default=0)
	# --- ELO solo (1v1 classé uniquement) ---
	elo_solo_player1_before = models.IntegerField(default=1000, db_column='elo_solo_p1_before')
	elo_solo_player1_after  = models.IntegerField(default=1000, db_column='elo_solo_p1_after')
	elo_solo_player2_before = models.IntegerField(default=1000, db_column='elo_solo_p2_before')
	elo_solo_player2_after  = models.IntegerField(default=1000, db_column='elo_solo_p2_after')

	# --- ELO 2v2 personnel (TEAM classé uniquement) ---
	# Chaque joueur possède son propre ELO 2v2, indépendant de son partenaire
	elo_team_p1_before          = models.IntegerField(default=1000)
	elo_team_p1_after           = models.IntegerField(default=1000)
	elo_team_p1tm_before 		= models.IntegerField(default=1000)
	elo_team_p1tm_after  		= models.IntegerField(default=1000)
	elo_team_p2_before          = models.IntegerField(default=1000)
	elo_team_p2_after           = models.IntegerField(default=1000)
	elo_team_p2tm_before 		= models.IntegerField(default=1000)
	elo_team_p2tm_after  		= models.IntegerField(default=1000)

	season = models.ForeignKey(
		'seasons.Season',
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='matches',
	)

	played_at  = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		managed  = False
		db_table = 'matches'
		ordering = ['-played_at']

	def clean(self):
		# TWO_V_ONE est toujours non classé
		if self.match_type == self.MatchType.TWO_V_ONE and self.is_ranked:
			raise ValidationError(
				"Un match 2v1 ne peut pas être classé (is_ranked doit être False)."
			)

		# player1_teammate requis pour TEAM et TWO_V_ONE
		if self.match_type in (self.MatchType.TEAM, self.MatchType.TWO_V_ONE):
			if not self.player1_teammate_id:
				raise ValidationError(
					"player1_teammate est requis pour un match TEAM ou TWO_V_ONE."
				)

		# player2_teammate requis uniquement pour TEAM
		if self.match_type == self.MatchType.TEAM:
			if not self.player2_teammate_id:
				raise ValidationError(
					"player2_teammate est requis pour un match TEAM."
				)

		# player2_teammate interdit hors TEAM
		if self.match_type != self.MatchType.TEAM and self.player2_teammate_id:
			raise ValidationError(
				"player2_teammate ne peut être renseigné que pour un match TEAM."
			)

		# player1_teammate interdit en SOLO
		if self.match_type == self.MatchType.SOLO and self.player1_teammate_id:
			raise ValidationError(
				"player1_teammate ne peut pas être renseigné pour un match SOLO."
			)

		# Un joueur ne peut pas être dans les deux camps
		players = [self.player1_id, self.player2_id]
		if self.player1_teammate_id:
			players.append(self.player1_teammate_id)
		if self.player2_teammate_id:
			players.append(self.player2_teammate_id)
		players = [p for p in players if p is not None]
		if len(players) != len(set(players)):
			raise ValidationError(
				"Un même joueur ne peut pas apparaître deux fois dans le même match."
			)

	def __str__(self):
		if self.match_type == self.MatchType.SOLO:
			ranked = '' if self.is_ranked else ' [libre]'
			return (
				f"{self.player1} vs {self.player2} "
				f"({self.score_player1}-{self.score_player2}){ranked}"
			)
		if self.match_type == self.MatchType.TEAM:
			ranked = '' if self.is_ranked else ' [libre]'
			return (
				f"{self.player1} & {self.player1_teammate} vs "
				f"{self.player2} & {self.player2_teammate} "
				f"({self.score_player1}-{self.score_player2}){ranked}"
			)
		# TWO_V_ONE
		return (
			f"{self.player1} & {self.player1_teammate} vs {self.player2} "
			f"({self.score_player1}-{self.score_player2}) [libre]"
		)

	def get_winner(self):
		if self.status != self.Status.VALIDATED:
			return None
		if self.score_player1 > self.score_player2:
			return 'player1_side'
		if self.score_player2 > self.score_player1:
			return 'player2_side'
		return None  # égalité
