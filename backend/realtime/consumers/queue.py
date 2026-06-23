"""
WebSocket consumer for the "queue" room (ws/queue/).

Manages the live queue, the game lifecycle, invitations (direct and
"take-the-winner"), and deferred delivery to offline players.

Layout (shared state lives in realtime/state.py, accessed via `state.*`):
  - QueueSerializeMixin : build/broadcast the queue snapshot
  - QueueBetsMixin      : bridge to betting (reservations + odds)
  - QueueHandlersMixin  : `*_msg` handlers (internal event -> front-end JSON)
  - this file           : connect/disconnect + `receive` dispatch -> `_on_<action>`

Each front-end message {"action": "..."} is routed by the ACTIONS table to the
matching `_on_<action>` method.
"""
import json
import time
import uuid

from channels.generic.websocket import AsyncWebsocketConsumer

from realtime import state
from realtime.consumers._queue_serialize import QueueSerializeMixin
from realtime.consumers._queue_bets import QueueBetsMixin
from realtime.consumers._queue_handlers import QueueHandlersMixin

# Compat re-export: bets/services.py does
# `from realtime.consumers.queue import games`. The dict is mutated in place
# (never reassigned) -> this import shares the same instance as state.games.
from realtime.state import games  # noqa: F401


class QueueConsumer(
    QueueSerializeMixin,
    QueueBetsMixin,
    QueueHandlersMixin,
    AsyncWebsocketConsumer,
):
    group_name = "queue"

    ACTIONS = {
        "join":               "_on_join",
        "leave":              "_on_leave",
        "update":             "_on_update",
        "game_open":          "_on_game_open",
        "score_update":       "_on_score_update",
        "game_end":           "_on_game_end",
        "invite":             "_on_invite",
        "invite_response":    "_on_invite_response",
        "cancel_invite":      "_on_cancel_invite",
        "win_claim_response": "_on_win_claim_response",
        "leave_as_p2":        "_on_leave_as_p2",
    }

    # ── Lifecycle ───────────────────────────────────────────────────────────

    async def connect(self):
        self.user_id = None
        self.username = ""
        if not self.scope["user"].is_authenticated:
            await self.close()
            return

        self.user_id = state.identity_from_scope(self.scope, self.channel_name)
        self.username = state.username_from_scope(self.scope)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        # Personal group for direct messages (invitations, responses)
        if self.username:
            await self.channel_layer.group_add(f"user_{self.username}", self.channel_name)
            previous = state.active_connections.get(self.username)
            if previous and previous != self.channel_name:
                await self.channel_layer.send(previous, {"type": "session.superseded"})
            state.active_connections[self.username] = self.channel_name
            state.online_users.add(self.username)
        await self.accept()
        await self.send(text_data=json.dumps({
            "type": "queue_state",
            "queue": await self._queue_payload(state.queue),
        }))
        # Restore game state if this player is in an active game (reconnect / late join)
        if self.username:
            for game_id, g in state.games.items():
                if self.username in (g.get("player1"), g.get("player2"),
                                     g.get("player1_teammate"), g.get("player2_teammate")):
                    await self.send(text_data=json.dumps({
                        "type": "game_state",
                        "game": {**g, "gameId": game_id},
                    }))
                    break

        await self._deliver_pending()

    async def _deliver_pending(self):
        """Deliver messages buffered while this player was offline.

        One-shot notifications (match_cancelled, win_claim_declined...) are
        consumed on delivery; invitations (direct / win) are kept until answered
        or cancelled (they survive several reconnections).
        """
        if not self.username or self.username not in state.pending_invites:
            return
        to_deliver = list(state.pending_invites[self.username])
        ONE_SHOT_KEYS = ("match_cancelled", "win_claim_declined", "invite_response", "p2_left", "game_ended", "friend_added")
        state.pending_invites[self.username] = [
            inv for inv in to_deliver
            if not any(inv.get(k) for k in ONE_SHOT_KEYS)
        ]
        if not state.pending_invites[self.username]:
            del state.pending_invites[self.username]
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
            elif inv.get("friend_added"):
                await self.send(text_data=json.dumps({
                    "type": "friend_added",
                    "from": inv["from"],
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

    async def session_superseded(self, event):
        try:
            await self.send(text_data=json.dumps({"type": "session_superseded"}))
        except Exception:
            pass
        await self.close(code=4001)

    async def account_deleted(self, event):
        """This player's account was just deleted: drop their live games from
        memory (reservations/bets are already cancelled in the DB), remove their
        queue slots, then close the session so they can no longer change a
        score."""
        for game_id in list(state.games.keys()):
            g = state.games[game_id]
            if self.username in self._game_usernames(g):
                del state.games[game_id]
                state.queue = [s for s in state.queue if s.get("id") != game_id]
                state.completed_game_ids.add(game_id)
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "game_ended_msg", "gameId": game_id,
                     "winner": None, "winner_teammate": None},
                )
        # Remove ALL slots where this player appears (owner OR opponent OR
        # teammate) -- not only the ones they own -- otherwise the other player
        # would keep a playable slot tied to a deleted account. Refund the open
        # bets and signal the end of each slot to both players.
        involved = [s for s in state.queue if self._slot_involves(s, self.username)]
        for s in involved:
            await self._close_bets_for_slot(s)
            slot_id = s.get("id")
            if slot_id:
                state.completed_game_ids.add(slot_id)
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "game_ended_msg", "gameId": slot_id,
                     "winner": None, "winner_teammate": None},
                )
        involved_ids = {s.get("id") for s in involved}
        state.queue = [s for s in state.queue if s.get("id") not in involved_ids]
        await self._broadcast_queue()
        try:
            await self.send(text_data=json.dumps({"type": "account_deleted"}))
        except Exception:
            pass
        await self.close(code=4002)

    async def friend_added(self, event):
        try:
            await self.send(text_data=json.dumps({
                "type": "friend_added",
                "from": event["from"],
            }))
        except Exception:
            pass

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if self.username:
            await self.channel_layer.group_discard(f"user_{self.username}", self.channel_name)

        if self.username and state.active_connections.get(self.username) != self.channel_name:
            return

        if self.username:
            state.active_connections.pop(self.username, None)
            state.online_users.discard(self.username)

        # Keep the slots that:
        # - belong to another user
        # - are tied to an active game
        # - have an engaged opponent (p2 set = P2 accepted the invite)
        # - are takeWins waiting for the previous game to end (p2 unknown)
        active_game_slot_ids = set(state.games.keys())
        state.queue = [
            s for s in state.queue
            if s.get("ownerId") != self.user_id
            or s.get("id") in active_game_slot_ids
            or bool(s.get("p2"))
            or bool(s.get("takeWin"))
        ]
        await self._broadcast_queue()

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return
        handler_name = self.ACTIONS.get(data.get("action"))
        if handler_name:
            await getattr(self, handler_name)(data)

    # ── Queue actions ───────────────────────────────────────────────────────

    async def _on_join(self, data):
        slot = data.get("slot") or {}
        # The client-provided _localId becomes the server ID (referenced by leave/update)
        slot["id"] = slot.get("_localId") or str(uuid.uuid4())

        # Reject stale rejoins: P1 was offline when P2 finished the game; the
        # reconnect effect fires before game_end -> the slot would reappear.
        if slot["id"] in state.completed_game_ids:
            await self.send(text_data=json.dumps({
                "type": "game_ended",
                "gameId": slot["id"],
            }))
            return

        slot["ownerId"] = self.user_id
        slot["type"] = "taken"
        await self._commit_slot(slot)

    async def _commit_slot(self, slot):
        slot_id = slot["id"]
        existing = next((s for s in state.queue if s.get("id") == slot_id), None)
        if existing:
            for field in ("p2", "player1", "player2", "player1_teammate",
                          "player2_teammate", "team1", "team2"):
                if existing.get(field) and not slot.get(field):
                    slot[field] = existing[field]
        state.queue = [s for s in state.queue if s.get("id") != slot_id]
        created_at = slot.get("createdAt") or 0
        insert_idx = len(state.queue)
        for i, s in enumerate(state.queue):
            if (s.get("createdAt") or 0) > created_at:
                insert_idx = i
                break
        state.queue.insert(insert_idx, slot)

        g = self._slot_to_game(slot)
        if g["player1"] and g["player2"]:
            await self._ensure_reservation_for_game(g)
            await self._broadcast_bet_market(g)

        # If this takeWin was just completed (teammate accepted) and its parent
        # match is already over, send the winner(s) the invite stored when the
        # parent match ended (the team was incomplete then).
        if slot.get("takeWin") and not slot.get("p2") and self._takewin_team_ready(slot):
            parent = slot.get("parentSlotId")
            res = state.takewin_pending_results.get(parent)
            if res and res.get("match_type") == slot.get("match_type", "SOLO"):
                state.takewin_pending_results.pop(parent, None)
                await self._send_win_invites(slot, res["winner"], res.get("winner_teammate"))

        await self._broadcast_queue()

    async def _on_leave(self, data):
        slot_id = data.get("slotId")
        leaving_slot = next(
            (s for s in state.queue if s.get("id") == slot_id and s.get("ownerId") == self.user_id),
            None,
        )
        state.queue = [
            s for s in state.queue
            if not (s.get("id") == slot_id and s.get("ownerId") == self.user_id)
        ]
        if leaving_slot:
            # Mark the slot terminal: prevents re-adding it via a late re-`join`
            # (reconnection of a participant whose front-end kept the slot).
            state.completed_game_ids.add(slot_id)
            await self._cancel_win_invites_for_slots({slot_id})
            # Targets already warned by invite_cancelled -> excluded from match_cancelled.
            invited = (await self._cancel_invites_for_slots({slot_id})).get(slot_id, set())
            cancel_id = str(uuid.uuid4())
            for participant in self._slot_participants(leaving_slot, {self.username} | invited):
                await self._notify(
                    participant,
                    {"type": "match_cancelled_msg", "cancelledBy": self.username, "cancelId": cancel_id},
                    {"match_cancelled": True, "cancelledBy": self.username,
                     "slotId": leaving_slot.get("id"), "cancelId": cancel_id},
                )
            await self._cascade_cancel_takewins(leaving_slot.get("id"), leaving_slot.get("match_type", "SOLO"))
            await self._close_bets_for_slot(leaving_slot)
        await self._broadcast_queue()

    async def _on_update(self, data):
        slot_id = data.get("slotId")
        updates = data.get("updates") or {}
        for slot in state.queue:
            if slot.get("id") == slot_id and slot.get("ownerId") == self.user_id:
                slot.update(updates)
                break
        await self._broadcast_queue()

    async def _on_game_open(self, data):
        game_id    = data.get("gameId")
        player1    = data.get("player1")
        player2    = data.get("player2")
        match_type = data.get("match_type", "SOLO")
        if not (game_id and player1 and player2):
            return

        # Authoritative guard: a participant may have been deleted/deactivated
        # between the reservation and the launch. We refuse to start a game with
        # a non-existent account, purge the slot and warn both players (the
        # "play" button disappears on the front via game_ended).
        participants = {player1, player2,
                        data.get("player1_teammate"),
                        data.get("player2_teammate")} - {None}
        active = await self._filter_active_usernames(participants)
        if active != participants:
            slot = next((s for s in state.queue if s.get("id") == game_id), None)
            if slot:
                await self._close_bets_for_slot(slot)
            state.queue = [s for s in state.queue if s.get("id") != game_id]
            state.games.pop(game_id, None)
            state.completed_game_ids.add(game_id)
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "game_ended_msg", "gameId": game_id,
                 "winner": None, "winner_teammate": None},
            )
            await self._broadcast_queue()
            return

        if game_id not in state.games:
            state.games[game_id] = {
                "player1": player1,
                "player2": player2,
                "player1_teammate": data.get("player1_teammate"),
                "player2_teammate": data.get("player2_teammate"),
                "match_type": match_type,
                "scoreRed": 0,
                "scoreBlue": 0,
                "gamellesRed": 0,
                "gamellesBlue": 0,
                "demisRed": 0,
                "demisBlue": 0,
                "startTime": int(time.time() * 1000),
            }
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "game_state_msg", "game": {**state.games[game_id], "gameId": game_id}},
        )
        # Push the "live" flag to all clients immediately
        await self._broadcast_queue()
        await self._ensure_reservation_for_game(state.games[game_id])
        await self._broadcast_bet_market(state.games[game_id])

    async def _on_score_update(self, data):
        game_id = data.get("gameId")
        if not (game_id and game_id in state.games):
            return
        g = state.games[game_id]
        g["scoreRed"]  = data.get("scoreRed", 0)
        g["scoreBlue"] = data.get("scoreBlue", 0)
        for key in ("gamellesRed", "gamellesBlue", "demisRed", "demisBlue"):
            if data.get(key) is not None:
                g[key] = data[key]
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "game_state_msg", "game": {**state.games[game_id], "gameId": game_id}},
        )
        await self._broadcast_bet_market(state.games[game_id])

    async def _on_game_end(self, data):
        game_id = data.get("gameId")
        # completed=True only via signalGameEnd (official match end). closeGame
        # omits it -> avoids inviting the leader of an ongoing match.
        is_completed    = data.get("completed", False)
        winner          = data.get("winner") or None
        winner_teammate = data.get("winner_teammate") or None
        g = None
        if game_id and game_id in state.games:
            g = state.games[game_id]
            if not winner:
                if g.get("scoreBlue", 0) > g.get("scoreRed", 0):
                    winner          = g.get("player1")
                    winner_teammate = g.get("player1_teammate")
                elif g.get("scoreRed", 0) > g.get("scoreBlue", 0):
                    winner          = g.get("player2")
                    winner_teammate = g.get("player2_teammate")
            # Warn offline participants so they leave the activeGame on reconnect
            for pf in ("player1", "player2", "player1_teammate", "player2_teammate"):
                p = g.get(pf)
                if p and p not in state.online_users:
                    state.pending_invites.setdefault(p, []).append({
                        "game_ended": True,
                        "gameId":          game_id,
                        "winner":          winner,
                        "winner_teammate": winner_teammate,
                    })
            del state.games[game_id]
        # Remove the finished slot
        if game_id:
            state.queue = [s for s in state.queue if s.get("id") != game_id]
            state.completed_game_ids.add(game_id)
            if len(state.completed_game_ids) > 10000:
                state.completed_game_ids.pop()
        # Invite the winner(s) -- only if the match is officially over
        if winner and is_completed:
            ended_match_type = data.get("match_type") or (g.get("match_type", "SOLO") if g else "SOLO")
            for slot in state.queue:
                if (slot.get("takeWin") and not slot.get("p2")
                        and slot.get("match_type", "SOLO") == ended_match_type
                        and slot.get("parentSlotId") == game_id):
                    if self._takewin_team_ready(slot):
                        await self._send_win_invites(slot, winner, winner_teammate)
                    else:
                        # takeWin team incomplete (teammate hasn't accepted yet):
                        # store the result to invite the winner(s) as soon as the
                        # team is ready (cf. _commit_slot).
                        state.takewin_pending_results[game_id] = {
                            "winner":          winner,
                            "winner_teammate": winner_teammate,
                            "match_type":      ended_match_type,
                        }
        if g:
            closed_id = await self._close_reservation_for_game(g, refund=not is_completed)
            if closed_id:
                await self.channel_layer.group_send(
                    "bets", {"type": "market_closed_msg", "reservation_id": closed_id}
                )
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "game_ended_msg", "gameId": game_id, "winner": winner, "winner_teammate": winner_teammate},
        )
        await self._broadcast_queue()

    async def _send_win_invites(self, slot, winner, winner_teammate):
        """Build and send the "take-the-winner" invitation to a slot's winner(s)."""
        invite_id = str(uuid.uuid4())
        win_targets = [t for t in [winner, winner_teammate] if t]
        state.win_invites[invite_id] = {
            "slotId":   slot["id"],
            "targets":  win_targets,
            "accepted": [],
            "owner":    slot.get("p1"),
        }
        for target in win_targets:
            inv_payload = {
                "inviteId": invite_id,
                "from":     slot.get("p1"),
                "slot":     slot,
                "slotId":   slot["id"],
            }
            # Always persisted for redelivery on reconnect; additionally
            # delivered live if the target is connected.
            state.pending_invites.setdefault(target, []).append(
                {"win_invite": True, **inv_payload}
            )
            if target in state.online_users:
                await self.channel_layer.group_send(
                    f"user_{target}",
                    {"type": "win_invite_msg", **inv_payload},
                )

    # ── Invitations ─────────────────────────────────────────────────────────

    async def _on_invite(self, data):
        target    = data.get("target")   # P2's username
        invite_id = data.get("inviteId") or str(uuid.uuid4())
        slot      = data.get("slot") or {}
        if not target:
            return
        # Server registry: lets the slot be activated in the queue on acceptance
        # even if the inviter (P1) is offline at that moment. ownerId is P1's
        # (self here) so the slot stays attached to them.
        inv = state.invites.setdefault(invite_id, {
            "from":     self.username,
            "ownerId":  self.user_id,
            "targets":  list(slot.get("_targets") or [target]),
            "slot":     slot,
            "accepted": [],
        })
        if target not in inv["targets"]:
            inv["targets"].append(target)
        # Always persisted for redelivery on reconnect (removed on response/cancellation)
        state.pending_invites.setdefault(target, []).append({
            "inviteId": invite_id,
            "from":     self.username,
            "slot":     slot,
        })
        if target in state.online_users:
            await self.channel_layer.group_send(
                f"user_{target}",
                {"type": "invite_msg", "inviteId": invite_id, "from": self.username, "slot": slot},
            )

    async def _on_invite_response(self, data):
        invite_id = data.get("inviteId")
        accepted  = data.get("accepted", False)
        from_user = data.get("from")    # P1's username
        # Remove from the offline queue so it isn't redelivered on the next reconnect
        self._remove_pending(self.username, invite_id)

        inv = state.invites.get(invite_id)
        if not accepted:
            # A refusal cancels the invitation for everyone
            state.invites.pop(invite_id, None)
            # If it was a takeWin already present in the queue (added immediately
            # on invitation), remove the orphan slot, mark it terminal and
            # propagate the cancellation to downstream takeWins.
            if inv and (inv.get("slot") or {}).get("takeWin"):
                sid = (inv["slot"].get("_localId") or invite_id)
                if any(s.get("id") == sid for s in state.queue):
                    match_type = inv["slot"].get("match_type", "SOLO")
                    state.queue = [s for s in state.queue if s.get("id") != sid]
                    state.completed_game_ids.add(sid)
                    await self._cancel_win_invites_for_slots({sid})
                    await self._cascade_cancel_takewins(sid, match_type)
                    await self._broadcast_queue()
        elif inv:
            if self.username not in inv["accepted"]:
                inv["accepted"].append(self.username)
            # All targets accepted -> the server adds the slot to the queue
            # itself (independent of P1's connection state): every connected
            # player then sees it and can start the match.
            if len(inv["accepted"]) >= len(inv["targets"]):
                # Pop BEFORE activation: with no pending invite, _takewin_team_ready
                # sees the team as complete and can trigger the stored win-invite.
                state.invites.pop(invite_id, None)
                await self._activate_invite_slot(inv)

        if from_user:
            payload = {"inviteId": invite_id, "accepted": accepted, "responder": self.username}
            await self._notify(
                from_user,
                {"type": "invite_response_msg", **payload},
                {"invite_response": True, **payload},
            )

    async def _activate_invite_slot(self, inv):
        """Add the slot of an accepted direct invitation to the queue.

        Server-side mirror of what P1's client used to do on acceptance, but
        without depending on their connection. "tournament_teammate" invitations
        (a plain notification) do not join the queue.
        """
        slot = dict(inv["slot"])
        if slot.get("type") == "tournament_teammate":
            return
        slot["id"] = slot.get("_localId") or slot.get("id") or str(uuid.uuid4())
        if slot["id"] in state.completed_game_ids:
            return
        slot["ownerId"] = inv.get("ownerId")
        slot["type"] = "taken"
        await self._commit_slot(slot)

    async def _on_cancel_invite(self, data):
        target    = data.get("target")
        invite_id = data.get("inviteId")
        if not target:
            return
        inv = state.invites.pop(invite_id, None)
        self._remove_pending(target, invite_id)
        await self.channel_layer.group_send(
            f"user_{target}",
            {"type": "cancel_invite_msg", "inviteId": invite_id},
        )
        # If the invite carried a takeWin added to the queue immediately (inviter
        # side), remove the orphan slot, mark it terminal and propagate the
        # cancellation to downstream takeWins.
        if inv and (inv.get("slot") or {}).get("takeWin"):
            sid = inv["slot"].get("_localId") or invite_id
            if any(s.get("id") == sid for s in state.queue):
                match_type = inv["slot"].get("match_type", "SOLO")
                state.queue = [s for s in state.queue if s.get("id") != sid]
                state.completed_game_ids.add(sid)
                await self._cancel_win_invites_for_slots({sid})
                await self._cascade_cancel_takewins(sid, match_type)
                await self._broadcast_queue()

    async def _on_win_claim_response(self, data):
        invite_id = data.get("inviteId")
        accepted  = data.get("accepted", False)
        invite    = state.win_invites.get(invite_id)
        if not invite:
            return
        slot_id = invite["slotId"]
        self._remove_pending(self.username, invite_id)

        if not accepted:
            # Winner refuses -> cancel the takeWin slot
            cancelled_slot = next((s for s in state.queue if s.get("id") == slot_id), None)
            cancelled_match_type = (cancelled_slot.get("match_type", "SOLO") if cancelled_slot else "SOLO")
            state.queue = [s for s in state.queue if s.get("id") != slot_id]
            # Mark the slot terminal: prevents re-adding it if the owner (P3)
            # reconnects and their front-end re-`join`s its local slots.
            state.completed_game_ids.add(slot_id)
            # Cancel the win_invite for ALL co-winners (online and offline), not
            # only the connected ones.
            await self._cancel_win_invites_for_slots({slot_id})
            await self._notify(
                invite["owner"],
                {"type": "win_claim_declined_msg", "slotId": slot_id},
                {"win_claim_declined": True, "slotId": slot_id},
            )
            # Also notify the takeWin slot's teammates (e.g. P6 in 2v2), not only
            # its owner P5.
            if cancelled_slot:
                for mate in self._slot_participants(cancelled_slot, {invite["owner"]}):
                    await self._notify(
                        mate,
                        {"type": "win_claim_declined_msg", "slotId": slot_id},
                        {"win_claim_declined": True, "slotId": slot_id},
                    )
            await self._cascade_cancel_takewins(slot_id, cancelled_match_type)
            await self._broadcast_queue()
            return

        # Accepted -- record it
        if self.username not in invite["accepted"]:
            invite["accepted"].append(self.username)
        if len(invite["accepted"]) >= len(invite["targets"]):
            target_slot = next((s for s in state.queue if s.get("id") == slot_id), None)
            if target_slot:
                self._fill_winner_into_slot(target_slot, invite["targets"])
            del state.win_invites[invite_id]
            await self._broadcast_queue()

    @staticmethod
    def _fill_winner_into_slot(target_slot, targets):
        """Place the accepted winner(s) into the free side of the takeWin slot."""
        w    = targets[0]
        w_tm = targets[1] if len(targets) > 1 else None
        target_slot["p2"] = w  # p2 = displayed opponent
        if target_slot.get("player1") is None:
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

    async def _on_leave_as_p2(self, data):
        slot_id = data.get("slotId")
        target_slot = next((s for s in state.queue if s.get("id") == slot_id), None)
        state.queue = [s for s in state.queue if s.get("id") != slot_id]
        if target_slot:
            # Mark the slot terminal: prevents re-adding it if the owner (P1)
            # reconnects and their front-end re-`join`s its local slots.
            state.completed_game_ids.add(slot_id)
            owner_username = target_slot.get("p1")
            if owner_username:
                await self._notify(
                    owner_username,
                    {"type": "p2_left_msg", "slotId": slot_id, "cancelledBy": self.username},
                    {"p2_left": True, "slotId": slot_id, "cancelledBy": self.username},
                )
            await self._cancel_win_invites_for_slots({slot_id})
            # Targets already warned by invite_cancelled -> excluded from match_cancelled.
            invited = (await self._cancel_invites_for_slots({slot_id})).get(slot_id, set())
            cancel_id = str(uuid.uuid4())
            for participant in self._slot_participants(target_slot, {self.username, owner_username} | invited):
                await self._notify(
                    participant,
                    {"type": "match_cancelled_msg", "cancelledBy": self.username, "cancelId": cancel_id},
                    {"match_cancelled": True, "cancelledBy": self.username,
                     "slotId": slot_id, "cancelId": cancel_id},
                )
            await self._cascade_cancel_takewins(target_slot.get("id"), target_slot.get("match_type", "SOLO"))
            await self._close_bets_for_slot(target_slot)
        await self._broadcast_queue()

    # ── Internal helpers ────────────────────────────────────────────────────

    async def _cancel_win_invites_for_slots(self, slot_ids):
        """Cancel (server + clients, online AND offline) the pending win_invites
        whose slotId is in slot_ids.

        Prevents a winner from keeping a "take-the-winner" invitation to a slot
        that was just removed from the queue (owner left, cancellation...).
        """
        stale_invite_ids = [k for k, v in state.win_invites.items() if v["slotId"] in slot_ids]
        for inv_id in stale_invite_ids:
            inv = state.win_invites.pop(inv_id, None)
            if not inv:
                continue
            for t in inv.get("targets", []):
                # Remove the stale win_invite from the offline queue (leaving the others)
                if t in state.pending_invites:
                    state.pending_invites[t] = [
                        i for i in state.pending_invites[t]
                        if not (i.get("win_invite") and i.get("inviteId") == inv_id)
                    ]
                    if not state.pending_invites[t]:
                        del state.pending_invites[t]
                if t in state.online_users:
                    await self.channel_layer.group_send(
                        f"user_{t}",
                        {"type": "cancel_invite_msg", "inviteId": inv_id},
                    )

    async def _cancel_invites_for_slots(self, slot_ids):
        """Cancel the PENDING direct (teammate) invitations whose slot is in
        slot_ids: the target(s) must not keep an invitation to join a slot that
        was just removed from the queue.

        For a takeWin, the inviteId == the slot id (== _localId), so the
        invitation is found directly by the slot id.

        Returns {slot_id: set(notified targets)} to allow deduplicating
        notifications (don't also send a match_cancelled to a target already
        warned by invite_cancelled).
        """
        notified = {}
        for sid in slot_ids:
            inv = state.invites.pop(sid, None)
            if not inv:
                continue
            targets = set()
            for target in inv.get("targets", []):
                self._remove_pending(target, sid)
                targets.add(target)
                if target in state.online_users:
                    await self.channel_layer.group_send(
                        f"user_{target}",
                        {"type": "cancel_invite_msg", "inviteId": sid},
                    )
            if targets:
                notified[sid] = targets
        return notified

    async def _cascade_cancel_takewins(self, cancelled_slot_id, match_type):
        """Cancel only the takeWins that depend DIRECTLY on cancelled_slot_id
        (parentSlotId == cancelled_slot_id), then recurse.

        This way only the downstream slots (Match 4+) are cancelled when Match 3
        is removed, without touching the upstream (Match 2). Applies to SOLO and
        TEAM.
        """
        to_cancel = [
            s for s in state.queue
            if s.get("takeWin") and not s.get("p2")
            and s.get("match_type", "SOLO") == match_type
            and s.get("parentSlotId") == cancelled_slot_id
        ]
        if not to_cancel:
            return
        cancel_ids = {s["id"] for s in to_cancel}
        state.queue = [s for s in state.queue if s.get("id") not in cancel_ids]
        # Mark these slots terminal: prevents re-adding them if an owner
        # reconnects and their front-end re-`join`s its local slots.
        state.completed_game_ids |= cancel_ids
        # Cancel the win_invites AND the pending teammate invitations of these slots
        await self._cancel_win_invites_for_slots(cancel_ids)
        invited_by_slot = await self._cancel_invites_for_slots(cancel_ids)
        # Notify the owner AND their teammates, then recurse into the dependents.
        # Same cancelId for all -> the front-end dedup (seenCancelIds) stays
        # correct (each client is a distinct user, it only sees its own notif).
        for slot in to_cancel:
            owner = slot.get("p1")
            slot_id = slot.get("id")
            cancel_id = str(uuid.uuid4())
            # Targets already warned by invite_cancelled -> excluded from match_cancelled.
            already = invited_by_slot.get(slot_id, set())
            for recipient in ({owner} | self._slot_participants(slot, {owner})) - already:
                await self._notify(
                    recipient,
                    {"type": "match_cancelled_msg", "cancelledBy": "", "slotId": slot_id, "chain": True, "cancelId": cancel_id},
                    {"match_cancelled": True, "cancelledBy": "", "slotId": slot_id, "chain": True, "cancelId": cancel_id},
                )
            await self._cascade_cancel_takewins(slot_id, match_type)

    async def _notify(self, username, online_event, offline_payload):
        """Deliver a message to `username`: live if they are connected, otherwise
        stored in pending_invites for redelivery on their next connection."""
        if not username:
            return
        if username in state.online_users:
            await self.channel_layer.group_send(f"user_{username}", online_event)
        else:
            state.pending_invites.setdefault(username, []).append(offline_payload)

    @staticmethod
    def _remove_pending(username, invite_id):
        """Remove invitation `invite_id` from a user's offline queue (so it isn't
        redelivered on reconnect)."""
        if username in state.pending_invites:
            state.pending_invites[username] = [
                i for i in state.pending_invites[username]
                if i.get("inviteId") != invite_id
            ]
            if not state.pending_invites[username]:
                del state.pending_invites[username]

    @staticmethod
    def _takewin_team_ready(slot):
        """A 2v2 (TEAM) takeWin is only "ready" once its teammate invitation is
        no longer pending (the teammate accepted -> the invite was removed from
        state.invites). A 1v1 (SOLO) takeWin is always ready (no teammate).

        Server-side source of truth: immune to a stale front-end flag sent back
        by a re-`join` on reconnection.
        """
        if slot.get("match_type", "SOLO") == "TEAM":
            return slot.get("id") not in state.invites
        return True

    @staticmethod
    def _slot_participants(slot, exclude=()):
        """Usernames of a slot's co-participants (p2 + teammates + teams),
        excluding those present in `exclude`."""
        exclude = set(exclude)
        out = set()
        for field in ("p2", "player1_teammate", "player2_teammate"):
            val = slot.get(field)
            if val and val not in exclude:
                out.add(val)
        for team_key in ("team1", "team2"):
            for p in (slot.get(team_key) or []):
                if p and p not in exclude:
                    out.add(p)
        return out
