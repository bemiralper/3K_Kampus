"""
Communication Modelleri — Django model registry için re-export
"""
from apps.communication.domain.models import (  # noqa: F401
    CampaignAttachment,
    CommunicationChannelConfig,
    ContactIdentity,
    PhoneIdentity,
    Conversation,
    Message,
    MessageStatusEvent,
    MessageAttachment,
    MessageTemplate,
    MessageReaction,
    MessageTemplateCategory,
    OutboundCampaign,
    OutboundQueueItem,
    CommunicationLog,
    RawWebhookEvent,
)
