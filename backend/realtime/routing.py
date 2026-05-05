from django.urls import re_path
from realtime.consumers.match import MatchConsumer
from realtime.consumers.queue import QueueConsumer
from realtime.consumers.chat import ChatConsumer
from realtime.consumers.bets import BetConsumer

websocket_urlpatterns = [
    re_path(r"ws/match/(?P<match_id>\d+)/$", MatchConsumer.as_asgi()),
    re_path(r"ws/queue/$", QueueConsumer.as_asgi()),
    re_path(r"ws/chat/$", ChatConsumer.as_asgi()),
    re_path(r"ws/bets/$", BetConsumer.as_asgi()),
]