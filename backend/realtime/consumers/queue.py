import json
import uuid
from channels.generic.websocket import AsyncWebsocketConsumer

queue = []
games = {}  # gameId -> { player1, player2, scoreRed, scoreBlue }


def _identity_from_scope(scope, channel_name):
    user = scope.get("user")
    if user is not None and getattr(user, "is_authenticated", False):
        return f"user:{user.id}"
    ws_username = scope.get("ws_username")
    if ws_username:
        return f"guest:{ws_username}"
    return f"chan:{channel_name}"


def _username_from_scope(scope):
    user = scope.get("user")
    if user is not None and getattr(user, "is_authenticated", False):
        return getattr(user, "username", "") or ""
    return scope.get("ws_username") or ""


class QueueConsumer(AsyncWebsocketConsumer):
    group_name = "queue"

    async def connect(self):
        self.user_id = _identity_from_scope(self.scope, self.channel_name)
        self.username = _username_from_scope(self.scope)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        # Personal group for direct messages (invites, responses)
        if self.username:
            await self.channel_layer.group_add(f"user_{self.username}", self.channel_name)
        await self.accept()
        await self.send(text_data=json.dumps({
            "type": "queue_state",
            "queue": queue,
        }))

    async def disconnect(self, close_code):
        global queue
        queue = [s for s in queue if s.get("ownerId") != self.user_id]
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if self.username:
            await self.channel_layer.group_discard(f"user_{self.username}", self.channel_name)
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
            # Use client-provided _localId as the server ID so leave/update can reference it
            slot["id"] = slot.get("_localId") or str(uuid.uuid4())
            slot["ownerId"] = self.user_id
            slot["type"] = "taken"
            queue.append(slot)

        elif action == "leave":
            slot_id = data.get("slotId")
            leaving_slot = next(
                (s for s in queue if s.get("id") == slot_id and s.get("ownerId") == self.user_id),
                None,
            )
            queue = [
                s for s in queue
                if not (s.get("id") == slot_id and s.get("ownerId") == self.user_id)
            ]
            if leaving_slot:
                participants = set()
                for field in ["p2", "player1_teammate", "player2_teammate"]:
                    val = leaving_slot.get(field)
                    if val and val != self.username:
                        participants.add(val)
                for team_key in ["team1", "team2"]:
                    for p in (leaving_slot.get(team_key) or []):
                        if p and p != self.username:
                            participants.add(p)
                for participant in participants:
                    await self.channel_layer.group_send(
                        f"user_{participant}",
                        {"type": "match_cancelled_msg", "cancelledBy": self.username},
                    )

        elif action == "update":
            slot_id = data.get("slotId")
            updates = data.get("updates") or {}
            for slot in queue:
                if slot.get("id") == slot_id and slot.get("ownerId") == self.user_id:
                    slot.update(updates)
                    break

        elif action == "game_open":
            game_id  = data.get("gameId")
            player1  = data.get("player1")
            player2  = data.get("player2")
            p1_tm    = data.get("player1_teammate")
            p2_tm    = data.get("player2_teammate")
            if game_id and player1 and player2:
                if game_id not in games:
                    games[game_id] = {
                        "player1": player1,
                        "player2": player2,
                        "player1_teammate": p1_tm,
                        "player2_teammate": p2_tm,
                        "scoreRed": 0,
                        "scoreBlue": 0,
                    }
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "game_state_msg", "game": {**games[game_id], "gameId": game_id}},
                )
            return

        elif action == "score_update":
            game_id    = data.get("gameId")
            score_red  = data.get("scoreRed", 0)
            score_blue = data.get("scoreBlue", 0)
            if game_id and game_id in games:
                games[game_id]["scoreRed"]  = score_red
                games[game_id]["scoreBlue"] = score_blue
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "game_state_msg", "game": {**games[game_id], "gameId": game_id}},
                )
            return

        elif action == "game_end":
            game_id = data.get("gameId")
            winner = None
            winner_teammate = None
            if game_id and game_id in games:
                g = games[game_id]
                # player1 = équipe bleue, player2 = équipe rouge
                if g.get("scoreBlue", 0) > g.get("scoreRed", 0):
                    winner = g.get("player1")
                    winner_teammate = g.get("player1_teammate")
                elif g.get("scoreRed", 0) > g.get("scoreBlue", 0):
                    winner = g.get("player2")
                    winner_teammate = g.get("player2_teammate")
                del games[game_id]
            # Supprime le créneau terminé
            if game_id:
                queue = [s for s in queue if s.get("id") != game_id]
            # Met à jour les créneaux takeWin qui attendaient ce gagnant
            if winner:
                for slot in queue:
                    if slot.get("takeWin") and not slot.get("p2"):
                        slot["p2"] = winner
                        slot["player2"] = winner
                        if winner_teammate:
                            slot["player2_teammate"] = winner_teammate
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "game_ended_msg", "gameId": game_id, "winner": winner, "winner_teammate": winner_teammate},
            )
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "queue_update", "queue": queue},
            )
            return

        # ── Invitations ────────────────────────────────────────────────────────

        elif action == "invite":
            target    = data.get("target")   # username of J2
            invite_id = data.get("inviteId") or str(uuid.uuid4())
            slot      = data.get("slot") or {}
            if target:
                await self.channel_layer.group_send(
                    f"user_{target}",
                    {
                        "type": "invite_msg",
                        "inviteId": invite_id,
                        "from": self.username,
                        "slot": slot,
                    },
                )
            return

        elif action == "invite_response":
            invite_id = data.get("inviteId")
            accepted  = data.get("accepted", False)
            from_user = data.get("from")    # J1's username

            if from_user:
                await self.channel_layer.group_send(
                    f"user_{from_user}",
                    {
                        "type": "invite_response_msg",
                        "inviteId": invite_id,
                        "accepted": accepted,
                        "responder": self.username,  # who responded (J2/J3/J4)
                    },
                )
            return

        elif action == "cancel_invite":
            target    = data.get("target")
            invite_id = data.get("inviteId")
            if target:
                await self.channel_layer.group_send(
                    f"user_{target}",
                    {"type": "cancel_invite_msg", "inviteId": invite_id},
                )
            return

        elif action == "leave_as_p2":
            slot_id = data.get("slotId")
            target_slot = next((s for s in queue if s.get("id") == slot_id), None)
            queue = [s for s in queue if s.get("id") != slot_id]
            if target_slot:
                owner_username = target_slot.get("p1")
                if owner_username:
                    await self.channel_layer.group_send(
                        f"user_{owner_username}",
                        {"type": "p2_left_msg", "slotId": slot_id},
                    )
                other_participants = set()
                for field in ["player1_teammate", "p2", "player2_teammate"]:
                    val = target_slot.get(field)
                    if val and val != self.username and val != owner_username:
                        other_participants.add(val)
                for team_key in ["team1", "team2"]:
                    for p in (target_slot.get(team_key) or []):
                        if p and p != self.username and p != owner_username:
                            other_participants.add(p)
                for participant in other_participants:
                    await self.channel_layer.group_send(
                        f"user_{participant}",
                        {"type": "match_cancelled_msg", "cancelledBy": self.username},
                    )
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "queue_update", "queue": queue},
            )
            return

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
        await self.send(text_data=json.dumps({
            "type": "match_cancelled",
            "cancelledBy": event["cancelledBy"],
        }))

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
        }))
