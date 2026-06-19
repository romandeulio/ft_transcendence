"""
Diffusion temps réel des marchés de paris (cotes/pools) via Channels.

Appelé depuis les vues/services REST, typiquement sous `transaction.on_commit`
pour ne diffuser qu'après la validation effective en base.
"""
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .serializers import market_payload

BETS_GROUP = "bets"


def _send(event):
    layer = get_channel_layer()
    if layer is None:
        return
    async_to_sync(layer.group_send)(BETS_GROUP, event)


def broadcast_market(reservation):
    """Pousse le marché à jour d'une partie (nouvelle cote/pool) au groupe bets."""
    _send({"type": "market_update", "market": market_payload(reservation)})


def broadcast_closed(reservation):
    """Signale qu'une partie n'est plus pariable (fermée / annulée / résolue)."""
    _send({"type": "market_closed", "reservation_id": str(reservation.id)})
