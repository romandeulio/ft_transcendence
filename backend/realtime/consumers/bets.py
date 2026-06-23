"""
Betting WebSocket: streams the markets (odds/pools) of ongoing games in real
time. Read-only -- placing a bet goes through the REST API (/api/bets/), and
every placement/cancellation/settlement pushes an update here.

  ws/bets/
    <- {type: 'bets_state',     markets: [...]}   (snapshot on connect)
    <- {type: 'market_update',  market: {...}}    (a game's odds/pool changed)
    <- {type: 'market_closed',  reservation_id}   (game closed/settled)
    -> {action: 'refresh'}                          (ask for a fresh snapshot)
"""
import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from realtime import state
from planning.models import Reservation
from bets.serializers import serialize_available, market_payload

GROUP = "bets"


class BetConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.username = ""
        await self.channel_layer.group_add(GROUP, self.channel_name)
        # DEDICATED betting group (not the shared `user_{username}`, which also
        # receives invites/notifications this consumer cannot route): receives
        # `account.deleted` when this player is deleted, so this WS closes itself
        # (code 4002). Required to beat the `market_closed` of the player's own
        # cancelled game: both land on THIS consumer, but `account.deleted` is
        # emitted by `_kick_live_session` BEFORE the queue handler creates the
        # `market_closed` -> the channel's FIFO order guarantees the close runs
        # first, so no poll (loadHistory/refreshUser) and no 401 on the front.
        user = self.scope.get("user")
        if user is not None and getattr(user, "is_authenticated", False):
            self.username = state.username_from_scope(self.scope) or ""
            if self.username:
                await self.channel_layer.group_add(f"bets_user_{self.username}", self.channel_name)
        await self.accept()
        await self.send(text_data=json.dumps({
            "type": "bets_state",
            "markets": await self._snapshot(),
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(GROUP, self.channel_name)
        if self.username:
            await self.channel_layer.group_discard(f"bets_user_{self.username}", self.channel_name)

    async def account_deleted(self, event):
        """Account deleted: close this WS (code 4002) -> the front-end sets its
        session lock (killAuthSession) and stops issuing authenticated requests."""
        try:
            await self.send(text_data=json.dumps({"type": "account_deleted"}))
        except Exception:
            pass
        await self.close(code=4002)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return
        if data.get("action") == "refresh":
            await self.send(text_data=json.dumps({
                "type": "bets_state",
                "markets": await self._snapshot(),
            }))

    @database_sync_to_async
    def _snapshot(self):
        qs = (
            Reservation.objects
            .filter(status=Reservation.Status.IN_PROGRESS)
            .filter(match_type__in=["SOLO", "TEAM"])
            .select_related(
                "player1", "player1_teammate",
                "player2", "player2_teammate",
            )
        )
        user = self.scope.get("user")
        if user is not None and getattr(user, "is_authenticated", False):
            return [serialize_available(r, user) for r in qs]
        return [market_payload(r) for r in qs]


    async def market_update_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "market_update",
            "market": event["market"],
        }))

    async def market_closed_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "market_closed",
            "reservation_id": event["reservation_id"],
        }))
