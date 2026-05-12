import json
import uuid
from channels.generic.websocket import AsyncWebsocketConsumer

queue = []

class QueueConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]

        if self.user.is_anonymous:
            await self.close()
            return
        
        self.group_name = "queue"
        self.user_id = str(self.user.id) if hasattr(self.user, 'id') else self.user.username

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()
        await self.send(text_data=json.dumps({
            "type": "queue_state",
            "queue": queue
        }))

    async def disconnect(self, close_code):
        global queue
        queue = [slot for slot in queue if slot.get("ownerId") != self.user_id]
        
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )
        
        # Broadcast updated queue
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "queue_update",
                "queue": queue
            }
        )

    async def receive(self, text_data):
        global queue
        data = json.loads(text_data)
        action = data.get("action")

        if action == "join":
            slot = data.get("slot", {})
            slot["id"] = str(uuid.uuid4())
            slot["ownerId"] = self.user_id
            slot["type"] = "taken"
            queue.append(slot)

        elif action == "leave":
            slot_id = data.get("slotId")
            queue = [s for s in queue if s.get("id") != slot_id or s.get("ownerId") != self.user_id]

        elif action == "update":
            slot_id = data.get("slotId")
            updates = data.get("updates", {})
            for slot in queue:
                if slot.get("id") == slot_id and slot.get("ownerId") == self.user_id:
                    slot.update(updates)
                    break

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "queue_update",
                "queue": queue
            }
        )

    async def queue_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "queue_state",
            "queue": event["queue"]
        }))