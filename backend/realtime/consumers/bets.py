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

from realtime import state
from planning.models import Reservation
from bets.serializers import serialize_available, market_payload

GROUP = "bets"


class BetConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.username = ""
        await self.channel_layer.group_add(GROUP, self.channel_name)
        # Groupe personnel DÉDIÉ aux paris (pas le `user_{username}` partagé, qui
        # reçoit invites/notifs que ce consumer ne sait pas router) : reçoit
        # `account.deleted` quand ce joueur est supprimé, pour fermer ce WS
        # lui-même (code 4002). Indispensable pour battre le `market_closed` de
        # sa propre partie annulée : les deux arrivent sur CE consumer, mais
        # `account.deleted` est émis par `_kick_live_session` AVANT que le
        # handler queue ne crée le `market_closed` → l'ordre FIFO du canal
        # garantit la fermeture d'abord, donc aucun poll (loadHistory/
        # refreshUser) ni 401 côté front.
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
        """Compte supprimé : ferme ce WS (code 4002) → le front pose son verrou
        de session (killAuthSession) et n'émet plus aucune requête authentifiée."""
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
