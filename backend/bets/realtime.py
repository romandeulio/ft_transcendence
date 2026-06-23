"""
Real-time broadcast of betting markets (odds/pools) over Channels.

Called from the REST views/services, typically under `transaction.on_commit`
so a broadcast only happens once the change is committed to the database.
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
    """Push a game's updated market (new odds/pool) to the bets group."""
    _send({"type": "market_update_msg", "market": market_payload(reservation)})


def broadcast_closed(reservation):
    """Signal that a game is no longer bettable (closed / cancelled / settled)."""
    _send({"type": "market_closed_msg", "reservation_id": str(reservation.id)})
