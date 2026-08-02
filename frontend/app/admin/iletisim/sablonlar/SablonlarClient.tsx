"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CommunicationPageShell } from "@/components/communication";
import TemplateEditorPanel, {
  composerToTemplateForm,
  templateFormToComposer,
  TemplateEditorForm,
} from "@/components/communication/TemplateEditorPanel";
import "@/components/communication/communication.css";
import { ComposerState, createComposerState } from "@/components/communication/composer-utils";
import {
  categoryLabelMap,
  createTemplate,
  createTemplateCategory,
  deleteTemplate,
  deleteTemplateCategory,
  fetchTemplateCategories,
  fetchTemplates,
  MessageTemplateItem,
  TEMPLATE_AUDIENCE_LABELS,
  TemplateCategoryItem,
  updateTemplate,
} from "@/lib/communication-api";

const EMPTY_FORM: TemplateEditorForm = {
  name: "",
  body: "",
  category: "ozel",
  audience_scope: "admin",
  odev_pdf_role: "",
};

export default function SablonlarClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialCategory = searchParams.get("category") || "";

  const [templates, setTemplates] = useState<MessageTemplateItem[]>([]);
  const [categories, setCategories] = useState<TemplateCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplateItem | null>(null);
  const [form, setForm] = useState<TemplateEditorForm>(EMPTY_FORM);
  const [composerState, setComposerState] = useState<ComposerState>(createComposerState(""));
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryAudience, setNewCategoryAudience] = useState("admin");
  const [categorySaving, setCategorySaving] = useState(false);
  const [search, setSearch] = useState("");

  const labels = useMemo(() => categoryLabelMap(categories), [categories]);

  const loadCategories = useCallback(async () => {
    const res = await fetchTemplateCategories(false, true);
    setCategories(res.categories);
    return res.categories;
  }, []);

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
    setForm({ ...EMPTY_FORM, category: category || categoryFilter || "ozel" });
    setComposerState(createComposerState(""));
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setSuccessMsg(null);
    setDrawerOpen(true);
  };

  const openEdit = (t: MessageTemplateItem) => {
    setEditing(t);
    setForm({
      name: t.name,
      body: t.body,
      category: t.category,
      audience_scope: t.audience_scope || "genel",
      odev_pdf_role: t.odev_pdf_role || "",
    });
    setComposerState(templateFormToComposer(t.body));
    setSuccessMsg(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = composerToTemplateForm(form, composerState);
    try {
      if (editing) {
        await updateTemplate(editing.id, payload);
      } else {
        await createTemplate(payload);
      }
      closeDrawer();
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
        closeDrawer();
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
    if (!search.trim()) return templates;
    const q = search.trim().toLowerCase();
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q),
    );
  }, [templates, search]);

  return (
    <CommunicationPageShell
      title="Şablonlar"
      subtitle="Hazır yanıtları kategorilere göre yönetin"
      icon="📋"
      breadcrumbs={[
        { label: "İletişim", href: "/admin/iletisim/toplu-gonder" },
        { label: "Şablonlar" },
      ]}
      actions={
        <button type="button" className="comm-btn-primary" onClick={openCreate}>
          + Yeni Şablon
        </button>
      }
    >
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}
      {successMsg && <div className="comm-alert comm-alert-success">{successMsg}</div>}

      <div className="comm-stat-grid" style={{ marginBottom: "1.25rem" }}>
        <div className="comm-stat-card">
          <span className="comm-stat-value">{templates.length}</span>
          <span className="comm-stat-label">Aktif şablon</span>
        </div>
        <div className="comm-stat-card">
          <span className="comm-stat-value">{totals.sent}</span>
          <span className="comm-stat-label">Gönderildi</span>
        </div>
        <div className="comm-stat-card">
          <span className="comm-stat-value">{totals.read}</span>
          <span className="comm-stat-label">Okundu</span>
        </div>
        <div className="comm-stat-card">
          <span className="comm-stat-value">{activeCategories.length}</span>
          <span className="comm-stat-label">Kategori</span>
        </div>
      </div>

      <div className="comm-tabbar">
        <div className="comm-tabs" role="tablist" aria-label="Şablon kategorileri">
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === ""}
            className={`comm-tab${categoryFilter === "" ? " active" : ""}`}
            onClick={() => selectCategory("")}
          >
            Tümü
            <span className="comm-tab-count">{totalTemplateCount}</span>
          </button>
          {activeCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={categoryFilter === cat.slug}
              className={`comm-tab${categoryFilter === cat.slug ? " active" : ""}`}
              onClick={() => selectCategory(cat.slug)}
              title={TEMPLATE_AUDIENCE_LABELS[cat.audience_scope] || cat.audience_scope}
            >
              {cat.label}
              <span className="comm-tab-count">{cat.template_count ?? 0}</span>
              {(cat.template_count ?? 0) === 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="comm-tab-remove"
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
            className="comm-tab comm-tab-add"
            onClick={() => setShowCategoryForm((v) => !v)}
          >
            + Kategori
          </button>
        </div>

        <input
          type="search"
          className="comm-tabbar-search"
          placeholder="Şablon ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showCategoryForm && (
        <form className="comm-card comm-sablon-category-add-form" onSubmit={handleAddCategory}>
          <input
            type="text"
            placeholder="Yeni kategori adı"
            value={newCategoryLabel}
            onChange={(e) => setNewCategoryLabel(e.target.value)}
            aria-label="Yeni kategori adı"
            autoFocus
          />
          <select
            value={newCategoryAudience}
            onChange={(e) => setNewCategoryAudience(e.target.value)}
            aria-label="Hedef birim"
          >
            {Object.entries(TEMPLATE_AUDIENCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button type="submit" className="comm-btn-primary" disabled={categorySaving}>
            {categorySaving ? "Ekleniyor…" : "Ekle"}
          </button>
          <button type="button" className="comm-btn-secondary" onClick={() => setShowCategoryForm(false)}>
            İptal
          </button>
        </form>
      )}

      {loading ? (
        <p className="comm-studio-muted">Yükleniyor…</p>
      ) : visibleTemplates.length === 0 ? (
        <div className="comm-card" style={{ textAlign: "center", padding: "2.5rem" }}>
          <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.75rem" }}>📭</span>
          <p className="comm-studio-muted" style={{ margin: "0 0 1rem" }}>
            {search ? "Aramayla eşleşen şablon yok." : "Bu kategoride henüz şablon yok."}
          </p>
          {!search && (
            <button type="button" className="comm-btn-primary" onClick={openCreate}>
              Yeni şablon ekleyin
            </button>
          )}
        </div>
      ) : (
        <div className="comm-sablon-card-grid">
          {visibleTemplates.map((t) => (
            <div key={t.id} className="comm-sablon-card">
              <button type="button" className="comm-sablon-card-main" onClick={() => openEdit(t)}>
                <div className="comm-sablon-card-head">
                  <strong>{t.name}</strong>
                  <div className="comm-sablon-card-badges">
                    {t.is_system_active && (
                      <span className="comm-sablon-card-badge comm-sablon-card-badge-active">
                        Aktif
                      </span>
                    )}
                    {!categoryFilter && (
                      <span className="comm-sablon-card-badge">
                        {t.category_label || labels[t.category] || t.category}
                      </span>
                    )}
                  </div>
                </div>
                <p className="comm-sablon-card-body">
                  {t.body.slice(0, 100)}{t.body.length > 100 ? "…" : ""}
                </p>
                {t.is_system_active && t.system_usages?.length ? (
                  <p className="comm-sablon-card-usage">
                    {t.system_usages.map((u) => u.label).join(" · ")}
                  </p>
                ) : null}
                <div className="comm-sablon-card-meta">
                  <span>{TEMPLATE_AUDIENCE_LABELS[t.audience_scope || "genel"]}</span>
                  <span>{t.usage_count} kullanım</span>
                </div>
              </button>
              <button
                type="button"
                className="comm-sablon-card-delete"
                aria-label={`${t.name} sil`}
                onClick={() => handleDelete(t)}
              >
                Sil
              </button>
            </div>
          ))}
        </div>
      )}

      {drawerOpen && (
        <>
          <div className="comm-drawer-overlay" onClick={closeDrawer} role="presentation" />
          <div
            className="comm-drawer comm-sablon-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sablon-drawer-title"
          >
            <TemplateEditorPanel
              editing={editing}
              form={form}
              categories={categories}
              saving={saving}
              onChange={setForm}
              composerState={composerState}
              onComposerChange={setComposerState}
              onSubmit={handleSubmit}
              onCancel={closeDrawer}
              onDelete={editing ? () => handleDelete(editing) : undefined}
            />
          </div>
        </>
      )}
    </CommunicationPageShell>
  );
}
