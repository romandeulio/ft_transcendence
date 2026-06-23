"""
Queue serialisation mixin.

Builds the "snapshot" sent to clients: merges the in-memory live queue
(`state.queue`) with the rows persisted in the database, overlays the score of
ongoing games (`state.games`), then broadcasts the whole thing.

Inherited by QueueConsumer (cf. queue.py).
"""
import json

from channels.db import database_sync_to_async

from planning.models import QueueEntry
from realtime import state


class QueueSerializeMixin:
    @database_sync_to_async
    def _persisted_queue_slots(self):
        """Slots rebuilt from the WAITING QueueEntry rows in the DB (FIFO order)."""
        entries = (
            QueueEntry.objects
            .filter(status=QueueEntry.Status.WAITING)
            .select_related("player1", "player1_teammate", "player2", "player2_teammate")
            .order_by("joined_at")
        )
        slots = []
        for entry in entries:
            player1 = getattr(entry.player1, "username", None)
            player1_teammate = getattr(entry.player1_teammate, "username", None)
            player2 = getattr(entry.player2, "username", None)
            player2_teammate = getattr(entry.player2_teammate, "username", None)
            is_team = entry.match_type == "TEAM"
            team1 = [p for p in [player1, player1_teammate] if p]
            team2 = [p for p in [player2, player2_teammate] if p]
            slot_id = str(entry.id)

            slots.append({
                "id": slot_id,
                "_localId": slot_id,
                "p1": player1,
                "p2": player2,
                "player1": player1,
                "player1_teammate": player1_teammate,
                "player2": player2,
                "player2_teammate": player2_teammate,
                "match_type": entry.match_type,
                "is_ranked": entry.is_ranked,
                "format": "2v2" if is_team else "2v1" if entry.match_type == "TWO_V_ONE" else "1v1",
                "team1": team1 if is_team else None,
                "team2": team2 if is_team else None,
                "type": "taken",
                "source": "db",
                "createdAt": int(entry.joined_at.timestamp() * 1000),
            })
        return slots

    async def _queue_payload(self, live_queue=None):
        """Live queue + persisted entries (deduplicated), with the live score overlaid."""
        live_queue = live_queue if live_queue is not None else state.queue
        persisted_queue = await self._persisted_queue_slots()
        seen = {str(slot.get("id") or slot.get("_localId")) for slot in live_queue}
        merged = list(live_queue) + [
            slot for slot in persisted_queue
            if str(slot.get("id") or slot.get("_localId")) not in seen
        ]
        result = []
        for slot in merged:
            slot_id = str(slot.get("id") or slot.get("_localId") or "")
            if slot_id in state.games:
                g = state.games[slot_id]
                result.append({
                    **slot,
                    "live":       True,
                    "scoreBlue":  g.get("scoreBlue", 0),
                    "scoreRed":   g.get("scoreRed",  0),
                })
            else:
                result.append(slot)
        return sorted(result, key=lambda slot: slot.get("createdAt") or 0)

    async def _broadcast_queue(self):
        """Serialise the queue ONCE, then broadcast the snapshot to every client.
        Avoids one DB query per connected client on each change (every
        `queue_state_msg` handler just forwards the payload)."""
        payload = await self._queue_payload(state.queue)
        await self.channel_layer.group_send(
            self.group_name, {"type": "queue_state_msg", "queue": payload}
        )
