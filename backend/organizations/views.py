from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Organization, OrganizationMember
from .serializers import (
	AddMemberSerializer,
	OrganizationCreateSerializer,
	OrganizationMemberSerializer,
	OrganizationSerializer,
	OrganizationUpdateSerializer,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# GET /api/organizations/    POST /api/organizations/
# ---------------------------------------------------------------------------

class OrganizationListCreateView(generics.ListCreateAPIView):
	"""
	GET  — liste tous les groupes avec leurs membres.
	POST — créer un groupe (le owner = utilisateur connecté).
	"""
	permission_classes = [IsAuthenticated]

	def get_serializer_class(self):
		if self.request.method == 'POST':
			return OrganizationCreateSerializer
		return OrganizationSerializer

	def get_queryset(self):
		return Organization.objects.prefetch_related(
			'members__player'
		).select_related('owner')

	def create(self, request, *args, **kwargs):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		org = serializer.save(owner=request.user)

		# L'owner est automatiquement ajouté comme membre OWNER
		OrganizationMember.objects.create(
			organization=org,
			player=request.user,
			role=OrganizationMember.Role.OWNER,
		)

		return Response(
			OrganizationSerializer(org).data,
			status=status.HTTP_201_CREATED,
		)


# ---------------------------------------------------------------------------
# GET /api/organizations/<pk>/
# PATCH /api/organizations/<pk>/
# DELETE /api/organizations/<pk>/
# ---------------------------------------------------------------------------

class OrganizationDetailView(generics.RetrieveUpdateDestroyAPIView):
	"""
	GET    — détail d'un groupe.
	PATCH  — modifier nom / description / avatar (owner uniquement).
	DELETE — supprimer le groupe (owner ou staff uniquement).
	"""
	permission_classes = [IsAuthenticated]
	queryset = Organization.objects.prefetch_related('members__player').select_related('owner')

	def get_serializer_class(self):
		if self.request.method in ('PATCH', 'PUT'):
			return OrganizationUpdateSerializer
		return OrganizationSerializer

	def _check_owner(self, org, user):
		if not user.is_staff and org.owner_id != user.pk:
			return Response(
				{'detail': "Seul le propriétaire du groupe peut effectuer cette action."},
				status=status.HTTP_403_FORBIDDEN,
			)
		return None

	def update(self, request, *args, **kwargs):
		org = self.get_object()
		err = self._check_owner(org, request.user)
		if err:
			return err
		kwargs['partial'] = True  # on force PATCH
		return super().update(request, *args, **kwargs)

	def destroy(self, request, *args, **kwargs):
		org = self.get_object()
		err = self._check_owner(org, request.user)
		if err:
			return err
		org.delete()
		return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# POST /api/organizations/<pk>/members/
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def organization_add_member(request, pk):
	"""
	Ajoute un joueur au groupe.
	Autorisé : owner du groupe ou staff.
	Le joueur ne doit pas déjà appartenir à un groupe.
	"""
	org = get_object_or_404(Organization, pk=pk)

	if not request.user.is_staff and org.owner_id != request.user.pk:
		return Response(
			{'detail': "Seul le propriétaire peut ajouter des membres."},
			status=status.HTTP_403_FORBIDDEN,
		)

	serializer = AddMemberSerializer(data=request.data)
	serializer.is_valid(raise_exception=True)

	player = serializer.validated_data['player']

	member = OrganizationMember.objects.create(
		organization=org,
		player=player,
		role=OrganizationMember.Role.MEMBER,
	)

	return Response(
		OrganizationMemberSerializer(member).data,
		status=status.HTTP_201_CREATED,
	)


# ---------------------------------------------------------------------------
# DELETE /api/organizations/<pk>/members/<player_id>/
# ---------------------------------------------------------------------------

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def organization_remove_member(request, pk, player_id):
	"""
	Retire un membre du groupe.
	Autorisé : owner / staff — ou le joueur lui-même (quitter le groupe).
	L'owner ne peut pas se retirer (il faut supprimer le groupe).
	"""
	org    = get_object_or_404(Organization, pk=pk)
	player = get_object_or_404(User, pk=player_id)
	member = get_object_or_404(OrganizationMember, organization=org, player=player)

	user = request.user
	is_owner_or_staff = user.is_staff or org.owner_id == user.pk
	is_self = user.pk == player_id

	if not is_owner_or_staff and not is_self:
		return Response(
			{'detail': "Vous n'êtes pas autorisé à retirer ce membre."},
			status=status.HTTP_403_FORBIDDEN,
		)

	# L'owner ne peut pas se retirer lui-même
	if player_id == org.owner_id:
		return Response(
			{'detail': "Le propriétaire ne peut pas quitter son propre groupe. Supprimez le groupe si nécessaire."},
			status=status.HTTP_400_BAD_REQUEST,
		)

	member.delete()
	return Response(status=status.HTTP_204_NO_CONTENT)
