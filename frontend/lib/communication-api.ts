// İletişim Merkezi — API client

import { isSessionExpiredResponse, notifySessionExpired } from '@/lib/api';

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

const REQUEST_TIMEOUT_MS = 45_000;

/**
 * 24 saatlik serbest mesaj penceresi kapalı — Meta onaylı şablon gerekir.
 * Sohbet ekranı bunu yakalayıp şablon seçiciyi açar.
 */
export class SessionWindowClosedError extends Error {
  readonly session?: ConversationSessionInfo;

  constructor(message: string, session?: ConversationSessionInfo) {
    super(message);
    this.name = 'SessionWindowClosedError';
    this.session = session;
  }
}

function errorFromBody(body: Record<string, unknown>, status: number): Error {
  const raw = body.error ?? body.detail ?? body.details;
  const message =
    (Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : '') ||
    (raw && typeof raw === 'object' ? Object.values(raw).flat().join(', ') : '') ||
    `HTTP ${status}`;
  if (body.session_expired) {
    return new SessionWindowClosedError(
      message,
      body.session as ConversationSessionInfo | undefined,
    );
  }
  return new Error(message);
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const parentSignal = options.signal;
  const onParentAbort = () => controller.abort();
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  try {
    const response = await fetch(communicationApiUrl(path), {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (isSessionExpiredResponse(response.status, body)) {
        // Rozet/inbox yoklamaları oturum düştükten sonra sonsuza dek 401 üretmesin
        notifySessionExpired();
      }
      throw errorFromBody(body, response.status);
    }

    if (response.status === 204) return {} as T;
    return response.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('İstek zaman aşımına uğradı. Sayfayı yenileyip tekrar deneyin.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

export interface ConversationSlaInfo {
  first_unanswered_at?: string | null;
  last_customer_message_at?: string | null;
  last_reply_at?: string | null;
  waiting_seconds?: number | null;
  breached?: boolean;
}

/** WhatsApp 24 saatlik serbest mesaj penceresi */
export interface ConversationSessionInfo {
  state: 'OPEN' | 'EXPIRED' | 'NEVER' | 'NA' | string;
  is_open: boolean;
  label: string;
  notice: string;
  last_inbound_at?: string | null;
  expires_at?: string | null;
  seconds_left: number;
  window_hours: number;
}

export interface ConversationTagItem {
  id: string;
  slug: string;
  name: string;
  color: string;
}

export interface ConversationListItem {
  id: string;
  channel: string;
  contact_phone: string;
  contact_type: string;
  contact_name?: string;
  veli_ad?: string;
  ogrenci_ad?: string;
  /** Veli sohbetinde bağlı öğrenci adları (çok çocuklu ailelerde birden fazla). */
  ogrenci_adlari?: string[];
  kurum_ad?: string;
  sube?: string;
  profil_foto?: string | null;
  status: string;
  subject: string;
  department?: string;
  last_message_at: string | null;
  last_message_preview: string;
  unread_count_coach: number;
  ogrenci_id?: number | null;
  veli_id?: number | null;
  assigned_coach_id?: number | null;
  assigned_coach_name?: string;
  claimed_by_user_id?: number | null;
  claimed_by_name?: string;
  claim_version?: number;
  first_unanswered_at?: string | null;
  last_customer_message_at?: string | null;
  last_reply_at?: string | null;
  needs_support_at?: string | null;
  archived_at?: string | null;
  tags?: ConversationTagItem[];
  sla?: ConversationSlaInfo;
  session?: ConversationSessionInfo;
  can_claim?: boolean;
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
  app_id?: string;
  webhook_verify_token?: string;
  display_phone?: string;
  is_active?: boolean;
  has_token?: boolean;
  webhook_event_count?: number;
  webhook_last_received_at?: string | null;
  webhook_last_error?: string;
  webhook_callback_path?: string;
}

export type ConversationFilter = 'all' | 'unread' | 'archived' | 'mine' | 'new' | 'needs_support' | 'unassigned';
export type ConversationPeriod = '7d' | '30d' | 'year' | 'all';

export async function fetchConversations(params?: {
  filter?: ConversationFilter;
  inbox?: ConversationFilter;
  period?: ConversationPeriod;
  search?: string;
  ogrenci_id?: number;
  channel_config_id?: string;
  account_id?: string;
  department?: string;
}): Promise<ConversationsResponse> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const search = new URLSearchParams();
  if (kurumId) search.set('kurum_id', kurumId);
  const inbox = params?.inbox || params?.filter;
  if (inbox === 'unread') search.set('unread', '1');
  else if (inbox === 'archived') {
    search.set('archived', '1');
    search.set('inbox', 'archived');
  } else if (inbox && inbox !== 'all') {
    search.set('inbox', inbox);
  }
  if (params?.period) search.set('period', params.period);
  if (params?.search) search.set('search', params.search);
  if (params?.ogrenci_id) search.set('ogrenci_id', String(params.ogrenci_id));
  if (params?.department) search.set('department', params.department);
  const accountId = params?.channel_config_id || params?.account_id;
  if (accountId) search.set('channel_config_id', accountId);
  const qs = search.toString();
  return request<ConversationsResponse>(`/conversations/${qs ? `?${qs}` : ''}`);
}

export async function claimConversation(
  conversationId: string,
  claimVersion?: number,
): Promise<ConversationListItem> {
  const body: Record<string, unknown> = {};
  if (claimVersion != null) body.claim_version = claimVersion;
  return request<ConversationListItem>(`/conversations/${conversationId}/claim/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function transferConversation(
  conversationId: string,
  toUserId: number,
  reason?: string,
): Promise<ConversationListItem> {
  return request<ConversationListItem>(`/conversations/${conversationId}/transfer/`, {
    method: 'POST',
    body: JSON.stringify({ to_user_id: toUserId, reason: reason || '' }),
  });
}

export interface TransferCandidate {
  user_id: number;
  personel_id: number;
  name: string;
  email?: string;
  sube_ad?: string;
}

export async function fetchTransferCandidates(
  query: string,
): Promise<{ candidates: TransferCandidate[]; total: number }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const params = new URLSearchParams();
  if (kurumId) params.set('kurum_id', kurumId);
  if (query.trim()) params.set('q', query.trim());
  const qs = params.toString() ? `?${params}` : '';
  return request(`/transfer-candidates/${qs}`);
}

export async function fetchConversationNotes(conversationId: string): Promise<{
  notes: Array<{
    id: string;
    body: string;
    author_id?: number | null;
    author_name?: string;
    edit_history?: unknown[];
    created_at?: string | null;
    updated_at?: string | null;
  }>;
}> {
  return request(`/conversations/${conversationId}/notes/`);
}

export async function createConversationNote(
  conversationId: string,
  body: string,
): Promise<{ id: string; body: string }> {
  return request(`/conversations/${conversationId}/notes/`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export async function fetchTagCatalog(): Promise<{ tags: ConversationTagItem[] }> {
  return request('/tags/');
}

export async function setConversationTags(
  conversationId: string,
  slugs: string[],
): Promise<ConversationListItem> {
  return request<ConversationListItem>(`/conversations/${conversationId}/tags/`, {
    method: 'POST',
    body: JSON.stringify({ slugs }),
  });
}

export interface CommunicationDashboardData {
  active_conversations: number;
  waiting_conversations: number;
  sla_breaches: number;
  /** Koça atanmamış aktif sohbet */
  unassigned_active?: number;
  by_coach_active: Array<{
    assigned_coach_id: number;
    coach_name?: string;
    count: number;
  }>;
  by_coach_reply_time: Array<{
    assigned_coach_id: number;
    coach_name?: string;
    avg_reply_seconds: number | null;
    sample_count: number;
  }>;
  daily_inbound: number;
  daily_outbound: number;
  busy_hours: Array<{ hour: number; count: number }>;
  unanswered_messages: number;
  generated_at: string;
}

export async function fetchCommunicationDashboard(): Promise<CommunicationDashboardData> {
  return request<CommunicationDashboardData>('/dashboard/');
}

export type CommunicationDepartment =
  | 'COACHING'
  | 'ACCOUNTING'
  | 'SECRETARIAT'
  | 'GUIDANCE'
  | 'ADMISSIONS'
  | 'MANAGEMENT';

export type RoutingContactType = 'RAW_PHONE' | 'OGRENCI' | 'VELI' | 'PERSONEL';
export type RoutingQueueLabel = 'new' | 'mine' | 'needs_support';
export type RoutingQueueBehavior = 'unclaimed' | 'assign_coach' | 'needs_support';
export type RoutingSetStatus = 'NEW' | 'WAITING' | 'NEEDS_SUPPORT';

export interface RoutingRuleConditions {
  has_coach?: boolean | null;
  contact_types?: RoutingContactType[];
  queue?: RoutingQueueLabel | '';
}

export interface RoutingRuleActions {
  set_department?: CommunicationDepartment | string;
  queue_behavior?: RoutingQueueBehavior | '';
  set_status?: RoutingSetStatus | '';
  notify_roles?: string[];
}

export interface RoutingRule {
  id: string;
  name: string;
  department: CommunicationDepartment | string;
  is_active: boolean;
  priority: number;
  conditions: RoutingRuleConditions;
  actions: RoutingRuleActions;
}

export interface RoutingRuleWritePayload {
  name: string;
  department: CommunicationDepartment | string;
  priority?: number;
  is_active?: boolean;
  conditions?: RoutingRuleConditions;
  actions?: RoutingRuleActions;
}

export async function fetchRoutingRules(): Promise<{ rules: RoutingRule[] }> {
  return request('/routing-rules/');
}

export async function createRoutingRule(
  payload: RoutingRuleWritePayload,
): Promise<RoutingRule> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/routing-rules/', {
    method: 'POST',
    body: JSON.stringify({ ...payload, kurum_id: kurumId }),
  });
}

export async function updateRoutingRule(
  id: string,
  payload: Partial<RoutingRuleWritePayload>,
): Promise<RoutingRule> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request(`/routing-rules/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ ...payload, kurum_id: kurumId }),
  });
}

export async function deleteRoutingRule(id: string): Promise<void> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  await request(`/routing-rules/${id}/${qs}`, { method: 'DELETE' });
}

export const DEPARTMENT_LABELS: Record<string, string> = {
  COACHING: 'Koçluk',
  ACCOUNTING: 'Muhasebe',
  SECRETARIAT: 'Sekreterya',
  GUIDANCE: 'Rehberlik',
  ADMISSIONS: 'Kayıt Ofisi',
  MANAGEMENT: 'Yönetim',
};

export const ROUTING_CONTACT_TYPE_LABELS: Record<RoutingContactType, string> = {
  RAW_PHONE: 'Bilinmeyen numara',
  OGRENCI: 'Öğrenci',
  VELI: 'Veli',
  PERSONEL: 'Personel',
};

export const ROUTING_QUEUE_BEHAVIOR_LABELS: Record<RoutingQueueBehavior, string> = {
  unclaimed: 'Yeni Gelenler (üstlenilmemiş)',
  assign_coach: 'Koça ata / Bekliyor',
  needs_support: 'Destek Gerekiyor',
};

export interface NotificationSummary {
  unread_count: number;
  unread_conversations: number;
  cards?: ConversationListItem[];
}

export async function fetchNotificationSummary(): Promise<NotificationSummary> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request<NotificationSummary>(`/notifications/summary/${qs}`);
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
      throw errorFromBody(body, response.status);
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

// ─── WhatsApp Accounts (multi-account, Faz B) ───

export type WhatsAppAccountScope = 'ALL_SUBES' | 'SELECTED_SUBES';

export interface WhatsAppAccount {
  id: string;
  channel: string;
  name: string;
  phone_number_id: string;
  waba_id: string;
  app_id?: string;
  webhook_verify_token?: string;
  display_phone: string;
  is_active: boolean;
  is_default: boolean;
  scope_type: WhatsAppAccountScope;
  department?: CommunicationDepartment | string;
  quota_json?: Record<string, unknown>;
  last_synced_at?: string | null;
  role_ids: number[];
  sube_ids: number[];
  role_names: string[];
  sube_names: string[];
  configured?: boolean;
  has_token?: boolean;
  kurum_id?: number;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppAccountWritePayload {
  name?: string;
  phone_number_id?: string;
  waba_id?: string;
  app_id?: string;
  access_token?: string;
  app_secret?: string;
  webhook_verify_token?: string;
  display_phone?: string;
  is_active?: boolean;
  is_default?: boolean;
  scope_type?: WhatsAppAccountScope;
  department?: CommunicationDepartment | string;
  quota_json?: Record<string, unknown>;
  role_ids?: number[];
  sube_ids?: number[];
}

export async function fetchWhatsAppAccounts(params?: {
  accessible?: boolean;
  activeOnly?: boolean;
}): Promise<{ accounts: WhatsAppAccount[]; total: number }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const search = new URLSearchParams();
  if (kurumId) search.set('kurum_id', kurumId);
  if (params?.accessible) search.set('accessible', '1');
  if (params?.activeOnly) search.set('active', '1');
  const qs = search.toString();
  return request(`/accounts/${qs ? `?${qs}` : ''}`);
}

export async function fetchAccessibleWhatsAppAccounts(): Promise<{
  accounts: WhatsAppAccount[];
  default_account_id: string | null;
  total: number;
}> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request(`/accounts/accessible/${qs}`);
}

export async function fetchWhatsAppAccount(id: string): Promise<WhatsAppAccount> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request(`/accounts/${id}/${qs}`);
}

export async function createWhatsAppAccount(
  data: WhatsAppAccountWritePayload,
): Promise<WhatsAppAccount> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/accounts/', {
    method: 'POST',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function updateWhatsAppAccount(
  id: string,
  data: WhatsAppAccountWritePayload,
): Promise<WhatsAppAccount> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request(`/accounts/${id}/`, {
    method: 'PUT',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function deleteWhatsAppAccount(id: string): Promise<{ success: boolean; id: string }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request(`/accounts/${id}/${qs}`, { method: 'DELETE' });
}

export async function testWhatsAppAccount(
  id: string,
): Promise<{ success: boolean; message?: string }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request(`/accounts/${id}/test/`, {
    method: 'POST',
    body: JSON.stringify({ kurum_id: kurumId }),
  });
}

export async function syncWhatsAppAccountTemplates(id: string): Promise<{
  success: boolean;
  templates?: MetaWhatsAppTemplate[];
  upserted?: number;
  error?: string;
}> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request(`/accounts/${id}/sync-templates/`, {
    method: 'POST',
    body: JSON.stringify({ kurum_id: kurumId }),
  });
}

// ─── WhatsApp Meta Templates (local lifecycle) ───

export type MetaTemplateStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED';

export type MetaTemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

/** Şablonun hangi ekranlarda seçilebileceği */
export type MetaTemplateUsage = 'ALL' | 'SYSTEM' | 'PERSONAL' | 'CAMPAIGN';

export const META_TEMPLATE_USAGE_LABELS: Record<MetaTemplateUsage, string> = {
  ALL: 'Her yerde',
  SYSTEM: 'Otomatik bildirimler',
  PERSONAL: 'Sohbet — kişisel mesaj',
  CAMPAIGN: 'Toplu duyuru',
};

export interface MetaTemplateHeader {
  type?: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | string;
  text?: string;
  example_handle?: string;
  media_handle?: string;
}

export interface MetaTemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'PHONE' | 'OTP' | string;
  text?: string;
  url?: string;
  phone_number?: string;
  phone?: string;
  otp_type?: string;
}

export interface WhatsAppMetaTemplateItem {
  id: string;
  channel_config: string;
  channel_config_name?: string;
  name: string;
  language: string;
  meta_category: MetaTemplateCategory | string;
  meta_category_label?: string;
  status: MetaTemplateStatus | string;
  status_label?: string;
  meta_template_id?: string;
  usage_scope?: MetaTemplateUsage | string;
  usage_scope_label?: string;
  /** Gövdedeki değişken adları, gönderim ekranında doldurulur */
  variables?: string[];
  /** Sohbet bağlamıyla çözülmüş önizleme (yalnızca sohbet şablon listesinde) */
  preview?: string;
  body_named: string;
  header_json?: MetaTemplateHeader;
  footer_text?: string;
  buttons_json?: MetaTemplateButton[];
  components_json?: unknown[];
  variable_map_json?: Record<string, string>;
  rejected_reason?: string;
  rejected_detail?: string;
  last_submitted_at?: string | null;
  approved_at?: string | null;
  usage_count?: number;
  /** Bağlı uygulama şablonu (varsa) */
  app_template_id?: string;
  app_template_name?: string;
  system_usages?: Array<{
    module: string;
    role: string;
    label: string;
    is_active: boolean;
    event_key?: string;
  }>;
  is_system_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function fetchLocalMetaTemplates(params?: {
  account_id?: string;
  status?: string;
  meta_category?: string;
  language?: string;
  search?: string;
  approved_only?: boolean;
  usage?: MetaTemplateUsage;
}): Promise<{ templates: WhatsAppMetaTemplateItem[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.account_id) qs.set('account_id', params.account_id);
  if (params?.status) qs.set('status', params.status);
  if (params?.meta_category) qs.set('meta_category', params.meta_category);
  if (params?.language) qs.set('language', params.language);
  if (params?.search) qs.set('search', params.search);
  if (params?.approved_only) qs.set('approved_only', '1');
  if (params?.usage) qs.set('usage', params.usage);
  const suffix = qs.toString() ? `?${qs}` : '';
  return request(`/meta-templates/${suffix}`);
}

/** Sohbette kullanılabilecek Meta onaylı kişisel şablonlar + pencere durumu */
export async function fetchConversationTemplates(
  conversationId: string,
): Promise<{
  templates: WhatsAppMetaTemplateItem[];
  session: ConversationSessionInfo;
  context: Record<string, string>;
  preferred_audience?: 'veli' | 'ogrenci' | null;
  /** Örn. sohbet_kocluk_veli — birim + alıcıya göre */
  preferred_template_name?: string | null;
}> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request(`/conversations/${conversationId}/template-messages/${qs}`);
}

export async function sendConversationTemplate(
  conversationId: string,
  templateId: string,
  variables: Record<string, string>,
): Promise<MessageItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request(`/conversations/${conversationId}/template-messages/`, {
    method: 'POST',
    body: JSON.stringify({
      template_id: templateId,
      variables,
      kurum_id: kurumId,
    }),
  });
}

export async function createLocalMetaTemplate(data: {
  channel_config_id: string;
  name: string;
  language?: string;
  meta_category?: string;
  usage_scope?: MetaTemplateUsage;
  body_named?: string;
  header_json?: MetaTemplateHeader;
  footer_text?: string;
  buttons_json?: MetaTemplateButton[];
  also_create_app_template?: boolean;
  app_template_name?: string;
  app_template_category?: string;
  app_template_audience_scope?: string;
}): Promise<WhatsAppMetaTemplateItem & {
  pairing?: { app_template?: MessageTemplateItem; info?: string };
  info?: string;
}> {
  return request('/meta-templates/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateLocalMetaTemplate(
  id: string,
  data: Partial<{
    name: string;
    language: string;
    meta_category: string;
    usage_scope: MetaTemplateUsage;
    body_named: string;
    header_json: MetaTemplateHeader;
    footer_text: string;
    buttons_json: MetaTemplateButton[];
  }>,
): Promise<WhatsAppMetaTemplateItem> {
  return request(`/meta-templates/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteLocalMetaTemplate(
  id: string,
  deleteOnMeta = false,
): Promise<{ success: boolean }> {
  const qs = deleteOnMeta ? '?delete_on_meta=1' : '';
  return request(`/meta-templates/${id}/${qs}`, { method: 'DELETE' });
}

export async function submitLocalMetaTemplate(id: string): Promise<WhatsAppMetaTemplateItem> {
  return request(`/meta-templates/${id}/submit/`, { method: 'POST', body: '{}' });
}

export async function resubmitLocalMetaTemplate(id: string): Promise<WhatsAppMetaTemplateItem> {
  return request(`/meta-templates/${id}/resubmit/`, { method: 'POST', body: '{}' });
}

export async function refreshLocalMetaTemplateStatus(id: string): Promise<WhatsAppMetaTemplateItem> {
  return request(`/meta-templates/${id}/refresh-status/`, { method: 'POST', body: '{}' });
}

export async function cloneLocalMetaTemplate(
  id: string,
  newName: string,
): Promise<WhatsAppMetaTemplateItem> {
  return request(`/meta-templates/${id}/clone/`, {
    method: 'POST',
    body: JSON.stringify({ new_name: newName }),
  });
}

export async function createAppTemplateFromMeta(
  id: string,
  data?: { name?: string; category?: string; audience_scope?: string },
): Promise<{
  success: boolean;
  info?: string;
  app_template?: MessageTemplateItem;
  meta_template?: WhatsAppMetaTemplateItem;
}> {
  return request(`/meta-templates/${id}/create-app-template/`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

export async function importAppTemplatesFromMeta(data?: {
  channel_config_id?: string;
  account_id?: string;
  category?: string;
  audience_scope?: string;
}): Promise<{
  created_count: number;
  skipped_count: number;
  created: Array<{ id: string; name: string; meta_template_id: string }>;
  skipped: Array<{ meta_template_id: string; name: string; reason: string }>;
  info?: string;
}> {
  return request('/meta-templates/import-app-templates/', {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

/** Kampanya CAMPAIGN taslakları: duyuru / hatirlatma / bilgilendirme × veli|öğrenci × medya */
export async function seedDuyuruMetaTemplates(data: {
  channel_config_id: string;
  force?: boolean;
}): Promise<{
  created_count: number;
  updated_count?: number;
  skipped_count: number;
  created: string[];
  updated?: string[];
  skipped: string[];
  errors: string[];
  next_steps?: string[];
  info?: string;
}> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/meta-templates/seed-duyuru/', {
    method: 'POST',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

/** Personel sohbet açılış PERSONAL taslakları (birim × veli/öğrenci + QUICK_REPLY) */
export async function seedPersonalChatTemplates(data: {
  channel_config_id: string;
  force?: boolean;
}): Promise<{
  created_count: number;
  updated_count?: number;
  skipped_count: number;
  created: string[];
  updated?: string[];
  skipped: string[];
  errors: string[];
  department?: string;
  next_steps?: string[];
  info?: string;
}> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/meta-templates/seed-personal-chat/', {
    method: 'POST',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

/** Akademik sınıf ders programı — veli/öğrenci DOCUMENT Meta + LMS + bildirim bağlama */
export async function seedAcademicScheduleTemplates(data: {
  channel_config_id: string;
  sube_id?: number | null;
  force?: boolean;
  bind?: boolean;
}): Promise<{
  created_app_count: number;
  updated_app_count: number;
  skipped_app_count: number;
  created_meta_count: number;
  updated_meta_count: number;
  skipped_meta_count: number;
  bound_count: number;
  created_app: string[];
  updated_app: string[];
  created_meta: string[];
  updated_meta: string[];
  bound: string[];
  errors: string[];
  next_steps?: string[];
  event_keys?: string[];
  info?: string;
}> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/meta-templates/seed-academic-schedule/', {
    method: 'POST',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function uploadMetaTemplateExampleMedia(
  file: File,
  channelConfigId: string,
): Promise<{ success: boolean; example_handle: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('channel_config_id', channelConfigId);
  const csrf = getCsrfToken();
  const headers: Record<string, string> = { ...getContextHeaders() };
  if (csrf) headers['X-CSRFToken'] = csrf;
  const res = await fetch(communicationApiUrl('/meta-templates/example-media/'), {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Örnek medya yüklenemedi');
  }
  return res.json();
}

// ─── Outbound queue monitoring ───

export interface OutboundQueueItem {
  id: string;
  message_id: string | null;
  status: string | null;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string;
  campaign_id: string | null;
  campaign_title: string;
  channel_config_id: string | null;
  channel_config_name: string;
  contact_phone: string;
  body_preview: string;
  created_at: string | null;
  updated_at: string | null;
}

export async function fetchOutboundQueue(params?: {
  status?: string;
  campaign_id?: string;
  channel_config_id?: string;
  page?: number;
  page_size?: number;
}): Promise<{
  items: OutboundQueueItem[];
  total: number;
  page: number;
  page_size: number;
  status_counts: { pending: number; sending: number; failed: number };
}> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const search = new URLSearchParams();
  if (kurumId) search.set('kurum_id', kurumId);
  if (params?.status) search.set('status', params.status);
  if (params?.campaign_id) search.set('campaign_id', params.campaign_id);
  if (params?.channel_config_id) search.set('channel_config_id', params.channel_config_id);
  if (params?.page) search.set('page', String(params.page));
  if (params?.page_size) search.set('page_size', String(params.page_size));
  const qs = search.toString();
  return request(`/queue/${qs ? `?${qs}` : ''}`);
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
  options?: {
    ogrenci_id?: number;
    veli_id?: number;
    personel_id?: number;
    channel_config_id?: string;
  },
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

/** Veli sohbetinde "… velisi" alt satırı; öğrenci sohbetinde veli adı (varsa). */
export function conversationRelationLabel(conv: {
  contact_type?: string;
  ogrenci_ad?: string;
  ogrenci_adlari?: string[];
  veli_ad?: string;
}): string {
  const students = (conv.ogrenci_adlari && conv.ogrenci_adlari.length > 0)
    ? conv.ogrenci_adlari
    : (conv.ogrenci_ad ? conv.ogrenci_ad.split(',').map((s) => s.trim()).filter(Boolean) : []);
  if (conv.contact_type === 'VELI' && students.length > 0) {
    if (students.length === 1) return `${students[0]} velisi`;
    return `${students.join(', ')} velisi`;
  }
  if (conv.contact_type === 'OGRENCI' && conv.veli_ad) {
    return `Veli: ${conv.veli_ad}`;
  }
  return '';
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

export type ContactKind = 'ogrenci' | 'anne' | 'baba' | 'vasi';
export type MaliDurumFilter = 'borclu' | 'borcu_yok' | 'geciken';

export interface KalemFilterSpec {
  turu: string;
  id: number;
}

export interface AudienceFilter {
  audience_type?: string;
  sinif_id?: number;
  sube_id?: number;
  coach_id?: number;
  ogrenci_ids?: number[];
  veli_ids?: number[];
  personel_ids?: number[];
  egitim_yili_id?: number;
  template_name?: string;

  // Gelişmiş filtre alanları (Faz B)
  sinif_ids?: number[];
  sinif_seviyesi_ids?: number[];
  alan_ids?: number[];
  coach_ids?: number[];
  school_ids?: number[];
  kalemler?: KalemFilterSpec[];
  giris_turu?: string;
  kayit_turu?: string;
  durum?: string;
  mali_durum?: MaliDurumFilter | '';
  has_phone?: boolean | null;
  whatsapp_default_only?: boolean;
  contact_kinds?: ContactKind[];
  included_ogrenci_ids?: number[];
  excluded_ogrenci_ids?: number[];
  included_veli_ids?: number[];
  excluded_veli_ids?: number[];
  included_personel_ids?: number[];
  excluded_personel_ids?: number[];
  /** Personel kitlesi: görevlendirme rolleri (boş = tüm personel) */
  rol_ids?: number[];
  q?: string;
}

export interface CampaignPreviewRecipient {
  e164: string;
  recipient_type: string;
  ogrenci_id?: number | null;
  veli_id?: number | null;
  personel_id?: number | null;
  display_name?: string;
}

export interface CampaignPreviewStats {
  total_recipients: number;
  ogrenci_count: number;
  veli_count: number;
  personel_count?: number;
  estimated_messages: number;
  invalid_phones: number;
  attachment_count?: number;
  estimated_cost_usd?: string;
  ai_used?: boolean;
  recipients?: CampaignPreviewRecipient[];
  recipients_total?: number;
  page?: number;
  page_size?: number;
}

export interface BulkRecipientHit {
  kind: 'ogrenci' | 'veli' | 'personel';
  id: number;
  label: string;
  meta?: string;
  phone?: string;
  sinif?: string;
  ad?: string;
  soyad?: string;
  ogrenci_id?: number;
  ogrenci_name?: string;
  veli_turu_display?: string;
}

export async function searchBulkRecipients(
  q: string,
  options?: { includePersonel?: boolean },
): Promise<{ results: BulkRecipientHit[]; counts?: Record<string, number> }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const search = new URLSearchParams();
  search.set('q', q);
  if (kurumId) search.set('kurum_id', kurumId);
  if (options?.includePersonel === false) search.set('include_personel', '0');
  return request(`/recipients/search/?${search.toString()}`);
}

export interface MessageTemplateItem {
  id: string;
  category: string;
  audience_scope?: string;
  category_label?: string;
  name: string;
  body: string;
  header_json?: MetaTemplateHeader;
  footer_text?: string;
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
  system_usages?: Array<{
    module: string;
    role: string;
    label: string;
    is_active: boolean;
    event_key?: string;
  }>;
  is_system_active?: boolean;
  odev_pdf_role?: string | null;
  /** Meta karşılığı — 24 saatlik pencere kapalıyken bu şablon kullanılır */
  meta_template?: string | null;
  meta_template_name?: string;
  meta_template_status?: string;
}

export interface CampaignAttachmentItem {
  id: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  url?: string;
}

export type SendMode = 'now' | 'scheduled' | 'draft';

export interface CampaignAnalytics {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  delivery_rate: number;
  read_rate: number;
  fail_rate: number;
  reply_rate: number;
}

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
  replied_count?: number;
  delivery_rate?: number;
  read_rate?: number;
  channel_config_id?: string | null;
  channel_config_name?: string;
  created_by?: number | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  body_template?: string;
  recipient_filter_json?: AudienceFilter;
  preview_stats_json?: CampaignPreviewStats;
  retried_count?: number;
  analytics?: CampaignAnalytics;
  scheduled_at?: string | null;
  estimated_cost_usd?: string;
}

export async function previewCampaign(
  audienceFilter: AudienceFilter,
  options?: {
    attachmentCount?: number;
    aiUsed?: boolean;
    channelConfigId?: string;
    includeRecipients?: boolean;
    page?: number;
    pageSize?: number;
  },
): Promise<CampaignPreviewStats> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request<CampaignPreviewStats>('/campaigns/preview/', {
    method: 'POST',
    body: JSON.stringify({
      kurum_id: kurumId,
      recipient_filter: audienceFilter,
      attachment_count: options?.attachmentCount ?? 0,
      ai_used: options?.aiUsed ?? false,
      channel_config_id: options?.channelConfigId,
      include_recipients: options?.includeRecipients ?? false,
      page: options?.page,
      page_size: options?.pageSize,
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
  channel_config_id?: string;
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
  all_personeller: 'Personeller',
  sinif: 'Sınıf',
  sube: 'Şube',
  coach_students: 'Koç öğrencileri',
  coach_parents: 'Koç velileri',
  custom_ids: 'Arama ile seç (öğrenci / veli / personel)',
  filtered: 'Filtre',
  advanced: 'Gelişmiş filtre',
};

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  ogrenci: 'Öğrenci',
  anne: 'Anne',
  baba: 'Baba',
  vasi: 'Vasi',
};

export const MALI_DURUM_LABELS: Record<MaliDurumFilter, string> = {
  borclu: 'Borçlu',
  borcu_yok: 'Borcu yok',
  geciken: 'Gecikmiş taksidi olan',
};

/** Hesap seçici / etiketleri için okunabilir isim. */
export function accountLabel(account: WhatsAppAccount): string {
  const base = account.name || account.display_phone || account.phone_number_id || 'WhatsApp Hesabı';
  return account.is_default ? `${base} (Varsayılan)` : base;
}

/**
 * Basit önizleme: gövde metnindeki {{veli_ad}} / {{ogrenci_ad}} belirteçlerini
 * alıcının display_name'i ile değiştirir; diğer belirteçler örnek verilerle doldurulur.
 */
export function renderSampleMessage(
  body: string,
  recipient: { recipient_type?: string; display_name?: string },
): string {
  const name = recipient.display_name?.trim() || '';
  const isVeli = (recipient.recipient_type || '').toUpperCase() === 'VELI';
  let text = body;
  if (name) {
    text = text.replace(/\{\{veli_ad\}\}/g, isVeli ? name : recipient.display_name || '');
    text = text.replace(/\{\{ogrenci_ad\}\}/g, !isVeli ? name : recipient.display_name || '');
  }
  return text;
}

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

// ─── Merkezi bildirim şablon eşlemesi ───

export type NotificationSendMode = 'AUTO' | 'META_ONLY' | 'FREEFORM_ONLY' | 'DISABLED';

export interface NotificationBindingRow {
  id: string;
  sube_id: number | null;
  channel_config_id: string | null;
  meta_template_id: string | null;
  meta_template_name: string;
  message_template_id: string | null;
  message_template_name: string;
  send_mode: NotificationSendMode;
  is_active: boolean;
}

export interface NotificationResolvedInfo {
  source: string;
  source_label: string;
  send_mode: NotificationSendMode;
  meta_template_id: string | null;
  meta_template_name: string;
  meta_template_status: string;
  message_template_name: string;
  body: string;
  warnings: string[];
}

export interface NotificationEventSlot {
  recipient_type: 'VELI' | 'OGRENCI' | 'PERSONEL';
  binding: NotificationBindingRow | null;
  suggested_meta_name: string;
  default_body: string;
  meta_example_body: string;
  resolved: NotificationResolvedInfo;
}

export interface NotificationEventItem {
  key: string;
  module: string;
  module_label: string;
  label: string;
  description: string;
  has_document: boolean;
  has_image?: boolean;
  opt_in_category: string;
  variables: string[];
  meta_name_base: string;
  slots: NotificationEventSlot[];
}

export interface BirthdayMediaAsset {
  id: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  is_active: boolean;
  sort_order: number;
  sube_id: number | null;
  url: string;
  created_at: string | null;
}

export async function fetchBirthdayMedia(params?: {
  active_only?: boolean;
}): Promise<{ assets: BirthdayMediaAsset[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.active_only) qs.set('active_only', '1');
  const suffix = qs.toString() ? `?${qs}` : '';
  return request(`/birthday-media/${suffix}`);
}

export async function uploadBirthdayMedia(file: File): Promise<BirthdayMediaAsset> {
  const form = new FormData();
  form.append('file', file);
  const csrf = getCsrfToken();
  const headers: Record<string, string> = { ...getContextHeaders() };
  if (csrf) headers['X-CSRFToken'] = csrf;
  const res = await fetch(communicationApiUrl('/birthday-media/'), {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.error || err.detail || err.message;
    throw new Error(
      typeof detail === 'string' && detail.trim()
        ? detail
        : `Görsel yüklenemedi (HTTP ${res.status})`,
    );
  }
  return res.json();
}

export async function updateBirthdayMedia(
  id: string,
  data: Partial<{ is_active: boolean; sort_order: number }>,
): Promise<BirthdayMediaAsset> {
  return request(`/birthday-media/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteBirthdayMedia(id: string): Promise<{ success: boolean }> {
  return request(`/birthday-media/${id}/`, { method: 'DELETE' });
}

export interface NotificationEventCatalog {
  modules: Array<{ key: string; label: string }>;
  events: NotificationEventItem[];
  send_modes: Array<{ value: NotificationSendMode; label: string }>;
}

export interface NotificationPreviewResult {
  event_key: string;
  recipient_type: string;
  body: string;
  send_mode: NotificationSendMode;
  uses_meta: boolean;
  meta_template_name: string;
  meta_template_language: string;
  message_template_name: string;
  channel_config_id: string | null;
  source: string;
  source_label: string;
  warnings: string[];
  would_send: boolean;
}

export async function fetchNotificationEvents(params?: {
  sube_id?: number | null;
  channel_config_id?: string | null;
}): Promise<NotificationEventCatalog> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = new URLSearchParams();
  if (kurumId) qs.set('kurum_id', kurumId);
  if (params?.sube_id) qs.set('sube_id', String(params.sube_id));
  if (params?.channel_config_id) qs.set('channel_config_id', params.channel_config_id);
  const suffix = qs.toString() ? `?${qs}` : '';
  return request(`/notification-events/${suffix}`);
}

export async function saveNotificationBinding(data: {
  event_key: string;
  recipient_type: string | 'VELI' | 'OGRENCI' | 'PERSONEL';
  sube_id?: number | null;
  channel_config_id?: string | null;
  meta_template_id?: string | null;
  message_template_id?: string | null;
  send_mode?: NotificationSendMode;
  is_active?: boolean;
}): Promise<{ id: string }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/notification-bindings/', {
    method: 'PUT',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function deleteNotificationBinding(data: {
  event_key: string;
  recipient_type: string;
  sube_id?: number | null;
  channel_config_id?: string | null;
}): Promise<{ deleted: number }> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/notification-bindings/', {
    method: 'DELETE',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function previewNotificationBinding(data: {
  event_key: string;
  recipient_type: string;
  sube_id?: number | null;
  channel_config_id?: string | null;
  context?: Record<string, string>;
}): Promise<NotificationPreviewResult> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/notification-bindings/preview/', {
    method: 'POST',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function fetchTemplate(id: string): Promise<MessageTemplateItem> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const qs = kurumId ? `?kurum_id=${kurumId}` : '';
  return request(`/templates/${id}/${qs}`);
}

export async function createTemplate(data: {
  name: string;
  body?: string;
  header_json?: MetaTemplateHeader;
  footer_text?: string;
  category?: string;
  audience_scope?: string;
  variables_json?: string[];
  odev_pdf_role?: string;
  meta_template_id?: string | null;
  also_create_meta_template?: boolean;
  meta_channel_config_id?: string | null;
  meta_template_name?: string;
  meta_language?: string;
  meta_category?: string;
}): Promise<MessageTemplateItem & {
  pairing?: { meta_template?: WhatsAppMetaTemplateItem; info?: string };
  info?: string;
}> {
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  return request('/templates/', {
    method: 'POST',
    body: JSON.stringify({ ...data, kurum_id: kurumId }),
  });
}

export async function updateTemplate(
  id: string,
  data: Partial<{
    name: string;
    body: string;
    header_json: MetaTemplateHeader;
    footer_text: string;
    category: string;
    audience_scope: string;
    is_active: boolean;
    odev_pdf_role: string;
    meta_template_id: string | null;
  }>,
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
