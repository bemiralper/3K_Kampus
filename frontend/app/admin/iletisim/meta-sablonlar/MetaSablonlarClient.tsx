"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CommunicationPageShell } from "@/components/communication";
import TemplateVariablePanel from "@/components/communication/TemplateVariablePanel";
import { useTextareaInsert } from "@/components/communication/useTextareaInsert";
import {
  parseWhatsAppText,
  resolvePreviewVariables,
} from "@/components/communication/composer-utils";
import "@/components/communication/communication.css";
import {
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
  META_TEMPLATE_USAGE_LABELS,
  MetaTemplateButton,
  MetaTemplateHeader,
  MetaTemplateUsage,
  cloneLocalMetaTemplate,
  createAppTemplateFromMeta,
  createLocalMetaTemplate,
  deleteLocalMetaTemplate,
  fetchLocalMetaTemplates,
  fetchNotificationEvents,
  fetchWhatsAppAccounts,
  importAppTemplatesFromMeta,
  refreshLocalMetaTemplateStatus,
  resubmitLocalMetaTemplate,
  saveNotificationBinding,
  submitLocalMetaTemplate,
  syncWhatsAppAccountTemplates,
  updateLocalMetaTemplate,
  uploadMetaTemplateExampleMedia,
} from "@/lib/communication-api";

const STATUS_BADGE: Record<string, string> = {
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

const templateContentIssues = (
  body: string,
  header: MetaTemplateHeader,
  footer: string,
): string[] => {
  const issues: string[] = [];
  const text = (body || "").trim();
  if (text) {
    const tokens = Array.from(text.matchAll(new RegExp(VAR_TOKEN, "g")));
    const last = tokens[tokens.length - 1];
    if (text.search(VAR_TOKEN) === 0) {
      issues.push(
        'Mesaj bir değişkenle başlayamaz. Başına sabit metin ekleyin — örn. "Sayın {{veli_ad}}, …".',
      );
    }
    if (last && (last.index ?? 0) + last[0].length === text.length) {
      issues.push(
        'Mesaj bir değişkenle bitemez. Sonuna sabit metin ekleyin — örn. "… bilgilerinize sunulur.".',
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
  if (footer && VAR_TOKEN.test(footer)) {
    issues.push("Alt bilgide değişken kullanılamaz.");
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
});

export default function MetaSablonlarClient() {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [templates, setTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [editing, setEditing] = useState<WhatsAppMetaTemplateItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [bindContext, setBindContext] = useState<{
    eventKey: string;
    recipient: string;
    bind: boolean;
  } | null>(null);
  const { setNode: setBodyNode, insert: insertIntoBody } = useTextareaInsert();

  const loadAccounts = useCallback(async () => {
    const res = await fetchWhatsAppAccounts();
    const list = res.accounts || [];
    setAccounts(list);
    if (!accountId && list.length) {
      const params = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
      const fromUrl = params?.get("account") || "";
      const preferred = fromUrl && list.some((a) => a.id === fromUrl)
        ? fromUrl
        : (list.find((a) => a.is_default) || list[0]).id;
      setAccountId(preferred);
    }
  }, [accountId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLocalMetaTemplates({
        account_id: accountId || undefined,
        status: statusFilter || undefined,
        meta_category: categoryFilter || undefined,
        language: languageFilter || undefined,
        search: search.trim() || undefined,
      });
      setTemplates(res.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şablonlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [accountId, statusFilter, categoryFilter, languageFilter, search]);

  useEffect(() => {
    loadAccounts().catch(() => setError("WhatsApp hesapları yüklenemedi"));
  }, [loadAccounts]);

  useEffect(() => {
    if (accountId) load();
  }, [accountId, load]);

  // Bildirim Şablonları ekranından "bu olay için şablon oluştur" kısayolu
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const eventKey = params.get("event");
    const recipient = (params.get("recipient") || "").toUpperCase();
    const shouldBind = params.get("bind") === "1";
    if (!eventKey || !recipient) return;

    setBindContext({ eventKey, recipient, bind: shouldBind });

    let cancelled = false;
    (async () => {
      try {
        const catalog = await fetchNotificationEvents();
        if (cancelled) return;
        const event = catalog.events.find((e) => e.key === eventKey);
        const slot = event?.slots.find((s) => s.recipient_type === recipient);
        if (!event || !slot) return;
        setEditing(null);
        setForm({
          ...emptyForm(),
          name: slot.suggested_meta_name,
          body_named: slot.meta_example_body,
          usage_scope: "SYSTEM",
          header: event.has_document
            ? ({ type: "DOCUMENT" } as MetaTemplateHeader)
            : event.has_image
              ? ({ type: "IMAGE" } as MetaTemplateHeader)
              : ({ type: "NONE" } as MetaTemplateHeader),
          also_create_app_template: true,
          app_template_name: `${event.label} — ${recipient === "VELI" ? "Veli" : recipient === "OGRENCI" ? "Öğrenci" : "Personel"}`,
        });
        setDrawerOpen(true);
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

  const previewText = useMemo(
    () => resolvePreviewVariables(form.body_named || ""),
    [form.body_named],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDrawerOpen(true);
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
    });
    setDrawerOpen(true);
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
        const updated = await updateLocalMetaTemplate(
          editing.id,
          locked ? { usage_scope: form.usage_scope } : payload(),
        );
        setMessage("Şablon kaydedildi.");
        setEditing(updated);
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
      setMessage(`${res.upserted ?? res.templates?.length ?? 0} şablon senkronize edildi.`);
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
    if (!confirm(`"${editing.name}" silinsin mi?`)) return;
    setSaving(true);
    try {
      await deleteLocalMetaTemplate(editing.id, editing.status !== "DRAFT");
      setDrawerOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (token: string) => {
    const next = insertIntoBody(form.body_named || "", token);
    setForm((f) => ({ ...f, body_named: next }));
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
    const found = (form.body_named || "").match(/\{\{(\w+)\}\}/g) || [];
    return Array.from(new Set(found));
  }, [form.body_named]);
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

  return (
    <CommunicationPageShell
      title="Meta Şablonları"
      subtitle="WhatsApp Business şablonlarını Meta Business Manager açmadan yönetin"
      icon="🟢"
      className="tplx tplx-page"
      breadcrumbs={[
        { label: "İletişim", href: "/admin/iletisim/toplu-gonder" },
        { label: "Meta Şablonları" },
      ]}
      actions={
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <select
            className="tplx-select"
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
          <button
            type="button"
            className="comm-btn-secondary"
            onClick={handleSync}
            disabled={!accountId || saving}
          >
            ⟳ Meta&apos;dan Güncelle
          </button>
          <button
            type="button"
            className="comm-btn-secondary"
            onClick={handleImportAppTemplates}
            disabled={!accountId || saving}
            title="Eşleşmeyen Meta şablonlarını uygulama şablonlarına kopyalar"
          >
            Uygulamaya aktar
          </button>
          <button
            type="button"
            className="comm-btn-primary"
            onClick={openCreate}
            disabled={!accountId}
          >
            + Yeni Şablon
          </button>
        </div>
      }
    >
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}
      {message && <div className="comm-alert comm-alert-success">{message}</div>}

      <div className="tplx-hero">
        <div className="tplx-hero-cell">
          <span className="tplx-hero-icon" aria-hidden="true">🗂</span>
          <span className="tplx-hero-text">
            <span className="tplx-hero-value">{counts.total}</span>
            <span className="tplx-hero-label">Şablon</span>
          </span>
        </div>
        <div className="tplx-hero-cell">
          <span className="tplx-hero-icon" aria-hidden="true">✅</span>
          <span className="tplx-hero-text">
            <span className="tplx-hero-value">{counts.approved}</span>
            <span className="tplx-hero-label">Onaylı</span>
          </span>
        </div>
        <div className="tplx-hero-cell">
          <span className="tplx-hero-icon is-amber" aria-hidden="true">⏳</span>
          <span className="tplx-hero-text">
            <span className="tplx-hero-value">{counts.pending}</span>
            <span className="tplx-hero-label">İnceleniyor</span>
          </span>
        </div>
        <div className="tplx-hero-cell">
          <span className="tplx-hero-icon is-rose" aria-hidden="true">⛔</span>
          <span className="tplx-hero-text">
            <span className="tplx-hero-value">{counts.rejected}</span>
            <span className="tplx-hero-label">Reddedildi</span>
          </span>
        </div>
        <div className="tplx-hero-cell">
          <span className="tplx-hero-icon is-violet" aria-hidden="true">📝</span>
          <span className="tplx-hero-text">
            <span className="tplx-hero-value">{counts.draft}</span>
            <span className="tplx-hero-label">Taslak</span>
          </span>
        </div>
      </div>

      <div className="tplx-toolbar">
        <div className="tplx-chips" role="tablist" aria-label="Durum filtresi">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === ""}
            className={`tplx-chip${statusFilter === "" ? " is-active" : ""}`}
            onClick={() => setStatusFilter("")}
          >
            Tümü
          </button>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={statusFilter === key}
              className={`tplx-chip${statusFilter === key ? " is-active" : ""}`}
              onClick={() => setStatusFilter(statusFilter === key ? "" : key)}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          className="tplx-select"
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
          className="tplx-select"
          value={languageFilter}
          onChange={(e) => setLanguageFilter(e.target.value)}
          aria-label="Dil filtresi"
        >
          <option value="">Tüm diller</option>
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
          <option value="en_US">English (US)</option>
        </select>

        <label className="tplx-search">
          <span className="tplx-search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            placeholder="Şablon ara…"
            aria-label="Şablon ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {!accountId && !loading ? (
        <div className="tplx-empty">
          <span className="tplx-empty-icon" aria-hidden="true">📱</span>
          <h3>WhatsApp hesabı seçin</h3>
          <p>
            Şablonlar hesap bazında yönetilir. Yukarıdan bir WhatsApp Business hesabı seçtiğinizde
            şablonlar listelenir.
          </p>
        </div>
      ) : loading ? (
        <div className="tplx-grid" aria-busy="true" aria-label="Yükleniyor">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="tplx-skeleton-card" />
          ))}
        </div>
      ) : !templates.length ? (
        <div className="tplx-empty">
          <span className="tplx-empty-icon" aria-hidden="true">✨</span>
          <h3>Şablon bulunamadı</h3>
          <p>
            Yeni bir şablon oluşturup Meta onayına gönderin ya da Meta hesabınızdaki mevcut
            şablonları tek tıkla içeri aktarın.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
            <button type="button" className="comm-btn-secondary" onClick={handleSync} disabled={saving}>
              Meta&apos;dan içe aktar
            </button>
            <button type="button" className="comm-btn-primary" onClick={openCreate}>
              + Yeni şablon
            </button>
          </div>
        </div>
      ) : (
        <div className="tplx-grid">
          {templates.map((t) => {
            const tone = STATUS_BADGE[t.status] || "is-draft";
            return (
              <article key={t.id} className={`tplx-card ${tone}`}>
                <button
                  type="button"
                  className="tplx-card-main"
                  onClick={() => openEdit(t)}
                  aria-label={`${t.name} şablonunu aç`}
                >
                  <div className="tplx-card-head">
                    <span className="tplx-card-title">
                      {t.name}
                      <span className="tplx-card-sub">
                        {CATEGORY_LABELS[t.meta_category] || t.meta_category} · {t.language}
                        {t.usage_scope && t.usage_scope !== "ALL" && (
                          <> · {t.usage_scope_label
                            || META_TEMPLATE_USAGE_LABELS[t.usage_scope as MetaTemplateUsage]}</>
                        )}
                      </span>
                    </span>
                    <div className="tplx-badges">
                      {t.is_system_active && (
                        <span className="tplx-badge is-live">
                          <span className="tplx-badge-dot" aria-hidden="true" />
                          Aktif
                        </span>
                      )}
                      <span className={`tplx-badge ${tone}`}>
                        <span className="tplx-badge-dot" aria-hidden="true" />
                        {t.status_label || STATUS_LABELS[t.status] || t.status}
                      </span>
                    </div>
                  </div>

                  <p className="tplx-card-snippet">
                    {(t.body_named || "").slice(0, 130)}
                    {(t.body_named || "").length > 130 ? "…" : ""}
                  </p>

                  {t.is_system_active && t.system_usages?.length ? (
                    <p className="tplx-card-usage">
                      <span aria-hidden="true">⚡</span>
                      {t.system_usages.map((u) => u.label).join(" · ")}
                    </p>
                  ) : null}

                  {t.status === "REJECTED" && t.rejected_reason ? (
                    <p className="tplx-card-usage" style={{ color: "#be123c" }}>
                      <span aria-hidden="true">⛔</span>
                      {t.rejected_reason}
                    </p>
                  ) : null}

                  <div className="tplx-card-foot">
                    <span>📈 {t.usage_count ?? 0} gönderim</span>
                    <span>
                      {t.approved_at
                        ? `Onay: ${new Date(t.approved_at).toLocaleDateString("tr-TR")}`
                        : t.updated_at
                          ? new Date(t.updated_at).toLocaleDateString("tr-TR")
                          : "—"}
                    </span>
                  </div>
                </button>

                <div className="tplx-card-actions">
                  <button type="button" className="tplx-card-action" onClick={() => openEdit(t)}>
                    {t.status === "APPROVED" ? "Görüntüle" : "Düzenle"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {drawerOpen && (
        <>
          <div
            className="comm-drawer-overlay"
            role="presentation"
            onClick={() => !saving && setDrawerOpen(false)}
          />
          <aside
            className="tplx comm-drawer tplx-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meta-sablon-title"
          >
            <form className="tplx-drawer-form" onSubmit={handleSave}>
              <div className="tplx-drawer-head">
                <div>
                  <h2 id="meta-sablon-title">{editing ? editing.name : "Yeni Meta Şablonu"}</h2>
                  <p>
                    {editing
                      ? `${STATUS_LABELS[editing.status] || editing.status} · ${CATEGORY_LABELS[editing.meta_category] || editing.meta_category} · ${editing.language}`
                      : "Meta onayına gönderilecek WhatsApp şablonu oluşturun."}
                  </p>
                </div>
                <div className="tplx-drawer-head-actions">
                  {editing && (
                    <span className={`tplx-badge ${STATUS_BADGE[editing.status] || "is-draft"}`}>
                      <span className="tplx-badge-dot" aria-hidden="true" />
                      {STATUS_LABELS[editing.status] || editing.status}
                    </span>
                  )}
                  <button
                    type="button"
                    className="tplx-icon-btn"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Kapat"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="tplx-drawer-body">
                <div className="tplx-drawer-main">
                  {editing?.status === "REJECTED" && (
                    <div className="tplx-note is-danger">
                      <span className="tplx-note-icon" aria-hidden="true">⛔</span>
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
                    <div className="tplx-note is-warn">
                      <span className="tplx-note-icon" aria-hidden="true">🔒</span>
                      <div>
                        <strong>
                          Düzenlemeye kapalı ({STATUS_LABELS[editing!.status] || editing!.status})
                        </strong>
                        <p>
                          Meta tarafındaki şablonlar değiştirilemez. Değişiklik için &quot;Kopyala&quot; ile
                          yeni bir sürüm oluşturun.
                        </p>
                      </div>
                    </div>
                  )}

                  <section className="tplx-section">
                    <div className="tplx-section-head">
                      <span aria-hidden="true">🏷</span> Kimlik
                    </div>
                    <div className="tplx-section-body">
                      <div className="tplx-field">
                        <label htmlFor="meta-name">Şablon adı</label>
                        <input
                          id="meta-name"
                          value={form.name}
                          disabled={!!editing || locked}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="hosgeldin_mesaji"
                          required
                        />
                        <p className="tplx-field-hint">
                          Yalnızca küçük harf ve alt çizgi. Oluşturduktan sonra değiştirilemez.
                        </p>
                      </div>
                      <div className="tplx-row">
                        <div className="tplx-field">
                          <label htmlFor="meta-lang">Dil</label>
                          <select
                            id="meta-lang"
                            value={form.language}
                            disabled={locked}
                            onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                          >
                            <option value="tr">Türkçe (tr)</option>
                            <option value="en">English (en)</option>
                            <option value="en_US">English US (en_US)</option>
                          </select>
                        </div>
                        <div className="tplx-field">
                          <label htmlFor="meta-cat">Kategori</label>
                          <select
                            id="meta-cat"
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
                      <div className="tplx-field">
                        <label htmlFor="meta-usage">Kullanım alanı</label>
                        <select
                          id="meta-usage"
                          value={form.usage_scope}
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            usage_scope: e.target.value as MetaTemplateUsage,
                          }))}
                        >
                          {(Object.keys(META_TEMPLATE_USAGE_LABELS) as MetaTemplateUsage[]).map(
                            (scope) => (
                              <option key={scope} value={scope}>
                                {META_TEMPLATE_USAGE_LABELS[scope]}
                              </option>
                            ),
                          )}
                        </select>
                        <p className="tplx-field-hint">
                          Şablonun hangi ekranda seçilebileceğini belirler. Onaydan sonra da
                          değiştirilebilir.
                        </p>
                      </div>
                      {!editing && (
                        <div className="tplx-field">
                          <label className="tplx-check-row">
                            <input
                              type="checkbox"
                              checked={!!form.also_create_app_template}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                also_create_app_template: e.target.checked,
                              }))}
                            />
                            <span>Aynı metinle uygulama şablonu da oluştur</span>
                          </label>
                          <p className="tplx-field-hint">
                            24 saatlik pencere açıkken uygulama şablonu, kapalıyken Meta şablonu
                            kullanılır. Metinler eşleştirilir.
                          </p>
                          {form.also_create_app_template && (
                            <div className="tplx-field" style={{ marginTop: "0.55rem" }}>
                              <label htmlFor="meta-app-name">Uygulama şablon adı</label>
                              <input
                                id="meta-app-name"
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
                            <label className="tplx-check-row" style={{ marginTop: "0.75rem" }}>
                              <input
                                type="checkbox"
                                checked={!!bindContext.bind}
                                onChange={(e) => setBindContext((prev) => (
                                  prev ? { ...prev, bind: e.target.checked } : prev
                                ))}
                              />
                              <span>
                                Kaydedince bildirim olayına bağla
                                {" "}
                                <code>{bindContext.eventKey}</code>
                              </span>
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="tplx-section">
                    <div className="tplx-section-head">
                      <span aria-hidden="true">✍️</span> Mesaj içeriği
                    </div>
                    <div className="tplx-section-body">
                      <div className="tplx-field">
                        <textarea
                          id="meta-body"
                          ref={setBodyNode}
                          rows={7}
                          value={form.body_named}
                          disabled={locked}
                          onChange={(e) => setForm((f) => ({ ...f, body_named: e.target.value }))}
                          placeholder="Merhaba {{veli_ad}}, {{ogrenci_ad}} için bilgilendirme…"
                          required
                        />
                        <p className="tplx-field-hint">
                          Anlamlı değişkenler kullanın; Meta&apos;nın numaralı parametreleri arka planda
                          otomatik oluşturulur.
                        </p>
                        {contentIssues.length > 0 && (
                          <div className="comm-alert comm-alert-warning" style={{ marginTop: "0.5rem" }}>
                            <strong>Meta bu şablonu reddeder:</strong>
                            <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                              {contentIssues.map((issue) => (
                                <li key={issue}>{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      {!locked && <TemplateVariablePanel onInsert={insertVariable} />}
                    </div>
                  </section>

                  <section className="tplx-section">
                    <div className="tplx-section-head">
                      <span aria-hidden="true">🧩</span> Başlık &amp; alt bilgi
                    </div>
                    <div className="tplx-section-body">
                      <div className="tplx-row">
                        <div className="tplx-field">
                          <label htmlFor="meta-header-type">Başlık türü</label>
                          <select
                            id="meta-header-type"
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
                          <div className="tplx-field">
                            <label htmlFor="meta-header-text">Başlık metni</label>
                            <input
                              id="meta-header-text"
                              value={form.header.text || ""}
                              disabled={locked}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                header: { ...f.header, text: e.target.value },
                              }))}
                            />
                            <p className="tplx-field-hint">
                              Yeni satır, emoji, yıldız (*) ve biçimlendirme (* _ ~ `) kullanılamaz.
                            </p>
                          </div>
                        )}
                      </div>
                      {contentIssues.some((i) => i.toLocaleLowerCase("tr").includes("başlık")) && (
                        <div className="comm-alert comm-alert-warning" style={{ marginTop: "0.5rem" }}>
                          <strong>Başlık Meta kurallarına uymuyor:</strong>
                          <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                            {contentIssues
                              .filter((i) => i.toLocaleLowerCase("tr").includes("başlık"))
                              .map((issue) => (
                                <li key={issue}>{issue}</li>
                              ))}
                          </ul>
                        </div>
                      )}

                      {["IMAGE", "VIDEO", "DOCUMENT"].includes(form.header.type || "") && !locked && (
                        <div className="tplx-field">
                          <span className="tplx-label">Örnek medya (Meta onayı için zorunlu)</span>
                          <input
                            type="file"
                            accept={
                              form.header.type === "IMAGE" ? "image/*"
                                : form.header.type === "VIDEO" ? "video/*"
                                  : ".pdf,application/pdf"
                            }
                            onChange={(e) => onHeaderMedia(e.target.files?.[0] || null)}
                          />
                          {form.header.example_handle && (
                            <p className="tplx-field-hint">✅ Örnek medya yüklendi.</p>
                          )}
                        </div>
                      )}

                      <div className="tplx-field">
                        <label htmlFor="meta-footer">Alt bilgi (isteğe bağlı)</label>
                        <input
                          id="meta-footer"
                          maxLength={60}
                          value={form.footer_text}
                          disabled={locked}
                          placeholder="Örn. 3K Kampüs — Bilgilendirme mesajı"
                          onChange={(e) => setForm((f) => ({ ...f, footer_text: e.target.value }))}
                        />
                        <p className="tplx-field-hint">{form.footer_text.length}/60 karakter</p>
                      </div>
                    </div>
                  </section>

                  <section className="tplx-section">
                    <div className="tplx-section-head">
                      <span aria-hidden="true">🔘</span> Butonlar
                    </div>
                    <div className="tplx-section-body">
                      {!locked && (
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <button type="button" className="tplx-mini-btn" onClick={() => addButton("QUICK_REPLY")}>
                            + Hızlı yanıt
                          </button>
                          <button type="button" className="tplx-mini-btn" onClick={() => addButton("URL")}>
                            + Bağlantı
                          </button>
                          <button type="button" className="tplx-mini-btn" onClick={() => addButton("PHONE_NUMBER")}>
                            + Telefon
                          </button>
                        </div>
                      )}

                      {form.buttons.length === 0 ? (
                        <p className="tplx-field-hint" style={{ margin: 0 }}>
                          Henüz buton yok. En fazla 3 buton ekleyebilirsiniz.
                        </p>
                      ) : (
                        <div>
                          {form.buttons.map((btn, idx) => (
                            <div key={idx} className="tplx-btn-row">
                              <span className="tplx-btn-type">
                                {btn.type === "QUICK_REPLY" ? "Yanıt" : btn.type === "URL" ? "Link" : "Telefon"}
                              </span>
                              <input
                                value={btn.text || ""}
                                disabled={locked}
                                placeholder="Buton metni"
                                onChange={(e) => updateButton(idx, { text: e.target.value })}
                              />
                              {btn.type === "URL" && (
                                <input
                                  value={btn.url || ""}
                                  disabled={locked}
                                  placeholder="https://site.com/{{odeme_link}}"
                                  onChange={(e) => updateButton(idx, { url: e.target.value })}
                                />
                              )}
                              {(btn.type === "PHONE_NUMBER" || btn.type === "PHONE") && (
                                <input
                                  value={btn.phone_number || btn.phone || ""}
                                  disabled={locked}
                                  placeholder="+90555…"
                                  onChange={(e) => updateButton(idx, { phone_number: e.target.value })}
                                />
                              )}
                              {!locked && (
                                <button
                                  type="button"
                                  className="tplx-mini-btn is-danger"
                                  onClick={() => removeButton(idx)}
                                  aria-label="Butonu kaldır"
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
                </div>

                <aside className="tplx-drawer-side">
                  <div className="tplx-preview-title">
                    <span>WhatsApp önizleme</span>
                    <span>{(form.body_named || "").length} karakter</span>
                  </div>

                  <div className="tplx-preview-stack">
                    <div className="tplx-bubble">
                      {form.header.type === "TEXT" && form.header.text && (
                        <p className="tplx-bubble-header">
                          {resolvePreviewVariables(form.header.text)}
                        </p>
                      )}
                      {["IMAGE", "VIDEO", "DOCUMENT"].includes(form.header.type || "") && (
                        <div className="tplx-bubble-media">
                          {HEADER_MEDIA_LABEL[form.header.type || ""] || "Medya"}
                        </div>
                      )}
                      <p className="tplx-bubble-text">
                        {previewText.trim()
                          ? previewSegments.map((seg, i) =>
                              seg.type === "bold" ? (
                                <strong key={i}>{seg.content}</strong>
                              ) : seg.type === "italic" ? (
                                <em key={i}>{seg.content}</em>
                              ) : seg.type === "strike" ? (
                                <s key={i}>{seg.content}</s>
                              ) : seg.type === "mono" ? (
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
                        <p className="tplx-bubble-footer">{form.footer_text}</p>
                      )}
                      <div className="tplx-bubble-meta">
                        <span>
                          {new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span aria-hidden="true">✓✓</span>
                      </div>
                    </div>
                    {form.buttons.length > 0 && (
                      <div className="tplx-bubble-buttons">
                        {form.buttons.map((b, i) => (
                          <div key={i} className="tplx-bubble-button">
                            {b.type === "URL" ? "🔗 " : b.type === "PHONE_NUMBER" || b.type === "PHONE" ? "📞 " : "↩ "}
                            {b.text || "Buton"}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="tplx-preview-title" style={{ marginBottom: "0.4rem" }}>
                      <span>Kullanılan değişkenler</span>
                      <span>{usedVariables.length}</span>
                    </div>
                    {usedVariables.length ? (
                      <div className="tplx-map-list">
                        {usedVariables.map((v) => (
                          <span key={v} className="tplx-map-pill">
                            <b>{v}</b>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="tplx-field-hint" style={{ margin: 0 }}>
                        Değişken eklemek için soldaki listeden tıklayın.
                      </p>
                    )}
                  </div>

                  <div className="tplx-note is-info">
                    <span className="tplx-note-icon" aria-hidden="true">🔒</span>
                    <div>
                      <strong>Meta parametreleri otomatik</strong>
                      <p>
                        Numaralı parametreler kaydederken arka planda üretilir; gönderim sırasında
                        öğrenci, veli ve finans kayıtlarından otomatik doldurulur.
                      </p>
                    </div>
                  </div>
                </aside>
              </div>

              <div className="tplx-drawer-foot">
                <div className="tplx-foot-left">
                  {editing && (
                    <>
                      <button type="button" className="tplx-mini-btn" disabled={saving} onClick={handleClone}>
                        Kopyala
                      </button>
                      {!editing.app_template_id && (
                        <button
                          type="button"
                          className="tplx-mini-btn"
                          disabled={saving || !(editing.body_named || "").trim()}
                          onClick={handleCreateAppFromEditing}
                          title="Aynı metinle uygulama şablonu oluştur"
                        >
                          Uygulamaya aktar
                        </button>
                      )}
                      {editing.app_template_id && (
                        <span className="tplx-field-hint" style={{ margin: 0 }}>
                          Uygulama: {editing.app_template_name || "bağlı"}
                        </span>
                      )}
                      <button
                        type="button"
                        className="tplx-mini-btn is-danger"
                        disabled={saving}
                        onClick={handleDelete}
                      >
                        Sil
                      </button>
                    </>
                  )}
                </div>

                {editing && editing.status !== "DRAFT" && (
                  <button
                    type="button"
                    className="comm-btn-secondary"
                    disabled={saving}
                    onClick={() => runAction("Durum güncellendi", () => refreshLocalMetaTemplateStatus(editing.id))}
                  >
                    ⟳ Meta durumunu sorgula
                  </button>
                )}
                {editing && !locked && (
                  <button type="submit" className="comm-btn-secondary" disabled={saving}>
                    {saving ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                )}
                {editing && (editing.status === "DRAFT" || editing.status === "REJECTED") && (
                  <button
                    type="button"
                    className="comm-btn-primary"
                    disabled={saving || contentIssues.length > 0}
                    title={contentIssues.length > 0 ? contentIssues.join(" ") : undefined}
                    onClick={() => runAction(
                      "Meta'ya gönderildi",
                      () => (editing.status === "REJECTED"
                        ? resubmitLocalMetaTemplate(editing.id)
                        : submitLocalMetaTemplate(editing.id)),
                    )}
                  >
                    {editing.status === "REJECTED" ? "Yeniden onaya gönder" : "Meta'ya gönder"}
                  </button>
                )}
                {!editing && (
                  <button type="submit" className="comm-btn-primary" disabled={saving}>
                    {saving ? "Kaydediliyor…" : "Taslağı oluştur"}
                  </button>
                )}
              </div>
            </form>
          </aside>
        </>
      )}
    </CommunicationPageShell>
  );
}
