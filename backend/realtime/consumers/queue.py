import json
import time
import uuid
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from planning.models import QueueEntry

queue = []
games = {}         # gameId -> { player1, player2, scoreRed, scoreBlue }
win_invites = {}   # inviteId -> { slotId, targets, accepted, owner }
online_users = set()           # usernames currently connected
pending_invites = {}           # username -> list of stored invites for offline users
completed_game_ids = set()     # gameIds that ended (to reject stale reconnect rejoins)


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

    @database_sync_to_async
    def _persisted_queue_slots(self):
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
        live_queue = live_queue if live_queue is not None else queue
        persisted_queue = await self._persisted_queue_slots()
        seen = {str(slot.get("id") or slot.get("_localId")) for slot in live_queue}
        merged = list(live_queue) + [
            slot for slot in persisted_queue
            if str(slot.get("id") or slot.get("_localId")) not in seen
        ]
        result = []
        for slot in merged:
            slot_id = str(slot.get("id") or slot.get("_localId") or "")
            if slot_id in games:
                g = games[slot_id]
                result.append({
                    **slot,
                    "live":       True,
                    "scoreBlue":  g.get("scoreBlue", 0),
                    "scoreRed":   g.get("scoreRed",  0),
                })
            else:
                result.append(slot)
        return sorted(result, key=lambda slot: slot.get("createdAt") or 0)

    async def connect(self):
        if not self.scope["user"].is_authenticated:
            await self.close()
            return

        self.user_id = _identity_from_scope(self.scope, self.channel_name)
        self.username = _username_from_scope(self.scope)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        # Personal group for direct messages (invites, responses)
        if self.username:
            await self.channel_layer.group_add(f"user_{self.username}", self.channel_name)
            online_users.add(self.username)
        await self.accept()
        await self.send(text_data=json.dumps({
            "type": "queue_state",
            "queue": await self._queue_payload(queue),
        }))
        # Restore game state for any active game this user is part of (reconnect / late join)
        if self.username:
            for game_id, g in games.items():
                if self.username in (g.get("player1"), g.get("player2"),
                                     g.get("player1_teammate"), g.get("player2_teammate")):
                    await self.send(text_data=json.dumps({
                        "type": "game_state",
                        "game": {**g, "gameId": game_id},
                    }))
                    break

        # Deliver messages that were sent while this user was offline.
        # One-shot notifications (match_cancelled, win_claim_declined) are consumed on delivery.
        # Pending invites (regular and win) are kept until the user responds or J1 cancels,
        # so they survive multiple disconnect/reconnect cycles.
        if self.username and self.username in pending_invites:
            to_deliver = list(pending_invites[self.username])
            # One-shot notifications consumed on delivery; persistent invites kept until responded/cancelled
            ONE_SHOT_KEYS = ("match_cancelled", "win_claim_declined", "invite_response", "p2_left", "game_ended")
            pending_invites[self.username] = [
                inv for inv in to_deliver
                if not any(inv.get(k) for k in ONE_SHOT_KEYS)
            ]
            if not pending_invites[self.username]:
                del pending_invites[self.username]
            for inv in to_deliver:
                if inv.get("match_cancelled"):
                    await self.send(text_data=json.dumps({
                        "type":        "match_cancelled",
                        "cancelledBy": inv.get("cancelledBy", ""),
                        "slotId":      inv.get("slotId"),
                        "chain":       inv.get("chain", False),
                        "cancelId":    inv.get("cancelId"),
                    }))
                elif inv.get("win_claim_declined"):
                    await self.send(text_data=json.dumps({
                        "type": "win_claim_declined",
                        "slotId": inv["slotId"],
                    }))
                elif inv.get("invite_response"):
                    await self.send(text_data=json.dumps({
                        "type":      "invite_response",
                        "inviteId":  inv["inviteId"],
                        "accepted":  inv["accepted"],
                        "responder": inv["responder"],
                    }))
                elif inv.get("p2_left"):
                    await self.send(text_data=json.dumps({
                        "type":        "p2_left",
                        "slotId":      inv["slotId"],
                        "cancelledBy": inv["cancelledBy"],
                    }))
                elif inv.get("game_ended"):
                    await self.send(text_data=json.dumps({
                        "type":            "game_ended",
                        "gameId":          inv["gameId"],
                        "winner":          inv.get("winner"),
                        "winner_teammate": inv.get("winner_teammate"),
                    }))
                elif inv.get("win_invite"):
                    await self.send(text_data=json.dumps({
                        "type": "win_invite",
                        "inviteId": inv["inviteId"],
                        "from":     inv["from"],
                        "slot":     inv["slot"],
                        "slotId":   inv["slotId"],
                    }))
                else:
                    await self.send(text_data=json.dumps({
                        "type": "invite_received",
                        "inviteId": inv["inviteId"],
                        "from":     inv["from"],
                        "slot":     inv["slot"],
                    }))

    async def disconnect(self, close_code):
        global queue
        # Keep slots that:
        # - belong to another user
        # - are tied to an active game
        # - have a committed opponent (p2 set = J2 accepted the invite)
        # - are takeWin slots waiting for the previous game to end (p2 still unknown)
        active_game_slot_ids = set(games.keys())
        queue = [
            s for s in queue
            if s.get("ownerId") != self.user_id
            or s.get("id") in active_game_slot_ids
            or bool(s.get("p2"))
            or bool(s.get("takeWin"))
        ]
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if self.username:
            await self.channel_layer.group_discard(f"user_{self.username}", self.channel_name)
            online_users.discard(self.username)
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

            # Reject stale rejoins: J1 was offline when J2 ended the game; the reconnect
            # effect fires before game_ended is processed, causing the slot to reappear.
            if slot["id"] in completed_game_ids:
                await self.send(text_data=json.dumps({
                    "type": "game_ended",
                    "gameId": slot["id"],
                }))
                return

            slot["ownerId"] = self.user_id
            slot["type"] = "taken"
            # Upsert: if a slot with the same id already exists, preserve any server-side
            # player fields that the reconnecting client might not have yet (e.g. p2 filled
            # by a win_claim while J1 was offline).
            existing = next((s for s in queue if s.get("id") == slot["id"]), None)
            if existing:
                for field in ("p2", "player1", "player2", "player1_teammate",
                              "player2_teammate", "team1", "team2"):
                    if existing.get(field) and not slot.get(field):
                        slot[field] = existing[field]
            queue = [s for s in queue if s.get("id") != slot["id"]]
            # Insert at correct position based on createdAt so invite-delayed slots
            # land before slots created later (FIFO by original creation time)
            created_at = slot.get("createdAt") or 0
            insert_idx = len(queue)
            for i, s in enumerate(queue):
                if (s.get("createdAt") or 0) > created_at:
                    insert_idx = i
                    break
            queue.insert(insert_idx, slot)

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
                cancel_id = str(uuid.uuid4())
                for participant in participants:
                    if participant in online_users:
                        await self.channel_layer.group_send(
                            f"user_{participant}",
                            {"type": "match_cancelled_msg", "cancelledBy": self.username, "cancelId": cancel_id},
                        )
                    else:
                        pending_invites.setdefault(participant, []).append({
                            "match_cancelled": True, "cancelledBy": self.username,
                            "slotId": leaving_slot.get("id"), "cancelId": cancel_id,
                        })
                await self._cascade_cancel_takewins(leaving_slot.get("id"), leaving_slot.get("match_type", "SOLO"))

        elif action == "update":
            slot_id = data.get("slotId")
            updates = data.get("updates") or {}
            for slot in queue:
                if slot.get("id") == slot_id and slot.get("ownerId") == self.user_id:
                    slot.update(updates)
                    break

        elif action == "game_open":
            game_id    = data.get("gameId")
            player1    = data.get("player1")
            player2    = data.get("player2")
            p1_tm      = data.get("player1_teammate")
            p2_tm      = data.get("player2_teammate")
            match_type = data.get("match_type", "SOLO")
            if game_id and player1 and player2:
                if game_id not in games:
                    games[game_id] = {
                        "player1": player1,
                        "player2": player2,
                        "player1_teammate": p1_tm,
                        "player2_teammate": p2_tm,
                        "match_type": match_type,
                        "scoreRed": 0,
                        "scoreBlue": 0,
                        "startTime": int(time.time() * 1000),
                    }
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "game_state_msg", "game": {**games[game_id], "gameId": game_id}},
                )
                # Push live flag to all connected clients immediately
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "queue_update", "queue": queue},
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
            # completed=True uniquement quand envoyé par signalGameEnd (fin officielle de match)
            # closeGame l'omet → évite d'inviter le leader d'un match en cours
            is_completed    = data.get("completed", False)
            winner          = data.get("winner") or None
            winner_teammate = data.get("winner_teammate") or None
            g = None
            if game_id and game_id in games:
                g = games[game_id]
                if not winner:
                    if g.get("scoreBlue", 0) > g.get("scoreRed", 0):
                        winner          = g.get("player1")
                        winner_teammate = g.get("player1_teammate")
                    elif g.get("scoreRed", 0) > g.get("scoreBlue", 0):
                        winner          = g.get("player2")
                        winner_teammate = g.get("player2_teammate")
                # Notify offline participants so their activeGame clears on reconnect
                for pf in ("player1", "player2", "player1_teammate", "player2_teammate"):
                    p = g.get(pf)
                    if p and p not in online_users:
                        pending_invites.setdefault(p, []).append({
                            "game_ended": True,
                            "gameId":          game_id,
                            "winner":          winner,
                            "winner_teammate": winner_teammate,
                        })
                del games[game_id]
            # Supprime le créneau terminé
            if game_id:
                queue = [s for s in queue if s.get("id") != game_id]
                completed_game_ids.add(game_id)
                if len(completed_game_ids) > 10000:
                    completed_game_ids.pop()
            # Invite le/les gagnant(s) — seulement si le match est officiellement terminé
            if winner and is_completed:
                ended_match_type = data.get("match_type") or (g.get("match_type", "SOLO") if g else "SOLO")
                for slot in queue:
                    if (slot.get("takeWin") and not slot.get("p2")
                            and slot.get("match_type", "SOLO") == ended_match_type
                            and slot.get("parentSlotId") == game_id):
                        invite_id = str(uuid.uuid4())
                        win_targets = [t for t in [winner, winner_teammate] if t]
                        win_invites[invite_id] = {
                            "slotId":  slot["id"],
                            "targets": win_targets,
                            "accepted": [],
                            "owner":   slot.get("p1"),
                        }
                        for target in win_targets:
                            inv_payload = {
                                "inviteId": invite_id,
                                "from":     slot.get("p1"),
                                "slot":     slot,
                                "slotId":   slot["id"],
                            }
                            # Always persist for reconnect re-delivery
                            pending_invites.setdefault(target, []).append(
                                {"win_invite": True, **inv_payload}
                            )
                            if target in online_users:
                                await self.channel_layer.group_send(
                                    f"user_{target}",
                                    {"type": "win_invite_msg", **inv_payload},
                                )
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
                # Always persist for reconnect re-delivery (removed on response or cancel)
                pending_invites.setdefault(target, []).append({
                    "inviteId": invite_id,
                    "from":     self.username,
                    "slot":     slot,
                })
                if target in online_users:
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

            # Remove from pending storage so the invite isn't re-delivered on next reconnect
            if self.username in pending_invites:
                pending_invites[self.username] = [
                    i for i in pending_invites[self.username]
                    if i.get("inviteId") != invite_id
                ]
                if not pending_invites[self.username]:
                    del pending_invites[self.username]

            if from_user:
                payload = {
                    "inviteId":  invite_id,
                    "accepted":  accepted,
                    "responder": self.username,
                }
                if from_user in online_users:
                    await self.channel_layer.group_send(
                        f"user_{from_user}",
                        {"type": "invite_response_msg", **payload},
                    )
                else:
                    pending_invites.setdefault(from_user, []).append(
                        {"invite_response": True, **payload}
                    )
            return

        elif action == "cancel_invite":
            target    = data.get("target")
            invite_id = data.get("inviteId")
            if target:
                # Remove from offline storage if target hasn't connected yet
                if target in pending_invites:
                    pending_invites[target] = [
                        i for i in pending_invites[target]
                        if i.get("inviteId") != invite_id
                    ]
                    if not pending_invites[target]:
                        del pending_invites[target]
                await self.channel_layer.group_send(
                    f"user_{target}",
                    {"type": "cancel_invite_msg", "inviteId": invite_id},
                )
            return

        elif action == "win_claim_response":
            invite_id = data.get("inviteId")
            accepted  = data.get("accepted", False)
            invite    = win_invites.get(invite_id)
            if not invite:
                return
            slot_id = invite["slotId"]

            # Remove win_invite from pending storage so it isn't re-delivered on reconnect
            if self.username in pending_invites:
                pending_invites[self.username] = [
                    i for i in pending_invites[self.username]
                    if i.get("inviteId") != invite_id
                ]
                if not pending_invites[self.username]:
                    del pending_invites[self.username]

            if not accepted:
                # Gagnant refuse → annuler le créneau takeWin
                cancelled_slot = next((s for s in queue if s.get("id") == slot_id), None)
                cancelled_match_type = (cancelled_slot.get("match_type", "SOLO") if cancelled_slot else "SOLO")
                queue = [s for s in queue if s.get("id") != slot_id]
                del win_invites[invite_id]
                owner = invite["owner"]
                declined_payload = {"win_claim_declined": True, "slotId": slot_id}
                if owner in online_users:
                    await self.channel_layer.group_send(
                        f"user_{owner}",
                        {"type": "win_claim_declined_msg", "slotId": slot_id},
                    )
                else:
                    pending_invites.setdefault(owner, []).append(declined_payload)
                # Annuler pour les autres co-gagnants éventuels
                for t in invite["targets"]:
                    if t != self.username:
                        # Their pending_invites entry was already removed when they responded,
                        # so we only need to notify if they're online.
                        if t in online_users:
                            await self.channel_layer.group_send(
                                f"user_{t}",
                                {"type": "cancel_invite_msg", "inviteId": invite_id},
                            )
                # Cascade : annuler les takeWin qui dépendent de ce slot
                await self._cascade_cancel_takewins(slot_id, cancelled_match_type)
                await self.channel_layer.group_send(
                    self.group_name, {"type": "queue_update", "queue": queue}
                )
                return

            # Accepté — enregistrer
            if self.username not in invite["accepted"]:
                invite["accepted"].append(self.username)

            if len(invite["accepted"]) >= len(invite["targets"]):
                # Tous ont accepté → remplir p2 dans le slot
                target_slot = next((s for s in queue if s.get("id") == slot_id), None)
                if target_slot:
                    w    = invite["targets"][0]
                    w_tm = invite["targets"][1] if len(invite["targets"]) > 1 else None
                    target_slot["p2"] = w  # always set p2 as opponent for display
                    fill_blue = target_slot.get("player1") is None
                    if fill_blue:
                        target_slot["player1"] = w
                        if w_tm:
                            target_slot["player1_teammate"] = w_tm
                            if target_slot.get("match_type") == "TEAM":
                                target_slot["team1"] = [w, w_tm]
                    else:
                        target_slot["player2"] = w
                        if w_tm:
                            target_slot["player2_teammate"] = w_tm
                            if target_slot.get("match_type") == "TEAM":
                                target_slot["team2"] = [w, w_tm]
                del win_invites[invite_id]
                await self.channel_layer.group_send(
                    self.group_name, {"type": "queue_update", "queue": queue}
                )
            return

        elif action == "leave_as_p2":
            slot_id = data.get("slotId")
            target_slot = next((s for s in queue if s.get("id") == slot_id), None)
            queue = [s for s in queue if s.get("id") != slot_id]
            if target_slot:
                owner_username = target_slot.get("p1")
                if owner_username:
                    if owner_username in online_users:
                        await self.channel_layer.group_send(
                            f"user_{owner_username}",
                            {"type": "p2_left_msg", "slotId": slot_id, "cancelledBy": self.username},
                        )
                    else:
                        pending_invites.setdefault(owner_username, []).append(
                            {"p2_left": True, "slotId": slot_id, "cancelledBy": self.username}
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
                cancel_id = str(uuid.uuid4())
                for participant in other_participants:
                    if participant in online_users:
                        await self.channel_layer.group_send(
                            f"user_{participant}",
                            {"type": "match_cancelled_msg", "cancelledBy": self.username, "cancelId": cancel_id},
                        )
                    else:
                        pending_invites.setdefault(participant, []).append({
                            "match_cancelled": True, "cancelledBy": self.username,
                            "slotId": slot_id, "cancelId": cancel_id,
                        })
            if target_slot:
                await self._cascade_cancel_takewins(target_slot.get("id"), target_slot.get("match_type", "SOLO"))
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

    async def _cascade_cancel_takewins(self, cancelled_slot_id, match_type):
        """Cancel only the takeWin slots that depend directly on cancelled_slot_id
        (parentSlotId == cancelled_slot_id), then recurse for each cancelled slot.

        This ensures that only downstream slots (Match 4+) are cancelled when
        Match 3 is removed, without touching upstream slots (Match 2).
        Works for both SOLO (1v1) and TEAM (2v2) chains.
        """
        global queue
        to_cancel = [
            s for s in queue
            if s.get("takeWin") and not s.get("p2")
            and s.get("match_type", "SOLO") == match_type
            and s.get("parentSlotId") == cancelled_slot_id
        ]
        if not to_cancel:
            return
        cancel_ids = {s["id"] for s in to_cancel}
        queue = [s for s in queue if s.get("id") not in cancel_ids]
        # Cancel any pending win_invites targeting these slots
        stale_invite_ids = [k for k, v in win_invites.items() if v["slotId"] in cancel_ids]
        for inv_id in stale_invite_ids:
            inv = win_invites.pop(inv_id, None)
            if inv:
                for t in inv.get("targets", []):
                    # Remove from offline storage so the stale win_invite isn't re-delivered
                    if t in pending_invites:
                        pending_invites[t] = [
                            i for i in pending_invites[t]
                            if not (i.get("win_invite") and i.get("inviteId") == inv_id)
                        ]
                        if not pending_invites[t]:
                            del pending_invites[t]
                    if t in online_users:
                        await self.channel_layer.group_send(
                            f"user_{t}",
                            {"type": "cancel_invite_msg", "inviteId": inv_id},
                        )
        # Notify each slot owner, then recurse into their dependents
        for slot in to_cancel:
            owner = slot.get("p1")
            slot_id = slot.get("id")
            if owner:
                cancel_id = str(uuid.uuid4())
                payload = {"type": "match_cancelled_msg", "cancelledBy": "", "slotId": slot_id, "chain": True, "cancelId": cancel_id}
                if owner in online_users:
                    await self.channel_layer.group_send(f"user_{owner}", payload)
                else:
                    pending_invites.setdefault(owner, []).append(
                        {"match_cancelled": True, "cancelledBy": "", "slotId": slot_id, "chain": True, "cancelId": cancel_id}
                    )
            await self._cascade_cancel_takewins(slot_id, match_type)

    async def queue_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "queue_state",
            "queue": await self._queue_payload(event["queue"]),
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

