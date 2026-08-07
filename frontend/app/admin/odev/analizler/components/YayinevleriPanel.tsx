"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  createPublisher,
  deletePublisher,
  fetchPublishers,
  updatePublisher,
  uploadPublisherLogo,
  type ResourcePublisher,
} from "@/lib/resources-api";
import { notifyResourcesChanged } from "@/lib/resources-events";
import { resolveMediaUrl } from "@/lib/resolve-media-url";
import SortableTable from "./SortableTable";

type FormState = {
  id: number | null;
  ad: string;
  kisa_ad: string;
  aciklama: string;
  eslesme_anahtarlari: string;
  aktif_mi: boolean;
};

const EMPTY: FormState = {
  id: null,
  ad: "",
  kisa_ad: "",
  aciklama: "",
  eslesme_anahtarlari: "",
  aktif_mi: true,
};

function unwrapList(data: unknown): ResourcePublisher[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as any).results)) {
    return (data as any).results;
  }
  return [];
}

export default function YayinevleriPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<ResourcePublisher[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteBlock, setDeleteBlock] = useState<{
    message: string;
    books: Array<{ id: number; ad: string; kod?: string }>;
    book_count: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchPublishers(search ? { search } : undefined);
    setItems(unwrapList(res.data));
    setLoading(false);
  }, [search]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const openCreate = () => {
    setForm(EMPTY);
    setError(null);
    setDrawerOpen(true);
  };

  const openEdit = (p: ResourcePublisher) => {
    setForm({
      id: p.id,
      ad: p.ad,
      kisa_ad: p.kisa_ad || "",
      aciklama: p.aciklama || "",
      eslesme_anahtarlari: p.eslesme_anahtarlari || "",
      aktif_mi: p.aktif_mi,
    });
    setError(null);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.ad.trim()) {
      setError("Yayınevi adı zorunlu");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      ad: form.ad.trim(),
      kisa_ad: form.kisa_ad.trim() || form.ad.trim(),
      aciklama: form.aciklama,
      eslesme_anahtarlari: form.eslesme_anahtarlari,
      aktif_mi: form.aktif_mi,
    };
    const res = form.id
      ? await updatePublisher(form.id, payload)
      : await createPublisher(payload);
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Kaydedilemedi");
      return;
    }
    setDrawerOpen(false);
    notifyResourcesChanged({ type: "publisher" });
    load();
  };

  const handleDelete = async (p: ResourcePublisher) => {
    if (!confirm(`“${p.ad}” yayınevini silmek istiyor musunuz?`)) return;
    const res = await deletePublisher(p.id);
    if (!res.success) {
      const data = res.data as {
        books?: Array<{ id: number; ad: string; kod?: string }>;
        book_count?: number;
      } | undefined;
      setDeleteBlock({
        message: res.error || "Silinemedi",
        books: data?.books || [],
        book_count: data?.book_count || 0,
      });
      return;
    }
    notifyResourcesChanged({ type: "publisher" });
    load();
  };

  const handleLogo = async (id: number, file: File) => {
    setError(null);
    const res = await uploadPublisherLogo(id, file);
    if (!res.success) {
      setError(res.error || "Logo yüklenemedi");
      return;
    }
    notifyResourcesChanged({ type: "publisher-logo" });
    await load();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className="kk-input"
          style={{ maxWidth: 320 }}
          placeholder="Yayınevi ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="kk-btn kk-btn-active-on-light" onClick={openCreate}>
          + Yayınevi Ekle
        </button>
      </div>
      {error && !drawerOpen && (
        <div style={{ marginBottom: 12, padding: 12, background: "#fef2f2", borderRadius: 10, color: "#991b1b" }}>
          {error}
          <button
            type="button"
            style={{ marginLeft: 12, border: 0, background: "none", color: "#991b1b", cursor: "pointer", textDecoration: "underline" }}
            onClick={() => setError(null)}
          >
            Kapat
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#64748b" }}>Yükleniyor…</div>
      ) : (
        <SortableTable
          rows={items}
          rowKey={(r) => r.id}
          columns={[
            {
              key: "ad",
              label: "Yayınevi",
              type: "text",
              render: (p) => {
                const logoSrc = resolveMediaUrl(p.logo_url || (p as any).logo || null);
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {logoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoSrc}
                        alt=""
                        width={36}
                        height={36}
                        style={{
                          borderRadius: 8,
                          objectFit: "cover",
                          border: "1px solid #e2e8f0",
                          background: "#fff",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: "#e2e8f0",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#64748b",
                        }}
                      >
                        {(p.ad || "?").slice(0, 1).toLocaleUpperCase("tr")}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.ad}</div>
                      {p.kisa_ad && <div style={{ fontSize: 12, color: "#64748b" }}>{p.kisa_ad}</div>}
                    </div>
                  </div>
                );
              },
            },
            { key: "book_count", label: "Kitap", type: "number", render: (p) => p.book_count ?? 0 },
            {
              key: "student_usage_count",
              label: "Havuzdaki öğrenci",
              hint: "Bu yayınevinin kitaplarını kaynak havuzunda tutan atama sayısı",
              type: "number",
              render: (p) => p.student_usage_count ?? 0,
            },
            {
              key: "aktif_mi",
              label: "Durum",
              type: "text",
              render: (p) => (p.aktif_mi ? "Aktif" : "Pasif"),
            },
            {
              key: "id",
              label: "İşlem",
              type: "number",
              render: (p) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <label style={{ cursor: "pointer", fontSize: 13, color: "#0061a6" }}>
                    Logo
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogo(p.id, f);
                      }}
                    />
                  </label>
                  <button type="button" className="kk-btn kk-btn-on-light" onClick={() => openEdit(p)}>Düzenle</button>
                  <button type="button" className="kk-btn kk-btn-on-light" onClick={() => handleDelete(p)}>Sil</button>
                </div>
              ),
            },
          ]}
        />
      )}

      {deleteBlock && (
        <>
          <div className="kk-drawer-backdrop" onClick={() => setDeleteBlock(null)} />
          <div className="kk-drawer">
            <div className="kk-drawer-header">
              <h2>Silinemedi</h2>
              <button type="button" onClick={() => setDeleteBlock(null)}>×</button>
            </div>
            <div className="kk-drawer-body">
              <p style={{ color: "#b91c1c", fontWeight: 600 }}>{deleteBlock.message}</p>
              <p style={{ color: "#64748b" }}>
                Bağlı kitaplar ({deleteBlock.book_count}):
              </p>
              <ol style={{ paddingLeft: 20 }}>
                {deleteBlock.books.map((b, i) => (
                  <li key={b.id}>{i + 1}. {b.ad}{b.kod ? ` (${b.kod})` : ""}</li>
                ))}
              </ol>
              {deleteBlock.book_count > deleteBlock.books.length && (
                <p style={{ fontSize: 13, color: "#64748b" }}>
                  … ve {deleteBlock.book_count - deleteBlock.books.length} kitap daha
                </p>
              )}
            </div>
            <div className="kk-drawer-footer">
              <button type="button" className="kk-btn kk-btn-active-on-light" onClick={() => setDeleteBlock(null)}>
                Tamam
              </button>
            </div>
          </div>
        </>
      )}

      {drawerOpen && (
        <>
          <div className="kk-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="kk-drawer">
            <div className="kk-drawer-header">
              <h2>{form.id ? "Yayınevi Düzenle" : "Yeni Yayınevi"}</h2>
              <button type="button" onClick={() => setDrawerOpen(false)}>×</button>
            </div>
            <div className="kk-drawer-body">
              <div className="kk-field">
                <label className="kk-label">Yayınevi Adı *</label>
                <input className="kk-input" value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} />
              </div>
              <div className="kk-field">
                <label className="kk-label">Kısa Ad</label>
                <input className="kk-input" value={form.kisa_ad} onChange={(e) => setForm({ ...form, kisa_ad: e.target.value })} />
              </div>
              <div className="kk-field">
                <label className="kk-label">Eşleşme Anahtarları</label>
                <input
                  className="kk-input"
                  placeholder="virgülle: 3D, 3d yay, …"
                  value={form.eslesme_anahtarlari}
                  onChange={(e) => setForm({ ...form, eslesme_anahtarlari: e.target.value })}
                />
              </div>
              <div className="kk-field">
                <label className="kk-label">Açıklama</label>
                <textarea className="kk-input" rows={3} value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={form.aktif_mi} onChange={(e) => setForm({ ...form, aktif_mi: e.target.checked })} />
                Aktif
              </label>
              {error && <div style={{ color: "#b91c1c", marginTop: 12 }}>{error}</div>}
            </div>
            <div className="kk-drawer-footer">
              <button type="button" className="kk-btn kk-btn-on-light" onClick={() => setDrawerOpen(false)}>İptal</button>
              <button type="button" className="kk-btn kk-btn-active-on-light" disabled={saving} onClick={handleSave}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
