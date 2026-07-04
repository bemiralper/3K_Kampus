"""
İletişim Merkezi API URL tanımları (authenticated).
"""
from django.urls import path

from apps.communication.interfaces.views.campaigns import (
    CampaignCancelView,
    CampaignConfirmView,
    CampaignDetailView,
    CampaignListCreateView,
    CampaignPreviewView,
    CampaignRetryFailedView,
)
from apps.communication.interfaces.views.config import WhatsAppConfigTestView, WhatsAppConfigView
from apps.communication.interfaces.views.conversation_open import ConversationOpenView
from apps.communication.interfaces.views.meta_templates import WhatsAppMetaTemplatesView
from apps.communication.interfaces.views.conversations import (
    ConversationArchiveView,
    ConversationDetailView,
    ConversationListView,
    ConversationReadView,
)
from apps.communication.interfaces.views.messages import ConversationMessagesView
from apps.communication.interfaces.views.message_reactions import MessageReactionView
from apps.communication.interfaces.views.notifications import NotificationSummaryView
from apps.communication.interfaces.views.recipients import (
    CoachParentsRecipientsView,
    CoachStudentsRecipientsView,
    RecipientResolveView,
)
from apps.communication.interfaces.views.announcements import AnnouncementSendView
from apps.communication.interfaces.views.ai import AiSuggestReplyView
from apps.communication.interfaces.views.attachments import AttachmentDetailView, AttachmentUploadView
from apps.communication.interfaces.views.events import CommunicationEventsStreamView
from apps.communication.interfaces.views.payment_reminders import PaymentReminderSendView
from apps.communication.interfaces.views.templates import (
    TemplateDetailView,
    TemplateListCreateView,
    TemplateStatsView,
    TemplateUseView,
)
from apps.communication.interfaces.views.template_categories import (
    TemplateCategoryDetailView,
    TemplateCategoryListCreateView,
)

app_name = 'communication'

urlpatterns = [
    path('config/whatsapp/', WhatsAppConfigView.as_view(), name='whatsapp-config'),
    path('config/whatsapp/test/', WhatsAppConfigTestView.as_view(), name='whatsapp-config-test'),
    path('config/whatsapp/templates/', WhatsAppMetaTemplatesView.as_view(), name='whatsapp-meta-templates'),
    path('conversations/open/', ConversationOpenView.as_view(), name='conversation-open'),
    path('conversations/', ConversationListView.as_view(), name='conversation-list'),
    path('conversations/<uuid:conversation_id>/', ConversationDetailView.as_view(), name='conversation-detail'),
    path(
        'conversations/<uuid:conversation_id>/messages/',
        ConversationMessagesView.as_view(),
        name='conversation-messages',
    ),
    path(
        'conversations/<uuid:conversation_id>/messages/<uuid:message_id>/reactions/',
        MessageReactionView.as_view(),
        name='message-reaction',
    ),
    path(
        'conversations/<uuid:conversation_id>/archive/',
        ConversationArchiveView.as_view(),
        name='conversation-archive',
    ),
    path(
        'conversations/<uuid:conversation_id>/read/',
        ConversationReadView.as_view(),
        name='conversation-read',
    ),
    path('notifications/summary/', NotificationSummaryView.as_view(), name='notification-summary'),
    path('events/stream/', CommunicationEventsStreamView.as_view(), name='events-stream'),
    path('ai/suggest-reply/', AiSuggestReplyView.as_view(), name='ai-suggest-reply'),
    path('payment-reminders/send/', PaymentReminderSendView.as_view(), name='payment-reminder-send'),
    path('campaigns/preview/', CampaignPreviewView.as_view(), name='campaign-preview'),
    path('campaigns/', CampaignListCreateView.as_view(), name='campaign-list-create'),
    path('campaigns/<uuid:campaign_id>/', CampaignDetailView.as_view(), name='campaign-detail'),
    path('campaigns/<uuid:campaign_id>/confirm/', CampaignConfirmView.as_view(), name='campaign-confirm'),
    path('campaigns/<uuid:campaign_id>/retry-failed/', CampaignRetryFailedView.as_view(), name='campaign-retry'),
    path('campaigns/<uuid:campaign_id>/cancel/', CampaignCancelView.as_view(), name='campaign-cancel'),
    path('templates/', TemplateListCreateView.as_view(), name='template-list-create'),
    path('templates/<uuid:template_id>/', TemplateDetailView.as_view(), name='template-detail'),
    path('templates/<uuid:template_id>/use/', TemplateUseView.as_view(), name='template-use'),
    path('templates/<uuid:template_id>/stats/', TemplateStatsView.as_view(), name='template-stats'),
    path('template-categories/', TemplateCategoryListCreateView.as_view(), name='template-category-list-create'),
    path(
        'template-categories/<uuid:category_id>/',
        TemplateCategoryDetailView.as_view(),
        name='template-category-detail',
    ),
    path('attachments/upload/', AttachmentUploadView.as_view(), name='attachment-upload'),
    path('attachments/<uuid:attachment_id>/', AttachmentDetailView.as_view(), name='attachment-detail'),
    path('recipients/resolve/', RecipientResolveView.as_view(), name='recipient-resolve'),
    path('recipients/coach-students/', CoachStudentsRecipientsView.as_view(), name='recipient-coach-students'),
    path('recipients/coach-parents/', CoachParentsRecipientsView.as_view(), name='recipient-coach-parents'),
    path('announcements/send/', AnnouncementSendView.as_view(), name='announcement-send'),
]
