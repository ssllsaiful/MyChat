from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from django.db.models import Q
from .models import Conversation, DirectMessage
from .serializers import ConversationSerializer, DirectMessageSerializer
from accounts.serializers import UserSerializer

User = get_user_model()


class UserSearchView(generics.ListAPIView):
    """Search for users by username to start a new conversation."""
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        query = self.request.query_params.get('q', '')
        if not query:
            return User.objects.none()
        return User.objects.filter(username__icontains=query).exclude(id=self.request.user.id)


class ConversationListCreateView(APIView):
    """List all conversations for the current user, or create/get one with another user."""
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        conversations = Conversation.objects.filter(
            participants=request.user
        ).prefetch_related('participants', 'messages')
        serializer = ConversationSerializer(conversations, many=True)
        return Response(serializer.data)

    def post(self, request):
        other_user_id = request.data.get('user_id')
        if not other_user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            other_user = User.objects.get(id=other_user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        # Find existing conversation between these two users
        existing = Conversation.objects.filter(
            participants=request.user
        ).filter(
            participants=other_user
        ).first()

        if existing:
            return Response(ConversationSerializer(existing).data)

        # Create new conversation
        conversation = Conversation.objects.create()
        conversation.participants.add(request.user, other_user)
        return Response(ConversationSerializer(conversation).data, status=status.HTTP_201_CREATED)


class DirectMessageListView(generics.ListAPIView):
    """Get all messages in a conversation."""
    serializer_class = DirectMessageSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        conversation_id = self.kwargs['conversation_id']
        # Ensure the user is a participant
        return DirectMessage.objects.filter(
            conversation__id=conversation_id,
            conversation__participants=self.request.user
        )


from rest_framework.parsers import MultiPartParser, FormParser
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

class ImageUploadView(APIView):
    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, conversation_id):
        try:
            conversation = Conversation.objects.get(id=conversation_id, participants=request.user)
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)

        image = request.FILES.get('image')
        if not image:
            return Response({"error": "No image provided"}, status=status.HTTP_400_BAD_REQUEST)

        content = request.data.get('content', '')

        # Save to database
        msg = DirectMessage.objects.create(
            conversation=conversation,
            sender=request.user,
            content=content,
            image=image
        )
        conversation.save()

        # Get serialized data
        msg_data = DirectMessageSerializer(msg).data

        # Broadcast to the conversation group
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'chat_{conversation_id}',
            {
                'type': 'chat_message',
                'message': msg_data.get('content', ''),
                'image': msg_data.get('image'),
                'sender_id': request.user.id,
                'sender_username': request.user.username,
                'timestamp': msg_data.get('timestamp'),
                'message_id': msg.id,
            }
        )

        return Response(msg_data, status=status.HTTP_201_CREATED)
