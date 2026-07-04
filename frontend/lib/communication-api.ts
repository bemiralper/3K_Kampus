// İletişim Merkezi — API client

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const STORAGE_KEYS = {
  activeKurum: '3k_active_kurum',
  activeSube: '3k_active_sube',
  activeEgitimYili: '3k_active_egitim_yili',
};

function readContextId(storageKey: string): string | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'number') return String(parsed);
    if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    if (parsed && typeof parsed === 'object' && 'id' in parsed && parsed.id != null) {
      return String(parsed.id);
    }
  } catch {
    if (raw.trim()) return raw.trim();
  }
  return null;
}

function getContextHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const headers: Record<string, string> = {};
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const subeId = readContextId(STORAGE_KEYS.activeSube);
  const egitimYiliId = readContextId(STORAGE_KEYS.activeEgitimYili);
  if (kurumId) headers['X-Kurum-ID'] = kurumId;
  if (subeId) headers['X-Sube-ID'] = subeId;
  if (egitimYiliId) headers['X-Egitim-Yili-ID'] = egitimYiliId;
  return headers;
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  for (const cookie of document.cookie.split(';')) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'lms_csrftoken') return value;
  }
  return null;
}

function communicationApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined') {
    return `/api/communication${normalized}`;
  }
  return `${BACKEND_URL}/api/communication${normalized}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrf = getCsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getContextHeaders(),
    ...(options.headers as Record<string, string> || {}),
  };
  if (csrf && options.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
    headers['X-CSRFToken'] = csrf;
  }

  const response = await fetch(communicationApiUrl(path), {
    credentials: 'include',
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const errMsg = body.error || (Array.isArray(body.error) ? body.error.join(', ') : '') || `HTTP ${response.status}`;
    throw new Error(typeof errMsg === 'string' ? errMsg : `HTTP ${response.status}`);
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

export interface ConversationListItem {
  id: string;
  channel: string;
  contact_phone: string;
  contact_type: string;
  contact_name?: string;
  veli_ad?: string;
  ogrenci_ad?: string;
  kurum_ad?: string;
  sube?: string;
  status: string;
  subject: string;
  last_message_at: string | null;
  last_message_preview: string;
  unread_count_coach: number;
  ogrenci_id?: number | null;
  veli_id?: number | null;
  created_at: string;
}

const MESSAGE_STATUS_LABELS: Record<string, string> = {
  PENDING: "bekliyor",
  SENDING: "gönderiliyor",
  SENT: "iletildi",
  DELIVERED: "iletildi",
  READ: "okundu",
  FAILED: "başarısız",
  CANCELLED: "iptal",
};

/** Giden mesaj durumunu Türkçe etikete çevir. */
export function formatMessageStatus(status: string | null | undefined): string {
  if (!status) return "";
  return MESSAGE_STATUS_LABELS[status] ?? status.toLowerCase();
}

export interface MessageAttachmentItem {
  id: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  file_url: string;
}

export interface MessageReactionItem {
  id: string;
  emoji: string;
  reacted_by?: number | null;
  reacted_by_name?: string;
  created_at: string;
}

export interface MessageReplyPreview {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  message_type: string;
  body: string;
  created_at: string;
  attachments?: MessageAttachmentItem[];
}

export interface MessageItem {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  message_type: string;
  body: string;
  status: string;
  provider_message_id?: string;
  sender_user_id?: number | null;
  failed_reason?: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  created_at: string;
  attachments?: MessageAttachmentItem[];
  reactions?: MessageReactionItem[];
  reply_to?: MessageReplyPreview | null;
}

export interface ConversationsResponse {
  conversations: ConversationListItem[];
  total: number;
}

export interface MessagesResponse {
  messages: MessageItem[];
  total: number;
  has_more: boolean;
}

export interface WhatsAppConfig {
  configured?: boolean;
  id?: string;
  phone_number_id?: string;
  waba_id?: string;
  webhook_verify_token?: string;
  display_phone?: string;
  is_active?: boolean;
  has_token?: boolean;
  webhook_event_count?: number;
  webhook_last_received_at?: string | null;
  webhook_last_error?: string;
  webhook_callback_path?: string;
}

export type ConversationFilter = 'all' | 'unread' | 'archived';

export async function fetchConversations(params?: {
  filter?: ConversationFilter;
  search?: string;
  ogrenci_id?: number;
}): Promise<ConversationsResponse> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const search = new URLSearchParams();
  if (kurumId) search.set('kurum_id', kurumId);
  if (params?.filter === 'unread') search.set('unread', '1');
  if (params?.filter === 'archived') search.set('archived', '1');
  if (params?.search) search.set('search', params.search);
  if (params?.ogrenci_id) search.set('ogrenci_id', String(params.ogrenci_id));
  const qs = search.toString();
  return request<ConversationsResponse>(`/conversations/${qs ? `?${qs}` : ''}`);
}

export async function fetchConversationMessages(
  conversationId: string,
  params?: { limit?: number; before?: string },
): Promise<MessagesResponse> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const search = new URLSearchParams();
  if (kurumId) search.set('kurum_id', kurumId);
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.before) search.set('before', params.before);
  const qs = search.toString();
  return request<MessagesResponse>(
    `/conversations/${conversationId}/messages/${qs ? `?${qs}` : ''}`,
  );
}

export async function sendConversationMessage(
  conversationId: string,
  text: string,
  options?: { attachmentFile?: File; attachmentId?: string; replyToMessageId?: string },
): Promise<MessageItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);

  if (options?.attachmentFile) {
    const csrf = getCsrfToken();
    const form = new FormData();
    form.append('text', text);
    form.append('kurum_id', kurumId || '');
    form.append('process_immediately', 'true');
    if (options.replyToMessageId) {
      form.append('reply_to_message_id', options.replyToMessageId);
    }
    form.append('file', options.attachmentFile);
    const headers: Record<string, string> = { ...getContextHeaders() };
    if (csrf) headers['X-CSRFToken'] = csrf;

    const response = await fetch(
      communicationApiUrl(`/conversations/${conversationId}/messages/`),
      { method: 'POST', credentials: 'include', headers, body: form },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const rawError = body.error ?? body.details;
      const errMsg = Array.isArray(rawError)
        ? rawError.join(', ')
        : typeof rawError === 'object' && rawError
          ? Object.values(rawError).flat().join(', ')
          : rawError || `HTTP ${response.status}`;
      throw new Error(String(errMsg));
    }
    return response.json();
  }

  return request<MessageItem>(`/conversations/${conversationId}/messages/`, {
    method: 'POST',
    body: JSON.stringify({
      text,
      kurum_id: kurumId,
      process_immediately: true,
      attachment_id: options?.attachmentId,
      reply_to_message_id: options?.replyToMessageId,
    }),
  });
}

export async function sendMessageReaction(
  conversationId: string,
  messageId: string,
  emoji: string,
): Promise<MessageReactionItem | { ok: boolean; removed: boolean }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request(`/conversations/${conversationId}/messages/${messageId}/reactions/`, {
    method: 'POST',
    body: JSON.stringify({ emoji, kurum_id: kurumId }),
  });
}

export async function markConversationRead(conversationId: string): Promise<ConversationListItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request<ConversationListItem>(`/conversations/${conversationId}/read/`, {
    method: 'PATCH',
    body: JSON.stringify({ kurum_id: kurumId }),
  });
}

export async function archiveConversation(
  conversationId: string,
  archive = true,
): Promise<ConversationListItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request<ConversationListItem>(`/conversations/${conversationId}/archive/`, {
    method: 'PATCH',
    body: JSON.stringify({ kurum_id: kurumId, archive }),
  });
}

export async function fetchWhatsAppConfig(): Promise<WhatsAppConfig> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request<WhatsAppConfig>(`/config/whatsapp/${qs}`);
}

export async function saveWhatsAppConfig(data: Partial<WhatsAppConfig> & { access_token?: string }): Promise<WhatsAppConfig> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request<WhatsAppConfig>('/config/whatsapp/', {
    method: 'PUT',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function testWhatsAppConnection(): Promise<{ success: boolean; message?: string }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/config/whatsapp/test/', {
    method: 'POST',
    body: JSON.stringify({ kurum_id: kurumId }),
  });
}

export interface MetaWhatsAppTemplate {
  name: string;
  status: string;
  language: string;
  category?: string;
  id?: string;
}

export async function fetchMetaWhatsAppTemplates(): Promise<{
  success: boolean;
  templates: MetaWhatsAppTemplate[];
  error?: string;
}> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request(`/config/whatsapp/templates/${qs}`);
}

export async function openConversationByPhone(
  phone: string,
  options?: { ogrenci_id?: number; veli_id?: number },
): Promise<ConversationListItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request<ConversationListItem>('/conversations/open/', {
    method: 'POST',
    body: JSON.stringify({ phone, kurum_id: kurumId, ...options }),
  });
}

export function conversationInboxPath(conversationId: string, admin = false): string {
  const base = admin ? '/admin/iletisim/mesajlar' : '/coach/mesajlar';
  return `${base}?conversation=${conversationId}`;
}

export async function fetchNotificationSummary(): Promise<{ unread_count: number; unread_conversations: number }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request(`/notifications/summary${qs}`);
}

export async function sendPaymentReminder(
  taksitId: number,
  options?: { with_pdf?: boolean },
): Promise<{ success: boolean; message_id?: string; detail?: string }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/payment-reminders/send/', {
    method: 'POST',
    body: JSON.stringify({
      kurum_id: kurumId,
      taksit_id: taksitId,
      with_pdf: options?.with_pdf ?? false,
    }),
  });
}

export function formatMessageTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

// ─── Campaign / Bulk Send ───

export interface AudienceFilter {
  audience_type?: string;
  sinif_id?: number;
  sube_id?: number;
  coach_id?: number;
  ogrenci_ids?: number[];
  veli_ids?: number[];
  egitim_yili_id?: number;
  template_name?: string;
}

export interface CampaignPreviewStats {
  total_recipients: number;
  ogrenci_count: number;
  veli_count: number;
  estimated_messages: number;
  invalid_phones: number;
  attachment_count?: number;
  estimated_cost_usd?: string;
  ai_used?: boolean;
  recipients?: Array<{
    e164: string;
    recipient_type: string;
    ogrenci_id?: number | null;
    veli_id?: number | null;
    display_name?: string;
  }>;
}

export interface MessageTemplateItem {
  id: string;
  category: string;
  audience_scope?: string;
  category_label?: string;
  name: string;
  body: string;
  variables_json?: string[];
  attachment_ids_json?: string[];
  is_active: boolean;
  usage_count: number;
  stats_sent: number;
  stats_read: number;
  stats_failed: number;
  avg_read_seconds: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  system_usages?: Array<{ module: string; role: string; label: string; is_active: boolean }>;
  is_system_active?: boolean;
  odev_pdf_role?: string | null;
}

export interface CampaignAttachmentItem {
  id: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  url?: string;
}

export type SendMode = 'now' | 'scheduled' | 'draft';

export interface CampaignItem {
  id: string;
  title: string;
  channel: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_by?: number | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  body_template?: string;
  recipient_filter_json?: AudienceFilter;
  preview_stats_json?: CampaignPreviewStats;
  retried_count?: number;
}

export async function previewCampaign(
  audienceFilter: AudienceFilter,
  options?: { attachmentCount?: number; aiUsed?: boolean },
): Promise<CampaignPreviewStats> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request<CampaignPreviewStats>('/campaigns/preview/', {
    method: 'POST',
    body: JSON.stringify({
      kurum_id: kurumId,
      recipient_filter: audienceFilter,
      attachment_count: options?.attachmentCount ?? 0,
      ai_used: options?.aiUsed ?? false,
    }),
  });
}

export async function createCampaign(data: {
  title?: string;
  body?: string;
  template_name?: string;
  template_language?: string;
  audience_filter: AudienceFilter;
  attachment_ids?: string[];
  template_id?: string;
  scheduled_at?: string;
  send_options?: Record<string, unknown>;
  save_as_template?: boolean;
  template_category?: string;
  draft_only?: boolean;
}): Promise<CampaignItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request<CampaignItem>('/campaigns/', {
    method: 'POST',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function confirmCampaign(campaignId: string): Promise<CampaignItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request<CampaignItem>(`/campaigns/${campaignId}/confirm/`, {
    method: 'POST',
    body: JSON.stringify({ kurum_id: kurumId }),
  });
}

export async function fetchCampaigns(): Promise<{ campaigns: CampaignItem[]; total: number }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request(`/campaigns/${qs}`);
}

export async function fetchCampaign(campaignId: string): Promise<CampaignItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request(`/campaigns/${campaignId}/${qs}`);
}

export async function retryFailedCampaign(campaignId: string): Promise<CampaignItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request<CampaignItem>(`/campaigns/${campaignId}/retry-failed/`, {
    method: 'POST',
    body: JSON.stringify({ kurum_id: kurumId }),
  });
}

export async function cancelCampaign(campaignId: string): Promise<CampaignItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request<CampaignItem>(`/campaigns/${campaignId}/cancel/`, {
    method: 'POST',
    body: JSON.stringify({ kurum_id: kurumId }),
  });
}

export async function resolveRecipients(
  audienceFilter: AudienceFilter,
): Promise<CampaignPreviewStats> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request<CampaignPreviewStats>('/recipients/resolve/', {
    method: 'POST',
    body: JSON.stringify({ kurum_id: kurumId, recipient_filter: audienceFilter }),
  });
}

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Taslak',
  CONFIRMED: 'Onaylandı',
  QUEUED: 'Kuyrukta',
  PROCESSING: 'İşleniyor',
  COMPLETED: 'Tamamlandı',
  PARTIAL: 'Kısmi',
  CANCELLED: 'İptal',
};

export const AUDIENCE_TYPE_LABELS: Record<string, string> = {
  all_veliler: 'Tüm veliler',
  all_ogrenciler: 'Tüm öğrenciler',
  sinif: 'Sınıf',
  sube: 'Şube',
  coach_students: 'Koç öğrencileri',
  coach_parents: 'Koç velileri',
  custom_ids: 'Özel seçim',
  filtered: 'Filtre',
};

export interface TemplateCategoryItem {
  id: string;
  slug: string;
  label: string;
  audience_scope: string;
  sort_order: number;
  is_active: boolean;
  template_count?: number;
  created_at: string;
  updated_at: string;
}

/** @deprecated API'den fetchTemplateCategories kullanın */
export const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  deneme_sonucu: 'Deneme Sonucu',
  haftalik_odev: 'Haftalık Ödev',
  devamsizlik: 'Devamsızlık',
  yoklama_gelmedi: 'Yoklama — Gelmedi',
  yoklama_gec: 'Yoklama — Geç Kalma',
  yoklama_cikis: 'Yoklama — Çıkış',
  tebrik: 'Tebrik',
  odeme: 'Ödeme',
  karne: 'Karne',
  duyuru: 'Duyuru',
  ozel: 'Özel',
};

export function categoryLabelMap(categories: TemplateCategoryItem[]): Record<string, string> {
  return Object.fromEntries(categories.map((c) => [c.slug, c.label]));
}

export const TEMPLATE_AUDIENCE_LABELS: Record<string, string> = {
  genel: 'Genel',
  admin: 'Admin / İletişim',
  coach: 'Koç',
  muhasebe: 'Muhasebe',
};

export async function fetchTemplateCategories(
  activeOnly = false,
  allScopes = false,
): Promise<{ categories: TemplateCategoryItem[]; total: number }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const params = new URLSearchParams();
  if (kurumId) params.set('kurum_id', kurumId);
  if (activeOnly) params.set('active_only', 'true');
  if (allScopes) params.set('all_scopes', 'true');
  const qs = params.toString() ? `?${params}` : '';
  return request(`/template-categories/${qs}`);
}

export async function createTemplateCategory(
  label: string,
  audienceScope = 'genel',
): Promise<TemplateCategoryItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/template-categories/', {
    method: 'POST',
    body: JSON.stringify({ label, audience_scope: audienceScope, kurum_id: kurumId }),
  });
}

export async function updateTemplateCategory(
  id: string,
  data: Partial<{ label: string; sort_order: number; is_active: boolean }>,
): Promise<TemplateCategoryItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request(`/template-categories/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function deleteTemplateCategory(id: string): Promise<void> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  await request(`/template-categories/${id}/?kurum_id=${kurumId}`, { method: 'DELETE' });
}

export async function fetchTemplates(
  category?: string,
  audienceScope?: string,
): Promise<{ templates: MessageTemplateItem[]; total: number }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const params = new URLSearchParams();
  if (kurumId) params.set('kurum_id', kurumId);
  if (category) params.set('category', category);
  if (audienceScope) params.set('audience_scope', audienceScope);
  const qs = params.toString() ? `?${params}` : '';
  return request(`/templates/${qs}`);
}

export async function fetchTemplate(id: string): Promise<MessageTemplateItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request(`/templates/${id}/${qs}`);
}

export async function createTemplate(data: {
  name: string;
  body?: string;
  category?: string;
  audience_scope?: string;
  variables_json?: string[];
  odev_pdf_role?: string;
}): Promise<MessageTemplateItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/templates/', {
    method: 'POST',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function updateTemplate(
  id: string,
  data: Partial<{ name: string; body: string; category: string; audience_scope: string; is_active: boolean; odev_pdf_role: string }>,
): Promise<MessageTemplateItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request(`/templates/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function deleteTemplate(id: string): Promise<{
  success: boolean;
  reassigned?: Array<{ role: string; label: string; template_id: string; template_name: string }>;
  warning?: string;
}> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request(`/templates/${id}/?kurum_id=${kurumId}`, { method: 'DELETE' });
}

export async function fetchTemplateStats(id: string): Promise<{
  template_id: string;
  stats_sent: number;
  stats_read: number;
  stats_failed: number;
  avg_read_seconds: number;
  usage_count: number;
}> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request(`/templates/${id}/stats/?kurum_id=${kurumId}`);
}

export async function recordTemplateUsage(id: string): Promise<{ ok: boolean; usage_count: number }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request(`/templates/${id}/use/`, {
    method: 'POST',
    body: JSON.stringify({ kurum_id: kurumId }),
  });
}

export async function uploadCampaignAttachment(file: File): Promise<CampaignAttachmentItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const form = new FormData();
  form.append('file', file);
  if (kurumId) form.append('kurum_id', kurumId);

  const csrf = getCsrfToken();
  const headers: Record<string, string> = { ...getContextHeaders() };
  if (csrf) headers['X-CSRFToken'] = csrf;

  const res = await fetch(communicationApiUrl('/attachments/upload/'), {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Dosya yüklenemedi');
  }
  return res.json();
}

/** @deprecated Use uploadCampaignAttachment */
export const uploadAttachment = uploadCampaignAttachment;
