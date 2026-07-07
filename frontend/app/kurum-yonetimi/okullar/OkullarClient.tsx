"use client";

import { useCallback, useEffect, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import {
  createOkul,
  deleteOkul,
  fetchOkulDeleteInfo,
  fetchOkullar,
  updateOkul,
  type OkulFormData,
  type OkulRecord,
} from "@/lib/okul-api";
import TopluOkulEkleModal from "@/components/okul/TopluOkulEkleModal";

const EMPTY_FORM: OkulFormData = {
  ad: "",
  okul_turu: "",
  il: "",
  ilce: "",
  not_metni: "",
  aktif_mi: true,
};

export default function OkullarClient() {
  const { activeSube } = useKurum();
  const [items, setItems] = useState<OkulRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [search, setSearch] = useState("");
  const [okulTuru, setOkulTuru] = useState("");
  const [il, setIl] = useState("");
  const [ilce, setIlce] = useState("");
  const [aktifFilter, setAktifFilter] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<OkulFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOkullar({
        page,
        page_size: 25,
        search: search.trim() || undefined,
        okul_turu: okulTuru.trim() || undefined,
        il: il.trim() || undefined,
        ilce: ilce.trim() || undefined,
        aktif_mi: aktifFilter || undefined,
      });
      setItems(res.data || []);
      setTotalPages(res.pagination?.total_pages || 1);
      setTotalCount(res.pagination?.total_count || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Okul listesi yüklenemedi.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, okulTuru, il, ilce, aktifFilter]);

  useEffect(() => {
    loadData();
  }, [loadData, activeSube?.id]);

  useEffect(() => {
    setPage(1);
  }, [search, okulTuru, il, ilce, aktifFilter, activeSube?.id]);

  const openCreate = () => {
    setDrawerMode("create");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: OkulRecord) => {
    setDrawerMode("edit");
    setEditingId(row.id);
    setForm({
      ad: row.ad,
      okul_turu: row.okul_turu,
      il: row.il,
      ilce: row.ilce,
      not_metni: row.not_metni,
      aktif_mi: row.aktif_mi,
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.ad.trim()) {
      setFormError("Okul adı zorunludur.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (drawerMode === "create") {
        await createOkul(form);
      } else if (editingId) {
        await updateOkul(editingId, form);
      }
      setDrawerOpen(false);
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Kayıt başarısız.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: OkulRecord) => {
    try {
      const info = await fetchOkulDeleteInfo(row.id);
      if (!info.can_delete) {
        const deactivate = window.confirm(
          `Bu okul ${info.ogrenci_sayisi} öğrenci kaydında kullanılıyor. Silinemez; pasife alınsın mı?`
        );
        if (deactivate) {
          await updateOkul(row.id, { aktif_mi: false });
          await loadData();
        }
        return;
      }
      if (window.confirm(`"${row.ad}" okulunu silmek istediğinize emin misiniz?`)) {
        await deleteOkul(row.id);
        await loadData();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Silme işlemi başarısız.");
    }
  };

  const toggleAktif = async (row: OkulRecord) => {
    try {
      await updateOkul(row.id, { aktif_mi: !row.aktif_mi });
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Durum güncellenemedi.");
    }
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Okullar</h1>
          <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>
            Şube bazlı okul referans verisi
            {activeSube ? ` — ${activeSube.ad}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="wizard-btn secondary" onClick={() => setBulkOpen(true)}>
            Toplu Okul Ekle
          </button>
          <button type="button" className="wizard-btn primary" onClick={openCreate}>
            Yeni Okul
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <input
          className="wizard-input"
          placeholder="Okul adı ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className="wizard-input"
          placeholder="Okul türü"
          value={okulTuru}
          onChange={(e) => setOkulTuru(e.target.value)}
        />
        <input className="wizard-input" placeholder="İl" value={il} onChange={(e) => setIl(e.target.value)} />
        <input className="wizard-input" placeholder="İlçe" value={ilce} onChange={(e) => setIlce(e.target.value)} />
        <select className="wizard-select" value={aktifFilter} onChange={(e) => setAktifFilter(e.target.value)}>
          <option value="">Tüm durumlar</option>
          <option value="true">Aktif</option>
          <option value="false">Pasif</option>
        </select>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "left" }}>
              <th style={{ padding: "10px 12px" }}>Okul Adı</th>
              <th style={{ padding: "10px 12px" }}>Okul Türü</th>
              <th style={{ padding: "10px 12px" }}>İl</th>
              <th style={{ padding: "10px 12px" }}>İlçe</th>
              <th style={{ padding: "10px 12px" }}>Durum</th>
              <th style={{ padding: "10px 12px", width: 180 }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
                  Yükleniyor…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
                  Kayıt bulunamadı
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 12px" }}>{row.ad}</td>
                  <td style={{ padding: "10px 12px" }}>{row.okul_turu || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{row.il || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{row.ilce || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ color: row.aktif_mi ? "#059669" : "#6b7280" }}>
                      {row.aktif_mi ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="wizard-btn secondary" onClick={() => openEdit(row)}>
                        Düzenle
                      </button>
                      <button type="button" className="wizard-btn secondary" onClick={() => toggleAktif(row)}>
                        {row.aktif_mi ? "Pasife Al" : "Aktifleştir"}
                      </button>
                      <button type="button" className="wizard-btn secondary" onClick={() => handleDelete(row)}>
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Toplam {totalCount} okul</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="wizard-btn secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Önceki
          </button>
          <span style={{ fontSize: 13, alignSelf: "center" }}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="wizard-btn secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sonraki
          </button>
        </div>
      </div>

      {drawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "flex-end",
          }}
          onClick={() => !saving && setDrawerOpen(false)}
        >
          <div
            style={{
              width: 420,
              maxWidth: "100%",
              background: "#fff",
              height: "100%",
              padding: 24,
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>{drawerMode === "create" ? "Yeni Okul" : "Okul Düzenle"}</h3>
            <div className="wizard-form-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div className="wizard-field">
                <label className="wizard-label required">Okul Adı</label>
                <input
                  className="wizard-input"
                  value={form.ad}
                  onChange={(e) => setForm({ ...form, ad: e.target.value })}
                />
              </div>
              <div className="wizard-field">
                <label className="wizard-label">Okul Türü</label>
                <input
                  className="wizard-input"
                  value={form.okul_turu || ""}
                  onChange={(e) => setForm({ ...form, okul_turu: e.target.value })}
                />
              </div>
              <div className="wizard-field">
                <label className="wizard-label">İl</label>
                <input
                  className="wizard-input"
                  value={form.il || ""}
                  onChange={(e) => setForm({ ...form, il: e.target.value })}
                />
              </div>
              <div className="wizard-field">
                <label className="wizard-label">İlçe</label>
                <input
                  className="wizard-input"
                  value={form.ilce || ""}
                  onChange={(e) => setForm({ ...form, ilce: e.target.value })}
                />
              </div>
              <div className="wizard-field">
                <label className="wizard-label">Not</label>
                <textarea
                  className="wizard-input"
                  rows={3}
                  value={form.not_metni || ""}
                  onChange={(e) => setForm({ ...form, not_metni: e.target.value })}
                />
              </div>
              <div className="wizard-field">
                <label className="wizard-label">Durum</label>
                <select
                  className="wizard-select"
                  value={form.aktif_mi ? "1" : "0"}
                  onChange={(e) => setForm({ ...form, aktif_mi: e.target.value === "1" })}
                >
                  <option value="1">Aktif</option>
                  <option value="0">Pasif</option>
                </select>
              </div>
            </div>
            {formError && <p style={{ color: "#dc2626", fontSize: 13 }}>{formError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button type="button" className="wizard-btn primary" disabled={saving} onClick={handleSave}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
              <button type="button" className="wizard-btn secondary" disabled={saving} onClick={() => setDrawerOpen(false)}>
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
      <TopluOkulEkleModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onComplete={() => {
          setPage(1);
          loadData();
        }}
      />
    </div>
  );
}
