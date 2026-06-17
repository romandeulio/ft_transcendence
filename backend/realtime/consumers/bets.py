"""
WebSocket des paris : diffuse en temps réel les marchés (cotes/pools) des
parties en cours. Lecture seule — la pose de pari passe par l'API REST
(/api/bets/), et chaque pose/annulation/résolution pousse une mise à jour ici.

  ws/bets/
    ← {type: 'bets_state',     markets: [...]}   (snapshot à la connexion)
    ← {type: 'market_update',  market: {...}}    (cote/pool d'une partie a changé)
    ← {type: 'market_closed',  reservation_id}   (partie fermée/résolue)
    → {action: 'refresh'}                         (redemander un snapshot)
"""
import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from planning.models import Reservation
from bets.serializers import serialize_available, market_payload

GROUP = "bets"


class BetConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add(GROUP, self.channel_name)
        await self.accept()
        await self.send(text_data=json.dumps({
            "type": "bets_state",
            "markets": await self._snapshot(),
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(GROUP, self.channel_name)

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


    async def market_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "market_update",
            "market": event["market"],
        }))

    async def market_closed(self, event):
        await self.send(text_data=json.dumps({
            "type": "market_closed",
            "reservation_id": event["reservation_id"],
        }))
