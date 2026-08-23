"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CommunicationPageShell, TemplateBindingSelect, WhatsAppPreviewBubble } from "@/components/communication";
import { headerTypeOf } from "@/components/communication/MetaTemplateSelect";
import { eventTemplateGroup } from "@/components/communication/notification-event-utils";
import { resolvePreviewVariables } from "@/components/communication/composer-utils";
import { useLivePreviewContext } from "@/components/communication/useLivePreviewContext";
import "@/components/communication/communication.css";
import {
  MessageTemplateItem,
  NotificationEventCatalog,
  NotificationEventItem,
  NotificationEventSlot,
  NotificationPreviewResult,
  NotificationSendMode,
  NotificationStaffRecipientItem,
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
  deleteNotificationBinding,
  fetchLocalMetaTemplates,
  fetchNotificationEvents,
  fetchNotificationStaffRecipients,
  fetchTemplates,
  fetchWhatsAppAccounts,
  previewNotificationBinding,
  saveNotificationBinding,
  saveNotificationStaffRecipients,
  seedAcademicScheduleTemplates,
  seedKayitSozlesmeTemplates,
  seedKutuphaneYoklamaTemplates,
} from "@/lib/communication-api";
import { notifyCommunicationTemplateUsageChanged } from "@/lib/communication-template-usage-sync";

const RECIPIENT_LABELS: Record<string, string> = {
  VELI: "Veli",
  OGRENCI: "Öğrenci",
  PERSONEL: "Personel",
};

const RECIPIENT_ICONS: Record<string, string> = {
  VELI: "👪",
  OGRENCI: "🎓",
  PERSONEL: "🧑‍💼",
};

const SEND_MODE_SHORT: Record<string, string> = {
  AUTO: "Otomatik",
  META_ONLY: "Meta şablonu",
  FREEFORM_ONLY: "Serbest mesaj",
  DISABLED: "Kapalı",
};

const SEND_MODE_HINT: Record<string, string> = {
  AUTO: "24 saatlik pencere açıkken serbest mesaj, kapalıyken onaylı Meta şablonu gönderilir.",
  META_ONLY: "Her zaman onaylı Meta şablonu gönderilir.",
  FREEFORM_ONLY: "Yalnızca 24 saatlik pencere açıkken serbest mesaj gönderilir.",
  DISABLED: "Bu bildirim hiç gönderilmez.",
};

const STATUS_FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "bound", label: "Bağlı" },
  { key: "default", label: "Varsayılan" },
  { key: "warn", label: "Uyarı" },
  { key: "off", label: "Kapalı" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

const EMPTY_EVENTS: NotificationEventItem[] = [];

const readActiveSubeId = (): number | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("3k_active_sube");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const sameAccountOrWaba = (
  tpl: WhatsAppMetaTemplateItem,
  accountId: string,
  accounts: WhatsAppAccount[],
): boolean => {
  if (!accountId) return true;
  if (String(tpl.channel_config || "") === String(accountId)) return true;
  const selected = accounts.find((a) => String(a.id) === String(accountId));
  const selectedWaba = (selected?.waba_id || "").trim();
  if (!selectedWaba) return false;
  const tplWaba = (tpl.waba_id || "").trim();
  if (tplWaba && tplWaba === selectedWaba) return true;
  const tplAccount = accounts.find((a) => String(a.id) === String(tpl.channel_config || ""));
  return Boolean(tplAccount?.waba_id && tplAccount.waba_id.trim() === selectedWaba);
};

function moduleEventMatches(modKey: string, event: NotificationEventItem): boolean {
  if (modKey.startsWith("yoklama:")) {
    return event.module === "yoklama" && event.group === modKey.slice("yoklama:".length);
  }
  return event.module === modKey;
}

const slotHasCustomBinding = (slot: NotificationEventSlot): boolean =>
  Boolean(
    slot.binding &&
      (slot.binding.meta_template_id ||
        slot.binding.message_template_id ||
        (slot.binding.send_mode && slot.binding.send_mode !== "AUTO") ||
        slot.binding.is_active === false),
  );

const slotSendMode = (slot: NotificationEventSlot): NotificationSendMode =>
  (slot.binding?.send_mode || slot.resolved.send_mode || "AUTO") as NotificationSendMode;

interface EventStatus {
  bound: boolean;
  warn: boolean;
  off: boolean;
  inactive: boolean;
}

function eventStatus(event: NotificationEventItem): EventStatus {
  return {
    bound: event.slots.some(slotHasCustomBinding),
    warn: event.slots.some((slot) => (slot.resolved.warnings || []).length > 0),
    off: event.slots.some((slot) => slotSendMode(slot) === "DISABLED"),
    inactive: event.slots.some((slot) => slot.binding?.is_active === false),
  };
}

function slotKeyOf(eventKey: string, recipientType: string): string {
  return `${eventKey}:${recipientType}`;
}

/* ─────────────── Alıcı yöneticiler (kayıt sözleşmesi) ─────────────── */

function StaffRecipientsPanel({
  eventKey,
  subeId,
  onError,
  onMessage,
}: {
  eventKey: string;
  subeId: number | null;
  onError: (msg: string | null) => void;
  onMessage: (msg: string | null) => void;
}) {
  const [items, setItems] = useState<NotificationStaffRecipientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotificationStaffRecipients(eventKey, subeId);
      setItems(data.items || []);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Yönetici listesi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [eventKey, subeId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: number) => {
    setItems((prev) =>
      prev.map((row) => (row.id === id ? { ...row, selected: !row.selected } : row)),
    );
  };

  const save = async () => {
    setSaving(true);
    onError(null);
    try {
      const data = await saveNotificationStaffRecipients({
        event_key: eventKey,
        personel_ids: items.filter((row) => row.selected).map((row) => row.id),
        sube_id: subeId,
      });
      setItems(data.items || []);
      onMessage("Alıcı yöneticiler kaydedildi.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Alıcılar kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = items.filter((row) => row.selected).length;

  return (
    <div className="nbx-staff">
      <div className="nbx-staff-head">
        <div>
          <strong>Alıcı yöneticiler</strong>
          <p className="nbx-hint">
            Sözleşme aktif edilince işaretlenen kurum / şube / eğitim yöneticilerine WhatsApp
            gider. Telefonu olmayanlar seçilse bile gönderilmez.
          </p>
        </div>
        <span className="nbx-badge">{selectedCount} seçili</span>
      </div>

      {loading ? (
        <div className="nbx-staff-list">
          <div className="nbx-skeleton" style={{ height: 44 }} />
          <div className="nbx-skeleton" style={{ height: 44 }} />
        </div>
      ) : items.length === 0 ? (
        <p className="nbx-hint">
          Bu kurumda kurum / şube / eğitim yöneticisi görevlendirmesi veya yönetici giriş hesabı
          olan personel yok.
        </p>
      ) : (
        <div className="nbx-staff-list">
          {items.map((row) => (
            <label
              key={row.id}
              className={`nbx-staff-row${!row.has_phone ? " is-disabled" : ""}${
                row.selected ? " is-selected" : ""
              }`}
            >
              <input type="checkbox" checked={row.selected} onChange={() => toggle(row.id)} />
              <span className="nbx-staff-text">
                <strong>
                  {row.ad} {row.soyad}
                </strong>
                <span className="nbx-staff-meta">
                  {row.rol}
                  {row.has_phone ? ` · ${row.telefon}` : " · telefon yok"}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      <button
        type="button"
        className="nbx-mini-btn"
        disabled={saving || loading}
        onClick={() => void save()}
      >
        {saving ? "Kaydediliyor…" : "Alıcıları kaydet"}
      </button>
    </div>
  );
}

/* ─────────────── Alıcı slotu (Veli / Öğrenci / Personel) ─────────────── */

interface SlotCardProps {
  event: NotificationEventItem;
  slot: NotificationEventSlot;
  sendModes: Array<{ value: NotificationSendMode; label: string }>;
  metaOptions: WhatsAppMetaTemplateItem[];
  lmsOptions: MessageTemplateItem[];
  boundMeta: WhatsAppMetaTemplateItem | null;
  busy: boolean;
  preview: NotificationPreviewResult | undefined;
  previewLoading: boolean;
  scopeAccountId: string;
  previewContext: Record<string, string>;
  copiedKey: string;
  onCopy: (text: string, key: string) => void;
  onPersist: (
    event: NotificationEventItem,
    slot: NotificationEventSlot,
    patch: Partial<{
      meta_template_id: string | null;
      message_template_id: string | null;
      send_mode: NotificationSendMode;
      is_active: boolean;
    }>,
  ) => void;
  onReset: (event: NotificationEventItem, slot: NotificationEventSlot) => void;
  onRefreshPreview: (event: NotificationEventItem, slot: NotificationEventSlot) => void;
}

function SlotCard({
  event,
  slot,
  sendModes,
  metaOptions,
  lmsOptions,
  boundMeta,
  busy,
  preview,
  previewLoading,
  scopeAccountId,
  previewContext,
  copiedKey,
  onCopy,
  onPersist,
  onReset,
  onRefreshPreview,
}: SlotCardProps) {
  const [showExample, setShowExample] = useState(false);
  const fieldId = useId();

  const key = slotKeyOf(event.key, slot.recipient_type);
  const custom = slotHasCustomBinding(slot);
  const mode = slotSendMode(slot);
  const inactive = slot.binding?.is_active === false;
  const warnings = slot.resolved.warnings || [];

  const headerFilterHint = event.has_image
    ? "Yalnızca IMAGE başlıklı Meta şablonları listelenir."
    : event.has_document
      ? "Yalnızca DOCUMENT (PDF) başlıklı Meta şablonları listelenir."
      : "Yalnızca metin başlıklı (TEXT / başlıksız) Meta şablonları listelenir.";

  const createHref = (() => {
    const qs = new URLSearchParams({
      event: event.key,
      recipient: slot.recipient_type,
      bind: "1",
    });
    if (scopeAccountId) qs.set("account", scopeAccountId);
    return `/admin/iletisim/meta-sablonlar?${qs.toString()}`;
  })();

  const resolvedBody =
    preview?.body ||
    boundMeta?.body_named ||
    slot.resolved.display_body ||
    slot.resolved.meta_template_body ||
    slot.resolved.body ||
    slot.default_body ||
    "";

  const previewBody = showExample
    ? slot.meta_example_body || slot.default_body || resolvedBody
    : resolvedBody;

  return (
    <div className={`nbx-slot${inactive ? " is-inactive" : ""}`}>
      <div className="nbx-slot-head">
        <span className="nbx-slot-avatar" aria-hidden="true">
          {RECIPIENT_ICONS[slot.recipient_type] || "💬"}
        </span>
        <div className="nbx-slot-ident">
          <span className="nbx-slot-name">
            {RECIPIENT_LABELS[slot.recipient_type] || slot.recipient_type}
          </span>
          <span className="nbx-slot-sub">{slot.resolved.source_label}</span>
        </div>

        <span className={`nbx-badge${custom ? " is-success" : ""}`}>
          {custom ? "Bu kapsamda tanımlı" : "Varsayılan"}
        </span>
        {inactive && <span className="nbx-badge is-danger">Pasif</span>}
        {warnings.length > 0 && (
          <span className="nbx-badge is-warn">{warnings.length} uyarı</span>
        )}

        <div className="nbx-slot-actions">
          {inactive && (
            <button
              type="button"
              className="nbx-mini-btn"
              disabled={busy}
              onClick={() => onPersist(event, slot, { is_active: true })}
            >
              Aktifleştir
            </button>
          )}
          <Link className="nbx-mini-btn" href={createHref}>
            Şablon oluştur
          </Link>
          {slot.binding && (
            <button
              type="button"
              className="nbx-mini-btn is-danger"
              disabled={busy}
              onClick={() => onReset(event, slot)}
            >
              Varsayılana dön
            </button>
          )}
        </div>
      </div>

      <div className="nbx-mode">
        <span className="nbx-field-label">Gönderim modu</span>
        <div className="nbx-seg" role="group" aria-label="Gönderim modu">
          {sendModes.map((item) => (
            <button
              key={item.value}
              type="button"
              className={mode === item.value ? "is-active" : ""}
              title={item.label}
              disabled={busy}
              onClick={() => onPersist(event, slot, { send_mode: item.value })}
            >
              {SEND_MODE_SHORT[item.value] || item.label}
            </button>
          ))}
        </div>
        <p className="nbx-hint">{SEND_MODE_HINT[mode] || ""}</p>
      </div>

      <div className="nbx-slot-body">
        <div className="nbx-slot-fields">
          <div className="nbx-field">
            <TemplateBindingSelect
              id={`${fieldId}-meta`}
              label="Meta şablonu"
              value={slot.binding?.meta_template_id || ""}
              emptyLabel={
                slot.resolved.meta_template_name
                  ? `Otomatik — ${slot.resolved.meta_template_name}`
                  : "Otomatik / yok"
              }
              eventGroup={eventTemplateGroup(event)}
              disabled={busy}
              hint={`${headerFilterHint} ${
                scopeAccountId
                  ? "Seçili WhatsApp hesabına ait şablonlar."
                  : "Tüm hesaplar — hesap adı seçenek sonunda görünür."
              } (${metaOptions.length} şablon)`}
              onChange={(id) => onPersist(event, slot, { meta_template_id: id || null })}
              options={metaOptions.map((tpl) => {
                const htype = headerTypeOf(tpl);
                const accountTag =
                  !scopeAccountId && tpl.channel_config_name
                    ? ` · ${tpl.channel_config_name}`
                    : "";
                const base = (event.meta_name_base || "").toLowerCase();
                return {
                  id: String(tpl.id),
                  name: tpl.name,
                  groupKey: tpl.template_group || "",
                  groupLabel: tpl.template_group_label || "",
                  status: tpl.status_label || tpl.status,
                  recommended: Boolean(base && (tpl.name || "").toLowerCase().includes(base)),
                  meta: [
                    htype && htype !== "NONE" ? `[${htype}]` : "",
                    `(${tpl.language})`,
                    tpl.status !== "APPROVED" ? `— ${tpl.status_label || tpl.status}` : "",
                    accountTag,
                  ].filter(Boolean).join(" "),
                };
              })}
            />
            {boundMeta && boundMeta.status !== "APPROVED" && (
              <p className="nbx-hint is-warn">
                Bu şablon Meta onayında değil ({boundMeta.status_label || boundMeta.status});
                pencere kapalıyken gönderilemez.
                {boundMeta.rejected_reason ? ` Red sebebi: ${boundMeta.rejected_reason}` : ""}
              </p>
            )}
            <div className="nbx-field-links">
              <button
                type="button"
                className={`nbx-copy${copiedKey === `meta:${key}` ? " is-copied" : ""}`}
                onClick={() => onCopy(slot.suggested_meta_name, `meta:${key}`)}
                title="Önerilen Meta şablon adını kopyala"
              >
                {copiedKey === `meta:${key}` ? "Kopyalandı" : slot.suggested_meta_name}
              </button>
              {slot.binding?.meta_template_id && (
                <Link
                  className="nbx-inline-link"
                  href={`/admin/iletisim/meta-sablonlar?account=${
                    boundMeta?.channel_config || scopeAccountId || ""
                  }`}
                >
                  Meta şablonlarda aç →
                </Link>
              )}
            </div>
          </div>

          <div className="nbx-field">
            <TemplateBindingSelect
              id={`${fieldId}-lms`}
              label="LMS şablonu (serbest mesaj)"
              value={slot.binding?.message_template_id || ""}
              emptyLabel={
                slot.resolved.message_template_name
                  ? `Otomatik — ${slot.resolved.message_template_name}`
                  : "Varsayılan metin"
              }
              eventGroup={eventTemplateGroup(event)}
              disabled={busy}
              hint="24 saatlik pencere açıkken bu metin serbest mesaj olarak gider."
              onChange={(id) => onPersist(event, slot, { message_template_id: id || null })}
              options={lmsOptions.map((tpl) => {
                const base = (event.meta_name_base || "").replace(/_/g, " ").toLowerCase();
                return {
                  id: String(tpl.id),
                  name: tpl.name,
                  groupKey: tpl.template_group || "",
                  groupLabel: tpl.template_group_label || "",
                  recommended: Boolean(base && tpl.name.toLowerCase().includes(base)),
                };
              })}
            />
            {slot.binding?.message_template_id && (
              <div className="nbx-field-links">
                <Link className="nbx-inline-link" href="/admin/iletisim/sablonlar">
                  LMS şablonlarda aç →
                </Link>
              </div>
            )}
          </div>

          {warnings.map((warning) => (
            <div key={warning} className="comm-alert comm-alert-warning">
              {warning}
            </div>
          ))}
        </div>

        <div className="nbx-preview">
          <div className="nbx-preview-head">
            <div className="nbx-seg nbx-seg-sm" role="group" aria-label="Önizleme kaynağı">
              <button
                type="button"
                className={!showExample ? "is-active" : ""}
                onClick={() => setShowExample(false)}
              >
                Gönderilecek
              </button>
              <button
                type="button"
                className={showExample ? "is-active" : ""}
                onClick={() => setShowExample(true)}
              >
                Meta örneği
              </button>
            </div>
            <button
              type="button"
              className="nbx-mini-btn"
              disabled={busy || previewLoading}
              onClick={() => onRefreshPreview(event, slot)}
            >
              {previewLoading ? "…" : "Yenile"}
            </button>
          </div>

          <p className="nbx-hint">
            {previewLoading && !preview
              ? "Önizleme yükleniyor…"
              : preview
                ? [
                    preview.uses_meta
                      ? `Meta şablonu: ${preview.meta_template_name}${
                          preview.meta_template_language ? ` (${preview.meta_template_language})` : ""
                        }`
                      : "Serbest mesaj olarak gönderilir",
                    preview.source_label,
                    preview.would_send ? null : "bu bildirim kapalı",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Önizleme alınamadı."}
          </p>

          <WhatsAppPreviewBubble text={resolvePreviewVariables(previewBody, previewContext)} />

          {(preview?.warnings || []).map((warning) => (
            <p key={warning} className="nbx-hint is-warn">
              {warning}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Sayfa ─────────────── */

export default function BildirimSablonlariClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [catalog, setCatalog] = useState<NotificationEventCatalog | null>(null);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [metaTemplates, setMetaTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [lmsTemplates, setLmsTemplates] = useState<MessageTemplateItem[]>([]);
  const [activeSubeId, setActiveSubeId] = useState<number | null>(null);

  const [scopeSube, setScopeSube] = useState(false);
  const [scopeAccountId, setScopeAccountId] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedEventKey, setSelectedEventKey] = useState("");
  const [urlEventApplied, setUrlEventApplied] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState("");
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({});
  const [seeding, setSeeding] = useState("");
  const [seedOpen, setSeedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, NotificationPreviewResult>>({});
  const [copiedKey, setCopiedKey] = useState("");

  const seedRef = useRef<HTMLDivElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewContext = useLivePreviewContext();

  useEffect(() => {
    setActiveSubeId(readActiveSubeId());
  }, []);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const scopeSubeId = scopeSube ? activeSubeId : null;
  const scopeChannelConfigId = scopeAccountId || null;

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotificationEvents({
        sube_id: scopeSubeId,
        channel_config_id: scopeChannelConfigId,
      });
      setCatalog(data);
      setPreviews({});
      setModuleFilter((current) =>
        current && data.modules.some((m) => m.key === current) ? current : "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bildirim olayları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [scopeSubeId, scopeChannelConfigId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const reloadTemplateLists = useCallback(async () => {
    try {
      const [acc, meta, lms] = await Promise.all([
        fetchWhatsAppAccounts({ activeOnly: true }),
        // Bağlamada taslak/pending de seçilebilsin (gönderim yine APPROVED ister)
        fetchLocalMetaTemplates(),
        fetchTemplates(),
      ]);
      setAccounts(acc.accounts || []);
      setMetaTemplates(meta.templates || []);
      setLmsTemplates((lms.templates || []).filter((t) => t.is_active));
    } catch {
      // şablon listeleri yüklenemezse ekran yine de çalışır
    }
  }, []);

  useEffect(() => {
    void reloadTemplateLists();
  }, [reloadTemplateLists]);

  const events = catalog?.events || EMPTY_EVENTS;
  const urlEventKey = (searchParams.get("event") || "").trim();

  // Katalog gelince seçimi geçerli tut (URL'den gelen olay varsa ona öncelik)
  useEffect(() => {
    if (!events.length) return;
    if (!urlEventApplied && urlEventKey) return;
    setSelectedEventKey((current) =>
      current && events.some((e) => e.key === current) ? current : events[0].key,
    );
  }, [events, urlEventApplied, urlEventKey]);

  // ?event=... derin bağlantısı
  useEffect(() => {
    if (!catalog || urlEventApplied) return;
    if (urlEventKey && catalog.events.some((e) => e.key === urlEventKey)) {
      setSelectedEventKey(urlEventKey);
    }
    setUrlEventApplied(true);
  }, [catalog, urlEventApplied, urlEventKey]);

  // Seçim değişince adres çubuğunu güncelle (paylaşılabilir bağlantı)
  useEffect(() => {
    if (!urlEventApplied || !selectedEventKey || urlEventKey === selectedEventKey) return;
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("event", selectedEventKey);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  }, [selectedEventKey, urlEventApplied, urlEventKey, searchParams, pathname, router]);

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr");
    return events.filter((event) => {
      if (moduleFilter && !moduleEventMatches(moduleFilter, event)) return false;

      if (statusFilter !== "all") {
        const status = eventStatus(event);
        if (statusFilter === "bound" && !status.bound) return false;
        if (statusFilter === "default" && status.bound) return false;
        if (statusFilter === "warn" && !status.warn) return false;
        if (statusFilter === "off" && !status.off && !status.inactive) return false;
      }

      if (!term) return true;
      const haystack = [
        event.label,
        event.key,
        event.description,
        event.module_label,
        event.group_label,
        event.meta_name_base,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr");
      return haystack.includes(term);
    });
  }, [events, moduleFilter, statusFilter, search]);

  const railGroups = useMemo(() => {
    const modules = catalog?.modules || [];
    return modules
      .map((mod) => ({
        ...mod,
        items: filteredEvents.filter((event) => moduleEventMatches(mod.key, event)),
      }))
      .filter((group) => group.items.length > 0);
  }, [catalog, filteredEvents]);

  const stats = useMemo(() => {
    let bound = 0;
    let warn = 0;
    let off = 0;
    for (const event of events) {
      const status = eventStatus(event);
      if (status.bound) bound += 1;
      if (status.warn) warn += 1;
      if (status.off || status.inactive) off += 1;
    }
    return { total: events.length, bound, warn, off };
  }, [events]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.key === selectedEventKey) || null,
    [events, selectedEventKey],
  );

  const metaOptionsFor = useCallback(
    (event: NotificationEventItem, boundId?: string | null): WhatsAppMetaTemplateItem[] => {
      const scoped = scopeAccountId
        ? metaTemplates.filter((t) => sameAccountOrWaba(t, scopeAccountId, accounts))
        : metaTemplates;

      let required: string[];
      if (event.has_image) required = ["IMAGE"];
      else if (event.has_document) required = ["DOCUMENT"];
      // Serbest metin olaylarında medya başlıklı şablonları gizle —
      // yanlışlıkla DOCUMENT seçilmesin; yine de bağlı olanı göster.
      else required = ["NONE", "TEXT"];

      let list = scoped.filter((t) => required.includes(headerTypeOf(t)));

      // Bağlı şablon filtre dışında kaldıysa (eski header / başka hesap) yine de göster
      if (boundId) {
        const bound = metaTemplates.find((t) => String(t.id) === String(boundId));
        if (bound && !list.some((t) => String(t.id) === String(boundId))) {
          list = [bound, ...list];
        }
      }

      // İsim eşleşmesi: önerilen meta adları üste
      const base = (event.meta_name_base || "").toLowerCase();
      return [...list].sort((a, b) => {
        const aName = (a.name || "").toLowerCase();
        const bName = (b.name || "").toLowerCase();
        const aHit = base && aName.includes(base) ? 0 : 1;
        const bHit = base && bName.includes(base) ? 0 : 1;
        if (aHit !== bHit) return aHit - bHit;
        const aOk = a.status === "APPROVED" ? 0 : 1;
        const bOk = b.status === "APPROVED" ? 0 : 1;
        if (aOk !== bOk) return aOk - bOk;
        return a.name.localeCompare(b.name, "tr");
      });
    },
    [metaTemplates, scopeAccountId, accounts],
  );

  const lmsOptionsFor = useCallback(
    (event: NotificationEventItem) => {
      const base = event.meta_name_base || "";
      const rank = (name: string) => {
        const lower = name.toLowerCase();
        if (base && lower.includes(base.replace(/_/g, " "))) return 0;
        if (base && lower.includes(base.split("_")[0] || "")) return 1;
        return 2;
      };
      return [...lmsTemplates].sort((a, b) => {
        const diff = rank(a.name) - rank(b.name);
        return diff !== 0 ? diff : a.name.localeCompare(b.name, "tr");
      });
    },
    [lmsTemplates],
  );

  const persist = useCallback(
    async (
      event: NotificationEventItem,
      slot: NotificationEventSlot,
      patch: Partial<{
        meta_template_id: string | null;
        message_template_id: string | null;
        send_mode: NotificationSendMode;
        is_active: boolean;
      }>,
    ) => {
      const key = slotKeyOf(event.key, slot.recipient_type);
      setSavingSlot(key);
      setError(null);
      setMessage(null);
      const next = {
        meta_template_id: slot.binding?.meta_template_id ?? null,
        message_template_id: slot.binding?.message_template_id ?? null,
        send_mode: (slot.binding?.send_mode ?? "AUTO") as NotificationSendMode,
        is_active: slot.binding?.is_active ?? true,
        ...patch,
      };
      // Boş + AUTO → özel tanımı sil (null binding satırı bırakma)
      const isEmptyDefault =
        !next.meta_template_id &&
        !next.message_template_id &&
        (next.send_mode === "AUTO" || !next.send_mode) &&
        next.is_active !== false;

      try {
        if (isEmptyDefault && slot.binding) {
          await deleteNotificationBinding({
            event_key: event.key,
            recipient_type: slot.recipient_type,
            sube_id: scopeSubeId,
            channel_config_id: scopeChannelConfigId,
          });
          setMessage(
            `${event.label} — ${RECIPIENT_LABELS[slot.recipient_type]} varsayılana döndü.`,
          );
          notifyCommunicationTemplateUsageChanged();
        } else if (isEmptyDefault && !slot.binding) {
          setMessage("Zaten varsayılan ayar kullanılıyor.");
        } else {
          await saveNotificationBinding({
            event_key: event.key,
            recipient_type: slot.recipient_type,
            sube_id: scopeSubeId,
            channel_config_id: scopeChannelConfigId,
            ...next,
          });
          setMessage(`${event.label} — ${RECIPIENT_LABELS[slot.recipient_type]} güncellendi.`);
          notifyCommunicationTemplateUsageChanged();
        }
        await loadCatalog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Eşleme kaydedilemedi.");
      } finally {
        setSavingSlot("");
      }
    },
    [scopeSubeId, scopeChannelConfigId, loadCatalog],
  );

  const resetSlot = useCallback(
    async (event: NotificationEventItem, slot: NotificationEventSlot) => {
      const key = slotKeyOf(event.key, slot.recipient_type);
      setSavingSlot(key);
      setError(null);
      setMessage(null);
      try {
        await deleteNotificationBinding({
          event_key: event.key,
          recipient_type: slot.recipient_type,
          sube_id: scopeSubeId,
          channel_config_id: scopeChannelConfigId,
        });
        setMessage(`${event.label} — ${RECIPIENT_LABELS[slot.recipient_type]} varsayılana döndü.`);
        notifyCommunicationTemplateUsageChanged();
        await loadCatalog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Eşleme silinemedi.");
      } finally {
        setSavingSlot("");
      }
    },
    [scopeSubeId, scopeChannelConfigId, loadCatalog],
  );

  const loadPreview = useCallback(
    async (event: NotificationEventItem, slot: NotificationEventSlot) => {
      const key = slotKeyOf(event.key, slot.recipient_type);
      setPreviewLoading((prev) => ({ ...prev, [key]: true }));
      try {
        const result = await previewNotificationBinding({
          event_key: event.key,
          recipient_type: slot.recipient_type,
          sube_id: scopeSubeId,
          channel_config_id: scopeChannelConfigId,
        });
        setPreviews((prev) => ({ ...prev, [key]: result }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Önizleme alınamadı.");
      } finally {
        setPreviewLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [scopeSubeId, scopeChannelConfigId],
  );

  // Seçili olayın slotları için otomatik önizleme
  useEffect(() => {
    if (!selectedEvent) return;
    let cancelled = false;
    (async () => {
      for (const slot of selectedEvent.slots) {
        if (cancelled) return;
        await loadPreview(selectedEvent, slot);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEvent, loadPreview]);

  useEffect(() => {
    if (!seedOpen) return;
    const onPointerDown = (ev: MouseEvent) => {
      if (seedRef.current && !seedRef.current.contains(ev.target as Node)) setSeedOpen(false);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setSeedOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [seedOpen]);

  const copyText = useCallback((text: string, key: string) => {
    if (!text) return;
    const done = () => {
      setCopiedKey(key);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedKey(""), 1400);
    };
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => undefined);
    }
  }, []);

  const scopeLabel =
    scopeSube && activeSubeId
      ? scopeAccountId
        ? "Şube + WhatsApp hesabı"
        : "Şube"
      : scopeAccountId
        ? "WhatsApp hesabı"
        : "Kurum varsayılanı";

  const runSeed = useCallback(
    async (
      kind: "academic" | "kutuphane" | "kayit",
      confirmText: string,
      fallbackInfo: string,
      failText: string,
      focusEventKey: string,
      seedFn: (payload: {
        channel_config_id: string;
        sube_id: number | null;
        bind: boolean;
      }) => Promise<{ info?: string; next_steps?: string[]; errors?: string[] }>,
    ) => {
      const accountId = scopeAccountId || accounts[0]?.id || "";
      if (!accountId) {
        setError("WhatsApp hesabı seçin (veya en az bir aktif hesap tanımlayın).");
        return;
      }
      if (!confirm(confirmText)) return;
      setSeeding(kind);
      setSeedOpen(false);
      setError(null);
      setMessage(null);
      try {
        const res = await seedFn({
          channel_config_id: accountId,
          sube_id: scopeSube ? activeSubeId : null,
          bind: true,
        });
        const errText = (res.errors || []).length ? ` Hatalar: ${(res.errors || []).join("; ")}` : "";
        setMessage(
          (res.info || fallbackInfo) +
            (res.next_steps?.length ? ` → ${res.next_steps[0]}` : "") +
            errText,
        );
        notifyCommunicationTemplateUsageChanged();
        await Promise.all([loadCatalog(), reloadTemplateLists()]);
        setModuleFilter("");
        setStatusFilter("all");
        setSearch("");
        setSelectedEventKey(focusEventKey);
        if (!scopeAccountId) setScopeAccountId(accountId);
      } catch (err) {
        setError(err instanceof Error ? err.message : failText);
      } finally {
        setSeeding("");
      }
    },
    [scopeAccountId, accounts, scopeSube, activeSubeId, loadCatalog, reloadTemplateLists],
  );

  const handleSeedAcademicSchedule = () =>
    runSeed(
      "academic",
      "Sınıf ders programı taslakları oluşturulsun mu?\n\n" +
        "• sinif_programi_veli (DOCUMENT)\n" +
        "• sinif_programi_ogrenci (DOCUMENT)\n\n" +
        "LMS şablonları + Meta DRAFT üretilir ve bu olayın Veli/Öğrenci " +
        "slotlarına bağlanır. Örnek PDF yükleyip Meta onayına göndermeniz gerekir.",
      "Akademik program taslakları hazır.",
      "Akademik program taslakları oluşturulamadı.",
      "akademik.sinif_programi",
      seedAcademicScheduleTemplates,
    );

  const handleSeedKutuphaneYoklama = () =>
    runSeed(
      "kutuphane",
      "Kütüphane yoklama taslakları oluşturulsun mu?\n\n" +
        "• yoklama_gelmedi_veli / yoklama_gec_veli / yoklama_cikis_veli\n\n" +
        "Onaylı şablonlara dokunulmaz. Eksik olanlar Meta DRAFT olarak eklenir " +
        "ve Yoklama → Kütüphane olaylarına bağlanır.",
      "Kütüphane yoklama taslakları hazır.",
      "Kütüphane yoklama taslakları oluşturulamadı.",
      "yoklama.gelmedi",
      seedKutuphaneYoklamaTemplates,
    );

  const handleSeedKayitSozlesme = () =>
    runSeed(
      "kayit",
      "Kayıt sözleşmesi taslağı oluşturulsun mu?\n\n" +
        "• ogrenci_kayit_sozlesme_personel (metin)\n\n" +
        "LMS şablonu + Meta DRAFT üretilir ve bu olayın Personel " +
        "slotuna bağlanır. Meta’ya gönderip onaylatmanız gerekir.",
      "Kayıt sözleşmesi taslağı hazır.",
      "Kayıt sözleşmesi taslağı oluşturulamadı.",
      "ogrenci.kayit_sozlesme",
      seedKayitSozlesmeTemplates,
    );

  const seedItems = [
    {
      kind: "academic",
      title: "Ders programı taslakları",
      desc: "Planlama → Programı Bildir için veli/öğrenci PDF şablonları",
      run: handleSeedAcademicSchedule,
    },
    {
      kind: "kutuphane",
      title: "Kütüphane yoklama taslakları",
      desc: "Gelmedi / geç kalma / çıkış Meta şablonları",
      run: handleSeedKutuphaneYoklama,
    },
    {
      kind: "kayit",
      title: "Kayıt sözleşmesi taslağı",
      desc: "Sözleşme aktif bildirimi için yönetici şablonu",
      run: handleSeedKayitSozlesme,
    },
  ];

  return (
    <CommunicationPageShell
      title="Bildirim Şablonları"
      subtitle="Otomatik bildirimlerde hangi Meta / LMS şablonunun kullanılacağını buradan bağlayın."
      icon="🔗"
      breadcrumbs={[
        { label: "İletişim", href: "/admin/iletisim/panel" },
        { label: "Bildirim Şablonları" },
      ]}
      actions={
        <div className="nbx-head-actions">
          <div className="nbx-menu" ref={seedRef}>
            <button
              type="button"
              className="comm-btn-secondary"
              aria-expanded={seedOpen}
              disabled={accounts.length === 0 || Boolean(seeding)}
              onClick={() => setSeedOpen((v) => !v)}
            >
              {seeding ? "Oluşturuluyor…" : "Hazır taslaklar"} ▾
            </button>
            {seedOpen && (
              <div className="nbx-menu-panel" role="menu">
                {seedItems.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    className="nbx-menu-item"
                    role="menuitem"
                    disabled={Boolean(seeding)}
                    onClick={() => void item.run()}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.desc}</span>
                  </button>
                ))}
                <p className="nbx-menu-note">
                  Taslaklar {scopeAccountId ? "seçili" : "ilk aktif"} WhatsApp hesabına eklenir ve
                  ilgili olaylara bağlanır.
                </p>
              </div>
            )}
          </div>
          <Link className="comm-btn-secondary" href="/admin/iletisim/sablonlar">
            LMS Şablonları
          </Link>
          <Link className="comm-btn-secondary" href="/admin/iletisim/meta-sablonlar">
            Meta Şablonları
          </Link>
        </div>
      }
      maxWidth="full"
    >
      {(error || message) && (
        <div className="nbx-alerts">
          {error && (
            <div className="comm-alert comm-alert-danger nbx-alert">
              <span>{error}</span>
              <button
                type="button"
                className="nbx-alert-close"
                aria-label="Kapat"
                onClick={() => setError(null)}
              >
                ×
              </button>
            </div>
          )}
          {message && (
            <div className="comm-alert comm-alert-success nbx-alert">
              <span>{message}</span>
              <button
                type="button"
                className="nbx-alert-close"
                aria-label="Kapat"
                onClick={() => setMessage(null)}
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      <div className="nbx-toolbar">
        <div className="nbx-toolbar-row">
          <div className="nbx-field">
            <span className="nbx-field-label">Kapsam</span>
            <div className="nbx-seg" role="group" aria-label="Kapsam">
              <button
                type="button"
                className={!scopeSube ? "is-active" : ""}
                onClick={() => setScopeSube(false)}
              >
                Kurum
              </button>
              <button
                type="button"
                className={scopeSube ? "is-active" : ""}
                disabled={!activeSubeId}
                title={activeSubeId ? "Aktif şube" : "Aktif şube seçili değil"}
                onClick={() => setScopeSube(true)}
              >
                Aktif şube
              </button>
            </div>
          </div>

          <label className="nbx-field">
            <span className="nbx-field-label">WhatsApp hesabı</span>
            <select
              className="nbx-select"
              value={scopeAccountId}
              onChange={(e) => setScopeAccountId(e.target.value)}
            >
              <option value="">Tüm hesaplar</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </label>

          <label className="nbx-field">
            <span className="nbx-field-label">Modül</span>
            <select
              className="nbx-select"
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
            >
              <option value="">Tüm modüller</option>
              {(catalog?.modules || []).map((mod) => (
                <option key={mod.key} value={mod.key}>
                  {mod.label}
                </option>
              ))}
            </select>
          </label>

          <div className="nbx-field nbx-field-grow">
            <span className="nbx-field-label">Ara</span>
            <div className="nbx-search">
              <span className="nbx-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="search"
                value={search}
                placeholder="Olay adı, anahtar veya açıklama…"
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearch("");
                }}
              />
            </div>
          </div>
        </div>

        <div className="nbx-toolbar-row nbx-toolbar-row-end">
          <div className="nbx-chips">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`nbx-chip${statusFilter === item.key ? " is-active" : ""}`}
                onClick={() => setStatusFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="nbx-scope-note">
            Düzenlenen kapsam: <strong>{scopeLabel}</strong>. Daha özel kapsamda tanım yoksa sistem
            sırasıyla şube, hesap ve kurum varsayılanına düşer.
          </p>
        </div>
      </div>

      <div className="nbx-stats">
        <div className="nbx-stat">
          <span className="nbx-stat-icon" aria-hidden="true">
            🔔
          </span>
          <span>
            <span className="nbx-stat-value">{stats.total}</span>
            <span className="nbx-stat-label">Bildirim olayı</span>
          </span>
        </div>
        <div className="nbx-stat is-bound">
          <span className="nbx-stat-icon" aria-hidden="true">
            ✅
          </span>
          <span>
            <span className="nbx-stat-value">{stats.bound}</span>
            <span className="nbx-stat-label">Bu kapsamda tanımlı</span>
          </span>
        </div>
        <div className="nbx-stat is-warn">
          <span className="nbx-stat-icon" aria-hidden="true">
            ⚠️
          </span>
          <span>
            <span className="nbx-stat-value">{stats.warn}</span>
            <span className="nbx-stat-label">Uyarılı olay</span>
          </span>
        </div>
        <div className="nbx-stat is-off">
          <span className="nbx-stat-icon" aria-hidden="true">
            🚫
          </span>
          <span>
            <span className="nbx-stat-value">{stats.off}</span>
            <span className="nbx-stat-label">Kapalı / pasif</span>
          </span>
        </div>
      </div>

      {loading && !catalog ? (
        <div className="nbx-layout">
          <aside className="nbx-rail">
            <div className="nbx-rail-body">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="nbx-skeleton" style={{ height: 38, margin: 6 }} />
              ))}
            </div>
          </aside>
          <section className="nbx-detail">
            <div className="nbx-detail-card" style={{ padding: 18 }}>
              <div className="nbx-skeleton" style={{ height: 26, width: "40%" }} />
              <div className="nbx-skeleton" style={{ height: 16, width: "70%", marginTop: 12 }} />
              <div className="nbx-skeleton" style={{ height: 180, marginTop: 20 }} />
            </div>
          </section>
        </div>
      ) : (
        <div className="nbx-layout">
          <aside className="nbx-rail">
            <div className="nbx-rail-head">
              <span>Olaylar</span>
              <span>
                {filteredEvents.length}/{stats.total}
              </span>
            </div>
            <div className="nbx-rail-body">
              {railGroups.length === 0 ? (
                <p className="nbx-empty">
                  Filtreye uyan bildirim olayı yok.
                  {(search || statusFilter !== "all" || moduleFilter) && (
                    <button
                      type="button"
                      className="nbx-inline-link"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("all");
                        setModuleFilter("");
                      }}
                    >
                      Filtreleri temizle
                    </button>
                  )}
                </p>
              ) : (
                railGroups.map((group) => (
                  <div key={group.key} className="nbx-rail-group">
                    <div className="nbx-rail-group-label">{group.label}</div>
                    {group.items.map((event) => {
                      const status = eventStatus(event);
                      const dotClass = status.off || status.inactive
                        ? "is-off"
                        : status.warn
                          ? "is-warn"
                          : status.bound
                            ? "is-bound"
                            : "";
                      return (
                        <button
                          key={event.key}
                          type="button"
                          className={`nbx-rail-item${
                            selectedEventKey === event.key ? " is-active" : ""
                          }`}
                          onClick={() => setSelectedEventKey(event.key)}
                        >
                          <span className={`nbx-rail-dot ${dotClass}`} aria-hidden="true" />
                          <span className="nbx-rail-text">
                            <span className="nbx-rail-label">{event.label}</span>
                            <span className="nbx-rail-meta">
                              {event.slots
                                .map((s) => RECIPIENT_LABELS[s.recipient_type] || s.recipient_type)
                                .join(" · ")}
                            </span>
                          </span>
                          {event.has_document && <span className="nbx-tag">PDF</span>}
                          {event.has_image && <span className="nbx-tag is-image">GÖRSEL</span>}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </aside>

          <section className="nbx-detail">
            {!selectedEvent ? (
              <div className="nbx-detail-card nbx-detail-empty">
                <span aria-hidden="true">🔔</span>
                <strong>Bildirim olayı seçin</strong>
                <p className="nbx-hint">
                  Soldaki listeden bir olay seçerek Meta / LMS şablon eşlemesini düzenleyin.
                </p>
              </div>
            ) : (
              <>
                <div className="nbx-detail-card">
                  <header className="nbx-detail-head">
                    <div className="nbx-detail-title">
                      <div>
                        <span className="nbx-detail-crumb">
                          {selectedEvent.module_label}
                          {selectedEvent.group_label ? ` · ${selectedEvent.group_label}` : ""}
                        </span>
                        <h2>{selectedEvent.label}</h2>
                        {selectedEvent.description && (
                          <p className="nbx-detail-desc">{selectedEvent.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        className={`nbx-key${copiedKey === `key:${selectedEvent.key}` ? " is-copied" : ""}`}
                        title="Olay anahtarını kopyala"
                        onClick={() => copyText(selectedEvent.key, `key:${selectedEvent.key}`)}
                      >
                        {selectedEvent.key}
                      </button>
                    </div>

                    <div className="nbx-badges">
                      {selectedEvent.has_document && <span className="nbx-badge">PDF ekli</span>}
                      {selectedEvent.has_image && <span className="nbx-badge">Görsel ekli</span>}
                      {selectedEvent.opt_in_category && (
                        <span className="nbx-badge">
                          İzin kategorisi: {selectedEvent.opt_in_category}
                        </span>
                      )}
                      <span className="nbx-badge">
                        {selectedEvent.slots.length} alıcı rolü
                      </span>
                    </div>
                  </header>

                  <div className="nbx-vars">
                    <div className="nbx-vars-head">
                      <span className="nbx-field-label">Kullanılabilir değişkenler</span>
                      <span className="nbx-hint">Tıklayınca kopyalanır</span>
                    </div>
                    <div className="nbx-var-list">
                      {selectedEvent.variables.map((variable) => {
                        const token = `{{${variable}}}`;
                        const ck = `var:${selectedEvent.key}:${variable}`;
                        return (
                          <button
                            key={variable}
                            type="button"
                            className={`nbx-var${copiedKey === ck ? " is-copied" : ""}`}
                            onClick={() => copyText(token, ck)}
                          >
                            {copiedKey === ck ? "kopyalandı" : token}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedEvent.key === "ogrenci.kayit_sozlesme" && (
                    <StaffRecipientsPanel
                      eventKey={selectedEvent.key}
                      subeId={scopeSubeId}
                      onError={setError}
                      onMessage={setMessage}
                    />
                  )}
                </div>

                <div className="nbx-detail-card">
                  {selectedEvent.slots.map((slot) => {
                    const key = slotKeyOf(selectedEvent.key, slot.recipient_type);
                    return (
                      <SlotCard
                        key={key}
                        event={selectedEvent}
                        slot={slot}
                        sendModes={catalog?.send_modes || []}
                        metaOptions={metaOptionsFor(
                          selectedEvent,
                          slot.binding?.meta_template_id,
                        )}
                        lmsOptions={lmsOptionsFor(selectedEvent)}
                        boundMeta={
                          slot.binding?.meta_template_id
                            ? metaTemplates.find(
                                (t) => String(t.id) === String(slot.binding?.meta_template_id),
                              ) || null
                            : null
                        }
                        busy={savingSlot === key}
                        preview={previews[key]}
                        previewLoading={Boolean(previewLoading[key])}
                        scopeAccountId={scopeAccountId}
                        previewContext={previewContext}
                        copiedKey={copiedKey}
                        onCopy={copyText}
                        onPersist={persist}
                        onReset={resetSlot}
                        onRefreshPreview={loadPreview}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </CommunicationPageShell>
  );
}
