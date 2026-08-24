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
from apps.communication.interfaces.views.accounts import (
    WhatsAppAccessibleAccountsView,
    WhatsAppAccountDetailView,
    WhatsAppAccountListCreateView,
    WhatsAppAccountSyncTemplatesView,
    WhatsAppAccountTestView,
)
from apps.communication.interfaces.views.config import WhatsAppConfigTestView, WhatsAppConfigView
from apps.communication.interfaces.views.queue import OutboundQueueListView
from apps.communication.interfaces.views.conversation_open import ConversationOpenView
from apps.communication.interfaces.views.meta_templates import WhatsAppMetaTemplatesView
from apps.communication.interfaces.views.birthday_media import (
    BirthdayMediaDetailView,
    BirthdayMediaListCreateView,
)
from apps.communication.interfaces.views.notification_bindings import (
    NotificationBindingPreviewView,
    NotificationBindingUpsertView,
    NotificationEventCatalogView,
)
from apps.communication.interfaces.views.staff_recipients import (
    NotificationStaffRecipientView,
)
from apps.communication.interfaces.views.notification_schedules import (
    NotificationScheduleView,
)
from apps.communication.interfaces.views.meta_template_mgmt import (
    MetaTemplateCloneView,
    MetaTemplateDetailView,
    MetaTemplateExampleMediaUploadView,
    MetaTemplateListCreateView,
    MetaTemplateRefreshStatusView,
    MetaTemplateCreateAppView,
    MetaTemplateImportAppBulkView,
    MetaTemplateResubmitView,
    MetaTemplateSeedAcademicScheduleView,
    MetaTemplateSeedKutuphaneYoklamaView,
    MetaTemplateSeedSinifYoklamaView,
    MetaTemplateSeedOzelDersView,
    MetaTemplateSeedDuyuruView,
    MetaTemplateSeedKayitSozlesmeView,
    MetaTemplateSeedPersonalChatView,
    MetaTemplateSubmitView,
)
from apps.communication.interfaces.views.conversations import (
    ConversationArchiveView,
    ConversationDetailView,
    ConversationListView,
    ConversationReadView,
)
from apps.communication.interfaces.views.conversation_actions import (
    ConversationClaimView,
    ConversationNoteDetailView,
    ConversationNotesView,
    ConversationTagCatalogView,
    ConversationTagsView,
    ConversationTransferView,
)
from apps.communication.interfaces.views.dashboard import CommunicationDashboardView
from apps.communication.interfaces.views.routing_rules import (
    RoutingRuleDetailView,
    RoutingRuleListCreateView,
)
from apps.communication.interfaces.views.transfer_candidates import TransferCandidatesView
from apps.communication.interfaces.views.messages import ConversationMessagesView
from apps.communication.interfaces.views.conversation_template_send import (
    ConversationTemplateSendView,
)
from apps.communication.interfaces.views.message_reactions import MessageReactionView
from apps.communication.interfaces.views.notifications import NotificationSummaryView
from apps.communication.interfaces.views.recipients import (
    CoachParentsRecipientsView,
    CoachStudentsRecipientsView,
    RecipientResolveView,
    RecipientSearchView,
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
    path('meta-templates/', MetaTemplateListCreateView.as_view(), name='meta-template-list-create'),
    path(
        'meta-templates/example-media/',
        MetaTemplateExampleMediaUploadView.as_view(),
        name='meta-template-example-media',
    ),
    path(
        'meta-templates/import-app-templates/',
        MetaTemplateImportAppBulkView.as_view(),
        name='meta-template-import-app-bulk',
    ),
    path(
        'meta-templates/seed-duyuru/',
        MetaTemplateSeedDuyuruView.as_view(),
        name='meta-template-seed-duyuru',
    ),
    path(
        'meta-templates/seed-academic-schedule/',
        MetaTemplateSeedAcademicScheduleView.as_view(),
        name='meta-template-seed-academic-schedule',
    ),
    path(
        'meta-templates/seed-kutuphane-yoklama/',
        MetaTemplateSeedKutuphaneYoklamaView.as_view(),
        name='meta-template-seed-kutuphane-yoklama',
    ),
    path(
        'meta-templates/seed-sinif-yoklama/',
        MetaTemplateSeedSinifYoklamaView.as_view(),
        name='meta-template-seed-sinif-yoklama',
    ),
    path(
        'meta-templates/seed-ozel-ders/',
        MetaTemplateSeedOzelDersView.as_view(),
        name='meta-template-seed-ozel-ders',
    ),
    path(
        'meta-templates/seed-kayit-sozlesme/',
        MetaTemplateSeedKayitSozlesmeView.as_view(),
        name='meta-template-seed-kayit-sozlesme',
    ),
    path(
        'meta-templates/seed-personal-chat/',
        MetaTemplateSeedPersonalChatView.as_view(),
        name='meta-template-seed-personal-chat',
    ),
    path('meta-templates/<uuid:template_id>/', MetaTemplateDetailView.as_view(), name='meta-template-detail'),
    path(
        'meta-templates/<uuid:template_id>/submit/',
        MetaTemplateSubmitView.as_view(),
        name='meta-template-submit',
    ),
    path(
        'meta-templates/<uuid:template_id>/resubmit/',
        MetaTemplateResubmitView.as_view(),
        name='meta-template-resubmit',
    ),
    path(
        'meta-templates/<uuid:template_id>/refresh-status/',
        MetaTemplateRefreshStatusView.as_view(),
        name='meta-template-refresh-status',
    ),
    path(
        'meta-templates/<uuid:template_id>/clone/',
        MetaTemplateCloneView.as_view(),
        name='meta-template-clone',
    ),
    path(
        'meta-templates/<uuid:template_id>/create-app-template/',
        MetaTemplateCreateAppView.as_view(),
        name='meta-template-create-app',
    ),
    path(
        'notification-events/',
        NotificationEventCatalogView.as_view(),
        name='notification-events',
    ),
    path(
        'notification-bindings/',
        NotificationBindingUpsertView.as_view(),
        name='notification-bindings',
    ),
    path(
        'notification-bindings/preview/',
        NotificationBindingPreviewView.as_view(),
        name='notification-bindings-preview',
    ),
    path(
        'notification-staff-recipients/',
        NotificationStaffRecipientView.as_view(),
        name='notification-staff-recipients',
    ),
    path(
        'notification-schedules/',
        NotificationScheduleView.as_view(),
        name='notification-schedules',
    ),
    path(
        'birthday-media/',
        BirthdayMediaListCreateView.as_view(),
        name='birthday-media-list-create',
    ),
    path(
        'birthday-media/<uuid:asset_id>/',
        BirthdayMediaDetailView.as_view(),
        name='birthday-media-detail',
    ),
    path('accounts/', WhatsAppAccountListCreateView.as_view(), name='whatsapp-accounts'),
    path('accounts/accessible/', WhatsAppAccessibleAccountsView.as_view(), name='whatsapp-accounts-accessible'),
    path('accounts/<uuid:account_id>/', WhatsAppAccountDetailView.as_view(), name='whatsapp-account-detail'),
    path('accounts/<uuid:account_id>/test/', WhatsAppAccountTestView.as_view(), name='whatsapp-account-test'),
    path(
        'accounts/<uuid:account_id>/sync-templates/',
        WhatsAppAccountSyncTemplatesView.as_view(),
        name='whatsapp-account-sync-templates',
    ),
    path('queue/', OutboundQueueListView.as_view(), name='outbound-queue'),
    path('conversations/open/', ConversationOpenView.as_view(), name='conversation-open'),
    path('conversations/', ConversationListView.as_view(), name='conversation-list'),
    path('conversations/<uuid:conversation_id>/', ConversationDetailView.as_view(), name='conversation-detail'),
    path(
        'conversations/<uuid:conversation_id>/messages/',
        ConversationMessagesView.as_view(),
        name='conversation-messages',
    ),
    path(
        'conversations/<uuid:conversation_id>/template-messages/',
        ConversationTemplateSendView.as_view(),
        name='conversation-template-messages',
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
    path(
        'conversations/<uuid:conversation_id>/claim/',
        ConversationClaimView.as_view(),
        name='conversation-claim',
    ),
    path(
        'conversations/<uuid:conversation_id>/transfer/',
        ConversationTransferView.as_view(),
        name='conversation-transfer',
    ),
    path(
        'transfer-candidates/',
        TransferCandidatesView.as_view(),
        name='transfer-candidates',
    ),
    path(
        'conversations/<uuid:conversation_id>/notes/',
        ConversationNotesView.as_view(),
        name='conversation-notes',
    ),
    path(
        'conversations/<uuid:conversation_id>/notes/<uuid:note_id>/',
        ConversationNoteDetailView.as_view(),
        name='conversation-note-detail',
    ),
    path(
        'conversations/<uuid:conversation_id>/tags/',
        ConversationTagsView.as_view(),
        name='conversation-tags',
    ),
    path('tags/', ConversationTagCatalogView.as_view(), name='tag-catalog'),
    path('dashboard/', CommunicationDashboardView.as_view(), name='communication-dashboard'),
    path('routing-rules/', RoutingRuleListCreateView.as_view(), name='routing-rules'),
    path('routing-rules/<uuid:rule_id>/', RoutingRuleDetailView.as_view(), name='routing-rule-detail'),
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
    path('recipients/search/', RecipientSearchView.as_view(), name='recipient-search'),
    path('recipients/coach-students/', CoachStudentsRecipientsView.as_view(), name='recipient-coach-students'),
    path('recipients/coach-parents/', CoachParentsRecipientsView.as_view(), name='recipient-coach-parents'),
    path('announcements/send/', AnnouncementSendView.as_view(), name='announcement-send'),
]
