from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import timedelta

MATCH_DURATION_MINUTES = 20


class Reservation(models.Model):
	"""
	Créneau actif au baby-foot.
	Quand les joueurs ont fini, un Match séparé est créé avec le score.
	La réservation garde un lien vers ce Match une fois créé.
	"""

	class Status(models.TextChoices):
		IN_PROGRESS = 'IN_PROGRESS', 'En cours'
		DONE        = 'DONE',        'Terminée'
		CANCELLED   = 'CANCELLED',   'Annulée'

	# --- Joueurs (même structure que Match) ---
	player1 = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='reservations_as_player1',
	)
	player1_teammate = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='reservations_as_player1_teammate',
	)
	player2 = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='reservations_as_player2',
	)
	player2_teammate = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='reservations_as_player2_teammate',
	)

	# --- Config du match à venir ---
	match_type = models.CharField(
		max_length=10,
		choices=[
			('SOLO',      '1v1'),
			('TEAM',      '2v2'),
			('TWO_V_ONE', '2v1'),
		],
		default='SOLO',
	)
	is_ranked = models.BooleanField(
		default=True,
		help_text="Si False : match libre, aucun impact ELO.",
	)

	# Lien vers le Match créé après la partie (nullable tant que le score n'est pas saisi)
	match = models.OneToOneField(
		'matches.Match',
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='reservation',
	)

	status    = models.CharField(
		max_length=15,
		choices=Status.choices,
		default=Status.IN_PROGRESS,
	)
	started_at = models.DateTimeField(default=timezone.now)
	ended_at   = models.DateTimeField(null=True, blank=True)

	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		db_table = 'reservations'
		ordering = ['-started_at']

	def __str__(self):
		return (
			f"Réservation {self.pk} — {self.get_match_type_display()} "
			f"({'classé' if self.is_ranked else 'libre'}) — {self.get_status_display()}"
		)

	@property
	def expected_end(self):
		"""Heure de fin théorique : départ + 20 min."""
		return self.started_at + timedelta(minutes=MATCH_DURATION_MINUTES)

	@property
	def is_overtime(self):
		"""True si le créneau de 20 min est dépassé et que c'est toujours IN_PROGRESS."""
		return (
			self.status == self.Status.IN_PROGRESS
			and timezone.now() > self.expected_end
		)

	def clean(self):
		# TWO_V_ONE est toujours non classé
		if self.match_type == 'TWO_V_ONE' and self.is_ranked:
			raise ValidationError("Un match 2v1 ne peut pas être classé.")

		# Vérifie qu'il n'y a pas déjà une réservation IN_PROGRESS
		active = Reservation.objects.filter(
			status=self.Status.IN_PROGRESS
		).exclude(pk=self.pk)
		if self.status == self.Status.IN_PROGRESS and active.exists():
			raise ValidationError(
				"Le baby-foot est déjà occupé. Rejoins la file d'attente."
			)

		# Un joueur ne peut pas être dans deux camps
		players = [
			self.player1_id, self.player2_id,
			self.player1_teammate_id, self.player2_teammate_id,
		]
		players = [p for p in players if p is not None]
		if len(players) != len(set(players)):
			raise ValidationError("Un même joueur ne peut pas apparaître deux fois.")


class QueueEntry(models.Model):
	"""
	File d'attente quand le baby est occupé.
	Ordre déterminé par joined_at (premier arrivé, premier servi).
	Quand c'est leur tour, l'entrée est marquée CALLED puis une Reservation est créée.
	"""

	class Status(models.TextChoices):
		WAITING   = 'WAITING',   'En attente'
		CALLED    = 'CALLED',    'Appelé — à vous de jouer !'
		DONE      = 'DONE',      'Passé en réservation'
		CANCELLED = 'CANCELLED', 'Annulé'

	# --- Joueurs ---
	player1 = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='queue_entries_as_player1',
	)
	player1_teammate = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='queue_entries_as_player1_teammate',
	)
	player2 = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='queue_entries_as_player2',
	)
	player2_teammate = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		null=True, blank=True,
		on_delete=models.SET_NULL,
		related_name='queue_entries_as_player2_teammate',
	)

	# --- Config du match à venir ---
	match_type = models.CharField(
		max_length=10,
		choices=[
			('SOLO',      '1v1'),
			('TEAM',      '2v2'),
			('TWO_V_ONE', '2v1'),
		],
		default='SOLO',
	)
	is_ranked = models.BooleanField(default=True)

	status    = models.CharField(
		max_length=15,
		choices=Status.choices,
		default=Status.WAITING,
	)
	joined_at = models.DateTimeField(default=timezone.now)

	class Meta:
		db_table = 'queue'
		ordering = ['joined_at']  # premier arrivé = premier dans la file

	def __str__(self):
		return (
			f"File #{self.queue_position} — {self.get_match_type_display()} "
			f"({'classé' if self.is_ranked else 'libre'}) — {self.get_status_display()}"
		)

	@property
	def queue_position(self):
		"""Position dans la file parmi les entrées WAITING, calculée dynamiquement."""
		return (
			QueueEntry.objects.filter(
				status=self.Status.WAITING,
				joined_at__lte=self.joined_at,
			).count()
		)

	@property
	def estimated_wait(self):
		"""Estimation du temps d'attente en minutes (position × 20 min)."""
		pos = self.queue_position
		if pos <= 1:
			return MATCH_DURATION_MINUTES
		return (pos - 1) * MATCH_DURATION_MINUTES

	def clean(self):
		# TWO_V_ONE est toujours non classé
		if self.match_type == 'TWO_V_ONE' and self.is_ranked:
			raise ValidationError("Un match 2v1 ne peut pas être classé.")

		# Un joueur ne peut pas être dans deux camps
		players = [
			self.player1_id, self.player2_id,
			self.player1_teammate_id, self.player2_teammate_id,
		]
		players = [p for p in players if p is not None]
		if len(players) != len(set(players)):
			raise ValidationError("Un même joueur ne peut pas apparaître deux fois.")

		# Un joueur ne peut pas être dans la file plusieurs fois simultanément
		if self.player1_id:
			already = QueueEntry.objects.filter(
				status=self.Status.WAITING,
				player1=self.player1,
			).exclude(pk=self.pk)
			if already.exists():
				raise ValidationError(
					f"{self.player1} est déjà dans la file d'attente."
				)
