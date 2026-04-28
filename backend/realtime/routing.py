from django.urls import path
from realtime.consumers.match import MatchConsumer
from realtime.consumers.queue import QueueConsumer
from realtime.consumers.chat import ChatConsumer
from realtime.consumers.bets import BetConsumer

websocket_urlpatterns = [
    path("ws/match/<int:match_id>/", MatchConsumer.as_asgi()),
    path("ws/queue/", QueueConsumer.as_asgi()),
    path("ws/chat/", ChatConsumer.as_asgi()),
    path("ws/bets/", BetConsumer.as_asgi()),
]