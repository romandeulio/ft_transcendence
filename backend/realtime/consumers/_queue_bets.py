"""
Mixin « pont paris » du consumer file d'attente.

Quand une partie démarre/se termine, on crée/ferme la Reservation IN_PROGRESS
correspondante (la fenêtre de paris) et on pousse la cote à jour vers le groupe
WebSocket "bets". Apparié par l'ensemble des joueurs (baby mono-table → pas
d'ambiguïté).

Hérité par QueueConsumer (cf. queue.py).
"""
from channels.db import database_sync_to_async

from realtime import state


class QueueBetsMixin:
    @staticmethod
    def _slot_to_game(slot):
        """Normalise un slot de file en dict 'game' (joueurs + type)."""
        return {
            "player1": slot.get("player1") or slot.get("p1"),
            "player2": slot.get("player2") or slot.get("p2"),
            "player1_teammate": slot.get("player1_teammate"),
            "player2_teammate": slot.get("player2_teammate"),
            "match_type": slot.get("match_type", "SOLO"),
        }

    @staticmethod
    def _game_usernames(game):
        """Ensemble des pseudos (non nuls) d'un dict 'game' en mémoire."""
        return {
            game.get("player1"), game.get("player1_teammate"),
            game.get("player2"), game.get("player2_teammate"),
        } - {None}

    def _slot_involves(self, slot, username):
        """True si `username` participe à ce créneau (owner, adversaire ou
        coéquipier), quel que soit le champ où il est stocké (p1/p2/player*)."""
        return username in self._game_usernames(self._slot_to_game(slot))

    @database_sync_to_async
    def _filter_active_usernames(self, usernames):
        """Sous-ensemble des pseudos correspondant à un compte existant ET actif."""
        from django.contrib.auth import get_user_model

        names = [n for n in usernames if n]
        if not names:
            return set()
        User = get_user_model()
        return set(
            User.objects
            .filter(username__in=names, is_active=True)
            .values_list("username", flat=True)
        )

    async def _close_bets_for_slot(self, slot):
        """Match retiré de la file sans être joué → ferme + rembourse ses paris."""
        g = self._slot_to_game(slot)
        if not g["player1"] or not g["player2"]:
            return
        closed_id = await self._close_reservation_for_game(g, refund=True)
        if closed_id:
            await self.channel_layer.group_send(
                "bets", {"type": "market_closed_msg", "reservation_id": closed_id}
            )

    @database_sync_to_async
    def _ensure_reservation_for_game(self, game):
        """
        Crée la Reservation IN_PROGRESS d'une partie (fenêtre de paris) si elle
        n'existe pas déjà (dédup par joueurs, ex. path « réserver » d'Accueil).
        Pas de réservation pour les 2v1 (non pariables). Retourne l'id ou None.
        """
        from django.contrib.auth import get_user_model
        from planning.models import Reservation

        match_type = game.get("match_type", "SOLO")
        if match_type not in ("SOLO", "TEAM"):
            return None
        if not game.get("player1") or not game.get("player2"):
            return None

        unames = self._game_usernames(game)
        existing = (
            Reservation.objects
            .filter(status=Reservation.Status.IN_PROGRESS)
            .select_related("player1", "player1_teammate", "player2", "player2_teammate")
        )
        for r in existing:
            if state.reservation_usernames(r) == unames:
                return str(r.id)

        User = get_user_model()
        u = lambda name: User.objects.filter(username=name).first() if name else None
        p1, p2 = u(game.get("player1")), u(game.get("player2"))
        if not p1 or not p2:
            return None
        res = Reservation.objects.create(
            match_type=match_type,
            status=Reservation.Status.IN_PROGRESS,
            player1=p1,
            player2=p2,
            player1_teammate=u(game.get("player1_teammate")),
            player2_teammate=u(game.get("player2_teammate")),
        )
        return str(res.id)

    @database_sync_to_async
    def _close_reservation_for_game(self, game, refund=False):
        """
        Ferme (DONE) la Reservation IN_PROGRESS d'une partie terminée, appariée
        par joueurs. Rembourse les paris ouverts si `refund` (partie abandonnée).
        Retourne l'id fermé ou None.
        """
        from django.utils import timezone
        from planning.models import Reservation

        unames = self._game_usernames(game)
        if not unames:
            return None
        candidates = (
            Reservation.objects
            .filter(status=Reservation.Status.IN_PROGRESS)
            .select_related("player1", "player1_teammate", "player2", "player2_teammate")
        )
        for r in candidates:
            if state.reservation_usernames(r) == unames:
                r.status = Reservation.Status.DONE
                r.ended_at = timezone.now()
                r.save(update_fields=["status", "ended_at"])
                if refund:
                    from bets.services import refund_reservation
                    refund_reservation(r)
                return str(r.id)
        return None

    async def _broadcast_bet_market(self, game):
        """Pousse la cote à jour du marché de paris correspondant à cette partie."""
        try:
            payload = await self._bet_market_payload(game)
            if payload:
                await self.channel_layer.group_send(
                    "bets", {"type": "market_update_msg", "market": payload}
                )
        except Exception:
            pass

    @database_sync_to_async
    def _bet_market_payload(self, game):
        """Payload de marché (cotes/pools) de la réservation appariée à `game`."""
        from planning.models import Reservation
        from bets.serializers import market_payload

        usernames = self._game_usernames(game)
        if not usernames:
            return None
        reservations = (
            Reservation.objects
            .filter(status=Reservation.Status.IN_PROGRESS)
            .filter(match_type__in=["SOLO", "TEAM"])
            .select_related(
                "player1", "player1_teammate",
                "player2", "player2_teammate",
            )
        )
        for r in reservations:
            if state.reservation_usernames(r) == usernames:
                return market_payload(r)
        return None
