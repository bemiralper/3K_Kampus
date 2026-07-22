"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { gorusmeService, gorusmeExportService } from "./services/gorusme-api";
import { downloadBlob } from "@/lib/download-file";
import GorusmeFormDrawer from "@/components/coaching/meetings/GorusmeFormDrawer";
import GorusmeDetailDrawer from "@/components/coaching/meetings/GorusmeDetailDrawer";
import {
  GorusmeKaydiListItem,
  GorusmeOzet,
  KullaniciBilgi,
  GORUSME_TURLERI,
  GORUSME_DURUMLARI,
  ONCELIK_SEVIYELERI,
} from "./types";

/* ─── Yardımcılar ─── */
function fmtTarih(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtSaat(t: string | null | undefined) {
  if (!t) return "";
  return t.slice(0, 5); // "14:30:00" → "14:30"
}

/* ═══════════════════════════════════════════════════════════════
   Koçluk Görüşme Yönetimi — Ana Bileşen
   Liste + Oluştur/Düzenle Drawer + Detay Drawer
   ═══════════════════════════════════════════════════════════════ */

/* ═══ Ana Bileşen ═══ */
export default function MeetingsClient() {
  const { activeKurum } = useKurum();
  const kurumId = activeKurum?.id;

  /* ─── state ─── */
  const [gorusmeler, setGorusmeler] = useState<GorusmeKaydiListItem[]>([]);
  const [ozet, setOzet] = useState<GorusmeOzet | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtreler
  const [durumFiltre, setDurumFiltre] = useState("");
  const [turFiltre, setTurFiltre] = useState("");
  const [aramaFiltre, setAramaFiltre] = useState("");

  // Drawers
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  // Toast
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Dışa aktarma
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Dropdown data (kept for potential future use; form drawer loads its own)
  const [kullaniciBilgi, setKullaniciBilgi] = useState<KullaniciBilgi | null>(null);
  const isCoachOnly = kullaniciBilgi ? (kullaniciBilgi.is_coach && !kullaniciBilgi.is_admin) : false;

  /* ─── Fetch ──────────────────────────────────── */
  const fetchList = useCallback(async () => {
    if (!kurumId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { kurum_id: String(kurumId) };
      if (durumFiltre) params.durum = durumFiltre;
      if (turFiltre) params.gorusme_turu = turFiltre;
      if (aramaFiltre) params.search = aramaFiltre;
      const data = await gorusmeService.list(params);
      setGorusmeler(data);
    } catch {
      setError("Görüşmeler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [kurumId, durumFiltre, turFiltre, aramaFiltre]);

  const fetchOzet = useCallback(async () => {
    if (!kurumId) return;
    try {
      const data = await gorusmeService.ozet({ kurum_id: String(kurumId) });
      setOzet(data);
    } catch { /* ignore */ }
  }, [kurumId]);

  useEffect(() => {
    fetchList();
    fetchOzet();
  }, [fetchList, fetchOzet]);

  /* ─── Dropdown Fetch ──────────────────────────── */
  useEffect(() => {
    gorusmeService.kullaniciBilgi()
      .then((data) => setKullaniciBilgi(data))
      .catch(() => {});
  }, []);

  /* ─── Toast ──────────────────────────────────── */
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(""), 3500);
      return () => clearTimeout(t);
    }
  }, [success]);
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(""), 5000);
      return () => clearTimeout(t);
    }
  }, [error]);

  useEffect(() => {
    if (!exportOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [exportOpen]);

  /* ─── Handlers ───────────────────────────────── */
  function openNewForm() {
    setEditId(null);
    setShowForm(true);
  }

  function openEditForm(id: number) {
    setEditId(id);
    setShowForm(true);
  }

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditId(null);
    setSuccess(editId ? "Görüşme güncellendi." : "Görüşme oluşturuldu.");
    fetchList();
    fetchOzet();
  };

  async function handleDelete(id: number) {
    if (!confirm("Bu görüşmeyi silmek istediğinize emin misiniz?")) return;
    try {
      await gorusmeService.delete(id);
      setSuccess("Görüşme silindi.");
      setDetailId(null);
      fetchList();
      fetchOzet();
    } catch (err: any) {
      setError(err.message || "Silinemedi.");
    }
  }

  function handleOpenDetail(id: number) {
    setDetailId(id);
  }

  async function handleExport(format: "csv" | "xlsx") {
    setExportOpen(false);
    setExporting(true);
    try {
      const filters = {
        kurum_id: kurumId ? String(kurumId) : undefined,
        durum: durumFiltre || undefined,
        gorusme_turu: turFiltre || undefined,
        search: aramaFiltre || undefined,
      };
      const blob = format === "csv"
        ? await gorusmeExportService.downloadCsv(filters)
        : await gorusmeExportService.downloadXlsx(filters);
      downloadBlob(blob, `gorusmeler.${format}`);
    } catch (err: any) {
      setError(err.message || "Dışa aktarma başarısız.");
    } finally {
      setExporting(false);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6">
      {/* ─── Hero Header ─── */}
      <div className="hero-header" style={{ background: "linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #a78bfa 100%)" }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Koçluk Görüşmeleri</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <a href="/admin/coaching/coaches">Koçluk</a>
              <span>/</span>
              <span>Görüşmeler</span>
            </div>
          </div>
        </div>
        <div className="hero-actions">
          <button onClick={openNewForm} className="btn-hero">
            <span className="btn-hero-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span>Yeni Görüşme</span>
          </button>
        </div>
      </div>

      {/* ─── Koç Bilgi Bandı ─── */}
      {isCoachOnly && kullaniciBilgi && (
        <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          </div>
          <div>
            <span className="text-[13px] font-semibold text-indigo-700">
              {kullaniciBilgi.coach_full_name || "Koç"}
            </span>
            <span className="text-[12px] text-indigo-500 ml-2">
              — {kullaniciBilgi.assigned_students?.length || 0} atanmış öğrenci
            </span>
          </div>
        </div>
      )}

      {/* ─── Quick Stats ─── */}
      {ozet && (
        <div className="quick-stats">
          <div className="quick-stat">
            <div className="quick-stat-icon blue">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{ozet.toplam}</h4>
              <span>Toplam Görüşme</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{ozet.planlanan}</h4>
              <span>Planlandı</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon green">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{ozet.tamamlanan}</h4>
              <span>Tamamlandı</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon orange">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{ozet.bu_hafta}</h4>
              <span>Bu Hafta</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toolbar + Tablo ─── */}
      <div className="card-modern">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Arama */}
            <div className="relative">
              <input
                type="text"
                placeholder="Öğrenci, konu veya etiket ara..."
                value={aramaFiltre}
                onChange={(e) => setAramaFiltre(e.target.value)}
                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[13px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 w-[280px]"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {/* Tür filtre */}
            <select
              value={turFiltre}
              onChange={(e) => setTurFiltre(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[13px] text-gray-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 cursor-pointer"
            >
              <option value="">Tüm Türler</option>
              {GORUSME_TURLERI.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {/* Durum filtre */}
            <select
              value={durumFiltre}
              onChange={(e) => setDurumFiltre(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[13px] text-gray-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 cursor-pointer"
            >
              <option value="">Tüm Durumlar</option>
              {GORUSME_DURUMLARI.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              disabled={exporting}
              className="flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[13px] font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {exporting ? "Hazırlanıyor…" : "Dışa Aktar"}
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-20">
                <button
                  type="button"
                  onClick={() => handleExport("xlsx")}
                  className="w-full text-left px-4 py-2 text-[13px] text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("csv")}
                  className="w-full text-left px-4 py-2 text-[13px] text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  CSV
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Tablo ─── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Yükleniyor...
          </div>
        ) : gorusmeler.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h3>Henüz görüşme kaydı yok</h3>
            <p>Yeni bir görüşme ekleyerek başlayabilirsiniz.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-modern">
              <thead>
                <tr>
                  <th style={{ width: 50 }}></th>
                  <th>Tarih</th>
                  <th>Öğrenci</th>
                  <th>Koç</th>
                  <th>Görüşme Türü</th>
                  <th>Süre</th>
                  <th>Konu</th>
                  <th>Durum</th>
                  <th className="text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {gorusmeler.map((g) => {
                  const turMeta = GORUSME_TURLERI.find((t) => t.value === g.gorusme_turu);
                  const durumMeta = GORUSME_DURUMLARI.find((d) => d.value === g.durum);
                  const oncelikMeta = ONCELIK_SEVIYELERI.find((o) => o.value === g.oncelik);
                  return (
                    <tr key={g.id} className="group cursor-pointer" onClick={() => handleOpenDetail(g.id)}>
                      <td className="!pl-4">
                        <div className={`w-2.5 h-2.5 rounded-full ${oncelikMeta?.dot || "bg-blue-500"}`} title={oncelikMeta?.label} />
                      </td>
                      <td>
                        <div className="text-[13px] font-semibold text-gray-800">{fmtTarih(g.gorusme_tarihi)}</div>
                        {g.gorusme_saati && <div className="text-[11px] text-gray-400">{fmtSaat(g.gorusme_saati)}</div>}
                      </td>
                      <td className="cell-primary">{g.ogrenci_adi}</td>
                      <td className="cell-secondary">{g.koc_adi}</td>
                      <td>
                        <span className={`badge-modern text-[11px] ${turMeta?.color || "bg-gray-100 text-gray-600"}`}>
                          <span className="mr-1">{turMeta?.icon}</span>
                          {g.gorusme_turu_display}
                        </span>
                      </td>
                      <td className="cell-secondary">
                        {g.sure_dakika ? `${g.sure_dakika} dk` : "—"}
                      </td>
                      <td>
                        <div className="max-w-[240px] truncate text-[13px] text-gray-700">{g.konu}</div>
                        {g.etiketler && g.etiketler.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {g.etiketler.slice(0, 3).map((e) => (
                              <span key={e} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600">
                                #{e}
                              </span>
                            ))}
                            {g.etiketler.length > 3 && (
                              <span className="text-[9px] text-gray-400">+{g.etiketler.length - 3}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge-modern text-[11px] ${durumMeta?.color || "bg-gray-100 text-gray-600"}`}>
                          {g.durum_display}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleOpenDetail(g.id)} className="row-action-btn" title="Detay">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          </button>
                          <button onClick={() => openEditForm(g.id)} className="row-action-btn" title="Düzenle">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button onClick={() => handleDelete(g.id)} className="row-action-btn text-rose-500 hover:bg-rose-50 hover:text-rose-600" title="Sil">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
         OLUŞTUR / DÜZENLE DRAWER
         ═══════════════════════════════════════════════════════ */}
      {showForm && (
        <GorusmeFormDrawer
          mode="admin"
          editId={editId}
          open={showForm}
          onClose={() => {
            setShowForm(false);
            setEditId(null);
          }}
          onSuccess={handleFormSuccess}
        />
      )}


      {detailId != null && (
        <GorusmeDetailDrawer
          gorusmeId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(id) => {
            setDetailId(null);
            openEditForm(id);
          }}
          onUpdated={() => {
            fetchList();
            fetchOzet();
          }}
          onDeleted={() => {
            fetchList();
            fetchOzet();
          }}
        />
      )}

      {/* ═══ Toast ═══ */}
      {(success || error) && (
        <div className="fixed bottom-6 right-6 z-[250] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl ${
            success
              ? "bg-emerald-50/95 border-emerald-200 text-emerald-700"
              : "bg-rose-50/95 border-rose-200 text-rose-700"
          }`}>
            {success ? (
              <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            ) : (
              <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
            <span className="text-[13px] font-semibold">{success || error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
