from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/chat/(?P<conversation_id>\d+)/$', consumers.DirectMessageConsumer.as_asgi()),
    re_path(r'ws/call/(?P<conversation_id>\d+)/$', consumers.CallSignalingConsumer.as_asgi()),
]
