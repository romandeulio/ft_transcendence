from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Organization, OrganizationMember

User = get_user_model()


class OrganizationMemberSerializer(serializers.ModelSerializer):
	"""
	Lecture d'un membre dans le contexte d'un groupe.
	"""

	player = serializers.StringRelatedField(read_only=True)
	role   = serializers.CharField(source='get_role_display', read_only=True)

	class Meta:
		model  = OrganizationMember
		fields = ['id', 'player', 'role', 'joined_at']
		read_only_fields = fields


class OrganizationSerializer(serializers.ModelSerializer):
	"""
	Lecture d'un groupe avec ses membres.
	Utilisé pour GET /api/organizations/ et GET /api/organizations/<id>/.
	"""

	owner        = serializers.StringRelatedField(read_only=True)
	members      = OrganizationMemberSerializer(many=True, read_only=True)
	member_count = serializers.IntegerField(read_only=True)

	class Meta:
		model  = Organization
		fields = [
			'id',
			'name',
			'description',
			'avatar',
			'owner',
			'member_count',
			'members',
			'created_at',
			'updated_at',
		]
		read_only_fields = ['id', 'owner', 'created_at', 'updated_at']


class OrganizationCreateSerializer(serializers.ModelSerializer):
	"""
	Création d'un groupe (POST /api/organizations/).
	Le owner est automatiquement l'utilisateur connecté (géré dans la view).
	"""

	class Meta:
		model  = Organization
		fields = ['name', 'description', 'avatar']

	def validate_name(self, value):
		if Organization.objects.filter(name__iexact=value).exists():
			raise serializers.ValidationError(
				"Un groupe avec ce nom existe déjà."
			)
		return value


class OrganizationUpdateSerializer(serializers.ModelSerializer):
	"""
	Modification d'un groupe (PATCH /api/organizations/<id>/).
	Seuls le nom, la description et l'avatar sont modifiables.
	Le owner ne peut pas être changé via l'API.
	"""

	class Meta:
		model  = Organization
		fields = ['name', 'description', 'avatar']


class AddMemberSerializer(serializers.Serializer):
	"""
	Ajout d'un membre à un groupe (POST /api/organizations/<id>/members/).
	Le front envoie juste l'ID du joueur à ajouter.
	"""

	player_id = serializers.PrimaryKeyRelatedField(
		queryset=User.objects.all(),
		source='player',
	)

	def validate_player_id(self, value):
		# Vérifie que le joueur n'est pas déjà dans un groupe
		existing = OrganizationMember.objects.filter(player=value).first()
		if existing:
			raise serializers.ValidationError(
				f"{value} appartient déjà au groupe '{existing.organization.name}'."
			)
		return value
