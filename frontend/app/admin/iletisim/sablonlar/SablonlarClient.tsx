"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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

export default function SablonlarClient() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") || "";

  const [templates, setTemplates] = useState<MessageTemplateItem[]>([]);
  const [categories, setCategories] = useState<TemplateCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [editing, setEditing] = useState<MessageTemplateItem | null>(null);
  const [form, setForm] = useState<TemplateEditorForm>({
    name: "",
    body: "",
    category: "ozel",
    audience_scope: "admin",
    odev_pdf_role: "",
  });
  const [composerState, setComposerState] = useState<ComposerState>(createComposerState(""));
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryAudience, setNewCategoryAudience] = useState("admin");
  const [categorySaving, setCategorySaving] = useState(false);

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

  const openCreate = () => {
    setEditing(null);
    const defaultCat = categoryFilter || "ozel";
    setForm({ name: "", body: "", category: defaultCat, audience_scope: "admin", odev_pdf_role: "" });
    setComposerState(createComposerState(""));
    setSuccessMsg(null);
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
      setEditing(null);
      setForm({ name: "", body: "", category: categoryFilter || "ozel", audience_scope: "admin", odev_pdf_role: "" });
      setComposerState(createComposerState(""));
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
        setEditing(null);
        setForm({ name: "", body: "", category: categoryFilter || "ozel", audience_scope: "admin", odev_pdf_role: "" });
        setComposerState(createComposerState(""));
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
      await createTemplateCategory(newCategoryLabel.trim(), newCategoryAudience);
      setNewCategoryLabel("");
      setNewCategoryAudience("admin");
      await loadCategories();
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
      if (categoryFilter === cat.slug) setCategoryFilter("");
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

  return (
    <CommunicationPageShell
      title="Mesaj Şablonları"
      subtitle="Hazır yanıtları kategorilere göre yönetin"
      icon="📋"
      breadcrumbs={[
        { label: "İletişim", href: "/admin/iletisim/kampanyalar" },
        { label: "Şablonlar" },
      ]}
    >
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}
      {successMsg && <div className="comm-alert comm-alert-success">{successMsg}</div>}

      <div className="comm-stat-grid" style={{ marginBottom: "1.5rem" }}>
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

      <div className="comm-sablonlar-v2">
        <aside className="comm-sablonlar-sidebar comm-card">
          <div className="comm-sablonlar-sidebar-header">
            <h3>Kategoriler</h3>
            <button
              type="button"
              className="comm-link-btn"
              onClick={() => setShowCategoryModal((v) => !v)}
            >
              {showCategoryModal ? "Kapat" : "+ Ekle"}
            </button>
          </div>

          {showCategoryModal && (
            <form className="comm-sablon-category-add-form" onSubmit={handleAddCategory}>
              <input
                type="text"
                placeholder="Yeni kategori adı"
                value={newCategoryLabel}
                onChange={(e) => setNewCategoryLabel(e.target.value)}
                aria-label="Yeni kategori adı"
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
                Ekle
              </button>
            </form>
          )}

          <ul className="comm-sablon-category-list">
            <li>
              <button
                type="button"
                className={`comm-sablon-category-item${categoryFilter === "" ? " active" : ""}`}
                onClick={() => setCategoryFilter("")}
              >
                Tümü
                <span>{totalTemplateCount}</span>
              </button>
            </li>
            {activeCategories.map((cat) => (
              <li key={cat.id}>
                <button
                  type="button"
                  className={`comm-sablon-category-item${categoryFilter === cat.slug ? " active" : ""}`}
                  onClick={() => setCategoryFilter(cat.slug)}
                >
                  <span className="comm-sablon-category-item-label">
                    {cat.label}
                    <small>{TEMPLATE_AUDIENCE_LABELS[cat.audience_scope] || cat.audience_scope}</small>
                  </span>
                  <span>{cat.template_count ?? 0}</span>
                </button>
                {(cat.template_count ?? 0) === 0 && (
                  <button
                    type="button"
                    className="comm-sablon-category-remove"
                    aria-label={`${cat.label} kategorisini kaldır`}
                    onClick={() => handleDeleteCategory(cat)}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </aside>

        <section className="comm-sablonlar-list comm-card">
          <div className="comm-sablonlar-toolbar">
            <h3>{categoryFilter ? labels[categoryFilter] || categoryFilter : "Tüm şablonlar"}</h3>
            <button type="button" className="comm-btn-primary" onClick={openCreate}>
              Yeni Şablon
            </button>
          </div>

          {loading ? (
            <p className="comm-studio-muted">Yükleniyor…</p>
          ) : (
            <div className="comm-sablon-card-grid">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className={`comm-sablon-card${editing?.id === t.id ? " selected" : ""}`}
                >
                  <button type="button" className="comm-sablon-card-main" onClick={() => openEdit(t)}>
                    <div className="comm-sablon-card-head">
                      <strong>{t.name}</strong>
                      <div className="comm-sablon-card-badges">
                        {t.is_system_active && (
                          <span className="comm-sablon-card-badge comm-sablon-card-badge-active">
                            Aktif
                          </span>
                        )}
                        <span className="comm-sablon-card-badge">
                          {t.category_label || labels[t.category] || t.category}
                        </span>
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
              {templates.length === 0 && (
                <p className="comm-studio-muted">Henüz şablon yok. Yeni şablon ekleyin.</p>
              )}
            </div>
          )}
        </section>

        <TemplateEditorPanel
          editing={editing}
          form={form}
          categories={categories}
          saving={saving}
          onChange={setForm}
          composerState={composerState}
          onComposerChange={setComposerState}
          onSubmit={handleSubmit}
          onCancel={() => {
            setEditing(null);
            setForm({ name: "", body: "", category: categoryFilter || "ozel", audience_scope: "admin", odev_pdf_role: "" });
            setComposerState(createComposerState(""));
          }}
          onDelete={editing ? () => handleDelete(editing) : undefined}
        />
      </div>
    </CommunicationPageShell>
  );
}
