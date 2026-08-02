"""
Communication Modelleri — Django model registry için re-export
"""
from apps.communication.domain.models import (  # noqa: F401
    CampaignAttachment,
    CommunicationChannelConfig,
    ContactIdentity,
    PhoneIdentity,
    Conversation,
    ConversationEvent,
    ConversationNote,
    ConversationRoutingRule,
    ConversationTag,
    ConversationTransferLog,
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
