from django.urls import re_path

from realtime.consumers.queue import QueueConsumer
from realtime.consumers.bets import BetConsumer

websocket_urlpatterns = [
    re_path(r"ws/queue/$", QueueConsumer.as_asgi()),
    re_path(r"ws/bets/$", BetConsumer.as_asgi()),
]
