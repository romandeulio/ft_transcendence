"""
Mixin for group event handlers ("*_msg").

Channels calls the method whose name == event["type"] on every consumer in the
group. These methods only TRANSLATE the internal event into the JSON message
sent to the browser (the contract the front-end reads). No shared state here.

Inherited by QueueConsumer (cf. queue.py).
"""
import json


class QueueHandlersMixin:
    async def queue_state_msg(self, event):
        # Payload already serialised by _broadcast_queue -> plain forward, no DB.
        await self.send(text_data=json.dumps({
            "type": "queue_state",
            "queue": event["queue"],
        }))

    async def game_state_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "game_state",
            "game": event["game"],
        }))

    async def game_ended_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "game_ended",
            "gameId": event["gameId"],
            "winner": event.get("winner"),
            "winner_teammate": event.get("winner_teammate"),
        }))

    async def match_cancelled_msg(self, event):
        msg = {"type": "match_cancelled", "cancelledBy": event["cancelledBy"]}
        if event.get("slotId"):
            msg["slotId"] = event["slotId"]
        if event.get("chain"):
            msg["chain"] = True
        if event.get("cancelId"):
            msg["cancelId"] = event["cancelId"]
        await self.send(text_data=json.dumps(msg))

    async def invite_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "invite_received",
            "inviteId": event["inviteId"],
            "from": event["from"],
            "slot": event["slot"],
        }))

    async def invite_response_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "invite_response",
            "inviteId": event["inviteId"],
            "accepted": event["accepted"],
            "responder": event.get("responder"),
        }))

    async def cancel_invite_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "invite_cancelled",
            "inviteId": event["inviteId"],
        }))

    async def p2_left_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "p2_left",
            "slotId": event["slotId"],
            "cancelledBy": event.get("cancelledBy", ""),
        }))

    async def win_invite_msg(self, event):
        await self.send(text_data=json.dumps({
            "type":     "win_invite",
            "inviteId": event["inviteId"],
            "from":     event["from"],
            "slot":     event["slot"],
            "slotId":   event["slotId"],
        }))

    async def win_claim_declined_msg(self, event):
        await self.send(text_data=json.dumps({
            "type":   "win_claim_declined",
            "slotId": event["slotId"],
        }))
