"""
État partagé en mémoire du salon « file d'attente » (temps réel baby-foot).

Tout le consumer (découpé en mixins) s'appuie sur ces structures. Elles vivent
ICI, dans un seul module, pour que tous les fichiers en partagent EXACTEMENT la
même instance.

⚠️ Règle d'or : on accède toujours à ces objets via `state.queue`, `state.games`…
(jamais `from realtime.state import queue`). Sinon, une réassignation de `queue`
dans un fichier ne serait pas vue par les autres (piège classique des globals
Python). Avec `state.queue = [...]`, on modifie bien l'unique attribut partagé.

Hypothèse d'exécution : un seul process Daphne sert HTTP + WebSocket, donc cet
état mémoire est cohérent. La diffusion entre clients passe par Redis (channels).
"""

# File d'attente live : liste de « slots » (dicts). RÉASSIGNÉE → via state.queue.
queue = []

# gameId -> {player1, player2, player1_teammate, player2_teammate,
#            match_type, scoreRed, scoreBlue, startTime}
games = {}

# inviteId -> {slotId, targets, accepted, owner}  (invitations « take-the-winner »)
win_invites = {}

# inviteId -> {from, ownerId, targets, slot, accepted}  (invitations directes)
# Permet d'activer le créneau dans la file à l'acceptation même si l'invitant
# (J1) est hors-ligne à ce moment-là.
invites = {}

# pseudos actuellement connectés
online_users = set()

# pseudo -> liste de messages stockés pour un joueur hors-ligne (re-livrés à la reco)
pending_invites = {}

# gameIds terminés : pour rejeter les rejoin obsolètes à la reconnexion
completed_game_ids = set()


def identity_from_scope(scope, channel_name):
    """Identifiant stable du propriétaire d'un slot (user authentifié, invité, ou canal)."""
    user = scope.get("user")
    if user is not None and getattr(user, "is_authenticated", False):
        return f"user:{user.id}"
    ws_username = scope.get("ws_username")
    if ws_username:
        return f"guest:{ws_username}"
    return f"chan:{channel_name}"


def username_from_scope(scope):
    """Pseudo associé à la connexion (compte authentifié ou invité)."""
    user = scope.get("user")
    if user is not None and getattr(user, "is_authenticated", False):
        return getattr(user, "username", "") or ""
    return scope.get("ws_username") or ""


def reservation_usernames(reservation):
    """Ensemble des pseudos (non nuls) des 4 emplacements joueur d'une réservation."""
    return {
        getattr(reservation.player1, "username", None),
        getattr(reservation.player1_teammate, "username", None),
        getattr(reservation.player2, "username", None),
        getattr(reservation.player2_teammate, "username", None),
    } - {None}
