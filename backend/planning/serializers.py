from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Reservation, QueueEntry, MATCH_DURATION_MINUTES

User = get_user_model()


class ReservationSerializer(serializers.ModelSerializer):
	"""
	Lecture d'une réservation active.
	Utilisé pour GET /api/planning/reservation/current/ et l'affichage temps réel.
	"""

	player1          = serializers.StringRelatedField(read_only=True)
	player1_teammate = serializers.StringRelatedField(read_only=True)
	player2          = serializers.StringRelatedField(read_only=True)
	player2_teammate = serializers.StringRelatedField(read_only=True)

	expected_end = serializers.DateTimeField(read_only=True)
	is_overtime  = serializers.BooleanField(read_only=True)
	match_id     = serializers.PrimaryKeyRelatedField(source='match', read_only=True)

	class Meta:
		model  = Reservation
		fields = [
			'id',
			'match_type',
			'is_ranked',
			'status',
			'player1', 'player1_teammate',
			'player2', 'player2_teammate',
			'started_at',
			'ended_at',
			'expected_end',
			'is_overtime',
			'match_id',
		]
		read_only_fields = fields


class ReservationCreateSerializer(serializers.ModelSerializer):
	"""
	Création d'une réservation (POST /api/planning/reservation/).
	Déclenché quand le baby est libre.
	Le status démarre toujours à IN_PROGRESS, géré par la view.
	"""

	player1_id          = serializers.PrimaryKeyRelatedField(
		source='player1', queryset=User.objects.all(), required=True,
	)
	player2_id          = serializers.PrimaryKeyRelatedField(
		source='player2', queryset=User.objects.all(), required=True,
	)
	player1_teammate_id = serializers.PrimaryKeyRelatedField(
		source='player1_teammate', queryset=User.objects.all(),
		required=False, allow_null=True,
	)
	player2_teammate_id = serializers.PrimaryKeyRelatedField(
		source='player2_teammate', queryset=User.objects.all(),
		required=False, allow_null=True,
	)

	class Meta:
		model  = Reservation
		fields = [
			'match_type', 'is_ranked',
			'player1_id', 'player1_teammate_id',
			'player2_id', 'player2_teammate_id',
		]

	def validate(self, data):
		match_type = data.get('match_type', 'SOLO')
		is_ranked  = data.get('is_ranked', True)
		p1         = data.get('player1')
		p2         = data.get('player2')
		p1_tm      = data.get('player1_teammate')
		p2_tm      = data.get('player2_teammate')

		if match_type == 'TWO_V_ONE' and is_ranked:
			raise serializers.ValidationError("Un match 2v1 ne peut pas être classé.")

		if match_type in ('TEAM', 'TWO_V_ONE') and not p1_tm:
			raise serializers.ValidationError(
				"player1_teammate_id est requis pour TEAM et TWO_V_ONE."
			)
		if match_type == 'TEAM' and not p2_tm:
			raise serializers.ValidationError(
				"player2_teammate_id est requis pour TEAM."
			)

		# Pas de doublon
		players = [p for p in [p1, p1_tm, p2, p2_tm] if p is not None]
		if len(players) != len(set(p.pk for p in players)):
			raise serializers.ValidationError(
				"Un même joueur ne peut pas apparaître deux fois."
			)

		# Baby déjà occupé ?
		if Reservation.objects.filter(status=Reservation.Status.IN_PROGRESS).exists():
			raise serializers.ValidationError(
				"Le baby-foot est déjà occupé. Rejoins la file d'attente."
			)

		return data


class QueueEntrySerializer(serializers.ModelSerializer):
	"""
	Lecture d'une entrée dans la file d'attente.
	Utilisé pour GET /api/planning/queue/ — visible par tous en temps réel.
	"""

	player1          = serializers.StringRelatedField(read_only=True)
	player1_teammate = serializers.StringRelatedField(read_only=True)
	player2          = serializers.StringRelatedField(read_only=True)
	player2_teammate = serializers.StringRelatedField(read_only=True)

	queue_position = serializers.IntegerField(read_only=True)
	estimated_wait = serializers.IntegerField(read_only=True)  # en minutes

	class Meta:
		model  = QueueEntry
		fields = [
			'id',
			'match_type',
			'is_ranked',
			'status',
			'player1', 'player1_teammate',
			'player2', 'player2_teammate',
			'queue_position',
			'estimated_wait',
			'joined_at',
		]
		read_only_fields = fields


class QueueEntryCreateSerializer(serializers.ModelSerializer):
	"""
	Rejoindre la file d'attente (POST /api/planning/queue/).
	Déclenché quand le baby est occupé.
	"""

	player1_id          = serializers.PrimaryKeyRelatedField(
		source='player1', queryset=User.objects.all(), required=True,
	)
	player2_id          = serializers.PrimaryKeyRelatedField(
		source='player2', queryset=User.objects.all(), required=True,
	)
	player1_teammate_id = serializers.PrimaryKeyRelatedField(
		source='player1_teammate', queryset=User.objects.all(),
		required=False, allow_null=True,
	)
	player2_teammate_id = serializers.PrimaryKeyRelatedField(
		source='player2_teammate', queryset=User.objects.all(),
		required=False, allow_null=True,
	)

	class Meta:
		model  = QueueEntry
		fields = [
			'match_type', 'is_ranked',
			'player1_id', 'player1_teammate_id',
			'player2_id', 'player2_teammate_id',
		]

	def validate(self, data):
		match_type = data.get('match_type', 'SOLO')
		is_ranked  = data.get('is_ranked', True)
		p1         = data.get('player1')
		p2         = data.get('player2')
		p1_tm      = data.get('player1_teammate')
		p2_tm      = data.get('player2_teammate')

		if match_type == 'TWO_V_ONE' and is_ranked:
			raise serializers.ValidationError("Un match 2v1 ne peut pas être classé.")

		if match_type in ('TEAM', 'TWO_V_ONE') and not p1_tm:
			raise serializers.ValidationError(
				"player1_teammate_id est requis pour TEAM et TWO_V_ONE."
			)
		if match_type == 'TEAM' and not p2_tm:
			raise serializers.ValidationError(
				"player2_teammate_id est requis pour TEAM."
			)

		# Pas de doublon
		players = [p for p in [p1, p1_tm, p2, p2_tm] if p is not None]
		if len(players) != len(set(p.pk for p in players)):
			raise serializers.ValidationError(
				"Un même joueur ne peut pas apparaître deux fois."
			)

		# Vérifie que player1 n'est pas déjà dans la file
		if p1 and QueueEntry.objects.filter(
			status=QueueEntry.Status.WAITING, player1=p1
		).exists():
			raise serializers.ValidationError(
				f"{p1} est déjà dans la file d'attente."
			)

		return data
