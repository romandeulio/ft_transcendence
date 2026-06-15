import logging

from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import QueueEntry, Reservation
from .serializers import (
	QueueEntryCreateSerializer,
	QueueEntrySerializer,
	ReservationCreateSerializer,
	ReservationSerializer,
)

logger = logging.getLogger(__name__)


# ===========================================================================
# RÉSERVATION
# ===========================================================================

# ---------------------------------------------------------------------------
# GET /api/planning/reservation/current/
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reservation_current(request):
	"""
	Retourne la réservation IN_PROGRESS, ou 404 si le baby est libre.
	Endpoint typiquement affiché en temps réel par Roman via WebSocket ;
	cette vue sert de fallback REST.
	"""
	reservation = Reservation.objects.filter(
		status=Reservation.Status.IN_PROGRESS
	).select_related(
		'player1', 'player1_teammate',
		'player2', 'player2_teammate',
		'match',
	).first()

	if reservation is None:
		return Response(
			{'detail': "Le baby-foot est libre."},
			status=status.HTTP_404_NOT_FOUND,
		)

	return Response(ReservationSerializer(reservation).data)


# ---------------------------------------------------------------------------
# POST /api/planning/reservation/
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reservation_create(request):
	"""
	Crée une réservation si le baby est libre.
	Si le baby est occupé, le front doit rediriger vers la file d'attente.
	"""
	serializer = ReservationCreateSerializer(data=request.data)
	serializer.is_valid(raise_exception=True)
	reservation = serializer.save(status=Reservation.Status.IN_PROGRESS)

	# Nouvelle partie pariable → la diffuser aux clients qui regardent les paris.
	try:
		from bets.realtime import broadcast_market
		broadcast_market(reservation)
	except Exception:
		logger.exception("Échec de la diffusion du marché pour la réservation %s", reservation.id)

	return Response(
		ReservationSerializer(reservation).data,
		status=status.HTTP_201_CREATED,
	)


# ---------------------------------------------------------------------------
# PATCH /api/planning/reservation/<pk>/close/
# ---------------------------------------------------------------------------

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def reservation_close(request, pk):
	"""
	Termine une réservation IN_PROGRESS → DONE.
	Le score est ensuite saisi via POST /api/matches/ (flux normal).
	Après clôture, si la file d'attente a des entrées WAITING,
	la première est passée à CALLED pour notifier les prochains joueurs.
	"""
	reservation = get_object_or_404(Reservation, pk=pk)

	if reservation.status != Reservation.Status.IN_PROGRESS:
		return Response(
			{'detail': "Seule une réservation IN_PROGRESS peut être clôturée."},
			status=status.HTTP_400_BAD_REQUEST,
		)

	reservation.status   = Reservation.Status.DONE
	reservation.ended_at = timezone.now()
	reservation.save(update_fields=['status', 'ended_at'])

	# Partie terminée → fermer les paris (les paris ouverts seront résolus à la
	# validation du match correspondant).
	try:
		from bets.realtime import broadcast_closed
		broadcast_closed(reservation)
	except Exception:
		logger.exception("Échec de la diffusion de fermeture pour la réservation %s", reservation.id)

	# Appeler le premier de la file d'attente
	_call_next_in_queue()

	return Response(ReservationSerializer(reservation).data)


# ---------------------------------------------------------------------------
# PATCH /api/planning/reservation/<pk>/cancel/
# ---------------------------------------------------------------------------

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def reservation_cancel(request, pk):
	"""
	Annule une réservation IN_PROGRESS → CANCELLED.
	Autorisé : staff ou l'un des joueurs de la réservation.
	Libère le baby et appelle le prochain dans la file.
	"""
	reservation = get_object_or_404(Reservation, pk=pk)

	if reservation.status != Reservation.Status.IN_PROGRESS:
		return Response(
			{'detail': "Seule une réservation IN_PROGRESS peut être annulée."},
			status=status.HTTP_400_BAD_REQUEST,
		)

	user = request.user
	involved = {
		reservation.player1_id,
		reservation.player2_id,
		reservation.player1_teammate_id,
		reservation.player2_teammate_id,
	}
	if not user.is_staff and user.pk not in involved:
		return Response(
			{'detail': "Vous n'êtes pas autorisé à annuler cette réservation."},
			status=status.HTTP_403_FORBIDDEN,
		)

	reservation.status   = Reservation.Status.CANCELLED
	reservation.ended_at = timezone.now()
	reservation.save(update_fields=['status', 'ended_at'])

	# Partie annulée → remboursement des paris en cours.
	try:
		from bets.services import refund_reservation
		refund_reservation(reservation)
	except Exception:
		logger.exception("Échec du remboursement des paris pour la réservation %s", reservation.id)

	_call_next_in_queue()

	return Response(ReservationSerializer(reservation).data)


# ===========================================================================
# FILE D'ATTENTE
# ===========================================================================

# ---------------------------------------------------------------------------
# GET /api/planning/queue/
# ---------------------------------------------------------------------------

class QueueListView(generics.ListAPIView):
	"""
	Liste les entrées WAITING dans la file, triées par joined_at (FIFO).
	Visible par tous les utilisateurs authentifiés.
	"""
	serializer_class   = QueueEntrySerializer
	permission_classes = [IsAuthenticated]

	def get_queryset(self):
		return QueueEntry.objects.filter(
			status=QueueEntry.Status.WAITING
		).select_related(
			'player1', 'player1_teammate',
			'player2', 'player2_teammate',
		)


# ---------------------------------------------------------------------------
# POST /api/planning/queue/
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def queue_join(request):
	"""
	Rejoindre la file d'attente.
	Typiquement appelé quand le baby est occupé (Reservation IN_PROGRESS existe).
	"""
	serializer = QueueEntryCreateSerializer(data=request.data)
	serializer.is_valid(raise_exception=True)
	entry = serializer.save(status=QueueEntry.Status.WAITING)
	return Response(
		QueueEntrySerializer(entry).data,
		status=status.HTTP_201_CREATED,
	)


# ---------------------------------------------------------------------------
# DELETE /api/planning/queue/<pk>/
# ---------------------------------------------------------------------------

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def queue_leave(request, pk):
	"""
	Quitter la file d'attente (passe l'entrée à CANCELLED).
	Autorisé : staff ou player1 de l'entrée.
	"""
	entry = get_object_or_404(QueueEntry, pk=pk)

	if entry.status not in (QueueEntry.Status.WAITING, QueueEntry.Status.CALLED):
		return Response(
			{'detail': "Impossible de quitter : l'entrée n'est plus active."},
			status=status.HTTP_400_BAD_REQUEST,
		)

	user = request.user
	involved = {
		entry.player1_id,
		entry.player2_id,
		entry.player1_teammate_id,
		entry.player2_teammate_id,
	}
	if not user.is_staff and user.pk not in involved:
		return Response(
			{'detail': "Vous ne pouvez pas retirer quelqu'un d'autre de la file."},
			status=status.HTTP_403_FORBIDDEN,
		)

	entry.status = QueueEntry.Status.CANCELLED
	entry.save(update_fields=['status'])

	return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# PATCH /api/planning/queue/<pk>/promote/
# ---------------------------------------------------------------------------

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def queue_promote(request, pk):
	"""
	Passe une entrée WAITING → CALLED manuellement (staff uniquement).
	Utile si la notification automatique n'a pas fonctionné.
	"""
	if not request.user.is_staff:
		return Response(
			{'detail': "Seul un admin peut promouvoir une entrée manuellement."},
			status=status.HTTP_403_FORBIDDEN,
		)

	entry = get_object_or_404(QueueEntry, pk=pk)

	if entry.status != QueueEntry.Status.WAITING:
		return Response(
			{'detail': "Seule une entrée WAITING peut être promue."},
			status=status.HTTP_400_BAD_REQUEST,
		)

	entry.status = QueueEntry.Status.CALLED
	entry.save(update_fields=['status'])

	return Response(QueueEntrySerializer(entry).data)


# ===========================================================================
# Helpers internes
# ===========================================================================

def _call_next_in_queue() -> None:
	"""
	Passe la première entrée WAITING de la file à CALLED.
	Appelé automatiquement quand une réservation se termine ou est annulée.
	Roman peut brancher une notification WebSocket sur ce changement de statut.
	"""
	next_entry = QueueEntry.objects.filter(
		status=QueueEntry.Status.WAITING
	).order_by('joined_at').first()

	if next_entry:
		next_entry.status = QueueEntry.Status.CALLED
		next_entry.save(update_fields=['status'])
