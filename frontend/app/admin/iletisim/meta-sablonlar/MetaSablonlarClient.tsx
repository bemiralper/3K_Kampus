"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CommunicationPageShell, NotificationEventPicker } from "@/components/communication";
import MessageComposer from "@/components/communication/MessageComposer";
import TemplateVariablePanel from "@/components/communication/TemplateVariablePanel";
import type { EventSlotSelection } from "@/components/communication/notification-event-utils";
import { catalogTemplateGroups } from "@/components/communication/notification-event-utils";
import { useTextareaInsert } from "@/components/communication/useTextareaInsert";
import { useSheetChrome } from "@/components/communication/useSheetChrome";
import {
  createComposerState,
  insertAtCursor,
  parseWhatsAppText,
  resolvePreviewVariables,
  TEMPLATE_VARIABLES,
  type ComposerState,
} from "@/components/communication/composer-utils";
import { useLivePreviewContext } from "@/components/communication/useLivePreviewContext";
import "@/components/communication/communication.css";
import {
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
  META_TEMPLATE_USAGE_LABELS,
  MetaTemplateButton,
  MetaTemplateHeader,
  MetaTemplateUsage,
  NotificationEventCatalog,
  cloneLocalMetaTemplate,
  createAppTemplateFromMeta,
  createLocalMetaTemplate,
  bulkDeleteLocalMetaTemplates,
  deleteLocalMetaTemplate,
  fetchLocalMetaTemplates,
  fetchNotificationEvents,
  fetchWhatsAppAccounts,
  importAppTemplatesFromMeta,
  refreshLocalMetaTemplateStatus,
  resubmitLocalMetaTemplate,
  saveNotificationBinding,
  seedAcademicScheduleTemplates,
  seedDuyuruMetaTemplates,
  seedKayitSozlesmeTemplates,
  seedOzelDersTemplates,
  seedPersonalChatTemplates,
  submitLocalMetaTemplate,
  syncWhatsAppAccountTemplates,
  updateLocalMetaTemplate,
  uploadMetaTemplateExampleMedia,
} from "@/lib/communication-api";
import {
  notifyCommunicationTemplateUsageChanged,
  useRefreshOnCommunicationTemplateUsageChange,
} from "@/lib/communication-template-usage-sync";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "is-draft",
  SUBMITTED: "is-pending",
  PENDING: "is-pending",
  APPROVED: "is-approved",
  REJECTED: "is-rejected",
  PAUSED: "is-disabled",
  DISABLED: "is-disabled",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  SUBMITTED: "Meta'ya Gönderildi",
  PENDING: "İnceleniyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  PAUSED: "Duraklatıldı",
  DISABLED: "Devre Dışı",
};

const CATEGORY_LABELS: Record<string, string> = {
  UTILITY: "Bilgilendirme",
  MARKETING: "Pazarlama",
  AUTHENTICATION: "Doğrulama",
};

const LANGUAGE_LABELS: Record<string, string> = {
  tr: "Türkçe",
  en: "English",
  en_US: "English (US)",
};

/** Metrik kutularının filtre değerleri; İnceleniyor = PENDING + SUBMITTED. */
const PENDING_ANY = "PENDING_ANY";

const STATUS_SELECT_OPTIONS: [string, string][] = [
  ["", "Tüm durumlar"],
  ["APPROVED", "Onaylandı"],
  [PENDING_ANY, "İnceleniyor"],
  ["DRAFT", "Taslak"],
  ["REJECTED", "Reddedildi"],
  ["PAUSED", "Duraklatıldı"],
  ["DISABLED", "Devre dışı"],
];

const HEADER_MEDIA_LABEL: Record<string, string> = {
  IMAGE: "🖼 Görsel başlık",
  VIDEO: "🎬 Video başlık",
  DOCUMENT: "📄 Belge başlık",
};

const VAR_TOKEN = /\{\{\s*\w+\s*\}\}/;
const HEADER_FORMAT_CHARS = /[*_~`]/;
/** Meta başlık: emoji / ifade simgesi (BMP dışı + yaygın semboller). */
const HEADER_EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}\u{1F1E0}-\u{1F1FF}]/u;

/** Değişkenler çıkınca geriye okunur sabit metin kalıyor mu? */
const hasStaticText = (text: string): boolean =>
  !!(text || "").replace(new RegExp(VAR_TOKEN, "g"), "").trim();

const templateContentIssues = (
  body: string,
  header: MetaTemplateHeader,
  footer: string,
): string[] => {
  const issues: string[] = [];
  const text = (body || "").trim();
  // Meta "değişkenle başlama/bitme" kuralını şablonun bütününe uygular:
  // başlıkta sabit metin/medya varsa gövde değişkenle başlayabilir, alt bilgi
  // varsa değişkenle bitebilir.
  const headerType = (header?.type || "").toUpperCase();
  const hasLeadingText = headerType === "TEXT"
    ? hasStaticText(header?.text || "")
    : ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType);
  const hasTrailingText = !!(footer || "").trim();
  if (text) {
    const tokens = Array.from(text.matchAll(new RegExp(VAR_TOKEN, "g")));
    const last = tokens[tokens.length - 1];
    if (text.search(VAR_TOKEN) === 0 && !hasLeadingText) {
      issues.push(
        'Mesaj bir değişkenle başlayamaz. Başına sabit metin ekleyin veya "Metin" türünde bir başlık girin.',
      );
    }
    if (
      last
      && (last.index ?? 0) + last[0].length === text.length
      && !hasTrailingText
    ) {
      issues.push(
        "Mesaj bir değişkenle bitemez. Sonuna sabit metin ekleyin veya alt bilgi girin.",
      );
    }
    if (/\}\}\s*\{\{/.test(text)) {
      issues.push("İki değişken yan yana olamaz; aralarına açıklayıcı metin ekleyin.");
    }
    if (text.length > 1024) {
      issues.push(`Mesaj gövdesi en fazla 1024 karakter olabilir (şu an ${text.length}).`);
    }
  }

  const headerRaw = (header?.type || "").toUpperCase() === "TEXT" ? header?.text || "" : "";
  const headerText = headerRaw.trim();
  if ((header?.type || "").toUpperCase() === "TEXT" && !headerText) {
    issues.push('Başlık türü "Metin" seçildi ancak başlık metni boş.');
  }
  if (headerText) {
    if (/\r|\n/.test(headerRaw)) {
      issues.push("Başlık metninde yeni satır kullanılamaz. Tek satır yazın.");
    }
    if (HEADER_FORMAT_CHARS.test(headerText)) {
      issues.push(
        "Başlık metninde yıldız (*) veya biçimlendirme (*kalın*, _italik_, ~üstü çizili~, `kod`) kullanılamaz.",
      );
    }
    if (HEADER_EMOJI.test(headerText)) {
      issues.push("Başlık metninde emoji / ifade simgesi kullanılamaz.");
    }
    const headerTokens = Array.from(headerText.matchAll(new RegExp(VAR_TOKEN, "g")));
    if (headerTokens.length > 1) {
      issues.push("Başlık metninde en fazla bir değişken kullanılabilir.");
    }
    if (headerText.length > 60) {
      issues.push("Başlık metni en fazla 60 karakter olabilir.");
    }
    const headerLast = headerTokens[headerTokens.length - 1];
    const headerStartsVar = headerText.search(VAR_TOKEN) === 0;
    const headerEndsVar = !!(
      headerLast
      && (headerLast.index ?? 0) + headerLast[0].length === headerText.length
    );
    if (headerStartsVar || headerEndsVar) {
      issues.push("Başlık metni değişkenle başlayamaz veya bitemez; sabit metinle çevreleyin.");
    }
  }
  // Meta FOOTER parametre kabul etmez; değişkenler gönderim öncesi sabitlenir.
  if (footer && VAR_TOKEN.test(footer) && !hasStaticText(footer)) {
    issues.push("Alt bilgi yalnızca değişkenden oluşamaz; yanına sabit metin ekleyin.");
  }
  return issues;
};

const emptyForm = () => ({
  name: "",
  language: "tr",
  meta_category: "UTILITY",
  usage_scope: "ALL" as MetaTemplateUsage,
  body_named: "",
  footer_text: "",
  header: { type: "NONE" } as MetaTemplateHeader,
  buttons: [] as MetaTemplateButton[],
  also_create_app_template: true,
  app_template_name: "",
  template_group: "",
  campaign_audience: "",
  example_values: {} as Record<string, string>,
});

const VIEW_STORAGE_KEY = "comm.metaTemplates.view";

const FOOTER_MAX = 60;
/** Alt bilgi sabitlendiği için yalnızca kurum/şube gibi değişmeyen alanlar anlamlı. */
const FOOTER_VARIABLE_KEYS = ["kurum_ad", "sube"];

export default function MetaSablonlarClient() {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [templates, setTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sharedWabaCount, setSharedWabaCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<"grid" | "rows">("grid");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [eventCatalog, setEventCatalog] = useState<NotificationEventCatalog | null>(null);
  const [editing, setEditing] = useState<WhatsAppMetaTemplateItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [form, setForm] = useState(emptyForm());
  const [bindContext, setBindContext] = useState<{
    eventKey: string;
    recipient: string;
    bind: boolean;
  } | null>(null);
  const { setNode: setBodyNode, insert: insertIntoBody } = useTextareaInsert();
  const footerRef = useRef<HTMLInputElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);

  const closeSheet = useCallback(() => {
    if (saving) return;
    setSheetOpen(false);
  }, [saving]);

  useSheetChrome(sheetOpen, closeSheet);

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "rows" || stored === "grid") setView(stored);
  }, []);

  const changeView = (next: "grid" | "rows") => {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!toolsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [toolsOpen]);

  const loadAccounts = useCallback(async () => {
    const res = await fetchWhatsAppAccounts({ activeOnly: true });
    const list = res.accounts || [];
    setAccounts(list);
    setAccountId((prev) => {
      if (prev && list.some((a) => a.id === prev)) return prev;
      const params = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
      const fromUrl = params?.get("account") || "";
      if (fromUrl && list.some((a) => a.id === fromUrl)) return fromUrl;
      return list.find((a) => a.is_default)?.id || list[0]?.id || "";
    });
  }, []);

  // Durum filtresi istemcide uygulanır; metrik kutuları gerçek sayıları göstersin.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLocalMetaTemplates({
        account_id: accountId || undefined,
        meta_category: categoryFilter || undefined,
        language: languageFilter || undefined,
        search: debouncedSearch || undefined,
        template_group: groupFilter || undefined,
      });
      const next = res.templates || [];
      setTemplates(next);
      setSelectedIds((prev) => prev.filter((id) => next.some((t) => t.id === id)));
      setSharedWabaCount(res.shared_waba_account_count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şablonlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [accountId, categoryFilter, groupFilter, languageFilter, debouncedSearch]);

  useEffect(() => {
    loadAccounts().catch(() => setError("WhatsApp hesapları yüklenemedi"));
  }, [loadAccounts]);

  useEffect(() => {
    fetchNotificationEvents()
      .then(setEventCatalog)
      .catch(() => setEventCatalog(null));
  }, []);

  const templateGroups = useMemo(() => catalogTemplateGroups(eventCatalog), [eventCatalog]);

  const applyEventSelection = useCallback((selection: EventSlotSelection | null, bind = true) => {
    if (!selection) {
      setBindContext(null);
      setForm((f) => ({ ...f, template_group: "" }));
      return;
    }
    const { event, slot, groupKey } = selection;
    setBindContext({ eventKey: event.key, recipient: slot.recipient_type, bind });
    setForm((f) => ({
      ...f,
      name: slot.suggested_meta_name || f.name,
      body_named: slot.meta_example_body || f.body_named,
      usage_scope: "SYSTEM",
      template_group: groupKey,
      header: event.has_document
        ? ({ type: "DOCUMENT" } as MetaTemplateHeader)
        : event.has_image
          ? ({ type: "IMAGE" } as MetaTemplateHeader)
          : f.header?.type && f.header.type !== "NONE"
            ? f.header
            : ({ type: "NONE" } as MetaTemplateHeader),
      also_create_app_template: true,
      app_template_name: `${event.label} — ${
        slot.recipient_type === "VELI"
          ? "Veli"
          : slot.recipient_type === "OGRENCI"
            ? "Öğrenci"
            : "Personel"
      }`,
    }));
  }, []);

  useEffect(() => {
    if (accountId) load();
  }, [accountId, load]);

  useRefreshOnCommunicationTemplateUsageChange(() => {
    if (accountId) return load();
  });

  // Bildirim Şablonları ekranından "bu olay için şablon oluştur" kısayolu
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const eventKey = params.get("event");
    const recipient = (params.get("recipient") || "").toUpperCase();
    const shouldBind = params.get("bind") === "1";
    if (!eventKey || !recipient) return;

    let cancelled = false;
    (async () => {
      try {
        const catalog = await fetchNotificationEvents();
        if (cancelled) return;
        setEventCatalog(catalog);
        const event = catalog.events.find((e) => e.key === eventKey);
        const slot = event?.slots.find((s) => s.recipient_type === recipient);
        if (!event || !slot) return;
        const groupKey = event.template_group
          || (event.module === "yoklama" && event.group ? `yoklama:${event.group}` : event.module);
        setEditing(null);
        setForm({
          ...emptyForm(),
          name: slot.suggested_meta_name,
          body_named: slot.meta_example_body,
          usage_scope: "SYSTEM",
          template_group: groupKey,
          header: event.has_document
            ? ({ type: "DOCUMENT" } as MetaTemplateHeader)
            : event.has_image
              ? ({ type: "IMAGE" } as MetaTemplateHeader)
              : ({ type: "NONE" } as MetaTemplateHeader),
          also_create_app_template: true,
          app_template_name: `${event.label} — ${recipient === "VELI" ? "Veli" : recipient === "OGRENCI" ? "Öğrenci" : "Personel"}`,
        });
        setBindContext({ eventKey, recipient, bind: shouldBind });
        setPane("edit");
        setSheetOpen(true);
        setMessage(
          shouldBind
            ? `${event.label} olayı için şablon taslağı hazır. Kaydedince bu olaya otomatik bağlanır.`
            : `${event.label} olayı için şablon taslağı hazırlandı.`,
        );
      } catch {
        // kısayol ön dolgusu başarısızsa normal oluşturma akışı çalışır
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const livePreviewContext = useLivePreviewContext();
  const previewText = useMemo(
    () => resolvePreviewVariables(form.body_named || "", livePreviewContext),
    [form.body_named, livePreviewContext],
  );

  const openCreate = () => {
    setEditing(null);
    setBindContext(null);
    setForm(emptyForm());
    setPane("edit");
    setSheetOpen(true);
    setMessage(null);
    setError(null);
  };

  const openEdit = (t: WhatsAppMetaTemplateItem) => {
    setEditing(t);
    setForm({
      name: t.name,
      language: t.language || "tr",
      meta_category: t.meta_category || "UTILITY",
      usage_scope: (t.usage_scope as MetaTemplateUsage) || "ALL",
      body_named: t.body_named || "",
      footer_text: t.footer_text || "",
      header: (t.header_json as MetaTemplateHeader) || { type: "NONE" },
      buttons: (t.buttons_json as MetaTemplateButton[]) || [],
      also_create_app_template: false,
      app_template_name: "",
      template_group: t.template_group || "",
      campaign_audience: t.campaign_audience || "",
      example_values: { ...(t.example_values_json || {}) },
    });
    setPane("edit");
    setSheetOpen(true);
    setMessage(null);
    setError(null);
  };

  const payload = () => ({
    channel_config_id: accountId,
    name: form.name,
    language: form.language,
    meta_category: form.meta_category,
    usage_scope: form.usage_scope,
    body_named: form.body_named,
    footer_text: form.footer_text,
    header_json: form.header?.type && form.header.type !== "NONE" ? form.header : {},
    buttons_json: form.buttons,
    template_group: form.template_group || "",
    campaign_audience: form.usage_scope === "CAMPAIGN"
      ? (form.campaign_audience || "genel")
      : (form.campaign_audience || ""),
    example_values_json: form.example_values,
    also_create_app_template: !editing && !!form.also_create_app_template,
    app_template_name:
      !editing && form.also_create_app_template
        ? (form.app_template_name || undefined)
        : undefined,
  });

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!accountId) {
      setError("WhatsApp hesabı seçin.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (editing) {
        // Meta'ya gitmiş şablonun içeriği değişemez; yalnızca yerel kullanım alanı güncellenir.
        const isLocked = editing.status === "APPROVED"
          || editing.status === "PENDING"
          || editing.status === "SUBMITTED";
        const updated = await updateLocalMetaTemplate(
          editing.id,
          isLocked
            ? {
                usage_scope: form.usage_scope,
                template_group: form.template_group || "",
                campaign_audience: form.usage_scope === "CAMPAIGN"
                  ? (form.campaign_audience || "genel")
                  : (form.campaign_audience || ""),
              }
            : payload(),
        );
        setMessage(
          isLocked
            ? `Kullanım alanı güncellendi: ${
              META_TEMPLATE_USAGE_LABELS[(updated.usage_scope as MetaTemplateUsage)]
              || updated.usage_scope
              || form.usage_scope
            }.`
            : "Şablon kaydedildi.",
        );
        setEditing(updated);
        setForm((f) => ({
          ...f,
          usage_scope: (updated.usage_scope as MetaTemplateUsage) || f.usage_scope,
        }));
      } else {
        const created = await createLocalMetaTemplate(payload());
        const appName = created.pairing?.app_template?.name;
        let bindNote = "";
        if (bindContext?.bind && bindContext.eventKey && bindContext.recipient) {
          try {
            await saveNotificationBinding({
              event_key: bindContext.eventKey,
              recipient_type: bindContext.recipient as "VELI" | "OGRENCI" | "PERSONEL",
              channel_config_id: accountId || null,
              meta_template_id: created.id,
              message_template_id: created.pairing?.app_template?.id || null,
              send_mode: "AUTO",
              is_active: true,
            });
            notifyCommunicationTemplateUsageChanged();
            bindNote = ` Bildirim olayı (${bindContext.eventKey}) bağlandı.`;
          } catch (bindErr) {
            bindNote = ` Şablon oluştu ancak olaya bağlanamadı: ${
              bindErr instanceof Error ? bindErr.message : "hata"
            }`;
          }
        }
        setMessage(
          (created.info
            || (
              appName
                ? `Meta taslağı oluşturuldu ve uygulama şablonu eklendi (“${appName}”).`
                : "Meta taslağı oluşturuldu."
            )) + bindNote,
        );
        setEditing(created);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    label: string,
    fn: () => Promise<WhatsAppMetaTemplateItem>,
  ) => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await fn();
      setEditing(updated);
      setForm((prev) => ({
        ...prev,
        body_named: updated.body_named || prev.body_named,
        footer_text: updated.footer_text || "",
        header: (updated.header_json as MetaTemplateHeader) || prev.header,
        buttons: (updated.buttons_json as MetaTemplateButton[]) || [],
      }));
      setMessage(label);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!accountId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await syncWhatsAppAccountTemplates(accountId);
      const n = res.upserted ?? res.templates?.length ?? 0;
      const reverted = res.reverted ?? 0;
      const accounts = res.accounts_synced || 1;
      const base =
        accounts > 1
          ? `${n} şablon senkronize edildi (${accounts} hesap, aynı WABA).`
          : `${n} şablon senkronize edildi.`;
      setMessage(
        reverted
          ? `${base} Meta’da olmayan ${reverted} şablon taslağa alındı.`
          : base,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senkron başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleImportAppTemplates = async () => {
    if (!accountId) {
      setError("WhatsApp hesabı seçin.");
      return;
    }
    if (!confirm(
      "Bu hesaptaki henüz uygulama karşılığı olmayan Meta şablonları uygulama şablonlarına aktarılsın mı?\n\n"
      + "24s pencere açıkken uygulama, kapalıyken Meta şablonu kullanılır.",
    )) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await importAppTemplatesFromMeta({ channel_config_id: accountId });
      setMessage(
        `${res.created_count} şablon uygulamaya aktarıldı`
        + (res.skipped_count ? `, ${res.skipped_count} atlandı.` : ".")
        + (res.info ? ` ${res.info}` : ""),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktarım başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleSeedDuyuruTemplates = async () => {
    if (!accountId) {
      setError("WhatsApp hesabı seçin.");
      return;
    }
    if (!confirm(
      "Toplu mesaj taslakları oluşturulsun mu? (27 şablon)\n\n"
      + "Aileler: duyuru · hatırlatma · bilgilendirme\n"
      + "Her biri: metin / görsel / PDF × veli / öğrenci / personel\n\n"
      + "Örn. hatirlatma_metin, bilgilendirme_gorsel_ogrenci, duyuru_pdf_personel …\n\n"
      + "Mevcut aynı adlı şablonlar atlanır. Görsel/PDF için örnek medya yükleyip Meta onayına gönderin.",
    )) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedDuyuruMetaTemplates({ channel_config_id: accountId });
      const errText = (res.errors || []).length ? ` Hatalar: ${res.errors.join("; ")}` : "";
      setMessage(
        (res.info
          || `${res.created_count} taslak, ${res.updated_count || 0} güncellendi, ${res.skipped_count} atlandı.`)
        + (res.next_steps?.length ? ` → ${res.next_steps[0]}` : "")
        + errText,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toplu mesaj taslakları oluşturulamadı");
    } finally {
      setSaving(false);
    }
  };

  const handleSeedAcademicSchedule = async () => {
    if (!accountId) {
      setError("WhatsApp hesabı seçin.");
      return;
    }
    if (!confirm(
      "Ders programı Meta taslakları oluşturulsun mu?\n\n"
      + "• sinif_programi_veli (DOCUMENT)\n"
      + "• sinif_programi_ogrenci (DOCUMENT)\n\n"
      + "LMS şablonları da oluşturulur ve Bildirim Şablonları’nda "
      + "akademik.sinif_programi olayına bağlanır.",
    )) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedAcademicScheduleTemplates({
        channel_config_id: accountId,
        bind: true,
      });
      const errText = (res.errors || []).length ? ` Hatalar: ${res.errors.join("; ")}` : "";
      setMessage(
        (res.info || "Ders programı taslakları hazır.")
        + (res.next_steps?.length ? ` → ${res.next_steps[0]}` : "")
        + errText,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ders programı taslakları oluşturulamadı");
    } finally {
      setSaving(false);
    }
  };

  const handleSeedKayitSozlesme = async () => {
    if (!accountId) {
      setError("WhatsApp hesabı seçin.");
      return;
    }
    if (!confirm(
      "Kayıt sözleşmesi Meta taslağı oluşturulsun mu?\n\n"
      + "• ogrenci_kayit_sozlesme_personel (metin)\n\n"
      + "LMS şablonu da oluşturulur ve Bildirim Şablonları’nda "
      + "ogrenci.kayit_sozlesme olayına bağlanır. Meta’ya gönderip onaylatın.",
    )) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedKayitSozlesmeTemplates({
        channel_config_id: accountId,
        bind: true,
      });
      const errText = (res.errors || []).length ? ` Hatalar: ${res.errors.join("; ")}` : "";
      setMessage(
        (res.info || "Kayıt sözleşmesi taslağı hazır.")
        + (res.next_steps?.length ? ` → ${res.next_steps[0]}` : "")
        + errText,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt sözleşmesi taslağı oluşturulamadı");
    } finally {
      setSaving(false);
    }
  };

  const handleSeedOzelDers = async () => {
    if (!accountId) {
      setError("WhatsApp hesabı seçin.");
      return;
    }
    if (!confirm(
      "Özel ders Meta taslakları oluşturulsun mu?\n\n"
      + "• ozel_ders_ogretmen_gelmedi_veli\n"
      + "• ozel_ders_ogrenci_gelmedi_veli\n"
      + "• ozel_ders_iptal_veli\n"
      + "• ozel_ders_telafi_veli\n"
      + "• ozel_ders_islendi_veli\n\n"
      + "LMS şablonları da oluşturulur ve Bildirim Şablonları’nda "
      + "Özel Ders olaylarına bağlanır. Meta’ya gönderip onaylatın.",
    )) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedOzelDersTemplates({
        channel_config_id: accountId,
        bind: true,
      });
      const errText = (res.errors || []).length ? ` Hatalar: ${res.errors.join("; ")}` : "";
      setMessage(
        (res.info || "Özel ders taslakları hazır.")
        + (res.next_steps?.length ? ` → ${res.next_steps[0]}` : "")
        + errText,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Özel ders taslakları oluşturulamadı");
    } finally {
      setSaving(false);
    }
  };

  const handleSeedPersonalChat = async () => {
    if (!accountId) {
      setError("WhatsApp hesabı seçin.");
      return;
    }
    if (!confirm(
      "Sohbet açılış taslakları oluşturulsun mu?\n\n"
      + "Hesap birimine göre PERSONAL şablonlar (veli + öğrenci):\n"
      + "• Muhasebe / Koçluk / Yönetim + Genel\n"
      + "• Hızlı yanıt: Uygunum · Daha sonra · Arayın\n\n"
      + "Meta’ya gönderip onaylattıktan sonra detay sayfasındaki WhatsApp "
      + "ikonundan kullanılır.",
    )) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedPersonalChatTemplates({ channel_config_id: accountId });
      const errText = (res.errors || []).length ? ` Hatalar: ${res.errors.join("; ")}` : "";
      setMessage(
        (res.info || "Sohbet taslakları hazır.")
        + (res.next_steps?.length ? ` → ${res.next_steps[0]}` : "")
        + errText,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sohbet taslakları oluşturulamadı");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAppFromEditing = async () => {
    if (!editing) return;
    if (editing.app_template_id) {
      setMessage(`Zaten bağlı: “${editing.app_template_name || "uygulama şablonu"}”.`);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await createAppTemplateFromMeta(editing.id);
      setMessage(
        res.info
          || `Uygulama şablonu oluşturuldu: “${res.app_template?.name || ""}”.`,
      );
      if (res.meta_template) setEditing(res.meta_template);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktarım başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleClone = async () => {
    if (!editing) return;
    const newName = window.prompt("Yeni şablon adı (küçük harf_altçizgi):", `${editing.name}_v2`);
    if (!newName) return;
    setSaving(true);
    try {
      const clone = await cloneLocalMetaTemplate(editing.id, newName);
      setMessage("Kopya taslak oluşturuldu.");
      openEdit(clone);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kopyalama başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (editing.is_system_active) {
      const used = (editing.system_usages || []).map((u) => u.label).filter(Boolean).join(", ");
      setError(
        used
          ? `Bu şablon bildirimlerde kullanılıyor: ${used}. Önce Bildirim Şablonları’ndan bağlantıyı kaldırın.`
          : "Bu şablon bildirimlerde kullanılıyor. Önce bağlantıyı kaldırın.",
      );
      return;
    }
    const pairNote = editing.app_template_id
      ? `\nBağlı uygulama şablonu (“${editing.app_template_name || "şablon"}”) de silinecek.`
      : "";
    if (!confirm(`"${editing.name}" silinsin mi?${pairNote}`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteLocalMetaTemplate(editing.id, editing.status !== "DRAFT");
      setSheetOpen(false);
      setEditing(null);
      setMessage("Şablon silindi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    const selected = templates.filter((t) => selectedIds.includes(t.id));
    if (!selected.length) return;
    const blocked = selected.filter((t) => t.is_system_active);
    const ready = selected.filter((t) => !t.is_system_active);
    const blockedLines = blocked.map((t) => {
      const used = (t.system_usages || []).map((u) => u.label).filter(Boolean).join(", ");
      return `• ${t.name}${used ? ` — ${used}` : ""}`;
    });
    if (!ready.length) {
      setError(
        `Seçilen şablonlar bildirimlerde kullanılıyor, silinemez: ${
          blocked.map((t) => t.name).join(", ")
        }.`,
      );
      return;
    }
    const pairCount = ready.filter((t) => t.app_template_id).length;
    const confirmLines = [
      `${ready.length} şablon silinecek.`,
      pairCount ? `${pairCount} bağlı uygulama şablonu da silinecek.` : "",
      blocked.length
        ? `\nBildirimde kullanılan ${blocked.length} şablon atlandı:\n${blockedLines.join("\n")}`
        : "",
    ].filter(Boolean);
    if (!confirm(confirmLines.join("\n"))) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await bulkDeleteLocalMetaTemplates(
        ready.map((t) => t.id),
        ready.some((t) => t.status !== "DRAFT"),
      );
      const skipped = [
        ...blocked.map((t) => t.name),
        ...res.blocked.map((t) => t.name),
      ];
      const parts = [`${res.deleted_count} şablon silindi.`];
      if (skipped.length) {
        parts.push(`Bildirimde kullanılanlar silinmedi: ${skipped.join(", ")}.`);
      }
      setMessage(parts.join(" "));
      if (res.blocked.length && !res.deleted_count) {
        setError(res.blocked.map((t) => t.reason).join(" "));
      }
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toplu silme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (token: string) => {
    const next = insertIntoBody(form.body_named || "", token);
    setForm((f) => ({ ...f, body_named: next }));
  };

  const insertFooterVariable = (token: string) => {
    const el = footerRef.current;
    const current = form.footer_text || "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const { text, cursor } = insertAtCursor(current, start, end, token);
    const next = text.slice(0, FOOTER_MAX);
    const caret = Math.min(cursor, next.length);
    setForm((f) => ({ ...f, footer_text: next }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const addButton = (type: MetaTemplateButton["type"]) => {
    setForm((f) => ({
      ...f,
      buttons: [...f.buttons, { type, text: type === "QUICK_REPLY" ? "Yanıt" : "Buton" }],
    }));
  };

  const updateButton = (idx: number, patch: Partial<MetaTemplateButton>) => {
    setForm((f) => ({
      ...f,
      buttons: f.buttons.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }));
  };

  const removeButton = (idx: number) => {
    setForm((f) => ({ ...f, buttons: f.buttons.filter((_, i) => i !== idx) }));
  };

  const onHeaderMedia = async (file: File | null) => {
    if (!file || !accountId) return;
    setSaving(true);
    try {
      const res = await uploadMetaTemplateExampleMedia(file, accountId);
      setForm((f) => ({
        ...f,
        header: { ...f.header, example_handle: res.example_handle },
      }));
      setMessage("Örnek medya yüklendi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Medya yüklenemedi");
    } finally {
      setSaving(false);
    }
  };

  const locked = editing?.status === "APPROVED"
    || editing?.status === "PENDING"
    || editing?.status === "SUBMITTED";

  const previewSegments = useMemo(() => parseWhatsAppText(previewText), [previewText]);
  const usedVariables = useMemo(() => {
    const found = [...(form.body_named || "").matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    return Array.from(new Set(found));
  }, [form.body_named]);
  const exampleVars = usedVariables.filter((v) => v === "mesaj" || v === "aciklama" || v === "baslik");
  const footerVars = useMemo(() => {
    const found = [...(form.footer_text || "").matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    return Array.from(new Set(found));
  }, [form.footer_text]);
  const contentIssues = useMemo(
    () => templateContentIssues(form.body_named, form.header, form.footer_text),
    [form.body_named, form.header, form.footer_text],
  );

  const counts = useMemo(() => {
    const base = { total: templates.length, approved: 0, pending: 0, rejected: 0, draft: 0 };
    templates.forEach((t) => {
      if (t.status === "APPROVED") base.approved += 1;
      else if (t.status === "PENDING" || t.status === "SUBMITTED") base.pending += 1;
      else if (t.status === "REJECTED") base.rejected += 1;
      else if (t.status === "DRAFT") base.draft += 1;
    });
    return base;
  }, [templates]);

  const visibleTemplates = useMemo(() => {
    if (!statusFilter) return templates;
    return templates.filter((t) => (
      statusFilter === PENDING_ANY
        ? t.status === "PENDING" || t.status === "SUBMITTED"
        : t.status === statusFilter
    ));
  }, [templates, statusFilter]);

  const visibleIds = useMemo(() => visibleTemplates.map((t) => t.id), [visibleTemplates]);
  const selectedVisibleCount = selectedIds.filter((id) => visibleIds.includes(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) return prev.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const groupLabelOf = (key: string) =>
    templateGroups.find((g) => g.key === key)?.label || key;

  const activeFilters = [
    statusFilter && {
      key: "status",
      label: STATUS_SELECT_OPTIONS.find(([k]) => k === statusFilter)?.[1] || statusFilter,
      clear: () => setStatusFilter(""),
    },
    categoryFilter && {
      key: "category",
      label: CATEGORY_LABELS[categoryFilter] || categoryFilter,
      clear: () => setCategoryFilter(""),
    },
    groupFilter && {
      key: "group",
      label: groupLabelOf(groupFilter),
      clear: () => setGroupFilter(""),
    },
    languageFilter && {
      key: "language",
      label: LANGUAGE_LABELS[languageFilter] || languageFilter,
      clear: () => setLanguageFilter(""),
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const clearFilters = () => {
    setStatusFilter("");
    setCategoryFilter("");
    setGroupFilter("");
    setLanguageFilter("");
    setSearch("");
  };

  const metrics: {
    key: string;
    icon: string;
    tone: string;
    value: number;
    label: string;
    filter: string;
  }[] = [
    { key: "total", icon: "🗂", tone: "", value: counts.total, label: "Tüm şablonlar", filter: "" },
    { key: "approved", icon: "✅", tone: "is-green", value: counts.approved, label: "Onaylı", filter: "APPROVED" },
    { key: "pending", icon: "⏳", tone: "is-amber", value: counts.pending, label: "İnceleniyor", filter: PENDING_ANY },
    { key: "rejected", icon: "⛔", tone: "is-rose", value: counts.rejected, label: "Reddedildi", filter: "REJECTED" },
    { key: "draft", icon: "📝", tone: "is-violet", value: counts.draft, label: "Taslak", filter: "DRAFT" },
  ];

  const tools: { key: string; title: string; desc: string; onClick: () => void }[] = [
    {
      key: "sync",
      title: "⟳ Meta’dan güncelle",
      desc: "Meta’daki şablonları çeker; silinenleri taslağa alır.",
      onClick: handleSync,
    },
    {
      key: "import",
      title: "Uygulamaya aktar",
      desc: "Eşleşmeyen Meta şablonlarını uygulama şablonlarına kopyalar.",
      onClick: handleImportAppTemplates,
    },
    {
      key: "personal",
      title: "Sohbet taslakları",
      desc: "Personel–veli/öğrenci sohbet açılış PERSONAL şablonları.",
      onClick: handleSeedPersonalChat,
    },
    {
      key: "schedule",
      title: "Ders programı taslakları",
      desc: "sinif_programi_veli / _ogrenci (DOCUMENT) + LMS eşleri.",
      onClick: handleSeedAcademicSchedule,
    },
    {
      key: "sozlesme",
      title: "Kayıt sözleşmesi taslağı",
      desc: "ogrenci_kayit_sozlesme_personel şablonu ve bağlaması.",
      onClick: handleSeedKayitSozlesme,
    },
    {
      key: "ozel_ders",
      title: "Özel ders taslakları",
      desc: "Öğretmen/öğrenci gelmedi, iptal, telafi, işlendi (5 Meta + LMS).",
      onClick: handleSeedOzelDers,
    },
    {
      key: "duyuru",
      title: "Toplu mesaj taslakları",
      desc: "Duyuru · hatırlatma · bilgilendirme (metin / görsel / PDF).",
      onClick: handleSeedDuyuruTemplates,
    },
  ];

  const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const headerIssues = contentIssues.filter((i) => i.toLocaleLowerCase("tr").includes("başlık"));

  return (
    <CommunicationPageShell
      title="Meta Şablonları"
      subtitle="WhatsApp Business şablonlarını Meta Business Manager açmadan yönetin"
      icon="🟢"
      className="sbx sbx-page"
      breadcrumbs={[
        { label: "İletişim", href: "/admin/iletisim/toplu-gonder" },
        { label: "Meta Şablonları" },
      ]}
      actions={
        <div className="sbx-head-actions">
          <select
            className="sbx-select"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="WhatsApp hesabı"
          >
            <option value="">Hesap seçin</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.display_phone || a.id}
              </option>
            ))}
          </select>

          <div className="sbx-menu" ref={toolsRef}>
            <button
              type="button"
              className="sbx-btn"
              onClick={() => setToolsOpen((v) => !v)}
              disabled={!accountId || saving}
              aria-expanded={toolsOpen}
              aria-haspopup="menu"
            >
              Araçlar ▾
            </button>
            {toolsOpen && (
              <div className="sbx-menu-panel" role="menu">
                {tools.map((tool, idx) => (
                  <div key={tool.key}>
                    {idx === 2 && <div className="sbx-menu-sep" />}
                    <button
                      type="button"
                      className="sbx-menu-item"
                      role="menuitem"
                      disabled={saving}
                      onClick={() => {
                        setToolsOpen(false);
                        tool.onClick();
                      }}
                    >
                      <strong>{tool.title}</strong>
                      <span>{tool.desc}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="sbx-btn is-primary"
            onClick={openCreate}
            disabled={!accountId}
          >
            + Yeni Şablon
          </button>
        </div>
      }
    >
      {(error || message) && (
        <div className="sbx-alerts">
          {error && (
            <div className="sbx-alert is-danger" role="alert">
              <span aria-hidden="true">⛔</span>
              <span>{error}</span>
              <button type="button" className="sbx-alert-x" onClick={() => setError(null)} aria-label="Kapat">
                ×
              </button>
            </div>
          )}
          {message && (
            <div className="sbx-alert is-success">
              <span aria-hidden="true">✅</span>
              <span>{message}</span>
              <button type="button" className="sbx-alert-x" onClick={() => setMessage(null)} aria-label="Kapat">
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {accountId && sharedWabaCount > 1 && (
        <div className="sbx-alerts">
          <div className="sbx-alert is-info">
            <span aria-hidden="true">🔗</span>
            <span>
              Bu hat ile aynı WABA’da {sharedWabaCount} hesap var. Şablonlar ortak listelenir
              (ad+dil tekilleştirilir). Senkron tüm hesaplara yazılır.
            </span>
          </div>
        </div>
      )}

      <div className="sbx-metrics">
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`sbx-metric${statusFilter === m.filter ? " is-active" : ""}`}
            onClick={() => setStatusFilter(m.filter)}
            aria-pressed={statusFilter === m.filter}
          >
            <span className={`sbx-metric-icon ${m.tone}`} aria-hidden="true">{m.icon}</span>
            <span className="sbx-metric-text">
              <span className="sbx-metric-value">{m.value}</span>
              <span className="sbx-metric-label">{m.label}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="sbx-filterbar">
        <div className="sbx-filterbar-top">
          <label className="sbx-search">
            <span className="sbx-search-icon" aria-hidden="true">🔍</span>
            <input
              type="search"
              placeholder="Şablon adı veya metin ara…"
              aria-label="Şablon ara"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="sbx-btn sbx-filter-toggle"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            Filtreler
            {activeFilters.length > 0 && (
              <span className="sbx-filter-badge">{activeFilters.length}</span>
            )}
          </button>
          <div className="sbx-view" role="group" aria-label="Görünüm">
            <button
              type="button"
              className={view === "grid" ? "is-active" : ""}
              onClick={() => changeView("grid")}
            >
              ▦ Kart
            </button>
            <button
              type="button"
              className={view === "rows" ? "is-active" : ""}
              onClick={() => changeView("rows")}
            >
              ☰ Liste
            </button>
          </div>
        </div>

        <div className={`sbx-filter-grid${filtersOpen ? " is-open" : ""}`}>
          <select
            className="sbx-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Durum filtresi"
          >
            {STATUS_SELECT_OPTIONS.map(([value, label]) => (
              <option key={value || "all"} value={value}>{label}</option>
            ))}
          </select>
          <select
            className="sbx-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Kategori filtresi"
          >
            <option value="">Tüm kategoriler</option>
            <option value="UTILITY">Bilgilendirme</option>
            <option value="MARKETING">Pazarlama</option>
            <option value="AUTHENTICATION">Doğrulama</option>
          </select>
          <select
            className="sbx-select"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            aria-label="Şablon grubu filtresi"
          >
            <option value="">Tüm gruplar</option>
            {templateGroups.map((group) => (
              <option key={group.key} value={group.key}>{group.label}</option>
            ))}
          </select>
          <select
            className="sbx-select"
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            aria-label="Dil filtresi"
          >
            <option value="">Tüm diller</option>
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
            <option value="en_US">English (US)</option>
          </select>
        </div>

        {activeFilters.length > 0 && (
          <div className="sbx-pills">
            {activeFilters.map((f) => (
              <span key={f.key} className="sbx-pill">
                {f.label}
                <button type="button" onClick={f.clear} aria-label={`${f.label} filtresini kaldır`}>
                  ×
                </button>
              </span>
            ))}
            <button type="button" className="sbx-pill-clear" onClick={clearFilters}>
              Tümünü temizle
            </button>
          </div>
        )}
      </div>

      {!accountId && !loading ? (
        <div className="sbx-empty">
          <span className="sbx-empty-icon" aria-hidden="true">📱</span>
          <h3>WhatsApp hesabı seçin</h3>
          <p>
            Şablonlar hesap bazında yönetilir. Yukarıdan bir WhatsApp Business hesabı
            seçtiğinizde şablonlar listelenir.
          </p>
        </div>
      ) : loading ? (
        <div className="sbx-grid" aria-busy="true" aria-label="Yükleniyor">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="sbx-skeleton" />
          ))}
        </div>
      ) : !visibleTemplates.length ? (
        <div className="sbx-empty">
          <span className="sbx-empty-icon" aria-hidden="true">{activeFilters.length || search ? "🔍" : "✨"}</span>
          <h3>{activeFilters.length || search ? "Sonuç bulunamadı" : "Henüz şablon yok"}</h3>
          <p>
            {activeFilters.length || search
              ? "Filtreleri gevşetip yeniden deneyin ya da yeni bir şablon oluşturun."
              : "Yeni bir şablon oluşturup Meta onayına gönderin ya da Meta hesabınızdaki mevcut şablonları tek tıkla içeri aktarın."}
          </p>
          <div className="sbx-empty-actions">
            {(activeFilters.length || search) && (
              <button type="button" className="sbx-btn" onClick={clearFilters}>
                Filtreleri temizle
              </button>
            )}
            <button type="button" className="sbx-btn" onClick={handleSync} disabled={saving || !accountId}>
              Meta’dan içe aktar
            </button>
            <button type="button" className="sbx-btn is-primary" onClick={openCreate} disabled={!accountId}>
              + Yeni şablon
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="sbx-resultbar">
            <span>
              {visibleTemplates.length} şablon
              {visibleTemplates.length !== counts.total ? ` / ${counts.total}` : ""}
              {selectedIds.length ? ` · ${selectedIds.length} seçili` : ""}
            </span>
            <div className="sbx-resultbar-actions">
              <label className="sbx-check is-inline">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                />
                <span>Tümünü seç</span>
              </label>
              <button
                type="button"
                className="sbx-btn is-sm is-danger"
                disabled={saving || !selectedIds.length}
                onClick={() => void handleBulkDelete()}
              >
                Seçilenleri sil
              </button>
            </div>
          </div>
          <div className={`sbx-grid${view === "rows" ? " is-rows" : ""}`}>
            {visibleTemplates.map((t) => {
              const tone = STATUS_TONE[t.status] || "is-draft";
              const picked = selectedIds.includes(t.id);
              return (
                <article key={t.id} className={`sbx-card ${tone}${picked ? " is-picked" : ""}`}>
                  <label className="sbx-card-pick" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={picked}
                      title={t.is_system_active ? "Bildirimde kullanılıyor — silinemez" : "Seç"}
                      onChange={() => toggleSelected(t.id)}
                    />
                  </label>
                  <button
                    type="button"
                    className="sbx-card-open"
                    onClick={() => openEdit(t)}
                    aria-label={`${t.name} şablonunu aç`}
                  >
                    <div className="sbx-card-top">
                      <div className="sbx-card-headline">
                        <span className="sbx-card-title">{t.name}</span>
                        <span className="sbx-card-meta">
                          <span>{CATEGORY_LABELS[t.meta_category] || t.meta_category}</span>
                          <span>· {LANGUAGE_LABELS[t.language] || t.language}</span>
                          {t.template_group && t.template_group_label && (
                            <span>· {t.template_group_label}</span>
                          )}
                          {t.usage_scope && t.usage_scope !== "ALL" && (
                            <span>
                              ·{" "}
                              {t.usage_scope_label
                                || META_TEMPLATE_USAGE_LABELS[t.usage_scope as MetaTemplateUsage]}
                            </span>
                          )}
                          {t.usage_scope === "CAMPAIGN" && t.campaign_audience_label && (
                            <span>· {t.campaign_audience_label}</span>
                          )}
                        </span>
                      </div>
                      <div className="sbx-badges">
                        {t.is_system_active && (
                          <span className="sbx-badge is-live">
                            <span className="sbx-dot" aria-hidden="true" />
                            Aktif
                          </span>
                        )}
                        <span className={`sbx-badge ${tone}`}>
                          <span className="sbx-dot" aria-hidden="true" />
                          {t.status_label || STATUS_LABELS[t.status] || t.status}
                        </span>
                      </div>
                    </div>

                    <p className="sbx-card-snippet">{t.body_named || ""}</p>

                    {t.is_system_active && t.system_usages?.length ? (
                      <p className="sbx-card-usage">
                        <span aria-hidden="true">⚡</span>
                        {t.system_usages.map((u) => u.label).join(" · ")}
                      </p>
                    ) : null}

                    {t.status === "REJECTED" && t.rejected_reason ? (
                      <p className="sbx-card-usage is-danger">
                        <span aria-hidden="true">⛔</span>
                        {t.rejected_reason}
                      </p>
                    ) : null}

                    <div className="sbx-card-foot">
                      <span>📈 {t.usage_count ?? 0} gönderim</span>
                      {t.app_template_id && <span>🔗 Uygulama eşi var</span>}
                      <span>
                        {t.approved_at
                          ? `Onay: ${new Date(t.approved_at).toLocaleDateString("tr-TR")}`
                          : t.updated_at
                            ? new Date(t.updated_at).toLocaleDateString("tr-TR")
                            : "—"}
                      </span>
                    </div>
                  </button>

                  <div className="sbx-card-actions">
                    <button type="button" className="sbx-btn is-sm" onClick={() => openEdit(t)}>
                      {t.status === "APPROVED" ? "Görüntüle" : "Düzenle"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {sheetOpen && (
        <>
          <div className="sbx-scrim" role="presentation" onClick={closeSheet} />
          <aside
            className="sbx-sheet"
            data-pane={pane}
            role="dialog"
            aria-modal="true"
            aria-labelledby="meta-sablon-title"
          >
            <form className="sbx-sheet-form" onSubmit={handleSave}>
              <header className="sbx-sheet-head">
                <div className="sbx-sheet-head-text">
                  <span className="sbx-sheet-eyebrow">Meta şablonu</span>
                  <h2 id="meta-sablon-title">{editing ? editing.name : "Yeni Meta Şablonu"}</h2>
                  <p>
                    {editing
                      ? `${CATEGORY_LABELS[editing.meta_category] || editing.meta_category} · ${editing.language}`
                      : "Meta onayına gönderilecek WhatsApp şablonu oluşturun."}
                  </p>
                </div>
                <div className="sbx-sheet-head-side">
                  {editing && (
                    <span className={`sbx-badge ${STATUS_TONE[editing.status] || "is-draft"}`}>
                      <span className="sbx-dot" aria-hidden="true" />
                      {STATUS_LABELS[editing.status] || editing.status}
                    </span>
                  )}
                  <button
                    type="button"
                    className="sbx-iconbtn"
                    onClick={closeSheet}
                    aria-label="Kapat"
                  >
                    ×
                  </button>
                </div>
              </header>

              <div className="sbx-sheet-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={pane === "edit"}
                  className={pane === "edit" ? "is-active" : ""}
                  onClick={() => setPane("edit")}
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pane === "preview"}
                  className={pane === "preview" ? "is-active" : ""}
                  onClick={() => setPane("preview")}
                >
                  Önizleme
                </button>
              </div>

              <div className="sbx-sheet-body">
                <div className="sbx-sheet-main">
                  {editing?.status === "REJECTED" && (
                    <div className="sbx-note is-danger">
                      <span aria-hidden="true">⛔</span>
                      <div>
                        <strong>Meta bu şablonu reddetti: {editing.rejected_reason || "—"}</strong>
                        {editing.rejected_detail && <p>{editing.rejected_detail}</p>}
                        {editing.last_submitted_at && (
                          <p>
                            Son gönderim:{" "}
                            {new Date(editing.last_submitted_at).toLocaleString("tr-TR")}
                          </p>
                        )}
                        <p>Gerekli düzeltmeleri yapıp aşağıdan yeniden onaya gönderebilirsiniz.</p>
                      </div>
                    </div>
                  )}

                  {locked && (
                    <div className="sbx-note is-warn">
                      <span aria-hidden="true">🔒</span>
                      <div>
                        <strong>
                          İçerik kilitli ({STATUS_LABELS[editing!.status] || editing!.status})
                        </strong>
                        <p>
                          Meta gövdesi ve başlığı değiştirilemez. <strong>Kullanım alanı</strong> ve{" "}
                          <strong>şablon grubu</strong> yerelde kalır; kaydedebilirsiniz. İçerik
                          değişikliği için “Kopyala” ile yeni sürüm oluşturun.
                        </p>
                      </div>
                    </div>
                  )}

                  <section className="sbx-block">
                    <div className="sbx-block-head">
                      <span aria-hidden="true">🏷</span> Kimlik
                    </div>
                    <div className="sbx-block-body">
                      <div className="sbx-field">
                        <label className="sbx-label" htmlFor="meta-name">Şablon adı</label>
                        <input
                          id="meta-name"
                          className="sbx-input"
                          value={form.name}
                          disabled={!!editing || locked}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="hosgeldin_mesaji"
                          required
                        />
                        <p className="sbx-hint">
                          Yalnızca küçük harf ve alt çizgi. Oluşturduktan sonra değiştirilemez.
                        </p>
                      </div>

                      <div className="sbx-row">
                        <div className="sbx-field">
                          <label className="sbx-label" htmlFor="meta-lang">Dil</label>
                          <select
                            id="meta-lang"
                            className="sbx-select"
                            value={form.language}
                            disabled={locked}
                            onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                          >
                            <option value="tr">Türkçe (tr)</option>
                            <option value="en">English (en)</option>
                            <option value="en_US">English US (en_US)</option>
                          </select>
                        </div>
                        <div className="sbx-field">
                          <label className="sbx-label" htmlFor="meta-cat">Meta kategorisi</label>
                          <select
                            id="meta-cat"
                            className="sbx-select"
                            value={form.meta_category}
                            disabled={locked}
                            onChange={(e) => setForm((f) => ({ ...f, meta_category: e.target.value }))}
                          >
                            <option value="UTILITY">Bilgilendirme (Utility)</option>
                            <option value="MARKETING">Pazarlama (Marketing)</option>
                            <option value="AUTHENTICATION">Doğrulama (Authentication)</option>
                          </select>
                        </div>
                      </div>

                      {!editing && (
                        <NotificationEventPicker
                          catalog={eventCatalog}
                          eventKey={bindContext?.eventKey}
                          recipient={bindContext?.recipient}
                          onSelect={(selection) => applyEventSelection(selection, true)}
                        />
                      )}

                      <div className="sbx-row">
                        <div className="sbx-field">
                          <label className="sbx-label" htmlFor="meta-group">Şablon grubu</label>
                          <select
                            id="meta-group"
                            className="sbx-select"
                            value={form.template_group || ""}
                            onChange={(e) => setForm((f) => ({ ...f, template_group: e.target.value }))}
                          >
                            <option value="">Genel</option>
                            {templateGroups.map((group) => (
                              <option key={group.key} value={group.key}>{group.label}</option>
                            ))}
                          </select>
                          <p className="sbx-hint">
                            Bildirim sayfasındaki grup. Meta’ya gönderilmez; olay seçilince otomatik dolar.
                          </p>
                        </div>
                        <div className="sbx-field">
                          <label className="sbx-label" htmlFor="meta-usage">Kullanım alanı</label>
                          <select
                            id="meta-usage"
                            className="sbx-select"
                            value={form.usage_scope}
                            onChange={(e) => setForm((f) => {
                              const usage_scope = e.target.value as MetaTemplateUsage;
                              return {
                                ...f,
                                usage_scope,
                                campaign_audience: usage_scope === "CAMPAIGN"
                                  ? (f.campaign_audience || "genel")
                                  : f.campaign_audience,
                              };
                            })}
                          >
                            {(Object.keys(META_TEMPLATE_USAGE_LABELS) as MetaTemplateUsage[]).map(
                              (scope) => (
                                <option key={scope} value={scope}>
                                  {META_TEMPLATE_USAGE_LABELS[scope]}
                                </option>
                              ),
                            )}
                          </select>
                          <p className="sbx-hint">
                            Şablonun hangi ekranda seçilebileceğini belirler. Onaydan sonra da değişir.
                          </p>
                        </div>
                      </div>

                      {form.usage_scope === "CAMPAIGN" && (
                        <div className="sbx-field">
                          <label className="sbx-label" htmlFor="meta-camp-aud">Toplu gönderim kitlesi</label>
                          <select
                            id="meta-camp-aud"
                            className="sbx-select"
                            value={form.campaign_audience || "genel"}
                            onChange={(e) => setForm((f) => ({ ...f, campaign_audience: e.target.value }))}
                          >
                            <option value="veli">Veli</option>
                            <option value="ogrenci">Öğrenci</option>
                            <option value="personel">Personel</option>
                            <option value="genel">Genel (tüm kitleler)</option>
                          </select>
                          <p className="sbx-hint">
                            Veli / öğrenci / personel yalnızca o kitlede görünür.
                            Genel; veli, öğrenci, personel ve karma seçimlerin hepsinde kullanılır.
                          </p>
                        </div>
                      )}

                      {!editing && (
                        <>
                          <label className="sbx-check">
                            <input
                              type="checkbox"
                              checked={!!form.also_create_app_template}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                also_create_app_template: e.target.checked,
                              }))}
                            />
                            <span>
                              Aynı metinle uygulama şablonu da oluştur
                              <small>
                                24 saatlik pencere açıkken uygulama, kapalıyken Meta şablonu
                                kullanılır. Metinler eşleştirilir.
                              </small>
                            </span>
                          </label>

                          {form.also_create_app_template && (
                            <div className="sbx-field">
                              <label className="sbx-label" htmlFor="meta-app-name">
                                Uygulama şablon adı
                              </label>
                              <input
                                id="meta-app-name"
                                className="sbx-input"
                                value={form.app_template_name}
                                onChange={(e) => setForm((f) => ({
                                  ...f,
                                  app_template_name: e.target.value,
                                }))}
                                placeholder="Boş bırakılırsa Meta adından üretilir"
                              />
                            </div>
                          )}

                          {bindContext && (
                            <label className="sbx-check">
                              <input
                                type="checkbox"
                                checked={!!bindContext.bind}
                                onChange={(e) => setBindContext((prev) => (
                                  prev ? { ...prev, bind: e.target.checked } : prev
                                ))}
                              />
                              <span>
                                Kaydedince bildirim olayına bağla
                                <small>{bindContext.eventKey}</small>
                              </span>
                            </label>
                          )}
                        </>
                      )}
                    </div>
                  </section>

                  <section className="sbx-block">
                    <div className="sbx-block-head">
                      <span aria-hidden="true">✍️</span> Mesaj içeriği
                    </div>
                    <div className="sbx-block-body">
                      <MessageComposer
                        id="meta-body"
                        value={createComposerState(form.body_named)}
                        onChange={(state: ComposerState) =>
                          setForm((f) => ({ ...f, body_named: state.text }))
                        }
                        showPreview={false}
                        disabled={locked}
                        placeholder="Merhaba {{veli_ad}}, {{ogrenci_ad}} için bilgilendirme…"
                        onTextareaMount={setBodyNode}
                      />
                      <p className="sbx-hint">
                        Anlamlı değişkenler kullanın; Meta’nın numaralı parametreleri arka planda
                        otomatik oluşturulur.
                      </p>
                      {contentIssues.length > 0 && (
                        <div className="sbx-note is-warn">
                          <span aria-hidden="true">⚠️</span>
                          <div>
                            <strong>Meta bu şablonu reddeder</strong>
                            <ul>
                              {contentIssues.map((issue) => (
                                <li key={issue}>{issue}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                      {!locked && (
                        <TemplateVariablePanel
                          onInsert={insertVariable}
                          category={form.template_group || undefined}
                        />
                      )}
                      {exampleVars.length > 0 && (
                        <div className="sbx-field" style={{ marginTop: 16 }}>
                          <span className="sbx-label">Meta onay örneği</span>
                          <p className="sbx-hint">
                            Yalnızca Meta incelemesine gider. Toplu gönderimde buradaki metin kullanılmaz.
                          </p>
                          {exampleVars.map((key) => (
                            <label key={key} className="sbx-field" style={{ marginTop: 8 }}>
                              <span className="sbx-label">
                                {TEMPLATE_VARIABLES.find((item) => item.key === key)?.label || key}
                                {" "}
                                <code>{`{{${key}}}`}</code>
                              </span>
                              <textarea
                                className="sbx-input"
                                rows={3}
                                disabled={locked}
                                value={form.example_values[key] || ""}
                                onChange={(e) => setForm((f) => ({
                                  ...f,
                                  example_values: { ...f.example_values, [key]: e.target.value },
                                }))}
                                placeholder="Meta onayına gidecek örnek cümle"
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="sbx-block">
                    <div className="sbx-block-head">
                      <span aria-hidden="true">🧩</span> Başlık &amp; alt bilgi
                    </div>
                    <div className="sbx-block-body">
                      <div className="sbx-row">
                        <div className="sbx-field">
                          <label className="sbx-label" htmlFor="meta-header-type">Başlık türü</label>
                          <select
                            id="meta-header-type"
                            className="sbx-select"
                            value={form.header.type || "NONE"}
                            disabled={locked}
                            onChange={(e) => setForm((f) => ({
                              ...f,
                              header: { ...f.header, type: e.target.value },
                            }))}
                          >
                            <option value="NONE">Yok</option>
                            <option value="TEXT">Metin</option>
                            <option value="IMAGE">Görsel</option>
                            <option value="VIDEO">Video</option>
                            <option value="DOCUMENT">Belge</option>
                          </select>
                        </div>
                        {form.header.type === "TEXT" && (
                          <div className="sbx-field">
                            <label className="sbx-label" htmlFor="meta-header-text">Başlık metni</label>
                            <input
                              id="meta-header-text"
                              className="sbx-input"
                              value={form.header.text || ""}
                              disabled={locked}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                header: { ...f.header, text: e.target.value },
                              }))}
                            />
                            <p className="sbx-hint">
                              Yeni satır, emoji, yıldız (*) ve biçimlendirme (* _ ~ `) kullanılamaz.
                            </p>
                          </div>
                        )}
                      </div>

                      {headerIssues.length > 0 && (
                        <div className="sbx-note is-warn">
                          <span aria-hidden="true">⚠️</span>
                          <div>
                            <strong>Başlık Meta kurallarına uymuyor</strong>
                            <ul>
                              {headerIssues.map((issue) => (
                                <li key={issue}>{issue}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {["IMAGE", "VIDEO", "DOCUMENT"].includes(form.header.type || "") && !locked && (
                        <div className="sbx-field">
                          <span className="sbx-label">Örnek medya (Meta onayı için zorunlu)</span>
                          <input
                            type="file"
                            className="sbx-input"
                            accept={
                              form.header.type === "IMAGE" ? "image/*"
                                : form.header.type === "VIDEO" ? "video/*"
                                  : ".pdf,application/pdf"
                            }
                            onChange={(e) => onHeaderMedia(e.target.files?.[0] || null)}
                          />
                          {form.header.example_handle && (
                            <p className="sbx-hint">✅ Örnek medya yüklendi.</p>
                          )}
                        </div>
                      )}

                      <div className="sbx-field">
                        <label className="sbx-label" htmlFor="meta-footer">
                          Alt bilgi (isteğe bağlı)
                        </label>
                        <input
                          id="meta-footer"
                          ref={footerRef}
                          className="sbx-input"
                          maxLength={FOOTER_MAX}
                          value={form.footer_text}
                          disabled={locked}
                          placeholder="Örn. 3K Kampüs — {{sube}}"
                          onChange={(e) => setForm((f) => ({ ...f, footer_text: e.target.value }))}
                        />
                        <p className="sbx-hint">
                          {form.footer_text.length}/{FOOTER_MAX} karakter
                        </p>
                        {!locked && (
                          <>
                            <p className="sbx-hint">
                              Değişken de kullanabilirsiniz. Meta alt bilgide parametre kabul
                              etmediği için değeri onaya giderken sabitlenir; gönderimde
                              kişiye göre değişmez.
                            </p>
                            <TemplateVariablePanel
                              onInsert={insertFooterVariable}
                              allowedKeys={FOOTER_VARIABLE_KEYS}
                            />
                            {footerVars.map((key) => (
                              <label key={key} className="sbx-field" style={{ marginTop: 8 }}>
                                <span className="sbx-label">
                                  <code>{`{{${key}}}`}</code> yerine yazılacak sabit metin
                                </span>
                                <input
                                  className="sbx-input"
                                  value={form.example_values[key] || ""}
                                  onChange={(e) => setForm((f) => ({
                                    ...f,
                                    example_values: { ...f.example_values, [key]: e.target.value },
                                  }))}
                                  placeholder={
                                    TEMPLATE_VARIABLES.find((item) => item.key === key)?.label || key
                                  }
                                />
                              </label>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="sbx-block">
                    <div className="sbx-block-head">
                      <span aria-hidden="true">🔘</span> Butonlar
                    </div>
                    <div className="sbx-block-body">
                      {!locked && (
                        <div className="sbx-btnbar">
                          <button type="button" className="sbx-btn is-sm" onClick={() => addButton("QUICK_REPLY")}>
                            + Hızlı yanıt
                          </button>
                          <button type="button" className="sbx-btn is-sm" onClick={() => addButton("URL")}>
                            + Bağlantı
                          </button>
                          <button type="button" className="sbx-btn is-sm" onClick={() => addButton("PHONE_NUMBER")}>
                            + Telefon
                          </button>
                        </div>
                      )}

                      {form.buttons.length === 0 ? (
                        <p className="sbx-hint">Henüz buton yok. En fazla 3 buton ekleyebilirsiniz.</p>
                      ) : (
                        <div>
                          {form.buttons.map((btn, idx) => (
                            <div key={idx} className="sbx-btnrow">
                              <span className="sbx-btnrow-type">
                                {btn.type === "QUICK_REPLY"
                                  ? "Hızlı yanıt"
                                  : btn.type === "URL"
                                    ? "Bağlantı"
                                    : "Telefon"}
                              </span>
                              <input
                                className="sbx-input"
                                value={btn.text || ""}
                                disabled={locked}
                                placeholder="Buton metni"
                                onChange={(e) => updateButton(idx, { text: e.target.value })}
                              />
                              {btn.type === "URL" && (
                                <input
                                  className="sbx-input"
                                  value={btn.url || ""}
                                  disabled={locked}
                                  placeholder="https://site.com/{{odeme_link}}"
                                  onChange={(e) => updateButton(idx, { url: e.target.value })}
                                />
                              )}
                              {(btn.type === "PHONE_NUMBER" || btn.type === "PHONE") && (
                                <input
                                  className="sbx-input"
                                  value={btn.phone_number || btn.phone || ""}
                                  disabled={locked}
                                  placeholder="+90555…"
                                  onChange={(e) => updateButton(idx, { phone_number: e.target.value })}
                                />
                              )}
                              {!locked && (
                                <button
                                  type="button"
                                  className="sbx-btn is-sm is-danger"
                                  onClick={() => removeButton(idx)}
                                >
                                  Kaldır
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  {editing && (
                    <section className="sbx-block">
                      <div className="sbx-block-head">
                        <span aria-hidden="true">🛠</span> Şablon işlemleri
                      </div>
                      <div className="sbx-block-body">
                        <div className="sbx-btnbar">
                          <button type="button" className="sbx-btn is-sm" disabled={saving} onClick={handleClone}>
                            Kopyala
                          </button>
                          {editing.status !== "DRAFT" && (
                            <button
                              type="button"
                              className="sbx-btn is-sm"
                              disabled={saving}
                              onClick={() => runAction(
                                "Durum güncellendi",
                                () => refreshLocalMetaTemplateStatus(editing.id),
                              )}
                            >
                              ⟳ Meta durumunu sorgula
                            </button>
                          )}
                          {!editing.app_template_id && (
                            <button
                              type="button"
                              className="sbx-btn is-sm"
                              disabled={saving || !(editing.body_named || "").trim()}
                              onClick={handleCreateAppFromEditing}
                            >
                              Uygulamaya aktar
                            </button>
                          )}
                          <button
                            type="button"
                            className="sbx-btn is-sm is-danger"
                            disabled={saving || !!editing.is_system_active}
                            title={
                              editing.is_system_active
                                ? "Bildirimde kullanılıyor, silinemez"
                                : "Şablonu sil"
                            }
                            onClick={handleDelete}
                          >
                            Sil
                          </button>
                        </div>
                        <p className="sbx-hint">
                          {editing.is_system_active
                            ? `Bildirimde kullanılıyor${
                              editing.system_usages?.length
                                ? `: ${editing.system_usages.map((u) => u.label).join(", ")}`
                                : ""
                            }. Önce Bildirim Şablonları’ndan bağlantıyı kaldırın.`
                            : editing.app_template_id
                              ? `Uygulama şablonu bağlı: ${editing.app_template_name || "—"}. Silinince o da silinir; düzenleme otomatik yansır.`
                              : "Uygulama şablonu henüz bağlı değil; 24 saatlik pencere açıkken serbest mesaj gönderebilmek için aktarın."}
                        </p>
                      </div>
                    </section>
                  )}
                </div>

                <aside className="sbx-sheet-side">
                  <div className="sbx-preview">
                    <div className="sbx-preview-head">
                      <span>WhatsApp önizleme</span>
                      <span>{(form.body_named || "").length} karakter</span>
                    </div>
                    <div className="sbx-preview-canvas">
                      <div className="sbx-bubble">
                        {form.header.type === "TEXT" && form.header.text && (
                          <p className="sbx-bubble-header">
                            {resolvePreviewVariables(form.header.text, livePreviewContext)}
                          </p>
                        )}
                        {["IMAGE", "VIDEO", "DOCUMENT"].includes(form.header.type || "") && (
                          <div className="sbx-bubble-media">
                            {HEADER_MEDIA_LABEL[form.header.type || ""] || "Medya"}
                          </div>
                        )}
                        <p className="sbx-bubble-text">
                          {previewText.trim()
                            ? previewSegments.map((seg, i) =>
                                seg.type === "bold" ? (
                                  <strong key={i}>{seg.content}</strong>
                                ) : seg.type === "italic" ? (
                                  <em key={i}>{seg.content}</em>
                                ) : seg.type === "strike" ? (
                                  <s key={i}>{seg.content}</s>
                                ) : seg.type === "mono" || seg.type === "code" ? (
                                  <code key={i}>{seg.content}</code>
                                ) : seg.type === "variable" ? (
                                  <span key={i} className="wa-var">{seg.content}</span>
                                ) : (
                                  <span key={i}>{seg.content}</span>
                                ),
                              )
                            : "Mesajınız burada görünecek…"}
                        </p>
                        {form.footer_text && (
                          <p className="sbx-bubble-footer">
                            {resolvePreviewVariables(form.footer_text, livePreviewContext)}
                          </p>
                        )}
                        <div className="sbx-bubble-meta">
                          <span>{now}</span>
                          <span aria-hidden="true">✓✓</span>
                        </div>
                      </div>
                      {form.buttons.length > 0 && (
                        <div className="sbx-bubble-buttons">
                          {form.buttons.map((b, i) => (
                            <div key={i} className="sbx-bubble-button">
                              {b.type === "URL"
                                ? "🔗 "
                                : b.type === "PHONE_NUMBER" || b.type === "PHONE"
                                  ? "📞 "
                                  : "↩ "}
                              {b.text || "Buton"}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="sbx-preview">
                    <div className="sbx-preview-head">
                      <span>Kullanılan değişkenler</span>
                      <span>{usedVariables.length}</span>
                    </div>
                    {usedVariables.length ? (
                      <div className="sbx-varlist">
                        {usedVariables.map((v) => (
                          <span key={v} className="sbx-varpill">{v}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="sbx-hint">
                        Değişken eklemek için “Mesaj içeriği” altındaki listeden tıklayın.
                      </p>
                    )}
                  </div>

                  <div className="sbx-note is-info">
                    <span aria-hidden="true">🔒</span>
                    <div>
                      <strong>Meta parametreleri otomatik</strong>
                      <p>
                        Numaralı parametreler kaydederken arka planda üretilir; gönderimde öğrenci,
                        veli ve finans kayıtlarından otomatik doldurulur.
                      </p>
                    </div>
                  </div>
                </aside>
              </div>

              <footer className="sbx-sheet-foot">
                <button type="button" className="sbx-btn" onClick={closeSheet} disabled={saving}>
                  Kapat
                </button>
                <span className="sbx-foot-spacer" />
                {editing ? (
                  <>
                    <button
                      type="submit"
                      className={locked ? "sbx-btn is-primary" : "sbx-btn"}
                      disabled={saving}
                      title={
                        locked
                          ? "Yalnızca kullanım alanı ve şablon grubu kaydedilir; Meta içeriği değişmez"
                          : undefined
                      }
                    >
                      {saving ? "Kaydediliyor…" : locked ? "Yerel alanları kaydet" : "Kaydet"}
                    </button>
                    {(editing.status === "DRAFT" || editing.status === "REJECTED") && (
                      <button
                        type="button"
                        className="sbx-btn is-primary"
                        disabled={saving || contentIssues.length > 0}
                        title={contentIssues.length > 0 ? contentIssues.join(" ") : undefined}
                        onClick={() => runAction(
                          "Meta'ya gönderildi",
                          () => (editing.status === "REJECTED"
                            ? resubmitLocalMetaTemplate(editing.id)
                            : submitLocalMetaTemplate(editing.id)),
                        )}
                      >
                        {editing.status === "REJECTED" ? "Yeniden onaya gönder" : "Meta’ya gönder"}
                      </button>
                    )}
                  </>
                ) : (
                  <button type="submit" className="sbx-btn is-primary" disabled={saving}>
                    {saving ? "Kaydediliyor…" : "Taslağı oluştur"}
                  </button>
                )}
              </footer>
            </form>
          </aside>
        </>
      )}
    </CommunicationPageShell>
  );
}
