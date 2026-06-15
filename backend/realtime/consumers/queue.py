import json
import uuid
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from planning.models import QueueEntry

queue = []
games = {}         # gameId -> { player1, player2, scoreRed, scoreBlue }
win_invites = {}   # inviteId -> { slotId, targets, accepted, owner }
online_users = set()           # usernames currently connected
pending_invites = {}           # username -> list of stored invites for offline users


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
        return sorted(merged, key=lambda slot: slot.get("createdAt") or 0)

    async def connect(self):
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
        # Deliver messages that were sent while this user was offline
        if self.username and self.username in pending_invites:
            for inv in pending_invites.pop(self.username):
                if inv.get("match_cancelled"):
                    await self.send(text_data=json.dumps({
                        "type": "match_cancelled",
                        "cancelledBy": inv.get("cancelledBy", ""),
                        "slotId":      inv.get("slotId"),
                        "chain":       inv.get("chain", False),
                    }))
                elif inv.get("win_claim_declined"):
                    await self.send(text_data=json.dumps({
                        "type": "win_claim_declined",
                        "slotId": inv["slotId"],
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
        queue = [s for s in queue if s.get("ownerId") != self.user_id]
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
            slot["ownerId"] = self.user_id
            slot["type"] = "taken"
            # Insert at correct position based on createdAt so invite-delayed slots
            # land before slots created later (FIFO by original creation time)
            created_at = slot.get("createdAt") or 0
            insert_idx = len(queue)
            for i, s in enumerate(queue):
                if (s.get("createdAt") or 0) > created_at:
                    insert_idx = i
                    break
            queue.insert(insert_idx, slot)

            g = self._slot_to_game(slot)
            if g["player1"] and g["player2"]:
                await self._ensure_reservation_for_game(g)
                await self._broadcast_bet_market(g)

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
                await self._cascade_cancel_takewins(leaving_slot.get("id"), leaving_slot.get("match_type", "SOLO"))
                await self._close_bets_for_slot(leaving_slot)

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
                    }
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "game_state_msg", "game": {**games[game_id], "gameId": game_id}},
                )
                await self._ensure_reservation_for_game(games[game_id])
                await self._broadcast_bet_market(games[game_id])
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
                await self._broadcast_bet_market(games[game_id])
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
                del games[game_id]
            # Supprime le créneau terminé
            if game_id:
                queue = [s for s in queue if s.get("id") != game_id]
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
                            if target in online_users:
                                await self.channel_layer.group_send(
                                    f"user_{target}",
                                    {"type": "win_invite_msg", **inv_payload},
                                )
                            else:
                                pending_invites.setdefault(target, []).append(
                                    {"win_invite": True, **inv_payload}
                                )
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
                if target not in online_users:
                    # Store for delivery when target comes online
                    pending_invites.setdefault(target, []).append({
                        "inviteId": invite_id,
                        "from":     self.username,
                        "slot":     slot,
                    })
                else:
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
            if target_slot:
                await self._cascade_cancel_takewins(target_slot.get("id"), target_slot.get("match_type", "SOLO"))
                await self._close_bets_for_slot(target_slot)
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
                    await self.channel_layer.group_send(
                        f"user_{t}",
                        {"type": "cancel_invite_msg", "inviteId": inv_id},
                    )
        # Notify each slot owner, then recurse into their dependents
        for slot in to_cancel:
            owner = slot.get("p1")
            slot_id = slot.get("id")
            if owner:
                payload = {"type": "match_cancelled_msg", "cancelledBy": "", "slotId": slot_id, "chain": True}
                if owner in online_users:
                    await self.channel_layer.group_send(f"user_{owner}", payload)
                else:
                    pending_invites.setdefault(owner, []).append(
                        {"match_cancelled": True, "cancelledBy": "", "slotId": slot_id, "chain": True}
                    )
            await self._cascade_cancel_takewins(slot_id, match_type)

    @staticmethod
    def _slot_to_game(slot):
        """Normalise un slot de file en dict 'game' (joueurs + type)."""
        return {
            "player1": slot.get("player1") or slot.get("p1"),
            "player2": slot.get("player2") or slot.get("p2"),
            "player1_teammate": slot.get("player1_teammate"),
            "player2_teammate": slot.get("player2_teammate"),
            "match_type": slot.get("match_type", "SOLO"),
        }

    async def _close_bets_for_slot(self, slot):
        """Match retiré de la file sans être joué → ferme + rembourse ses paris."""
        g = self._slot_to_game(slot)
        if not g["player1"] or not g["player2"]:
            return
        closed_id = await self._close_reservation_for_game(g, refund=True)
        if closed_id:
            await self.channel_layer.group_send(
                "bets", {"type": "market_closed_msg", "reservation_id": closed_id}
            )

    def _game_usernames(self, game):
        return {
            game.get("player1"), game.get("player1_teammate"),
            game.get("player2"), game.get("player2_teammate"),
        } - {None}

    @database_sync_to_async
    def _ensure_reservation_for_game(self, game):
        """
        Crée la Reservation IN_PROGRESS d'une partie (fenêtre de paris) si elle
        n'existe pas déjà (dédup par joueurs, ex. path « réserver » d'Accueil).
        Pas de réservation pour les 2v1 (non pariables). Retourne l'id ou None.
        """
        from django.contrib.auth import get_user_model
        from planning.models import Reservation

        match_type = game.get("match_type", "SOLO")
        if match_type not in ("SOLO", "TEAM"):
            return None
        if not game.get("player1") or not game.get("player2"):
            return None

        unames = self._game_usernames(game)
        existing = (
            Reservation.objects
            .filter(status=Reservation.Status.IN_PROGRESS)
            .select_related("player1", "player1_teammate", "player2", "player2_teammate")
        )
        for r in existing:
            rp = {
                getattr(r.player1, "username", None),
                getattr(r.player1_teammate, "username", None),
                getattr(r.player2, "username", None),
                getattr(r.player2_teammate, "username", None),
            } - {None}
            if rp == unames:
                return str(r.id)

        User = get_user_model()
        u = lambda name: User.objects.filter(username=name).first() if name else None
        p1, p2 = u(game.get("player1")), u(game.get("player2"))
        if not p1 or not p2:
            return None
        res = Reservation.objects.create(
            match_type=match_type,
            status=Reservation.Status.IN_PROGRESS,
            player1=p1,
            player2=p2,
            player1_teammate=u(game.get("player1_teammate")),
            player2_teammate=u(game.get("player2_teammate")),
        )
        return str(res.id)

    @database_sync_to_async
    def _close_reservation_for_game(self, game, refund=False):
        """
        Ferme (DONE) la Reservation IN_PROGRESS d'une partie terminée, appariée
        par joueurs. Rembourse les paris ouverts si `refund` (partie abandonnée).
        Retourne l'id fermé ou None.
        """
        from django.utils import timezone
        from planning.models import Reservation

        unames = self._game_usernames(game)
        if not unames:
            return None
        candidates = (
            Reservation.objects
            .filter(status=Reservation.Status.IN_PROGRESS)
            .select_related("player1", "player1_teammate", "player2", "player2_teammate")
        )
        for r in candidates:
            rp = {
                getattr(r.player1, "username", None),
                getattr(r.player1_teammate, "username", None),
                getattr(r.player2, "username", None),
                getattr(r.player2_teammate, "username", None),
            } - {None}
            if rp == unames:
                r.status = Reservation.Status.DONE
                r.ended_at = timezone.now()
                r.save(update_fields=["status", "ended_at"])
                if refund:
                    from bets.services import refund_reservation
                    refund_reservation(r)
                return str(r.id)
        return None

    async def _broadcast_bet_market(self, game):
        """Pousse la cote à jour du marché de paris correspondant à cette partie."""
        try:
            payload = await self._bet_market_payload(game)
            if payload:
                await self.channel_layer.group_send(
                    "bets", {"type": "market_update_msg", "market": payload}
                )
        except Exception:
            pass

    @database_sync_to_async
    def _bet_market_payload(self, game):
        from planning.models import Reservation
        from bets.serializers import market_payload
        usernames = {
            game.get("player1"), game.get("player1_teammate"),
            game.get("player2"), game.get("player2_teammate"),
        } - {None}
        if not usernames:
            return None
        reservations = (
            Reservation.objects
            .filter(status=Reservation.Status.IN_PROGRESS)
            .filter(match_type__in=["SOLO", "TEAM"])
            .select_related(
                "player1", "player1_teammate",
                "player2", "player2_teammate",
            )
        )
        for r in reservations:
            rp = {
                getattr(r.player1, "username", None),
                getattr(r.player1_teammate, "username", None),
                getattr(r.player2, "username", None),
                getattr(r.player2_teammate, "username", None),
            } - {None}
            if rp == usernames:
                return market_payload(r)
        return None

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
