"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { cariV2Service } from "../services/cari-v2-api";
import { FinansHttpError } from "../services/finans-http";
import {
  CARI_V2_TURLERI,
  CariEtiket,
  CariV2Dashboard,
  CariV2Filters,
  CariV2Gorunum,
  CariV2ListItem,
  CariV2ListResponse,
  CariV2Turu,
  RISK_META,
  turMeta,
} from "../types/cari-v2-types";
import CariV2FormDrawer from "./CariV2FormDrawer";
import "./cari-v2.css";

const TL = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n || 0);
const DATE = (s: string | null) => (s ? new Date(s).toLocaleDateString("tr-TR") : "—");

type ViewMode = "table" | "compact" | "card";
type ToastTone = "success" | "error" | "info";
type Toast = { msg: string; type: ToastTone } | null;

const ALL_COLUMNS: { key: string; label: string; num?: boolean }[] = [
  { key: "cari", label: "Cari" },
  { key: "hesap_turu", label: "Tür" },
  { key: "hesap_kodu", label: "Kod" },
  { key: "kategori", label: "Kategori" },
  { key: "il", label: "İl" },
  { key: "acik_borc", label: "Verecek", num: true },
  { key: "acik_alacak", label: "Alacak", num: true },
  { key: "bakiye", label: "Net Bakiye", num: true },
  { key: "vadesi_gecmis", label: "Vadesi Geçmiş", num: true },
  { key: "risk", label: "Risk" },
  { key: "son_islem_tarihi", label: "Son İşlem" },
  { key: "durum", label: "Durum" },
  { key: "islemler", label: "" },
];
const DEFAULT_VISIBLE = ["cari", "hesap_turu", "acik_borc", "acik_alacak", "bakiye", "risk", "son_islem_tarihi", "islemler"];
const COL_STORAGE = "cv2_columns";
const VIEW_STORAGE = "cv2_viewmode";

export default function CariV2ListClient() {
  const { activeKurum, activeSube } = useKurum();
  const { href } = useFinansPath();
  const router = useRouter();
  const kurumId = activeKurum?.id;
  const subeId = activeSube?.id ?? null;

  const [dashboard, setDashboard] = useState<CariV2Dashboard | null>(null);
  const [data, setData] = useState<CariV2ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_VISIBLE);
  const [colMenuOpen, setColMenuOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<CariV2Filters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<string>("unvan");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; row: CariV2ListItem } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const [etiketler, setEtiketler] = useState<CariEtiket[]>([]);
  const [gorunumler, setGorunumler] = useState<CariV2Gorunum[]>([]);

  const showToast = useCallback((msg: string, type: ToastTone = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // localStorage tercihleri
  useEffect(() => {
    try {
      const c = localStorage.getItem(COL_STORAGE);
      if (c) setVisibleCols(JSON.parse(c));
      const v = localStorage.getItem(VIEW_STORAGE) as ViewMode | null;
      if (v) setViewMode(v);
    } catch { /* yoksay */ }
  }, []);
  useEffect(() => { localStorage.setItem(COL_STORAGE, JSON.stringify(visibleCols)); }, [visibleCols]);
  useEffect(() => { localStorage.setItem(VIEW_STORAGE, viewMode); }, [viewMode]);

  // debounce arama
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debounced, filters, pageSize]);

  const effectiveFilters = useMemo<CariV2Filters>(
    () => ({ ...filters, arama: debounced || undefined }),
    [filters, debounced],
  );

  const fetchList = useCallback(async (silent = false) => {
    if (!kurumId) return;
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const res = await cariV2Service.list({
        kurum_id: kurumId, sube_id: subeId, page, page_size: pageSize, sort, filters: effectiveFilters,
      });
      setData(res);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Liste yüklenemedi.", "error");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [kurumId, subeId, page, pageSize, sort, effectiveFilters, showToast]);

  const fetchDashboard = useCallback(async () => {
    if (!kurumId) return;
    try { setDashboard(await cariV2Service.dashboard(kurumId, subeId)); } catch { /* sessiz */ }
  }, [kurumId, subeId]);

  const fetchAux = useCallback(async () => {
    if (!kurumId) return;
    try {
      const [et, gr] = await Promise.all([
        cariV2Service.etiketler(kurumId, subeId),
        cariV2Service.gorunumler(kurumId, subeId),
      ]);
      setEtiketler(et); setGorunumler(gr);
    } catch { /* sessiz */ }
  }, [kurumId, subeId]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchDashboard(); fetchAux(); }, [fetchDashboard, fetchAux]);
  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const items = data?.results ?? [];
  const totalPages = data?.total_pages ?? 1;

  const toggleSort = (key: string) => {
    setSort((prev) => (prev === key ? `-${key}` : prev === `-${key}` ? key : key));
  };
  const toggleCol = (key: string) =>
    setVisibleCols((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleSelectAll = () =>
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));

  const onToggleAktif = async (row: CariV2ListItem) => {
    // Optimistic
    setData((prev) =>
      prev ? { ...prev, results: prev.results.map((r) => (r.id === row.id ? { ...r, aktif_mi: !r.aktif_mi } : r)) } : prev,
    );
    try {
      await cariV2Service.toggle(row.id);
      showToast("Durum güncellendi.", "success");
    } catch (e) {
      fetchList(true);
      showToast(e instanceof Error ? e.message : "İşlem başarısız.", "error");
    }
  };

  const onDelete = async (row: CariV2ListItem) => {
    if (!confirm(`"${row.gorunen_ad}" silinsin mi?`)) return;
    try {
      await cariV2Service.remove(row.id);
      showToast("Cari silindi.", "success");
      fetchList(true); fetchDashboard();
    } catch (e) {
      showToast(e instanceof FinansHttpError ? e.message : "Silinemedi.", "error");
    }
  };

  const openCreate = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (id: number) => { setEditing(id); setDrawerOpen(true); };
  const onSaved = () => { setDrawerOpen(false); fetchList(true); fetchDashboard(); };

  const saveGorunum = async () => {
    if (!kurumId) return;
    const ad = prompt("Görünüm adı:");
    if (!ad) return;
    try {
      await cariV2Service.gorunumCreate(kurumId, ad, { filters, sort, visibleCols, viewMode });
      showToast("Görünüm kaydedildi.", "success");
      fetchAux();
    } catch (e) { showToast(e instanceof Error ? e.message : "Kaydedilemedi.", "error"); }
  };
  const applyGorunum = (g: CariV2Gorunum) => {
    const cfg = g.config as { filters?: CariV2Filters; sort?: string; visibleCols?: string[]; viewMode?: ViewMode };
    if (cfg.filters) setFilters(cfg.filters);
    if (cfg.sort) setSort(cfg.sort);
    if (cfg.visibleCols) setVisibleCols(cfg.visibleCols);
    if (cfg.viewMode) setViewMode(cfg.viewMode);
    showToast(`"${g.ad}" uygulandı.`, "info");
  };

  const setTurFilter = (tur: CariV2Turu | "") =>
    setFilters((f) => ({ ...f, hesap_turu: tur || undefined }));

  if (!kurumId) {
    return <div className="cv2-empty">Lütfen üst menüden bir kurum ve şube seçin.</div>;
  }

  const goDetail = (id: number) => router.push(href(`cari-hesaplar-v2/${id}`));

  return (
    <div className="cv2-page">
      {/* Başlık */}
      <div className="hero-header">
        <div className="hero-content">
          <div>
            <h1>Cari Hesaplar</h1>
            <p>Müşteri, tedarikçi, gelir/gider hesapları ve cari takibi</p>
          </div>
          <button className="btn-hero" onClick={openCreate}>+ Yeni Cari</button>
        </div>
      </div>

      {/* Dashboard kartları */}
      {dashboard && (
        <div className="cv2-cards">
          <Card label="Toplam Cari" value={dashboard.toplam_cari} />
          <Card label="Aktif Cari" value={dashboard.aktif_cari} accent />
          <Card label="Borçlu Cari" value={dashboard.borclu_cari} tone="danger" />
          <Card label="Alacaklı Cari" value={dashboard.alacakli_cari} tone="success" />
          <Card label="Riskli Cari" value={dashboard.riskli_cari} tone="warning" />
          <Card label="Bu Ay Tahsilat" value={TL(dashboard.bu_ay_tahsilat)} tone="success" tl />
          <Card label="Bu Ay Ödeme" value={TL(dashboard.bu_ay_odeme)} tone="danger" tl />
          <Card label="Bekleyen Tahsilat" value={TL(dashboard.bekleyen_tahsilat)} tl />
        </div>
      )}

      {/* Hızlı filtre çipleri */}
      <div className="cv2-chips">
        <button className={`cv2-chip ${!filters.hesap_turu ? "cv2-chip--active" : ""}`} onClick={() => setTurFilter("")}>Tümü</button>
        {CARI_V2_TURLERI.map((t) => (
          <button key={t.value}
            className={`cv2-chip ${filters.hesap_turu === t.value ? "cv2-chip--active" : ""}`}
            onClick={() => setTurFilter(t.value)}>
            {t.ikon} {t.label}
          </button>
        ))}
      </div>

      {/* Araç çubuğu */}
      <div className="cv2-toolbar">
        <div className="cv2-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input placeholder="Cari ara (ünvan, vergi no, telefon...)" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="cv2-viewswitch">
          <button className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")} title="Tablo">▤</button>
          <button className={viewMode === "compact" ? "active" : ""} onClick={() => setViewMode("compact")} title="Yoğun">≡</button>
          <button className={viewMode === "card" ? "active" : ""} onClick={() => setViewMode("card")} title="Kart">▦</button>
        </div>
        <button className={`cv2-btn ${showFilters ? "cv2-btn--active" : ""}`} onClick={() => setShowFilters((s) => !s)}>⚙ Filtreler</button>
        <div className="cv2-rel">
          <button className="cv2-btn" onClick={() => setColMenuOpen((o) => !o)}>▥ Kolonlar</button>
          {colMenuOpen && (
            <div className="cv2-colmenu" onMouseLeave={() => setColMenuOpen(false)}>
              {ALL_COLUMNS.filter((c) => c.key !== "islemler" && c.key !== "cari").map((c) => (
                <label key={c.key}>
                  <input type="checkbox" checked={visibleCols.includes(c.key)} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        {gorunumler.length > 0 && (
          <select className="cv2-btn" style={{ maxWidth: 160 }} defaultValue=""
            onChange={(e) => { const g = gorunumler.find((x) => String(x.id) === e.target.value); if (g) applyGorunum(g); }}>
            <option value="">Görünüm seç…</option>
            {gorunumler.map((g) => <option key={g.id} value={g.id}>{g.ad}</option>)}
          </select>
        )}
        <button className="cv2-btn" onClick={saveGorunum}>💾 Görünüm Kaydet</button>
        {refreshing && <span className="cv2-muted" style={{ fontSize: 12 }}>Yükleniyor…</span>}
      </div>

      {/* Gelişmiş filtreler */}
      {showFilters && (
        <FilterPanel filters={filters} setFilters={setFilters} etiketler={etiketler} onClear={() => setFilters({})} />
      )}

      {/* Toplu işlem şeridi */}
      {selected.size > 0 && (
        <div className="cv2-toolbar" style={{ background: "#f0f8ff", padding: 10, borderRadius: 10 }}>
          <strong style={{ fontSize: 13 }}>{selected.size} cari seçildi</strong>
          <button className="cv2-btn cv2-btn--sm" onClick={() => setSelected(new Set())}>Seçimi Temizle</button>
        </div>
      )}

      {/* İçerik */}
      {loading ? (
        <div className="cv2-loading"><div className="cv2-spinner" />Cari hesaplar yükleniyor…</div>
      ) : items.length === 0 ? (
        <div className="cv2-empty">Kayıt bulunamadı. Filtreleri değiştirin veya yeni cari ekleyin.</div>
      ) : viewMode === "card" ? (
        <div className="cv2-grid">
          {items.map((row) => <GridCard key={row.id} row={row} onClick={() => goDetail(row.id)} />)}
        </div>
      ) : (
        <div className="cv2-tablewrap">
          <table className={`cv2-table ${viewMode === "compact" ? "cv2-table--compact" : ""}`}>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" className="cv2-checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleSelectAll} />
                </th>
                {ALL_COLUMNS.filter((c) => c.key === "cari" || visibleCols.includes(c.key)).map((c) => (
                  <th key={c.key}
                    className={["bakiye", "acik_borc", "acik_alacak", "hesap_kodu", "son_islem_tarihi"].includes(c.key) ? "cv2-sortable" : ""}
                    onClick={() => ["bakiye", "acik_borc", "acik_alacak", "hesap_kodu", "son_islem_tarihi"].includes(c.key) && toggleSort(c.key)}
                    style={c.num ? { textAlign: "right" } : undefined}>
                    {c.label}
                    {sort === c.key ? " ▲" : sort === `-${c.key}` ? " ▼" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}
                  onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, row }); }}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="cv2-checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} />
                  </td>
                  {ALL_COLUMNS.filter((c) => c.key === "cari" || visibleCols.includes(c.key)).map((c) => (
                    <td key={c.key} className={c.num ? "cv2-num" : ""} style={c.key === "cari" ? { cursor: "pointer" } : undefined}
                      onClick={() => c.key !== "islemler" && goDetail(row.id)}>
                      {renderCell(c.key, row, { onEdit: () => openEdit(row.id), onToggle: () => onToggleAktif(row), onDelete: () => onDelete(row) })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sayfalama */}
      {data && data.count > 0 && (
        <div className="cv2-pagination">
          <div className="cv2-pagination__info">
            Toplam {data.count} cari · Sayfa {data.page}/{totalPages}
            <select style={{ marginLeft: 10 }} className="cv2-btn cv2-btn--sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[10, 25, 50, 100].map((s) => <option key={s} value={s}>{s}/sayfa</option>)}
            </select>
          </div>
          <div className="cv2-pagination__nav">
            <button className="cv2-btn cv2-btn--sm" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button className="cv2-btn cv2-btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Önceki</button>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{page}</span>
            <button className="cv2-btn cv2-btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sonraki ›</button>
            <button className="cv2-btn cv2-btn--sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>
      )}

      {/* Sağ tık menü */}
      {ctxMenu && (
        <div className="cv2-ctxmenu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { goDetail(ctxMenu.row.id); setCtxMenu(null); }}>🔍 Detayı Aç</button>
          <button onClick={() => { openEdit(ctxMenu.row.id); setCtxMenu(null); }}>✏ Düzenle</button>
          <button onClick={() => { onToggleAktif(ctxMenu.row); setCtxMenu(null); }}>{ctxMenu.row.aktif_mi ? "⏸ Pasifleştir" : "▶ Aktifleştir"}</button>
          <button className="cv2-danger" onClick={() => { onDelete(ctxMenu.row); setCtxMenu(null); }}>🗑 Sil</button>
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <CariV2FormDrawer
          kurumId={kurumId}
          subeId={subeId}
          cariId={editing}
          etiketler={etiketler}
          onClose={() => setDrawerOpen(false)}
          onSaved={onSaved}
          onToast={showToast}
        />
      )}

      {toast && <div className={`cv2-toast cv2-toast--${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

function Card({ label, value, tone, accent, tl }: { label: string; value: number | string; tone?: "danger" | "success" | "warning"; accent?: boolean; tl?: boolean }) {
  return (
    <div className={`cv2-card ${accent ? "cv2-card--accent" : ""} ${tone ? `cv2-card--${tone}` : ""}`}>
      <span className="cv2-card__label">{label}</span>
      <span className={`cv2-card__value ${tl ? "cv2-card__value--tl" : ""}`}>{value}</span>
    </div>
  );
}

function GridCard({ row, onClick }: { row: CariV2ListItem; onClick: () => void }) {
  const meta = turMeta(row.hesap_turu);
  const risk = RISK_META[row.risk_durumu];
  return (
    <div className="cv2-gcard" onClick={onClick}>
      <div className="cv2-gcard__head">
        <div className="cv2-avatar" style={{ background: `${meta.renk}1a`, color: meta.renk }}>{meta.ikon}</div>
        <div style={{ flex: 1 }}>
          <div className="cv2-cari-name">{row.gorunen_ad}</div>
          <div className="cv2-cari-sub">{row.hesap_kodu || meta.label}</div>
        </div>
        <span className="cv2-badge" style={{ background: risk.bg, color: risk.renk }}>{row.risk_durumu_display}</span>
      </div>
      <div className="cv2-gcard__stats">
        <div className="cv2-gcard__stat"><span>Verecek</span><strong className="cv2-neg">{TL(row.acik_borc)}</strong></div>
        <div className="cv2-gcard__stat"><span>Alacak</span><strong className="cv2-pos">{TL(row.acik_alacak)}</strong></div>
        <div className="cv2-gcard__stat" style={{ textAlign: "right" }}><span>Net</span>
          <strong className={row.bakiye < 0 ? "cv2-neg" : row.bakiye > 0 ? "cv2-pos" : ""}>{TL(row.bakiye)}</strong>
        </div>
      </div>
    </div>
  );
}

function renderCell(
  key: string, row: CariV2ListItem,
  actions: { onEdit: () => void; onToggle: () => void; onDelete: () => void },
) {
  const meta = turMeta(row.hesap_turu);
  switch (key) {
    case "cari":
      return (
        <div className="cv2-cari-cell">
          <div className="cv2-avatar" style={{ background: `${meta.renk}1a`, color: meta.renk }}>{meta.ikon}</div>
          <div>
            <div className="cv2-cari-name">{row.gorunen_ad}</div>
            <div className="cv2-cari-sub">{row.hesap_kodu || row.vergi_no || "—"}</div>
          </div>
        </div>
      );
    case "hesap_turu":
      return <span className="cv2-badge" style={{ background: `${meta.renk}1a`, color: meta.renk }}>{meta.label}</span>;
    case "hesap_kodu": return row.hesap_kodu || "—";
    case "kategori": return row.kategori || "—";
    case "il": return row.il || "—";
    case "acik_borc": return <span className={row.acik_borc ? "cv2-neg" : "cv2-muted"}>{TL(row.acik_borc)}</span>;
    case "acik_alacak": return <span className={row.acik_alacak ? "cv2-pos" : "cv2-muted"}>{TL(row.acik_alacak)}</span>;
    case "bakiye": return <span className={row.bakiye < 0 ? "cv2-neg" : row.bakiye > 0 ? "cv2-pos" : "cv2-muted"}>{TL(row.bakiye)}</span>;
    case "vadesi_gecmis": return <span className={row.vadesi_gecmis ? "cv2-neg" : "cv2-muted"}>{TL(row.vadesi_gecmis)}</span>;
    case "risk": {
      const r = RISK_META[row.risk_durumu];
      return <span className="cv2-badge" style={{ background: r.bg, color: r.renk }}>{row.risk_durumu_display}</span>;
    }
    case "son_islem_tarihi": return <span className="cv2-muted">{DATE(row.son_islem_tarihi)}</span>;
    case "durum":
      return <span className="cv2-badge" style={{ background: row.aktif_mi ? "#ecfdf5" : "#f1f5f9", color: row.aktif_mi ? "#059669" : "#64748b" }}>{row.aktif_mi ? "Aktif" : "Pasif"}</span>;
    case "islemler":
      return (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          <button className="cv2-btn cv2-btn--sm cv2-btn--ghost" title="Düzenle" onClick={actions.onEdit}>✏</button>
          <button className="cv2-btn cv2-btn--sm cv2-btn--ghost" title="Aktif/Pasif" onClick={actions.onToggle}>⏻</button>
          <button className="cv2-btn cv2-btn--sm cv2-btn--ghost" title="Sil" onClick={actions.onDelete}>🗑</button>
        </div>
      );
    default: return "—";
  }
}

function FilterPanel({
  filters, setFilters, etiketler, onClear,
}: {
  filters: CariV2Filters; setFilters: (f: CariV2Filters) => void; etiketler: CariEtiket[]; onClear: () => void;
}) {
  const upd = (k: keyof CariV2Filters, v: string) => setFilters({ ...filters, [k]: v || undefined });
  return (
    <div className="cv2-filters">
      <div className="cv2-field"><label>Durum</label>
        <select value={filters.durum ?? ""} onChange={(e) => upd("durum", e.target.value)}>
          <option value="">Tümü</option><option value="aktif">Aktif</option><option value="pasif">Pasif</option>
        </select>
      </div>
      <div className="cv2-field"><label>Bakiye Durumu</label>
        <select value={filters.bakiye_durumu ?? ""} onChange={(e) => upd("bakiye_durumu", e.target.value)}>
          <option value="">Tümü</option><option value="borclu">Borçlu (Verecek)</option>
          <option value="alacakli">Alacaklı</option><option value="dengede">Dengede</option>
        </select>
      </div>
      <div className="cv2-field"><label>Risk Durumu</label>
        <select value={filters.risk_durumu ?? ""} onChange={(e) => upd("risk_durumu", e.target.value)}>
          <option value="">Tümü</option><option value="normal">Normal</option><option value="izlemede">İzlemede</option>
          <option value="limit_asildi">Limit Aşıldı</option><option value="riskli">Riskli</option><option value="kritik">Kritik</option>
        </select>
      </div>
      <div className="cv2-field"><label>Vade</label>
        <select value={filters.vade ?? ""} onChange={(e) => upd("vade", e.target.value)}>
          <option value="">Tümü</option><option value="gecmis">Vadesi Geçmiş</option>
          <option value="gelen">Vadesi Gelen</option><option value="gelecek">Gelecek Vadeli</option>
        </select>
      </div>
      <div className="cv2-field"><label>Etiket</label>
        <select value={filters.etiketler ?? ""} onChange={(e) => upd("etiketler", e.target.value)}>
          <option value="">Tümü</option>
          {etiketler.map((et) => <option key={et.id} value={et.id}>{et.ad}</option>)}
        </select>
      </div>
      <div className="cv2-field"><label>Kategori</label>
        <input value={filters.kategori ?? ""} onChange={(e) => upd("kategori", e.target.value)} placeholder="Kategori" />
      </div>
      <div className="cv2-field"><label>İl</label>
        <input value={filters.il ?? ""} onChange={(e) => upd("il", e.target.value)} placeholder="İl" />
      </div>
      <div className="cv2-field"><label>İlçe</label>
        <input value={filters.ilce ?? ""} onChange={(e) => upd("ilce", e.target.value)} placeholder="İlçe" />
      </div>
      <div className="cv2-field"><label>Yetkili</label>
        <input value={filters.yetkili ?? ""} onChange={(e) => upd("yetkili", e.target.value)} placeholder="Yetkili kişi" />
      </div>
      <div className="cv2-field"><label>Verecek (min)</label>
        <input type="number" value={filters.borc_min ?? ""} onChange={(e) => upd("borc_min", e.target.value)} />
      </div>
      <div className="cv2-field"><label>Verecek (max)</label>
        <input type="number" value={filters.borc_max ?? ""} onChange={(e) => upd("borc_max", e.target.value)} />
      </div>
      <div className="cv2-field"><label>Alacak (min)</label>
        <input type="number" value={filters.alacak_min ?? ""} onChange={(e) => upd("alacak_min", e.target.value)} />
      </div>
      <div className="cv2-field"><label>Alacak (max)</label>
        <input type="number" value={filters.alacak_max ?? ""} onChange={(e) => upd("alacak_max", e.target.value)} />
      </div>
      <div className="cv2-field"><label>Son İşlem (başlangıç)</label>
        <input type="date" value={filters.son_islem_baslangic ?? ""} onChange={(e) => upd("son_islem_baslangic", e.target.value)} />
      </div>
      <div className="cv2-field"><label>Son İşlem (bitiş)</label>
        <input type="date" value={filters.son_islem_bitis ?? ""} onChange={(e) => upd("son_islem_bitis", e.target.value)} />
      </div>
      <div className="cv2-filters__actions">
        <button className="cv2-btn" onClick={onClear}>Filtreleri Temizle</button>
      </div>
    </div>
  );
}
