import json
import uuid
from channels.generic.websocket import AsyncWebsocketConsumer

queue = []


def _identity_from_scope(scope, channel_name):
    user = scope.get("user")
    if user is not None and getattr(user, "is_authenticated", False):
        return f"user:{user.id}"
    ws_username = scope.get("ws_username")
    if ws_username:
        return f"guest:{ws_username}"
    return f"chan:{channel_name}"


class QueueConsumer(AsyncWebsocketConsumer):
    group_name = "queue"

    async def connect(self):
        self.user_id = _identity_from_scope(self.scope, self.channel_name)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send(text_data=json.dumps({
            "type": "queue_state",
            "queue": queue,
        }))

    async def disconnect(self, close_code):
        global queue
        queue = [s for s in queue if s.get("ownerId") != self.user_id]
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "queue_update", "queue": queue},
        )

    async def receive(self, text_data):
        global queue
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        action = data.get("action")

        if action == "join":
            slot = data.get("slot") or {}
            slot["id"] = str(uuid.uuid4())
            slot["ownerId"] = self.user_id
            slot["type"] = "taken"
            queue.append(slot)

        elif action == "leave":
            slot_id = data.get("slotId")
            queue = [
                s for s in queue
                if not (s.get("id") == slot_id and s.get("ownerId") == self.user_id)
            ]

        elif action == "update":
            slot_id = data.get("slotId")
            updates = data.get("updates") or {}
            for slot in queue:
                if slot.get("id") == slot_id and slot.get("ownerId") == self.user_id:
                    slot.update(updates)
                    break
        else:
            return

        await self.channel_layer.group_send(
            self.group_name,
            {"type": "queue_update", "queue": queue},
        )

    async def queue_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "queue_state",
            "queue": event["queue"],
        }))
