"""
Shared in-memory state of the "queue" room (real-time table football).

The whole consumer (split into mixins) relies on these structures. They live
HERE, in a single module, so every file shares EXACTLY the same instance.

Golden rule: always reach these objects through `state.queue`, `state.games`...
(never `from realtime.state import queue`). Otherwise a reassignment of `queue`
in one file would not be visible to the others (the classic Python globals trap).
With `state.queue = [...]`, the single shared attribute is mutated in place.

Runtime assumption: a single Daphne process serves HTTP + WebSocket, so this
in-memory state stays consistent. Cross-client delivery goes through Redis
(channels).
"""

# Live queue: list of "slots" (dicts). REASSIGNED -> always via state.queue.
queue = []

# gameId -> {player1, player2, player1_teammate, player2_teammate,
#            match_type, scoreRed, scoreBlue, startTime}
games = {}

# inviteId -> {slotId, targets, accepted, owner}  ("take-the-winner" invites)
win_invites = {}

# inviteId -> {from, ownerId, targets, slot, accepted}  (direct invites)
# Lets the slot be activated on acceptance even if the inviter (P1) is offline
# at that moment.
invites = {}

# usernames currently connected
online_users = set()

active_connections = {}

# username -> list of messages buffered for an offline player (redelivered on reconnect)
pending_invites = {}

# finished gameIds: to reject stale rejoins on reconnection
completed_game_ids = set()

# parentSlotId (gameId of the parent match) -> {winner, winner_teammate, match_type}
# Result of a match whose winner(s) must be invited onto a takeWin whose team was
# NOT yet complete when the parent match ended. The invite is sent as soon as the
# takeWin team becomes ready (cf. _commit_slot).
takewin_pending_results = {}


def identity_from_scope(scope, channel_name):
    """Stable identifier of a slot owner (authenticated user, guest, or channel)."""
    user = scope.get("user")
    if user is not None and getattr(user, "is_authenticated", False):
        return f"user:{user.id}"
    ws_username = scope.get("ws_username")
    if ws_username:
        return f"guest:{ws_username}"
    return f"chan:{channel_name}"


def username_from_scope(scope):
    """Username tied to the connection (authenticated account or guest)."""
    user = scope.get("user")
    if user is not None and getattr(user, "is_authenticated", False):
        return getattr(user, "username", "") or ""
    return scope.get("ws_username") or ""


def reservation_usernames(reservation):
    """Set of the (non-null) usernames of a reservation's 4 player slots."""
    return {
        getattr(reservation.player1, "username", None),
        getattr(reservation.player1_teammate, "username", None),
        getattr(reservation.player2, "username", None),
        getattr(reservation.player2_teammate, "username", None),
    } - {None}
