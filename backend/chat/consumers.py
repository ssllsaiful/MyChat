import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Conversation, DirectMessage
from django.contrib.auth import get_user_model

User = get_user_model()


class DirectMessageConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
        self.room_group_name = f'chat_{self.conversation_id}'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        message_content = data['message']
        sender_id = data['sender_id']

        # Save to database
        saved = await self.save_message(sender_id, self.conversation_id, message_content)

        # Broadcast to the conversation group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat_message',
                'message': message_content,
                'sender_id': sender_id,
                'sender_username': saved['username'],
                'timestamp': saved['timestamp'],
                'message_id': saved['id'],
            }
        )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'message': event['message'],
            'sender_id': event['sender_id'],
            'sender_username': event['sender_username'],
            'timestamp': event['timestamp'],
            'message_id': event['message_id'],
        }))

    @database_sync_to_async
    def save_message(self, sender_id, conversation_id, content):
        user = User.objects.get(id=sender_id)
        conversation = Conversation.objects.get(id=conversation_id)
        msg = DirectMessage.objects.create(
            conversation=conversation,
            sender=user,
            content=content
        )
        conversation.save()
        return {
            'id': msg.id,
            'username': user.username,
            'timestamp': msg.timestamp.isoformat(),
        }


class CallSignalingConsumer(AsyncWebsocketConsumer):
    """
    Handles WebRTC signaling for audio/video calls.
    Signal types: call-offer, call-answer, ice-candidate, call-reject, call-end
    """

    async def connect(self):
        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
        self.group_name = f'call_{self.conversation_id}'

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        signal_type = data.get('type')

        # Relay the signal to the other peer in the conversation group
        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'relay_signal',
                'signal_type': signal_type,
                'payload': data.get('payload'),
                'sender_id': data.get('sender_id'),
                'sender_username': data.get('sender_username'),
                'call_type': data.get('call_type', 'video'),  # 'audio' or 'video'
            }
        )

    async def relay_signal(self, event):
        """Forward signal to all WebSocket clients in the group (the other peer)."""
        await self.send(text_data=json.dumps({
            'type': event['signal_type'],
            'payload': event['payload'],
            'sender_id': event['sender_id'],
            'sender_username': event['sender_username'],
            'call_type': event['call_type'],
        }))
