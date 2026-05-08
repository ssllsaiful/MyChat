from rest_framework import serializers
from .models import Conversation, DirectMessage
from accounts.serializers import UserSerializer


class DirectMessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)

    class Meta:
        model = DirectMessage
        fields = ('id', 'sender', 'content', 'image', 'timestamp', 'is_read')


class ConversationSerializer(serializers.ModelSerializer):
    participants = UserSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ('id', 'participants', 'last_message', 'updated_at')

    def get_last_message(self, obj):
        msg = obj.messages.last()
        if msg:
            return DirectMessageSerializer(msg).data
        return None
