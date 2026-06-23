"""
Consumer WebSocket du salon « file d'attente » (ws/queue/).

Gère la file live, le cycle de vie des parties, les invitations (directes et
« take-the-winner »), et la livraison différée aux joueurs hors-ligne.

Organisation (l'état partagé est dans realtime/state.py, accédé via `state.*`) :
  - QueueSerializeMixin : construction/diffusion du snapshot de la file
  - QueueBetsMixin      : pont avec les paris (réservations + cotes)
  - QueueHandlersMixin  : handlers `*_msg` (traduction event interne → JSON front)
  - ce fichier          : connect/disconnect + dispatch `receive` → `_on_<action>`

Chaque message du front {"action": "..."} est routé par la table ACTIONS vers la
méthode `_on_<action>` correspondante.
"""
import json
import time
import uuid

from channels.generic.websocket import AsyncWebsocketConsumer

from realtime import state
from realtime.consumers._queue_serialize import QueueSerializeMixin
from realtime.consumers._queue_bets import QueueBetsMixin
from realtime.consumers._queue_handlers import QueueHandlersMixin

# Re-export de compat : bets/services.py fait
# `from realtime.consumers.queue import games`. Le dict est muté en place (jamais
# réassigné) → cet import partage la même instance que state.games.
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

    # ── Cycle de vie ────────────────────────────────────────────────────────

    async def connect(self):
        self.user_id = None
        self.username = ""
        if not self.scope["user"].is_authenticated:
            await self.close()
            return

        self.user_id = state.identity_from_scope(self.scope, self.channel_name)
        self.username = state.username_from_scope(self.scope)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        # Groupe personnel pour les messages directs (invitations, réponses)
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
        # Restaure l'état de partie si ce joueur est dans une partie active (reco / late join)
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
        """Livre les messages stockés pendant que ce joueur était hors-ligne.

        Les notifications one-shot (match_cancelled, win_claim_declined…) sont
        consommées à la livraison ; les invitations (directe / win) sont gardées
        jusqu'à réponse ou annulation (elles survivent à plusieurs reconnexions).
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

        # On garde les slots qui :
        # - appartiennent à un autre user
        # - sont liés à une partie active
        # - ont un adversaire engagé (p2 défini = J2 a accepté l'invite)
        # - sont des takeWin en attente de la fin de la partie précédente (p2 inconnu)
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

    # ── Actions de la file ──────────────────────────────────────────────────

    async def _on_join(self, data):
        slot = data.get("slot") or {}
        # L'_localId fourni par le client devient l'ID serveur (référencé par leave/update)
        slot["id"] = slot.get("_localId") or str(uuid.uuid4())

        # Rejet des rejoin obsolètes : J1 était hors-ligne quand J2 a fini la partie ;
        # l'effet de reconnexion se déclenche avant le game_end → le slot réapparaît.
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

        # Si ce takeWin vient d'être complété (coéquipier accepté) et que son match
        # parent est déjà terminé, on envoie maintenant l'invitation au(x) gagnant(s)
        # mémorisée à la fin du match parent (équipe alors incomplète).
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
            # Marque le slot terminal : empêche son ré-ajout via un re-`join`
            # tardif (reconnexion d'un participant dont le front a gardé le slot).
            state.completed_game_ids.add(slot_id)
            await self._cancel_win_invites_for_slots({slot_id})
            # Cibles déjà prévenues par invite_cancelled → exclues du match_cancelled.
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
        # Pousse le flag « live » à tous les clients immédiatement
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
        # completed=True seulement via signalGameEnd (fin officielle de match).
        # closeGame l'omet → évite d'inviter le leader d'un match en cours.
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
            # Prévient les participants hors-ligne pour qu'ils sortent de l'activeGame à la reco
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
        # Supprime le créneau terminé
        if game_id:
            state.queue = [s for s in state.queue if s.get("id") != game_id]
            state.completed_game_ids.add(game_id)
            if len(state.completed_game_ids) > 10000:
                state.completed_game_ids.pop()
        # Invite le/les gagnant(s) — seulement si le match est officiellement terminé
        if winner and is_completed:
            ended_match_type = data.get("match_type") or (g.get("match_type", "SOLO") if g else "SOLO")
            for slot in state.queue:
                if (slot.get("takeWin") and not slot.get("p2")
                        and slot.get("match_type", "SOLO") == ended_match_type
                        and slot.get("parentSlotId") == game_id):
                    if self._takewin_team_ready(slot):
                        await self._send_win_invites(slot, winner, winner_teammate)
                    else:
                        # Équipe takeWin incomplète (coéquipier pas encore accepté) :
                        # on mémorise le résultat pour inviter le(s) gagnant(s) dès
                        # que l'équipe sera prête (cf. _commit_slot).
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
        """Crée et envoie l'invitation « take-the-winner » au(x) gagnant(s) d'un slot."""
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
            # Toujours persisté pour re-livraison à la reconnexion ;
            # en plus, livraison live si la cible est connectée.
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
        target    = data.get("target")   # pseudo de J2
        invite_id = data.get("inviteId") or str(uuid.uuid4())
        slot      = data.get("slot") or {}
        if not target:
            return
        # Registre serveur : permet d'activer le créneau dans la file à
        # l'acceptation même si l'invitant (J1) est hors-ligne à ce moment-là.
        # L'ownerId est celui de J1 (self ici) pour que le slot lui reste rattaché.
        inv = state.invites.setdefault(invite_id, {
            "from":     self.username,
            "ownerId":  self.user_id,
            "targets":  list(slot.get("_targets") or [target]),
            "slot":     slot,
            "accepted": [],
        })
        if target not in inv["targets"]:
            inv["targets"].append(target)
        # Toujours persisté pour re-livraison à la reco (retiré à la réponse/annulation)
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
        from_user = data.get("from")    # pseudo de J1
        # Retire de la file hors-ligne pour ne pas re-livrer à la prochaine reco
        self._remove_pending(self.username, invite_id)

        inv = state.invites.get(invite_id)
        if not accepted:
            # Un refus annule l'invitation pour tout le monde
            state.invites.pop(invite_id, None)
            # Si c'était un takeWin déjà présent dans la file (ajout immédiat à
            # l'invitation), on retire le créneau orphelin, on le marque terminal
            # et on propage l'annulation aux takeWin en aval.
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
            # Toutes les cibles ont accepté → le serveur ajoute lui-même le
            # créneau à la file (indépendant de l'état de connexion de J1) : tout
            # joueur connecté le voit alors et peut lancer le match.
            if len(inv["accepted"]) >= len(inv["targets"]):
                # Pop AVANT activation : sans invite en attente, _takewin_team_ready
                # voit l'équipe comme complète et peut déclencher le win-invite mémorisé.
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
        """Ajoute le créneau d'une invitation directe acceptée à la file.

        Mirroir serveur de ce que faisait le client de J1 à l'acceptation, mais
        sans dépendre de sa connexion. Les invitations « tournament_teammate »
        (simple notification) ne rejoignent pas la file.
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
        # Si l'invite portait un takeWin ajouté immédiatement à la file (côté
        # inviteur), retirer le créneau orphelin, le marquer terminal et propager
        # l'annulation aux takeWin en aval.
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
            # Gagnant refuse → annuler le créneau takeWin
            cancelled_slot = next((s for s in state.queue if s.get("id") == slot_id), None)
            cancelled_match_type = (cancelled_slot.get("match_type", "SOLO") if cancelled_slot else "SOLO")
            state.queue = [s for s in state.queue if s.get("id") != slot_id]
            # Marque le slot comme terminal : empêche son ré-ajout si le proprio
            # (J3) se reconnecte et que son front re-`join` ses slots locaux.
            state.completed_game_ids.add(slot_id)
            # Annule le win_invite pour TOUS les co-gagnants (en ligne et hors-ligne),
            # pas seulement ceux connectés.
            await self._cancel_win_invites_for_slots({slot_id})
            await self._notify(
                invite["owner"],
                {"type": "win_claim_declined_msg", "slotId": slot_id},
                {"win_claim_declined": True, "slotId": slot_id},
            )
            # Notifie aussi les coéquipiers du créneau takeWin (ex. J6 en 2v2),
            # pas seulement son propriétaire J5.
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

        # Accepté — enregistrer
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
        """Place le(s) gagnant(s) accepté(s) dans le camp libre du créneau takeWin."""
        w    = targets[0]
        w_tm = targets[1] if len(targets) > 1 else None
        target_slot["p2"] = w  # p2 = adversaire affiché
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
            # Marque le slot terminal : empêche son ré-ajout si le proprio (J1)
            # se reconnecte et que son front re-`join` ses slots locaux.
            state.completed_game_ids.add(slot_id)
            owner_username = target_slot.get("p1")
            if owner_username:
                await self._notify(
                    owner_username,
                    {"type": "p2_left_msg", "slotId": slot_id, "cancelledBy": self.username},
                    {"p2_left": True, "slotId": slot_id, "cancelledBy": self.username},
                )
            await self._cancel_win_invites_for_slots({slot_id})
            # Cibles déjà prévenues par invite_cancelled → exclues du match_cancelled.
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

    # ── Helpers internes ────────────────────────────────────────────────────

    async def _cancel_win_invites_for_slots(self, slot_ids):
        """Annule (serveur + clients, en ligne ET hors-ligne) les win_invites en
        attente dont le slotId est dans slot_ids.

        Empêche qu'un gagnant garde une invitation « reprise de gagne » vers un
        créneau qui vient d'être retiré de la file (départ du proprio, annulation…).
        """
        stale_invite_ids = [k for k, v in state.win_invites.items() if v["slotId"] in slot_ids]
        for inv_id in stale_invite_ids:
            inv = state.win_invites.pop(inv_id, None)
            if not inv:
                continue
            for t in inv.get("targets", []):
                # Retire le win_invite obsolète de la file hors-ligne (sans toucher aux autres)
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
        """Annule les invitations directes (coéquipier) EN ATTENTE dont le créneau
        est dans slot_ids : la/les cible(s) ne doivent pas garder une invitation à
        rejoindre un créneau qui vient d'être retiré de la file.

        Pour un takeWin, l'inviteId == l'id du slot (== _localId), donc on retrouve
        l'invitation directement par l'id du créneau.

        Retourne {slot_id: set(cibles notifiées)} pour permettre la déduplication
        des notifications (ne pas envoyer aussi un match_cancelled à une cible déjà
        prévenue par invite_cancelled).
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
        """Annule uniquement les takeWin qui dépendent DIRECTEMENT de
        cancelled_slot_id (parentSlotId == cancelled_slot_id), puis récurse.

        Ainsi seuls les slots en aval (Match 4+) sont annulés quand le Match 3
        est retiré, sans toucher l'amont (Match 2). Vaut pour SOLO et TEAM.
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
        # Marque ces slots comme terminaux : empêche leur ré-ajout si un proprio
        # se reconnecte et que son front re-`join` ses slots locaux.
        state.completed_game_ids |= cancel_ids
        # Annule les win_invites ET les invitations coéquipier en attente de ces slots
        await self._cancel_win_invites_for_slots(cancel_ids)
        invited_by_slot = await self._cancel_invites_for_slots(cancel_ids)
        # Notifie le propriétaire ET ses coéquipiers, puis récurse dans les dépendants.
        # Même cancelId pour tous → la dédup côté front (seenCancelIds) reste correcte
        # (chaque client est un user distinct, il ne voit que sa propre notif).
        for slot in to_cancel:
            owner = slot.get("p1")
            slot_id = slot.get("id")
            cancel_id = str(uuid.uuid4())
            # Cibles déjà prévenues par invite_cancelled → exclues du match_cancelled.
            already = invited_by_slot.get(slot_id, set())
            for recipient in ({owner} | self._slot_participants(slot, {owner})) - already:
                await self._notify(
                    recipient,
                    {"type": "match_cancelled_msg", "cancelledBy": "", "slotId": slot_id, "chain": True, "cancelId": cancel_id},
                    {"match_cancelled": True, "cancelledBy": "", "slotId": slot_id, "chain": True, "cancelId": cancel_id},
                )
            await self._cascade_cancel_takewins(slot_id, match_type)

    async def _notify(self, username, online_event, offline_payload):
        """Livre un message à `username` : en live s'il est connecté, sinon
        stocké dans pending_invites pour re-livraison à sa prochaine connexion."""
        if not username:
            return
        if username in state.online_users:
            await self.channel_layer.group_send(f"user_{username}", online_event)
        else:
            state.pending_invites.setdefault(username, []).append(offline_payload)

    @staticmethod
    def _remove_pending(username, invite_id):
        """Retire de la file hors-ligne d'un user l'invitation `invite_id`
        (pour qu'elle ne soit pas re-livrée à la reconnexion)."""
        if username in state.pending_invites:
            state.pending_invites[username] = [
                i for i in state.pending_invites[username]
                if i.get("inviteId") != invite_id
            ]
            if not state.pending_invites[username]:
                del state.pending_invites[username]

    @staticmethod
    def _takewin_team_ready(slot):
        """Un takeWin 2v2 (TEAM) n'est « prêt » que lorsque son invitation coéquipier
        n'est plus en attente (le coéquipier a accepté → l'invite a été retirée de
        state.invites). Un takeWin 1v1 (SOLO) est toujours prêt (pas de coéquipier).

        Source de vérité côté serveur : insensible à un flag front périmé renvoyé
        par un re-`join` à la reconnexion.
        """
        if slot.get("match_type", "SOLO") == "TEAM":
            return slot.get("id") not in state.invites
        return True

    @staticmethod
    def _slot_participants(slot, exclude=()):
        """Pseudos des co-participants d'un créneau (p2 + équipiers + équipes),
        en excluant ceux présents dans `exclude`."""
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
