"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { gelirKategoriService } from "../services/gelir-api";
import type {
  GelirKategorisiTreeItem,
  GelirAltKategori,
  GelirKategorisiTreeResponse,
} from "../types/gelir-kategori-types";
import "../gider-yonetimi/gider.css";

/* ═══════════════════════════════════════════════════════════════
   Gelir Yönetimi — Kategori Ağacı
   ═══════════════════════════════════════════════════════════════ */

// ─── Micro SVG atoms ──────────────────────────────────────────
const Spin = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);
const XIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const PlusIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);
const EditIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);
const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const FolderIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);
const ChevSvg = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

// ─── FormField helper ─────────────────────────────────────────
function FL({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="gv-form-group">
      <label className="gv-form-label">
        {label}
        {required && <span className="gv-required"> *</span>}
      </label>
      {children}
      {hint && <span className="gv-form-help">{hint}</span>}
    </div>
  );
}

// ─── Varsayılan renk & ikon setleri ───────────────────────────
const RENKLER = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#6366f1", "#ec4899",
];
const IKONLAR = [
  "👤", "🏢", "📚", "📦", "📢", "💻", "🏛️",
  "🎓", "🚗", "🍽️", "📋", "🔧", "💰", "📊",
];
type DrawerType = "add-ana" | "edit-ana" | "add-alt" | "edit-alt" | "delete" | null;

interface DrawerState {
  type: DrawerType;
  parentId?: number;
  itemId?: number;
  itemAd?: string;
  isAna?: boolean;
  altCount?: number;
}

interface GelirYonetimiClientProps {
  embedded?: boolean;
}

export default function GelirYonetimiClient({ embedded }: GelirYonetimiClientProps = {}) {
  const { homeHref, portalHomeHref } = useFinansPath();
  const { activeKurum, activeSube } = useKurum();
  const [tree, setTree] = useState<GelirKategorisiTreeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Drawer
  const [drawer, setDrawer] = useState<DrawerState>({ type: null });
  const [saving, setSaving] = useState(false);
  const [formAd, setFormAd] = useState("");
  const [formIkon, setFormIkon] = useState("");
  const [formRenk, setFormRenk] = useState("");
  const [formAciklama, setFormAciklama] = useState("");
  const [formError, setFormError] = useState("");

  const searchTimer = useRef<NodeJS.Timeout | null>(null);
  const initialExpandDone = useRef(false);

  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ─── Fetch ──────────────────────────────────────
  const fetchTree = useCallback(async () => {
    if (!activeKurum || !activeSube) return;
    setLoading(true);
    try {
      const res: GelirKategorisiTreeResponse = await gelirKategoriService.tree(activeKurum.id, activeSube.id);
      setTree(res.kategoriler || []);
      if (res.kategoriler.length > 0 && !initialExpandDone.current) {
        setExpanded(new Set(res.kategoriler.map((k) => k.id)));
        initialExpandDone.current = true;
      }
    } catch (err: any) {
      showToast(err.message || "Veriler yüklenemedi", "error");
    } finally {
      setLoading(false);
    }
  }, [activeKurum, activeSube, showToast]);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  // ─── Seed ───────────────────────────────────────
  const handleSeed = async () => {
    if (!activeKurum || !activeSube) return;
    try {
      const res = await gelirKategoriService.seed(activeKurum.id, activeSube.id);
      showToast(res.message);
      initialExpandDone.current = false;
      fetchTree();
    } catch (err: any) {
      showToast(err.message || "Varsayılan kategoriler oluşturulamadı", "error");
    }
  };

  // ─── Expand / Collapse ──────────────────────────
  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const expandAll = () => setExpanded(new Set(tree.map((k) => k.id)));
  const collapseAll = () => setExpanded(new Set());

  // ─── Search ─────────────────────────────────────
  const handleSearchChange = (val: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(val), 300);
  };

  const filteredTree = tree.filter((ana) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return ana.ad.toLowerCase().includes(q) || ana.alt_kategoriler.some((alt) => alt.ad.toLowerCase().includes(q));
  });

  // ─── Drawer open helpers ────────────────────────
  const resetForm = () => { setFormAd(""); setFormIkon(""); setFormRenk(""); setFormAciklama(""); setFormError(""); };

  const openAddAna = () => {
    resetForm();
    setFormRenk(RENKLER[tree.length % RENKLER.length]);
    setDrawer({ type: "add-ana" });
  };

  const openEditAna = (item: GelirKategorisiTreeItem) => {
    setFormAd(item.ad);
    setFormIkon(item.ikon);
    setFormRenk(item.renk);
    setFormAciklama(item.aciklama);
    setFormError("");
    setDrawer({ type: "edit-ana", itemId: item.id, itemAd: item.ad });
  };

  const openAddAlt = (parentId: number) => {
    resetForm();
    setDrawer({ type: "add-alt", parentId });
    setExpanded((prev) => new Set(prev).add(parentId));
  };

  const openEditAlt = (alt: GelirAltKategori) => {
    setFormAd(alt.ad);
    setFormIkon(alt.ikon);
    setFormRenk(alt.renk);
    setFormAciklama(alt.aciklama);
    setFormError("");
    setDrawer({ type: "edit-alt", itemId: alt.id, itemAd: alt.ad, parentId: alt.parent_id });
  };

  const openDelete = (id: number, ad: string, isAna: boolean, altCount?: number) => {
    resetForm();
    setDrawer({ type: "delete", itemId: id, itemAd: ad, isAna, altCount });
  };

  const closeDrawer = () => {
    setDrawer({ type: null });
    setFormError("");
    setSaving(false);
  };

  // ─── Save (Add / Edit) ─────────────────────────
  const handleSave = async () => {
    if (!activeKurum || !activeSube) return;
    const ad = formAd.trim();
    if (!ad) { setFormError("Kategori adı zorunludur."); return; }

    setSaving(true);
    setFormError("");

    try {
      if (drawer.type === "add-ana") {
        await gelirKategoriService.create({ kurum_id: activeKurum.id, sube_id: activeSube.id, ad, ikon: formIkon, renk: formRenk, aciklama: formAciklama });
        showToast(`"${ad}" ana kategorisi oluşturuldu.`);
      } else if (drawer.type === "edit-ana" && drawer.itemId) {
        await gelirKategoriService.update(drawer.itemId, { ad, ikon: formIkon, renk: formRenk, aciklama: formAciklama });
        showToast(`"${ad}" güncellendi.`);
      } else if (drawer.type === "add-alt" && drawer.parentId) {
        await gelirKategoriService.create({ kurum_id: activeKurum.id, sube_id: activeSube.id, ad, parent_id: drawer.parentId, ikon: formIkon, renk: formRenk, aciklama: formAciklama });
        showToast(`"${ad}" alt kategorisi oluşturuldu.`);
      } else if (drawer.type === "edit-alt" && drawer.itemId) {
        await gelirKategoriService.update(drawer.itemId, { ad, ikon: formIkon, renk: formRenk, aciklama: formAciklama });
        showToast(`"${ad}" güncellendi.`);
      }
      closeDrawer();
      fetchTree();
    } catch (err: any) {
      setFormError(
        err.fieldErrors ? Object.values(err.fieldErrors).flat().join(", ") : err.message || "İşlem başarısız."
      );
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete ─────────────────────────────────────
  const handleDelete = async () => {
    if (!drawer.itemId) return;
    setSaving(true);
    try {
      await gelirKategoriService.delete(drawer.itemId);
      showToast(`"${drawer.itemAd}" silindi.`);
      closeDrawer();
      fetchTree();
    } catch (err: any) {
      setFormError(err.message || "Silme başarısız.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle aktif ──────────────────────────────
  const handleToggle = async (id: number) => {
    try {
      const res = await gelirKategoriService.toggle(id);
      showToast(res.message);
      fetchTree();
    } catch (err: any) {
      showToast(err.message || "Durum değiştirilemedi", "error");
    }
  };

  // ─── Kurum seçilmedi ───────────────────────────
  if (!activeKurum) {
    return (
      <div className="empty-state" style={{ padding: "48px 20px" }}>
        <div className="empty-state-icon">🏢</div>
        <h4>Kurum Seçiniz</h4>
        <p>Gelir kategorilerini görüntülemek için üst menüden bir kurum seçin.</p>
      </div>
    );
  }

  if (!activeSube) {
    return (
      <div className="empty-state" style={{ padding: "48px 20px" }}>
        <div className="empty-state-icon">🏫</div>
        <h4>Şube Seçiniz</h4>
        <p>Gelir kategorileri şube bazlıdır. Üst menüden bir şube seçin.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="empty-state" style={{ padding: "48px 20px" }}>
        <div className="empty-state-icon"><Spin /></div>
        <h4>Yükleniyor...</h4>
      </div>
    );
  }

  const toplamAna = tree.length;
  const toplamAlt = tree.reduce((s, k) => s + k.alt_kategoriler.length, 0);
  const isDrawerOpen = drawer.type !== null;
  const isFormDrawer = drawer.type === "add-ana" || drawer.type === "edit-ana" || drawer.type === "add-alt" || drawer.type === "edit-alt";
  const isDeleteDrawer = drawer.type === "delete";
  const isAnaForm = drawer.type === "add-ana" || drawer.type === "edit-ana";

  const drawerTitle = (() => {
    switch (drawer.type) {
      case "add-ana": return "Yeni Ana Kategori";
      case "edit-ana": return "Ana Kategori Düzenle";
      case "add-alt": return "Yeni Alt Kategori";
      case "edit-alt": return "Alt Kategori Düzenle";
      case "delete": return "Kategori Sil";
      default: return "";
    }
  })();

  const drawerIconClass = isDeleteDrawer ? "kat-drawer-icon danger" : "kat-drawer-icon";

  return (
    <>
      <div className={embedded ? "" : "space-y-5"}>
        {embedded ? (
          <div className="card-modern-header">
            <h3>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Gelir Kategorileri
            </h3>
            <div className="card-modern-header-actions">
              {toplamAna > 0 && (
                <span className="badge-modern secondary">
                  {toplamAna} ana · {toplamAlt} alt
                </span>
              )}
              <button type="button" onClick={openAddAna} className="btn-hero">
                <span className="btn-hero-icon">
                  <PlusIcon className="w-4 h-4" />
                </span>
                <span>Yeni Kategori</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="hero-header">
              <div className="hero-content">
                <div className="hero-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <div className="hero-text">
                  <h1>Gelir Kategorileri</h1>
                  <div className="hero-breadcrumb">
                    <a href={portalHomeHref}>Ana Sayfa</a>
                    <span>/</span>
                    <a href={homeHref}>Finans</a>
                    <span>/</span>
                    <span>Gelir Kategorileri</span>
                  </div>
                </div>
              </div>
              <div className="hero-actions">
                <button onClick={openAddAna} className="btn-hero">
                  <span className="btn-hero-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                  <span>Yeni Kategori</span>
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            {toplamAna > 0 && (
              <div className="quick-stats">
                <div className="quick-stat">
                  <div className="quick-stat-icon purple">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                  </div>
                  <div className="quick-stat-info">
                    <h4>{toplamAna}</h4>
                    <span>Ana Kategori</span>
                  </div>
                </div>
                <div className="quick-stat">
                  <div className="quick-stat-icon blue">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  </div>
                  <div className="quick-stat-info">
                    <h4>{toplamAlt}</h4>
                    <span>Alt Kategori</span>
                  </div>
                </div>
                <div className="quick-stat">
                  <div className="quick-stat-icon green">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                  </div>
                  <div className="quick-stat-info">
                    <h4>{toplamAna + toplamAlt}</h4>
                    <span>Toplam</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Toolbar */}
        <div className={`kat-toolbar ${embedded ? "embedded" : ""}`}>
          <div className="search-modern">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Kategori ara..."
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          {toplamAna > 0 && (
            <div className="kat-toolbar-actions">
              <button type="button" onClick={expandAll} className="btn-modern btn-secondary">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                Tümünü Aç
              </button>
              <button type="button" onClick={collapseAll} className="btn-modern btn-secondary">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5m-4.5 0v4.5m0-4.5l5.25 5.25" />
                </svg>
                Tümünü Kapat
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="kat-content">
          {toplamAna === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">💸</div>
              <h4>Henüz Gelir Kategorisi Yok</h4>
              <p>Gelir kayıtlarınızı düzenlemek için önce kategorilerinizi oluşturun.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
                <button type="button" onClick={handleSeed} className="btn-modern btn-primary">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Varsayılan Kategorileri Yükle
                </button>
                <button type="button" onClick={openAddAna} className="btn-modern btn-secondary">
                  <PlusIcon />
                  Manuel Ekle
                </button>
              </div>
            </div>
          )}

          {toplamAna > 0 && filteredTree.length === 0 && search && (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <div className="empty-state-icon">🔍</div>
              <h4>Sonuç Bulunamadı</h4>
              <p>&ldquo;{search}&rdquo; ile eşleşen kategori bulunamadı.</p>
            </div>
          )}

          {filteredTree.length > 0 && (
            <div className="kat-tree">
              {filteredTree.map((ana) => {
                const isOpen = expanded.has(ana.id);
                const altCount = ana.alt_kategoriler.length;

                return (
                  <div key={ana.id} className={`kat-ana ${!ana.aktif_mi ? "pasif" : ""}`}>
                    <div
                      className="kat-ana-header"
                      onClick={() => toggleExpand(ana.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleExpand(ana.id); }}
                    >
                      <div className={`kat-chevron ${isOpen ? "open" : ""}`}>
                        <ChevSvg />
                      </div>

                      <div
                        className="kat-icon"
                        style={{
                          background: ana.renk ? `${ana.renk}18` : "var(--body-bg)",
                          border: ana.renk ? `1px solid ${ana.renk}40` : "1px solid var(--border-color)",
                        }}
                      >
                        {ana.ikon || "📂"}
                      </div>

                      <div className="kat-info">
                        <h4 className="kat-name">{ana.ad}</h4>
                        <div className="kat-meta">
                          <span className="kat-count">{altCount} alt kategori</span>
                          {!ana.aktif_mi && <span className="kat-status-pasif">Pasif</span>}
                        </div>
                      </div>

                      <div className="kat-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => openAddAlt(ana.id)} title="Alt Kategori Ekle" className="kat-act-btn success">
                          <PlusIcon className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => openEditAna(ana)} title="Düzenle" className="kat-act-btn">
                          <EditIcon />
                        </button>
                        <button type="button" onClick={() => handleToggle(ana.id)} title={ana.aktif_mi ? "Pasif Yap" : "Aktif Yap"} className="kat-act-btn">
                          <span className={`kat-toggle-dot ${ana.aktif_mi ? "aktif" : "pasif-dot"}`} />
                        </button>
                        <button type="button" onClick={() => openDelete(ana.id, ana.ad, true, altCount)} title="Sil" className="kat-act-btn danger">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="kat-alt-wrap">
                        {altCount === 0 ? (
                          <div className="kat-alt-empty">
                            Henüz alt kategori yok.
                            <button type="button" onClick={() => openAddAlt(ana.id)} className="kat-alt-empty-link">
                              + Ekle
                            </button>
                          </div>
                        ) : (
                          ana.alt_kategoriler
                            .filter((alt) => !search || alt.ad.toLowerCase().includes(search.toLowerCase()))
                            .map((alt) => (
                              <div key={alt.id} className={`kat-alt-item ${!alt.aktif_mi ? "pasif" : ""}`}>
                                <span className="kat-alt-dot" style={{ background: ana.renk || "#94a3b8" }} />
                                <span className="kat-alt-name">
                                  {alt.ad}
                                  {!alt.aktif_mi && <span className="kat-status-pasif">Pasif</span>}
                                </span>
                                <div className="kat-alt-actions">
                                  <button type="button" onClick={() => openEditAlt(alt)} title="Düzenle" className="kat-act-btn">
                                    <EditIcon />
                                  </button>
                                  <button type="button" onClick={() => handleToggle(alt.id)} title={alt.aktif_mi ? "Pasif Yap" : "Aktif Yap"} className="kat-act-btn">
                                    <span className={`kat-toggle-dot ${alt.aktif_mi ? "aktif" : "pasif-dot"}`} />
                                  </button>
                                  <button type="button" onClick={() => openDelete(alt.id, alt.ad, false)} title="Sil" className="kat-act-btn danger">
                                    <TrashIcon />
                                  </button>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
      {isDrawerOpen && (
        <>
          <div className="gv-drawer-overlay" onClick={closeDrawer} />
          <div className="gv-drawer">
            <div className="gv-drawer-header">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className={drawerIconClass}>
                  {isDeleteDrawer ? (
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  ) : (
                    <FolderIcon />
                  )}
                </div>
                <div>
                  <h3>{drawerTitle}</h3>
                  <span className="gv-form-help" style={{ marginTop: 2 }}>
                    {isDeleteDrawer ? "Bu işlem geri alınamaz" : isAnaForm ? "Ana kategori bilgileri" : "Alt kategori bilgileri"}
                  </span>
                </div>
              </div>
              <button type="button" onClick={closeDrawer} className="gv-drawer-close" aria-label="Kapat">
                <XIcon />
              </button>
            </div>

            <div className="gv-drawer-body">
              {formError && (
                <div className="kat-error">
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {formError}
                </div>
              )}

              {isFormDrawer && (
                <>
                  <FL label="Kategori Adı" required>
                    <input
                      className="gv-form-input"
                      type="text"
                      value={formAd}
                      onChange={(e) => setFormAd(e.target.value)}
                      placeholder="Örn: Satış Gelirleri"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    />
                  </FL>

                  {isAnaForm && (
                    <>
                      <FL label="İkon" hint="Kategoriye bir emoji ikon atayabilirsiniz">
                        <div className="kat-icon-grid">
                          {IKONLAR.map((icon) => (
                            <button
                              key={icon}
                              type="button"
                              onClick={() => setFormIkon(formIkon === icon ? "" : icon)}
                              className={`kat-icon-btn ${formIkon === icon ? "selected" : ""}`}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      </FL>

                      <FL label="Renk">
                        <div className="kat-color-grid">
                          {RENKLER.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setFormRenk(formRenk === color ? "" : color)}
                              className={`kat-color-btn ${formRenk === color ? "selected" : ""}`}
                              style={{ background: color }}
                              aria-label={`Renk ${color}`}
                            />
                          ))}
                        </div>
                      </FL>
                    </>
                  )}

                  <FL label="Açıklama" hint="İsteğe bağlı açıklama notu">
                    <textarea
                      className="gv-form-textarea"
                      value={formAciklama}
                      onChange={(e) => setFormAciklama(e.target.value)}
                      placeholder="İsteğe bağlı not..."
                      rows={3}
                    />
                  </FL>

                  {isAnaForm && (formIkon || formRenk || formAd) && (
                    <div className="gv-form-group">
                      <label className="gv-form-label">Önizleme</label>
                      <div className="kat-preview-card">
                        <div
                          className="kat-preview-icon"
                          style={{
                            background: formRenk ? `${formRenk}18` : "var(--body-bg)",
                            border: formRenk ? `1px solid ${formRenk}40` : "1px solid var(--border-color)",
                          }}
                        >
                          {formIkon || "📂"}
                        </div>
                        <div>
                          <div className="kat-name">{formAd || "Kategori Adı"}</div>
                          <span className="kat-count">0 alt kategori</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {isDeleteDrawer && (
                <>
                  <p className="kat-confirm-text">
                    <strong>&ldquo;{drawer.itemAd}&rdquo;</strong> kategorisini silmek istediğinize emin misiniz?
                  </p>
                  {drawer.isAna && (drawer.altCount ?? 0) > 0 && (
                    <div className="kat-confirm-warning">
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      Bu ana kategoriyi sildiğinizde <strong>{drawer.altCount} alt kategori</strong> de birlikte silinecektir.
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="gv-drawer-footer">
              <button type="button" onClick={closeDrawer} disabled={saving} className="gv-btn gv-btn-secondary">
                İptal
              </button>
              {isFormDrawer && (
                <button type="button" onClick={handleSave} disabled={saving} className="gv-btn gv-btn-primary">
                  {saving ? <><Spin /> Kaydediliyor...</> : "Kaydet"}
                </button>
              )}
              {isDeleteDrawer && (
                <button type="button" onClick={handleDelete} disabled={saving} className="btn-modern btn-danger">
                  {saving ? <><Spin /> Siliniyor...</> : "Evet, Sil"}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className={`kat-toast ${toast.type}`}>
          {toast.type === "success" && (
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {toast.type === "error" && (
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.type === "info" && (
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {toast.message}
        </div>
      )}
    </>
  );
}
