"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  fetchDersler,
  fetchSinifSeviyeleri,
  fetchBooks,
  fetchBookStructure,
  fetchAssignmentPackages,
  fetchAssignmentPackage,
  createAssignmentPackage,
  updateAssignmentPackage,
  deleteAssignmentPackage,
  duplicateAssignmentPackage,
  type AssignmentPackage,
  type AssignmentPackageItem,
} from "@/lib/resources-api";

// UI types for content selection from book structure
interface PackageItemUI {
  bookId: number;
  bookName: string;
  contentId: number;
  contentName: string;
  contentType: string;
  topicName: string;
  unitName: string;
  questionCount: number | null;
  pageStart: number | null;
  pageEnd: number | null;
}

interface Book {
  id: number;
  ad: string;
  kod: string;
  ders_ad: string;
  sinif_seviyesi_ad: string;
  book_type_display: string;
}

interface BookStructure {
  id: number;
  ad: string;
  units: {
    id: number;
    ad: string;
    topics: {
      id: number;
      ad: string;
      contents: {
        id: number;
        ad: string;
        content_type: string;
        content_type_display: string;
        question_count: number | null;
        page_start: number | null;
        page_end: number | null;
      }[];
    }[];
  }[];
}

const LEGACY_STORAGE_KEY = "odev_paketleri_v1";

function itemToApi(item: PackageItemUI, order: number): Omit<AssignmentPackageItem, "id"> {
  return {
    book_id: item.bookId,
    book_name: item.bookName,
    content_id: item.contentId,
    content_name: item.contentName,
    content_type: item.contentType,
    topic_name: item.topicName,
    unit_name: item.unitName,
    question_count: item.questionCount,
    page_start: item.pageStart,
    page_end: item.pageEnd,
    order,
  };
}

function itemsToApi(items: AssignmentPackageItem[]): Omit<AssignmentPackageItem, "id">[] {
  return items.map((item, idx) => ({
    book_id: item.book_id,
    book_name: item.book_name,
    content_id: item.content_id,
    content_name: item.content_name,
    content_type: item.content_type,
    topic_name: item.topic_name,
    unit_name: item.unit_name,
    question_count: item.question_count,
    page_start: item.page_start,
    page_end: item.page_end,
    order: item.order ?? idx,
  }));
}

function packagePayload(
  pkg: Pick<AssignmentPackage, "name" | "description" | "ders_ad" | "sinif_seviyesi">,
  items: AssignmentPackageItem[]
) {
  return {
    name: pkg.name,
    description: pkg.description || "",
    ders_ad: pkg.ders_ad || "",
    sinif_seviyesi: pkg.sinif_seviyesi || "",
    items: itemsToApi(items),
  };
}

async function tryImportLegacyPackages(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return false;

    const listResult = await fetchAssignmentPackages();
    if (!listResult.success || (listResult.data && listResult.data.length > 0)) return false;

    const legacy = JSON.parse(raw) as {
      name: string;
      description?: string;
      dersAd?: string;
      sinifSeviyesi?: string;
      items?: {
        bookId: number;
        bookName: string;
        contentId: number;
        contentName: string;
        contentType: string;
        topicName?: string;
        unitName?: string;
        questionCount?: number | null;
        pageStart?: number | null;
        pageEnd?: number | null;
      }[];
    }[];

    if (!Array.isArray(legacy) || legacy.length === 0) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return false;
    }

    for (const pkg of legacy) {
      await createAssignmentPackage({
        name: pkg.name,
        description: pkg.description || "",
        ders_ad: pkg.dersAd || "",
        sinif_seviyesi: pkg.sinifSeviyesi || "",
        items: (pkg.items || []).map((item, idx) => ({
          book_id: item.bookId,
          book_name: item.bookName,
          content_id: item.contentId,
          content_name: item.contentName,
          content_type: item.contentType,
          topic_name: item.topicName || "",
          unit_name: item.unitName || "",
          question_count: item.questionCount ?? null,
          page_start: item.pageStart ?? null,
          page_end: item.pageEnd ?? null,
          order: idx,
        })),
      });
    }

    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

const getContentTypeIcon = (type: string) => {
  switch (type) {
    case "TEST_SET": return "📝";
    case "SUBJECT_SECTION": return "📖";
    case "PAGE_RANGE": return "📄";
    case "EXERCISE": return "✏️";
    case "VIDEO": return "🎬";
    default: return "📌";
  }
};

export default function OdevPaketleriPage() {
  const [packages, setPackages] = useState<AssignmentPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<AssignmentPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddContentModal, setShowAddContentModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDers, setNewDers] = useState("");
  const [newSinif, setNewSinif] = useState("");

  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [bookStructure, setBookStructure] = useState<BookStructure | null>(null);
  const [selectedContents, setSelectedContents] = useState<PackageItemUI[]>([]);
  const [loadingStructure, setLoadingStructure] = useState(false);

  const [dersler, setDersler] = useState<{ id: number; ad: string }[]>([]);
  const [sinifSeviyeleri, setSinifSeviyeleri] = useState<{ id: number; ad: string }[]>([]);

  const loadPackagesFromApi = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAssignmentPackages();
      if (result.success && result.data) {
        setPackages(result.data);
      } else {
        setError(result.error || "Paketler yüklenemedi");
      }
    } catch {
      setError("Paketler yüklenemedi");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const imported = await tryImportLegacyPackages();
      await loadPackagesFromApi();
      if (imported) flash("✅ Eski paketler içe aktarıldı");
    })();
    Promise.all([fetchDersler(), fetchSinifSeviyeleri()]).then(([dData, sData]) => {
      if (dData.success && dData.data) setDersler(dData.data);
      if (sData.success && sData.data) setSinifSeviyeleri(sData.data);
    }).catch(() => {});
  }, [loadPackagesFromApi]);

  const selectPackage = async (pkg: AssignmentPackage) => {
    if (pkg.items) {
      setSelectedPackage(pkg);
      return;
    }
    try {
      const result = await fetchAssignmentPackage(pkg.id);
      if (result.success && result.data) {
        setSelectedPackage(result.data);
        setPackages(prev => prev.map(p => p.id === result.data!.id ? { ...p, ...result.data } : p));
      } else {
        flash("❌ Paket detayı yüklenemedi");
      }
    } catch {
      flash("❌ Paket detayı yüklenemedi");
    }
  };

  const fetchBooksList = useCallback(async () => {
    try {
      const result = await fetchBooks();
      if (result.success && result.data) setBooks(result.data as Book[]);
    } catch { /* silent */ }
  }, []);

  const loadBookStructure = async (bookId: number) => {
    setLoadingStructure(true);
    try {
      const result = await fetchBookStructure(bookId);
      if (result.success && result.data) setBookStructure(result.data as BookStructure);
    } catch { /* silent */ }
    setLoadingStructure(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const result = await createAssignmentPackage({
        name: newName.trim(),
        description: newDesc.trim(),
        ders_ad: newDers,
        sinif_seviyesi: newSinif,
        items: [],
      });
      if (result.success && result.data) {
        setPackages(prev => [result.data!, ...prev]);
        setSelectedPackage(result.data);
        setShowCreateModal(false);
        setNewName(""); setNewDesc(""); setNewDers(""); setNewSinif("");
        flash("✅ Paket oluşturuldu");
      } else {
        flash("❌ Paket oluşturulamadı");
      }
    } catch {
      flash("❌ Paket oluşturulamadı");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Bu paketi silmek istediğinize emin misiniz?")) return;
    try {
      const result = await deleteAssignmentPackage(id);
      if (result.success) {
        setPackages(prev => prev.filter(p => p.id !== id));
        if (selectedPackage?.id === id) setSelectedPackage(null);
        flash("✅ Paket silindi");
      } else {
        flash("❌ Paket silinemedi");
      }
    } catch {
      flash("❌ Paket silinemedi");
    }
  };

  const handleDuplicate = async (pkg: AssignmentPackage) => {
    try {
      const result = await duplicateAssignmentPackage(pkg.id);
      if (result.success && result.data) {
        setPackages(prev => [result.data!, ...prev]);
        flash("✅ Paket kopyalandı");
      } else {
        flash("❌ Paket kopyalanamadı");
      }
    } catch {
      flash("❌ Paket kopyalanamadı");
    }
  };

  const handleRemoveItem = async (contentId: number) => {
    if (!selectedPackage) return;
    const updatedItems = (selectedPackage.items || []).filter(i => i.content_id !== contentId);
    try {
      const result = await updateAssignmentPackage(
        selectedPackage.id,
        packagePayload(selectedPackage, updatedItems)
      );
      if (result.success && result.data) {
        setSelectedPackage(result.data);
        setPackages(prev => prev.map(p => p.id === result.data!.id ? result.data! : p));
        flash("✅ İçerik paketten çıkarıldı");
      } else {
        flash("❌ Güncelleme başarısız");
      }
    } catch {
      flash("❌ Güncelleme başarısız");
    }
  };

  const handleAddContentsToPackage = async () => {
    if (!selectedPackage || selectedContents.length === 0) return;
    const existingIds = new Set((selectedPackage.items || []).map(i => i.content_id));
    const newItems = selectedContents
      .filter(c => !existingIds.has(c.contentId))
      .map((c, idx) => itemToApi(c, (selectedPackage.items?.length || 0) + idx));
    const mergedItems = [...itemsToApi(selectedPackage.items || []), ...newItems];

    try {
      const result = await updateAssignmentPackage(
        selectedPackage.id,
        packagePayload(selectedPackage, mergedItems as AssignmentPackageItem[])
      );
      if (result.success && result.data) {
        setSelectedPackage(result.data);
        setPackages(prev => prev.map(p => p.id === result.data!.id ? result.data! : p));
        setShowAddContentModal(false);
        setSelectedContents([]);
        setBookStructure(null);
        setSelectedBookId(null);
        flash(`✅ ${newItems.length} içerik pakete eklendi`);
      } else {
        flash("❌ İçerik eklenemedi");
      }
    } catch {
      flash("❌ İçerik eklenemedi");
    }
  };

  const toggleContentSelection = (item: PackageItemUI) => {
    setSelectedContents(prev => {
      const exists = prev.find(c => c.contentId === item.contentId);
      return exists ? prev.filter(c => c.contentId !== item.contentId) : [...prev, item];
    });
  };

  const filteredPackages = packages.filter(p => {
    const q = searchQuery.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.ders_ad.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
  });

  const itemCount = (pkg: AssignmentPackage) => pkg.items?.length ?? pkg.item_count ?? 0;

  return (
    <div style={{ padding: 0, fontFamily: "'Poppins', sans-serif" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#172b4c", color: "#fff", padding: "10px 24px", borderRadius: 100, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,.25)" }}>
          {toast}
        </div>
      )}

      <div style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", borderRadius: 16, padding: "32px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 64, height: 64, background: "rgba(255,255,255,0.2)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📦</div>
          <div>
            <h1 style={{ margin: 0, color: "white", fontSize: 24, fontWeight: 700 }}>Ödev Paketleri</h1>
            <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.8)", fontSize: 14 }}>Hazır ödev şablonları oluşturun, içerik ekleyin ve tek tıkla ödev olarak verin</p>
          </div>
        </div>
        <button onClick={() => setShowCreateModal(true)} style={{ padding: "12px 24px", background: "rgba(255,255,255,0.2)", color: "white", border: "none", borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(10px)" }}>
          ➕ Yeni Paket Oluştur
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input type="text" placeholder="🔍 Paket ara..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", padding: "12px 20px", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 14, outline: "none", background: "white" }} />
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>Yükleniyor...</div>
      )}

      {error && !loading && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 16, marginBottom: 16, color: "#dc2626", fontSize: 14 }}>
          {error}
          <button onClick={loadPackagesFromApi} style={{ marginLeft: 12, background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontWeight: 600 }}>Tekrar dene</button>
        </div>
      )}

      {!loading && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <div style={{ flex: selectedPackage ? "0 0 380px" : "1", transition: "flex 0.3s" }}>
            {filteredPackages.length === 0 ? (
              <div style={{ background: "white", borderRadius: 12, padding: 40, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
                <h3 style={{ margin: "0 0 8px", color: "#1e293b" }}>Henüz Paket Yok</h3>
                <p style={{ color: "#64748b", margin: "0 0 16px" }}>Sık kullandığınız ödev yapılarını paket olarak kaydedin.</p>
                <button onClick={() => setShowCreateModal(true)} style={{ padding: "10px 24px", background: "#f59e0b", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>➕ İlk Paketi Oluştur</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredPackages.map(pkg => {
                  const isSelected = selectedPackage?.id === pkg.id;
                  return (
                    <div key={pkg.id} onClick={() => selectPackage(pkg)} style={{ background: isSelected ? "#fffbeb" : "white", border: isSelected ? "2px solid #f59e0b" : "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", cursor: "pointer", transition: "all 0.15s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>{pkg.name}</div>
                          {pkg.description && <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{pkg.description}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                          <button onClick={(e) => { e.stopPropagation(); handleDuplicate(pkg); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, opacity: 0.5 }} title="Kopyala">📋</button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(pkg.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, opacity: 0.5 }} title="Sil">🗑️</button>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {pkg.ders_ad && <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 500, background: "#dbeafe", color: "#2563eb" }}>{pkg.ders_ad}</span>}
                        {pkg.sinif_seviyesi && <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 500, background: "#f1f5f9", color: "#64748b" }}>{pkg.sinif_seviyesi}</span>}
                        <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>📚 {itemCount(pkg)} içerik</span>
                        {pkg.usage_count > 0 && <span style={{ fontSize: 11, color: "#10b981" }}>✅ {pkg.usage_count}x kullanıldı</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedPackage && (
            <div style={{ flex: 1, background: "white", borderRadius: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", padding: 24, color: "white", position: "relative" }}>
                <button onClick={() => setSelectedPackage(null)} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", color: "white", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>{selectedPackage.name}</h2>
                {selectedPackage.description && <p style={{ margin: 0, opacity: 0.85, fontSize: 14 }}>{selectedPackage.description}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {selectedPackage.ders_ad && <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.2)" }}>{selectedPackage.ders_ad}</span>}
                  {selectedPackage.sinif_seviyesi && <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.2)" }}>{selectedPackage.sinif_seviyesi}</span>}
                  <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.2)" }}>📚 {itemCount(selectedPackage)} içerik</span>
                </div>
              </div>

              <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => { setShowAddContentModal(true); fetchBooksList(); setSelectedContents([]); setBookStructure(null); setSelectedBookId(null); }} style={{ padding: "8px 16px", background: "#8b5cf6", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>📖 İçerik Ekle</button>
                <Link href={`/admin/odev/ver?package_id=${selectedPackage.id}`} style={{ padding: "8px 16px", background: "#10b981", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>📤 Bu Paketten Ödev Ver</Link>
                <button onClick={() => handleDelete(selectedPackage.id)} style={{ padding: "8px 16px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", marginLeft: "auto" }}>🗑️ Sil</button>
              </div>

              <div style={{ padding: "20px 24px" }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#1e293b" }}>📚 Paket İçerikleri</h3>
                {!selectedPackage.items || selectedPackage.items.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", background: "#f8fafc", borderRadius: 8 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
                    <p style={{ color: "#64748b", margin: 0 }}>Bu pakete henüz içerik eklenmemiş.</p>
                    <button onClick={() => { setShowAddContentModal(true); fetchBooksList(); setSelectedContents([]); setBookStructure(null); setSelectedBookId(null); }} style={{ marginTop: 12, padding: "8px 20px", background: "#8b5cf6", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>📖 İçerik Ekle</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(
                      selectedPackage.items.reduce<Record<string, AssignmentPackageItem[]>>((acc, item) => {
                        const key = item.book_name;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(item);
                        return acc;
                      }, {})
                    ).map(([bookName, items]) => (
                      <div key={bookName} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ padding: "10px 16px", background: "#f8fafc", fontSize: 14, fontWeight: 600, color: "#1e293b" }}>📚 {bookName}</div>
                        {items.map(item => (
                          <div key={item.content_id} style={{ padding: "10px 16px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{getContentTypeIcon(item.content_type)} {item.content_name}</div>
                              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{item.unit_name} › {item.topic_name}</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {item.question_count && <span style={{ fontSize: 11, color: "#6366f1" }}>📝 {item.question_count} soru</span>}
                              <button onClick={() => handleRemoveItem(item.content_id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, opacity: 0.5 }} title="Çıkar">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ padding: "12px 24px", borderTop: "1px solid #f1f5f9", fontSize: 12, color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
                <span>Oluşturulma: {new Date(selectedPackage.created_at).toLocaleDateString("tr-TR")}</span>
                <span>Kullanım: {selectedPackage.usage_count}x</span>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <>
          <div onClick={() => setShowCreateModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "white", borderRadius: 16, padding: 32, zIndex: 1001, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 20 }}>📦 Yeni Ödev Paketi</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Paket Adı *</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Örn: Haftalık Matematik Paketi" style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Açıklama</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Paket hakkında kısa açıklama..." style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none", minHeight: 80, resize: "vertical" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Ders</label>
                  <select value={newDers} onChange={e => setNewDers(e.target.value)} style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none", background: "white" }}>
                    <option value="">Seçiniz</option>
                    {dersler.map(d => <option key={d.id} value={d.ad}>{d.ad}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Sınıf</label>
                  <select value={newSinif} onChange={e => setNewSinif(e.target.value)} style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none", background: "white" }}>
                    <option value="">Seçiniz</option>
                    {sinifSeviyeleri.map(s => <option key={s.id} value={s.ad}>{s.ad}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button onClick={() => setShowCreateModal(false)} style={{ padding: "10px 20px", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>İptal</button>
              <button onClick={handleCreate} disabled={!newName.trim()} style={{ padding: "10px 24px", background: newName.trim() ? "#f59e0b" : "#d1d5db", color: "white", border: "none", borderRadius: 8, cursor: newName.trim() ? "pointer" : "default", fontSize: 14, fontWeight: 600 }}>Oluştur</button>
            </div>
          </div>
        </>
      )}

      {showAddContentModal && (
        <>
          <div onClick={() => setShowAddContentModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "white", borderRadius: 16, padding: 32, zIndex: 1001, width: 700, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>📖 İçerik Ekle</h2>
              <button onClick={() => setShowAddContentModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Kitap Seçin</label>
              <select value={selectedBookId || ""} onChange={e => { const id = Number(e.target.value); setSelectedBookId(id); if (id) loadBookStructure(id); else setBookStructure(null); }} style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none", background: "white" }}>
                <option value="">Kitap seçiniz...</option>
                {books.map(b => <option key={b.id} value={b.id}>{b.ad} ({b.ders_ad} - {b.sinif_seviyesi_ad})</option>)}
              </select>
            </div>

            {loadingStructure ? (
              <div style={{ textAlign: "center", padding: 20, color: "#64748b" }}>Yükleniyor...</div>
            ) : bookStructure && (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 400, overflowY: "auto" }}>
                {bookStructure.units.map(unit => (
                  <div key={unit.id}>
                    <div style={{ padding: "10px 16px", background: "#f8fafc", fontWeight: 600, fontSize: 14, borderBottom: "1px solid #e2e8f0" }}>📁 {unit.ad}</div>
                    {unit.topics.map(topic => (
                      <div key={topic.id}>
                        <div style={{ padding: "8px 16px 8px 32px", fontSize: 13, color: "#64748b", borderBottom: "1px solid #f1f5f9" }}>📂 {topic.ad}</div>
                        {topic.contents.map(content => {
                          const isSelected = selectedContents.some(c => c.contentId === content.id);
                          const alreadyInPackage = selectedPackage?.items?.some(i => i.content_id === content.id);
                          return (
                            <div key={content.id} onClick={() => {
                              if (alreadyInPackage) return;
                              toggleContentSelection({
                                bookId: bookStructure.id,
                                bookName: bookStructure.ad,
                                contentId: content.id,
                                contentName: content.ad,
                                contentType: content.content_type,
                                topicName: topic.ad,
                                unitName: unit.ad,
                                questionCount: content.question_count,
                                pageStart: content.page_start,
                                pageEnd: content.page_end,
                              });
                            }} style={{
                              padding: "8px 16px 8px 48px",
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                              borderBottom: "1px solid #f1f5f9",
                              cursor: alreadyInPackage ? "default" : "pointer",
                              background: isSelected ? "#ede9fe" : alreadyInPackage ? "#f1f5f9" : "white",
                              opacity: alreadyInPackage ? 0.5 : 1
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 20, height: 20, borderRadius: 4, border: isSelected ? "none" : "2px solid #d1d5db", background: isSelected ? "#8b5cf6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, flexShrink: 0 }}>{isSelected ? "✓" : ""}</span>
                                <span style={{ fontSize: 13 }}>{getContentTypeIcon(content.content_type)} {content.ad}</span>
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                {content.question_count && <span style={{ fontSize: 11, color: "#6366f1" }}>{content.question_count} soru</span>}
                                {alreadyInPackage && <span style={{ fontSize: 11, color: "#94a3b8" }}>Zaten ekli</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {selectedContents.length > 0 && (
              <div style={{ marginTop: 16, padding: 12, background: "#f0fdf4", borderRadius: 8, fontSize: 13, color: "#16a34a" }}>
                ✅ {selectedContents.length} içerik seçildi
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
              <button onClick={() => setShowAddContentModal(false)} style={{ padding: "10px 20px", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>İptal</button>
              <button onClick={handleAddContentsToPackage} disabled={selectedContents.length === 0} style={{ padding: "10px 24px", background: selectedContents.length ? "#8b5cf6" : "#d1d5db", color: "white", border: "none", borderRadius: 8, cursor: selectedContents.length ? "pointer" : "default", fontSize: 14, fontWeight: 600 }}>📖 {selectedContents.length} İçerik Ekle</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
