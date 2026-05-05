from channels.generic.websocket import AsyncWebsocketConsumer

class BetConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()