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
  meta_template_id: "",
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
      meta_template_id: t.meta_template || "",
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
    const { meta_template_id, ...rest } = composerToTemplateForm(form, composerState);
    const payload = { ...rest, meta_template_id: meta_template_id || null };
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
      className="tplx tplx-page"
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

      <div className="tplx-hero">
        <div className="tplx-hero-cell">
          <span className="tplx-hero-icon" aria-hidden="true">📋</span>
          <span className="tplx-hero-text">
            <span className="tplx-hero-value">{templates.length}</span>
            <span className="tplx-hero-label">Şablon</span>
          </span>
        </div>
        <div className="tplx-hero-cell">
          <span className="tplx-hero-icon is-blue" aria-hidden="true">📤</span>
          <span className="tplx-hero-text">
            <span className="tplx-hero-value">{totals.sent.toLocaleString("tr-TR")}</span>
            <span className="tplx-hero-label">Gönderildi</span>
          </span>
        </div>
        <div className="tplx-hero-cell">
          <span className="tplx-hero-icon" aria-hidden="true">👁</span>
          <span className="tplx-hero-text">
            <span className="tplx-hero-value">{totals.read.toLocaleString("tr-TR")}</span>
            <span className="tplx-hero-label">Okundu</span>
          </span>
        </div>
        <div className="tplx-hero-cell">
          <span className="tplx-hero-icon is-rose" aria-hidden="true">⚠</span>
          <span className="tplx-hero-text">
            <span className="tplx-hero-value">{totals.failed.toLocaleString("tr-TR")}</span>
            <span className="tplx-hero-label">Başarısız</span>
          </span>
        </div>
        <div className="tplx-hero-cell">
          <span className="tplx-hero-icon is-violet" aria-hidden="true">🗂</span>
          <span className="tplx-hero-text">
            <span className="tplx-hero-value">{activeCategories.length}</span>
            <span className="tplx-hero-label">Kategori</span>
          </span>
        </div>
      </div>

      <div className="tplx-toolbar">
        <div className="tplx-chips" role="tablist" aria-label="Şablon kategorileri">
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === ""}
            className={`tplx-chip${categoryFilter === "" ? " is-active" : ""}`}
            onClick={() => selectCategory("")}
          >
            Tümü
            <span className="tplx-chip-count">{totalTemplateCount}</span>
          </button>
          {activeCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={categoryFilter === cat.slug}
              className={`tplx-chip${categoryFilter === cat.slug ? " is-active" : ""}`}
              onClick={() => selectCategory(cat.slug)}
              title={TEMPLATE_AUDIENCE_LABELS[cat.audience_scope] || cat.audience_scope}
            >
              {cat.label}
              <span className="tplx-chip-count">{cat.template_count ?? 0}</span>
              {(cat.template_count ?? 0) === 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="tplx-chip-x"
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
            className="tplx-chip is-dashed"
            onClick={() => setShowCategoryForm((v) => !v)}
          >
            + Kategori
          </button>
        </div>

        <label className="tplx-search">
          <span className="tplx-search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            placeholder="Şablon veya metin ara…"
            aria-label="Şablon ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {showCategoryForm && (
        <form className="tplx-inline-form" onSubmit={handleAddCategory}>
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
        <div className="tplx-grid" aria-busy="true" aria-label="Yükleniyor">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="tplx-skeleton-card" />
          ))}
        </div>
      ) : visibleTemplates.length === 0 ? (
        <div className="tplx-empty">
          <span className="tplx-empty-icon" aria-hidden="true">{search ? "🔍" : "✨"}</span>
          <h3>{search ? "Sonuç bulunamadı" : "Henüz şablon yok"}</h3>
          <p>
            {search
              ? `"${search}" aramasıyla eşleşen şablon yok. Farklı bir kelime deneyin veya filtreyi temizleyin.`
              : "Sık kullandığınız mesajları şablona dönüştürün; tek tıkla gönderin, değişkenler otomatik dolsun."}
          </p>
          {search ? (
            <button type="button" className="comm-btn-secondary" onClick={() => setSearch("")}>
              Aramayı temizle
            </button>
          ) : (
            <button type="button" className="comm-btn-primary" onClick={openCreate}>
              + İlk şablonu oluştur
            </button>
          )}
        </div>
      ) : (
        <div className="tplx-grid">
          {visibleTemplates.map((t) => (
            <article
              key={t.id}
              className={`tplx-card${t.is_system_active ? " is-flagged" : ""}`}
            >
              <button
                type="button"
                className="tplx-card-main"
                onClick={() => openEdit(t)}
                aria-label={`${t.name} şablonunu düzenle`}
              >
                <div className="tplx-card-head">
                  <span className="tplx-card-title">{t.name}</span>
                  <div className="tplx-badges">
                    {t.is_system_active && (
                      <span className="tplx-badge is-live">
                        <span className="tplx-badge-dot" aria-hidden="true" />
                        Aktif
                      </span>
                    )}
                    {!categoryFilter && (
                      <span className="tplx-badge is-ghost">
                        {t.category_label || labels[t.category] || t.category}
                      </span>
                    )}
                  </div>
                </div>

                <p className="tplx-card-snippet">
                  {t.body.slice(0, 130)}{t.body.length > 130 ? "…" : ""}
                </p>

                {t.is_system_active && t.system_usages?.length ? (
                  <p className="tplx-card-usage">
                    <span aria-hidden="true">⚡</span>
                    {t.system_usages.map((u) => u.label).join(" · ")}
                  </p>
                ) : null}

                <div className="tplx-card-foot">
                  <span>👥 {TEMPLATE_AUDIENCE_LABELS[t.audience_scope || "genel"]}</span>
                  <span>{t.usage_count} kullanım</span>
                </div>
              </button>

              <div className="tplx-card-actions">
                <button type="button" className="tplx-card-action" onClick={() => openEdit(t)}>
                  Düzenle
                </button>
                <button
                  type="button"
                  className="tplx-card-action is-danger"
                  aria-label={`${t.name} sil`}
                  onClick={() => handleDelete(t)}
                >
                  Sil
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {drawerOpen && (
        <>
          <div className="comm-drawer-overlay" onClick={closeDrawer} role="presentation" />
          <div
            className="tplx comm-drawer tplx-drawer"
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
