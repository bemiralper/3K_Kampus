"""İletişim — yalnızca kaynak tanımı."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='communication.messages',
        name='İletişim Mesajları',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Konuşmalar, mesajlar, kampanyalar ve kuyruk.',
        config={
            'models': [
                'communication.CommunicationChannelConfig',
                'communication.ContactIdentity',
                'communication.Conversation',
                'communication.MessageTemplate',
                'communication.OutboundCampaign',
                'communication.Message',
                'communication.OutboundQueueItem',
            ],
        },
        is_default=False,
        priority=100,
    ),
    ResourceSpec(
        code='communication.files',
        name='İletişim Ekleri',
        resource_type=ResourceType.MEDIA,
        description='Mesaj ve kampanya ekleri.',
        config={'relative_to': 'media', 'path': 'communication'},
        is_default=False,
        priority=101,
    ),
]
