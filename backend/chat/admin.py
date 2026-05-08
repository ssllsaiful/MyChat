from django.contrib import admin
from .models import Conversation, DirectMessage


class DirectMessageInline(admin.TabularInline):
    model = DirectMessage
    extra = 0
    readonly_fields = ('sender', 'content', 'image', 'timestamp', 'is_read')
    can_delete = False


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('id', 'get_participants', 'get_message_count', 'updated_at')
    list_filter = ('created_at',)
    search_fields = ('participants__username',)
    inlines = [DirectMessageInline]
    readonly_fields = ('created_at', 'updated_at')

    def get_participants(self, obj):
        return ' ↔ '.join([u.username for u in obj.participants.all()])
    get_participants.short_description = 'Participants'

    def get_message_count(self, obj):
        return obj.messages.count()
    get_message_count.short_description = 'Messages'


@admin.register(DirectMessage)
class DirectMessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'get_conversation', 'sender', 'short_content', 'has_image', 'timestamp', 'is_read')
    list_filter = ('is_read', 'timestamp')
    search_fields = ('sender__username', 'content')
    readonly_fields = ('timestamp',)

    def get_conversation(self, obj):
        parts = ' ↔ '.join([u.username for u in obj.conversation.participants.all()])
        return f'Conv #{obj.conversation.id}: {parts}'
    get_conversation.short_description = 'Conversation'

    def short_content(self, obj):
        return obj.content[:60] if obj.content else '—'
    short_content.short_description = 'Message'

    def has_image(self, obj):
        return bool(obj.image)
    has_image.boolean = True
    has_image.short_description = 'Image?'
