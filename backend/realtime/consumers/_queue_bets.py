"""
"Betting bridge" mixin of the queue consumer.

When a game starts/ends, the matching IN_PROGRESS Reservation (the betting
window) is created/closed and the updated odds are pushed to the "bets"
WebSocket group. Matched by the set of players (single table -> no ambiguity).

Inherited by QueueConsumer (cf. queue.py).
"""
from channels.db import database_sync_to_async

from realtime import state


class QueueBetsMixin:
    @staticmethod
    def _slot_to_game(slot):
        """Normalise a queue slot into a 'game' dict (players + type)."""
        return {
            "player1": slot.get("player1") or slot.get("p1"),
            "player2": slot.get("player2") or slot.get("p2"),
            "player1_teammate": slot.get("player1_teammate"),
            "player2_teammate": slot.get("player2_teammate"),
            "match_type": slot.get("match_type", "SOLO"),
        }

    @staticmethod
    def _game_usernames(game):
        """Set of the (non-null) usernames of an in-memory 'game' dict."""
        return {
            game.get("player1"), game.get("player1_teammate"),
            game.get("player2"), game.get("player2_teammate"),
        } - {None}

    def _slot_involves(self, slot, username):
        """True if `username` takes part in this slot (owner, opponent or
        teammate), regardless of which field stores them (p1/p2/player*)."""
        return username in self._game_usernames(self._slot_to_game(slot))

    @database_sync_to_async
    def _filter_active_usernames(self, usernames):
        """Subset of usernames that map to an existing AND active account."""
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
        """Game removed from the queue without being played -> close + refund its bets."""
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
        Create a game's IN_PROGRESS Reservation (betting window) if it does not
        already exist (dedup by players, e.g. the Home "reserve" path). No
        reservation for 2v1 games (not bettable). Returns the id or None.
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
        Close (DONE) the IN_PROGRESS Reservation of a finished game, matched by
        players. Refunds open bets when `refund` (game abandoned).
        Returns the closed id or None.
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
        """Push the updated odds of the betting market matching this game."""
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
        """Market payload (odds/pools) of the reservation matched to `game`."""
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
