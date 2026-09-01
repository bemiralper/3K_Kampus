"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CommunicationPageShell } from "@/components/communication";
import TemplateEditorPanel, {
  composerToTemplateForm,
  templateFormToComposer,
  TemplateEditorForm,
} from "@/components/communication/TemplateEditorPanel";
import { catalogTemplateGroups } from "@/components/communication/notification-event-utils";
import { useSheetChrome } from "@/components/communication/useSheetChrome";
import "@/components/communication/communication.css";
import { ComposerState, createComposerState } from "@/components/communication/composer-utils";
import { trIncludes } from "@/lib/text-format";
import {
  categoryLabelMap,
  createTemplate,
  createTemplateCategory,
  deleteTemplate,
  deleteTemplateCategory,
  fetchNotificationEvents,
  fetchTemplateCategories,
  fetchTemplates,
  MessageTemplateItem,
  NotificationEventCatalog,
  saveNotificationBinding,
  TEMPLATE_AUDIENCE_LABELS,
  TemplateCategoryItem,
  updateTemplate,
} from "@/lib/communication-api";
import {
  notifyCommunicationTemplateUsageChanged,
  useRefreshOnCommunicationTemplateUsageChange,
} from "@/lib/communication-template-usage-sync";

const EMPTY_FORM: TemplateEditorForm = {
  name: "",
  body: "",
  header_type: "NONE",
  header_text: "",
  footer_text: "",
  category: "ozel",
  audience_scope: "admin",
  odev_pdf_role: "",
  meta_template_id: "",
  also_create_meta_template: false,
  meta_channel_config_id: "",
  meta_template_name: "",
  template_group: "",
  bind_event_key: "",
  bind_recipient: "",
  bind_on_save: false,
};

const VIEW_STORAGE_KEY = "comm.appTemplates.view";

const USAGE_OPTIONS: [string, string][] = [
  ["", "Tüm şablonlar"],
  ["system", "Sistemde aktif"],
  ["free", "Bağımsız (serbest)"],
];

function headerFieldsFromTemplate(t: MessageTemplateItem) {
  const h = t.header_json || {};
  const type = (h.type || "NONE").toUpperCase() === "TEXT" ? "TEXT" : "NONE";
  return {
    header_type: type as "NONE" | "TEXT",
    header_text: type === "TEXT" ? (h.text || "") : "",
    footer_text: t.footer_text || "",
  };
}

function headerPayloadFromForm(form: TemplateEditorForm) {
  const header_json =
    form.header_type === "TEXT"
      ? { type: "TEXT" as const, text: (form.header_text || "").trim() }
      : {};
  return {
    header_json,
    footer_text: (form.footer_text || "").trim(),
  };
}

export default function SablonlarClient({
  portal = "admin",
}: {
  portal?: "admin" | "muhasebe";
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialCategory = searchParams.get("category") || "";
  const defaultAudience = portal === "muhasebe" ? "muhasebe" : "admin";
  const audienceOptions = useMemo(() => {
    const entries = Object.entries(TEMPLATE_AUDIENCE_LABELS);
    if (portal !== "muhasebe") return entries;
    return entries.filter(([key]) => key === "muhasebe");
  }, [portal]);

  const [templates, setTemplates] = useState<MessageTemplateItem[]>([]);
  const [categories, setCategories] = useState<TemplateCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [editing, setEditing] = useState<MessageTemplateItem | null>(null);
  const [form, setForm] = useState<TemplateEditorForm>({
    ...EMPTY_FORM,
    audience_scope: defaultAudience,
  });
  const [composerState, setComposerState] = useState<ComposerState>(createComposerState(""));
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryAudience, setNewCategoryAudience] = useState(defaultAudience);
  const [categorySaving, setCategorySaving] = useState(false);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [usageFilter, setUsageFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<"grid" | "rows">("grid");
  const [eventCatalog, setEventCatalog] = useState<NotificationEventCatalog | null>(null);

  const labels = useMemo(() => categoryLabelMap(categories), [categories]);
  const templateGroups = useMemo(() => catalogTemplateGroups(eventCatalog), [eventCatalog]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditing(null);
  }, []);

  useSheetChrome(sheetOpen, closeSheet);

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "rows" || stored === "grid") setView(stored);
  }, []);

  const changeView = (next: "grid" | "rows") => {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  const loadCategories = useCallback(async () => {
    const res = await fetchTemplateCategories(false, portal !== "muhasebe");
    setCategories(res.categories);
    return res.categories;
  }, [portal]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadCategories();
      const res = await fetchTemplates(categoryFilter || undefined);
      setTemplates(res.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şablonlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, loadCategories]);

  useEffect(() => {
    load();
  }, [load]);

  useRefreshOnCommunicationTemplateUsageChange(load);

  useEffect(() => {
    fetchNotificationEvents()
      .then(setEventCatalog)
      .catch(() => setEventCatalog(null));
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get("category") || "";
    if (fromUrl !== categoryFilter) {
      setCategoryFilter(fromUrl);
    }
    // URL → state sync only when query changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectCategory = (slug: string) => {
    setCategoryFilter(slug);
    const qs = slug ? `?category=${encodeURIComponent(slug)}` : "";
    router.replace(`${pathname}${qs}`, { scroll: false });
  };

  const resetForm = (category?: string) => {
    setForm({
      ...EMPTY_FORM,
      category: category || categoryFilter || "ozel",
      audience_scope: defaultAudience,
    });
    setComposerState(createComposerState(""));
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setSuccessMsg(null);
    setPane("edit");
    setSheetOpen(true);
  };

  const openEdit = (t: MessageTemplateItem) => {
    setEditing(t);
    setForm({
      name: t.name,
      body: t.body,
      ...headerFieldsFromTemplate(t),
      category: t.category,
      audience_scope: t.audience_scope || "genel",
      odev_pdf_role: t.odev_pdf_role || "",
      meta_template_id: t.meta_template || "",
      template_group: t.template_group || "",
    });
    setComposerState(templateFormToComposer(t.body));
    setSuccessMsg(null);
    setPane("edit");
    setSheetOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    const {
      meta_template_id,
      also_create_meta_template,
      meta_channel_config_id,
      meta_template_name,
      header_type: _ht,
      header_text: _hx,
      footer_text: _ft,
      bind_event_key,
      bind_recipient,
      bind_on_save,
      ...rest
    } = composerToTemplateForm(form, composerState);
    const headerFields = headerPayloadFromForm(form);
    const payload = {
      ...rest,
      ...headerFields,
      template_group: form.template_group || "",
      meta_template_id: meta_template_id || null,
      also_create_meta_template: !editing && !!also_create_meta_template,
      meta_channel_config_id:
        !editing && also_create_meta_template ? (meta_channel_config_id || null) : undefined,
      meta_template_name:
        !editing && also_create_meta_template ? (meta_template_name || undefined) : undefined,
    };
    try {
      if (editing) {
        await updateTemplate(editing.id, {
          ...rest,
          ...headerFields,
          meta_template_id: meta_template_id || null,
        });
        setSuccessMsg("Şablon güncellendi.");
      } else {
        const created = await createTemplate(payload);
        let bindNote = "";
        if (bind_on_save && bind_event_key && bind_recipient) {
          try {
            await saveNotificationBinding({
              event_key: bind_event_key,
              recipient_type: bind_recipient as "VELI" | "OGRENCI" | "PERSONEL",
              message_template_id: created.id,
              meta_template_id: created.pairing?.meta_template?.id || null,
              send_mode: "AUTO",
              is_active: true,
            });
            notifyCommunicationTemplateUsageChanged();
            bindNote = " Bildirim olayına bağlandı.";
          } catch (bindErr) {
            bindNote = ` Şablon oluştu ancak olaya bağlanamadı: ${
              bindErr instanceof Error ? bindErr.message : "hata"
            }`;
          }
        }
        const metaName = created.pairing?.meta_template?.name;
        setSuccessMsg(
          (created.info
            || (
              metaName
                ? `Şablon oluşturuldu ve Meta taslağı eklendi (${metaName}). ${created.pairing?.info || ""}`
                : "Şablon oluşturuldu."
            )) + bindNote,
        );
      }
      closeSheet();
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (target?: MessageTemplateItem) => {
    const tpl = target || editing;
    if (!tpl) return;
    const usageHint = tpl.is_system_active && tpl.system_usages?.length
      ? `\n\nBu şablon şu anda kullanılıyor:\n${tpl.system_usages.map((u) => `• ${u.label}`).join("\n")}\n\nSilinirse otomatik olarak başka bir şablon atanır.`
      : "";
    if (!confirm(`"${tpl.name}" şablonunu silmek istediğinize emin misiniz?${usageHint}`)) return;
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await deleteTemplate(tpl.id);
      if (res.warning) {
        setSuccessMsg(res.warning);
      }
      if (editing?.id === tpl.id) {
        closeSheet();
        resetForm();
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme başarısız");
    }
  };

  const handleAddCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCategoryLabel.trim()) return;
    setCategorySaving(true);
    setError(null);
    try {
      const created = await createTemplateCategory(newCategoryLabel.trim(), newCategoryAudience);
      setNewCategoryLabel("");
      setNewCategoryAudience("admin");
      setShowCategoryForm(false);
      await loadCategories();
      selectCategory(created.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategori eklenemedi");
    } finally {
      setCategorySaving(false);
    }
  };

  const handleDeleteCategory = async (cat: TemplateCategoryItem) => {
    if (!confirm(`"${cat.label}" kategorisini kaldırmak istediğinize emin misiniz?`)) return;
    setError(null);
    try {
      await deleteTemplateCategory(cat.id);
      if (categoryFilter === cat.slug) selectCategory("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategori silinemedi");
    }
  };

  const totals = templates.reduce(
    (acc, t) => ({
      sent: acc.sent + t.stats_sent,
      read: acc.read + t.stats_read,
      failed: acc.failed + t.stats_failed,
    }),
    { sent: 0, read: 0, failed: 0 },
  );

  const activeCategories = categories.filter((c) => c.is_active);
  const totalTemplateCount = useMemo(
    () => activeCategories.reduce((sum, c) => sum + (c.template_count ?? 0), 0),
    [activeCategories],
  );

  const visibleTemplates = useMemo(() => {
    const q = search.trim();
    return templates.filter((t) => {
      if (q && !trIncludes(t.name, q) && !trIncludes(t.body, q)) {
        return false;
      }
      if (groupFilter && (t.template_group || "") !== groupFilter) return false;
      if (audienceFilter && (t.audience_scope || "genel") !== audienceFilter) return false;
      if (usageFilter === "system" && !t.is_system_active) return false;
      if (usageFilter === "free" && t.is_system_active) return false;
      return true;
    });
  }, [templates, search, groupFilter, audienceFilter, usageFilter]);

  const activeFilters = [
    groupFilter && {
      key: "group",
      label: templateGroups.find((g) => g.key === groupFilter)?.label || groupFilter,
      clear: () => setGroupFilter(""),
    },
    audienceFilter && {
      key: "audience",
      label: TEMPLATE_AUDIENCE_LABELS[audienceFilter] || audienceFilter,
      clear: () => setAudienceFilter(""),
    },
    usageFilter && {
      key: "usage",
      label: USAGE_OPTIONS.find(([k]) => k === usageFilter)?.[1] || usageFilter,
      clear: () => setUsageFilter(""),
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const clearFilters = () => {
    setGroupFilter("");
    setAudienceFilter("");
    setUsageFilter("");
    setSearch("");
  };

  const metrics = [
    { key: "count", icon: "📋", tone: "", value: templates.length, label: "Şablon" },
    { key: "sent", icon: "📤", tone: "is-blue", value: totals.sent, label: "Gönderildi" },
    { key: "read", icon: "👁", tone: "is-green", value: totals.read, label: "Okundu" },
    { key: "failed", icon: "⚠", tone: "is-rose", value: totals.failed, label: "Başarısız" },
    { key: "cats", icon: "🗂", tone: "is-violet", value: activeCategories.length, label: "Kategori" },
  ];

  return (
    <CommunicationPageShell
      title="Şablonlar"
      subtitle="Hazır yanıtları kategori ve gruplara göre yönetin"
      icon="📋"
      className="sbx sbx-page"
      breadcrumbs={
        portal === "muhasebe"
          ? [
              { label: "WhatsApp", href: "/muhasebe/iletisim/mesajlar" },
              { label: "Şablonlar" },
            ]
          : [
              { label: "İletişim", href: "/admin/iletisim/toplu-gonder" },
              { label: "Şablonlar" },
            ]
      }
      actions={
        <div className="sbx-head-actions">
          <button type="button" className="sbx-btn is-primary" onClick={openCreate}>
            + Yeni Şablon
          </button>
        </div>
      }
    >
      {(error || successMsg) && (
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
          {successMsg && (
            <div className="sbx-alert is-success">
              <span aria-hidden="true">✅</span>
              <span>{successMsg}</span>
              <button
                type="button"
                className="sbx-alert-x"
                onClick={() => setSuccessMsg(null)}
                aria-label="Kapat"
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      <div className="sbx-metrics">
        {metrics.map((m) => (
          <div key={m.key} className="sbx-metric is-static">
            <span className={`sbx-metric-icon ${m.tone}`} aria-hidden="true">{m.icon}</span>
            <span className="sbx-metric-text">
              <span className="sbx-metric-value">{m.value.toLocaleString("tr-TR")}</span>
              <span className="sbx-metric-label">{m.label}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="sbx-chiprow" role="tablist" aria-label="Şablon kategorileri">
        <button
          type="button"
          role="tab"
          aria-selected={categoryFilter === ""}
          className={`sbx-chip${categoryFilter === "" ? " is-active" : ""}`}
          onClick={() => selectCategory("")}
        >
          Tümü
          <span className="sbx-chip-count">{totalTemplateCount}</span>
        </button>
        {activeCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={categoryFilter === cat.slug}
            className={`sbx-chip${categoryFilter === cat.slug ? " is-active" : ""}`}
            onClick={() => selectCategory(cat.slug)}
            title={TEMPLATE_AUDIENCE_LABELS[cat.audience_scope] || cat.audience_scope}
          >
            {cat.label}
            <span className="sbx-chip-count">{cat.template_count ?? 0}</span>
            {(cat.template_count ?? 0) === 0 && (
              <span
                role="button"
                tabIndex={0}
                className="sbx-chip-x"
                aria-label={`${cat.label} kategorisini kaldır`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteCategory(cat);
                }}
              >
                ×
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          className="sbx-chip is-add"
          onClick={() => setShowCategoryForm((v) => !v)}
        >
          + Kategori
        </button>
      </div>

      {showCategoryForm && (
        <form className="sbx-inline-form" onSubmit={handleAddCategory}>
          <input
            type="text"
            className="sbx-input"
            placeholder="Yeni kategori adı"
            value={newCategoryLabel}
            onChange={(e) => setNewCategoryLabel(e.target.value)}
            aria-label="Yeni kategori adı"
            autoFocus
          />
          <select
            className="sbx-select"
            value={newCategoryAudience}
            onChange={(e) => setNewCategoryAudience(e.target.value)}
            aria-label="Hedef birim"
          >
            {audienceOptions.map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button type="submit" className="sbx-btn is-primary" disabled={categorySaving}>
            {categorySaving ? "Ekleniyor…" : "Ekle"}
          </button>
          <button type="button" className="sbx-btn" onClick={() => setShowCategoryForm(false)}>
            İptal
          </button>
        </form>
      )}

      <div className="sbx-filterbar">
        <div className="sbx-filterbar-top">
          <label className="sbx-search">
            <span className="sbx-search-icon" aria-hidden="true">🔍</span>
            <input
              type="search"
              placeholder="Şablon veya metin ara…"
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
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
            aria-label="Hedef kitle filtresi"
          >
            <option value="">Tüm hedef kitleler</option>
            {audienceOptions.map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            className="sbx-select"
            value={usageFilter}
            onChange={(e) => setUsageFilter(e.target.value)}
            aria-label="Kullanım filtresi"
          >
            {USAGE_OPTIONS.map(([value, label]) => (
              <option key={value || "all"} value={value}>{label}</option>
            ))}
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

      {loading ? (
        <div className="sbx-grid" aria-busy="true" aria-label="Yükleniyor">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="sbx-skeleton" />
          ))}
        </div>
      ) : visibleTemplates.length === 0 ? (
        <div className="sbx-empty">
          <span className="sbx-empty-icon" aria-hidden="true">
            {search || activeFilters.length ? "🔍" : "✨"}
          </span>
          <h3>{search || activeFilters.length ? "Sonuç bulunamadı" : "Henüz şablon yok"}</h3>
          <p>
            {search || activeFilters.length
              ? "Arama veya filtrelerle eşleşen şablon yok. Farklı bir kelime deneyin ya da filtreleri temizleyin."
              : "Sık kullandığınız mesajları şablona dönüştürün; tek tıkla gönderin, değişkenler otomatik dolsun."}
          </p>
          <div className="sbx-empty-actions">
            {(search || activeFilters.length > 0) && (
              <button type="button" className="sbx-btn" onClick={clearFilters}>
                Filtreleri temizle
              </button>
            )}
            <button type="button" className="sbx-btn is-primary" onClick={openCreate}>
              + Yeni şablon
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="sbx-resultbar">
            <span>
              {visibleTemplates.length} şablon
              {visibleTemplates.length !== templates.length ? ` / ${templates.length}` : ""}
            </span>
          </div>
          <div className={`sbx-grid${view === "rows" ? " is-rows" : ""}`}>
            {visibleTemplates.map((t) => (
              <article key={t.id} className={`sbx-card${t.is_system_active ? " is-live" : ""}`}>
                <button
                  type="button"
                  className="sbx-card-open"
                  onClick={() => openEdit(t)}
                  aria-label={`${t.name} şablonunu düzenle`}
                >
                  <div className="sbx-card-top">
                    <div className="sbx-card-headline">
                      <span className="sbx-card-title">{t.name}</span>
                      <span className="sbx-card-meta">
                        <span>{t.category_label || labels[t.category] || t.category}</span>
                        <span>· {TEMPLATE_AUDIENCE_LABELS[t.audience_scope || "genel"]}</span>
                        {t.template_group && t.template_group_label && (
                          <span>· {t.template_group_label}</span>
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
                      {t.meta_template_name && (
                        <span className="sbx-badge is-group">Meta eşi</span>
                      )}
                    </div>
                  </div>

                  <p className="sbx-card-snippet">{t.body}</p>

                  {t.is_system_active && t.system_usages?.length ? (
                    <p className="sbx-card-usage">
                      <span aria-hidden="true">⚡</span>
                      <span>
                        {t.system_usages.map((u, idx) => (
                          <span key={`${u.module}-${u.role}-${idx}`}>
                            {idx > 0 ? " · " : ""}
                            {u.event_key && portal !== "muhasebe" ? (
                              <a
                                href={`/admin/iletisim/bildirim-sablonlari?event=${encodeURIComponent(u.event_key)}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {u.label}
                              </a>
                            ) : (
                              u.label
                            )}
                          </span>
                        ))}
                      </span>
                    </p>
                  ) : null}

                  <div className="sbx-card-foot">
                    <span>📤 {t.stats_sent.toLocaleString("tr-TR")} gönderim</span>
                    <span>👁 {t.stats_read.toLocaleString("tr-TR")} okundu</span>
                    {t.stats_failed > 0 && <span>⚠ {t.stats_failed} hata</span>}
                  </div>
                </button>

                <div className="sbx-card-actions">
                  <button type="button" className="sbx-btn is-sm" onClick={() => openEdit(t)}>
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className="sbx-btn is-sm is-danger"
                    aria-label={`${t.name} sil`}
                    onClick={() => handleDelete(t)}
                  >
                    Sil
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {sheetOpen && (
        <>
          <div className="sbx-scrim" onClick={closeSheet} role="presentation" />
          <aside
            className="sbx-sheet"
            data-pane={pane}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sablon-drawer-title"
          >
            <TemplateEditorPanel
              editing={editing}
              form={form}
              categories={categories}
              saving={saving}
              audienceOptions={audienceOptions}
              onChange={setForm}
              composerState={composerState}
              onComposerChange={setComposerState}
              onSubmit={handleSubmit}
              onCancel={closeSheet}
              onDelete={editing ? () => handleDelete(editing) : undefined}
              eventCatalog={eventCatalog}
              pane={pane}
              onPaneChange={setPane}
            />
          </aside>
        </>
      )}
    </CommunicationPageShell>
  );
}
