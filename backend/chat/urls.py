from django.urls import path
from .views import UserSearchView, ConversationListCreateView, DirectMessageListView, ImageUploadView

urlpatterns = [
    path('users/search/', UserSearchView.as_view(), name='user_search'),
    path('conversations/', ConversationListCreateView.as_view(), name='conversations'),
    path('conversations/<int:conversation_id>/messages/', DirectMessageListView.as_view(), name='messages'),
    path('conversations/<int:conversation_id>/upload_image/', ImageUploadView.as_view(), name='upload_image'),
]
