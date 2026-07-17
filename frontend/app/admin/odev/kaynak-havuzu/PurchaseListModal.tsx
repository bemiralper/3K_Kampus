"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  fetchAvailableResources,
  fetchDersler,
  createPurchaseListFromLibrary,
  type AvailableResource,
  type Ders,
} from "@/lib/resources-api";
import { BookCover } from "@/components/resources/BookCover";

type ListType = "PURCHASE" | "INSTITUTION";

const DEFAULT_LIST_TITLE = "3K Kampüs Öğrenci Kitap Seti";
const DEFAULT_SOURCE_NOTE = "Çağrı Kitap Kırtasiye";

interface PurchaseListModalProps {
  open: boolean;
  listType: ListType;
  studentId: string;
  onClose: () => void;
  onCreated: (listId: number) => void;
}

function formatDifficulty(r: AvailableResource): string | null {
  if (r.zorluk_display) return r.zorluk_display;
  if (r.zorluk_min != null && r.zorluk_max != null) return `${r.zorluk_min}-${r.zorluk_max}`;
  if (r.zorluk_min != null) return `${r.zorluk_min}+`;
  if (r.zorluk_max != null) return `1-${r.zorluk_max}`;
  return null;
}

function difficultyStyle(label: string | null): { bg: string; color: string } {
  if (!label) return { bg: "#f1f5f9", color: "#64748b" };
  const n = parseInt(label, 10);
  if (n >= 8) return { bg: "#fee2e2", color: "#b91c1c" };
  if (n >= 5) return { bg: "#fef3c7", color: "#b45309" };
  return { bg: "#dcfce7", color: "#15803d" };
}

export default function PurchaseListModal({
  open,
  listType,
  studentId,
  onClose,
  onCreated,
}: PurchaseListModalProps) {
  const isPurchase = listType === "PURCHASE";

  const [title, setTitle] = useState(DEFAULT_LIST_TITLE);
  const [stationeryName, setStationeryName] = useState("");
  const [stationeryAddress, setStationeryAddress] = useState("");
  const [defaultSource, setDefaultSource] = useState(DEFAULT_SOURCE_NOTE);
  const [notes, setNotes] = useState("");
  const [dersler, setDersler] = useState<Ders[]>([]);
  const [activeDersId, setActiveDersId] = useState<number | null>(null);
  const [booksByDers, setBooksByDers] = useState<Record<number, AvailableResource[]>>({});
  const [booksLoading, setBooksLoading] = useState(false);
  const [dersLoading, setDersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedMap, setSelectedMap] = useState<Record<number, AvailableResource>>({});
  const [sourceNotes, setSourceNotes] = useState<Record<number, string>>({});
  const [dersSearch, setDersSearch] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPanelOpen, setSelectedPanelOpen] = useState(true);
  const loadedDersRef = useRef<Set<number>>(new Set());

  const selectedIds = useMemo(() => Object.keys(selectedMap).map(Number), [selectedMap]);
  const selectedCount = selectedIds.length;

  const selectedByDers = useMemo(() => {
    const counts: Record<number, number> = {};
    Object.values(selectedMap).forEach(book => {
      counts[book.ders_id] = (counts[book.ders_id] || 0) + 1;
    });
    return counts;
  }, [selectedMap]);

  const loadDersler = useCallback(async () => {
    setDersLoading(true);
    try {
      const result = await fetchDersler();
      if (result.success && result.data) {
        setDersler(result.data);
      }
    } catch {
      setError("Ders listesi yüklenemedi");
    }
    setDersLoading(false);
  }, []);

  const loadBooksForDers = useCallback(async (dersId: number) => {
    if (loadedDersRef.current.has(dersId)) return;
    loadedDersRef.current.add(dersId);
    setBooksLoading(true);
    setError("");
    try {
      const result = await fetchAvailableResources({
        lesson_ids: dersId,
        student_ids: parseInt(studentId),
        exclude_assigned: false,
        acquisition_info: true,
      });
      if (result.success && result.data) {
        setBooksByDers(prev => ({ ...prev, [dersId]: result.data! }));
      } else {
        setBooksByDers(prev => ({ ...prev, [dersId]: [] }));
      }
    } catch {
      setError("Kitaplar yüklenemedi");
      setBooksByDers(prev => ({ ...prev, [dersId]: [] }));
    }
    setBooksLoading(false);
  }, [studentId]);

  useEffect(() => {
    if (open) {
      setTitle(DEFAULT_LIST_TITLE);
      setDefaultSource(DEFAULT_SOURCE_NOTE);
      setStationeryName("");
      setStationeryAddress("");
      setNotes("");
      setSelectedMap({});
      setSourceNotes({});
      setBooksByDers({});
      loadedDersRef.current = new Set();
      setActiveDersId(null);
      setDersSearch("");
      setBookSearch("");
      setSettingsOpen(false);
      setSelectedPanelOpen(true);
      setError("");
      loadDersler();
    }
  }, [open, loadDersler]);

  useEffect(() => {
    if (activeDersId != null) {
      loadBooksForDers(activeDersId);
    }
  }, [activeDersId, loadBooksForDers]);

  const filteredDersler = dersler.filter(d =>
    !dersSearch.trim() || d.ad.toLowerCase().includes(dersSearch.toLowerCase())
  );

  const activeBooks = activeDersId != null ? booksByDers[activeDersId] || [] : [];
  const filteredBooks = activeBooks.filter(b => {
    if (!bookSearch.trim()) return true;
    const q = bookSearch.toLowerCase();
    return `${b.ad} ${b.yayinevi} ${b.book_type}`.toLowerCase().includes(q);
  });

  const booksToPick = useMemo(
    () => filteredBooks.filter(b => !b.hidden && b.selectable !== false),
    [filteredBooks],
  );
  const booksBlocked = useMemo(
    () => filteredBooks.filter(b => !b.hidden && b.selectable === false),
    [filteredBooks],
  );
  const hiddenBookCount = useMemo(
    () => filteredBooks.filter(b => b.hidden).length,
    [filteredBooks],
  );

  const activeDers = dersler.find(d => d.id === activeDersId);

  const toggleBook = (book: AvailableResource) => {
    if (book.hidden || book.selectable === false) return;
    setSelectedMap(prev => {
      const next = { ...prev };
      if (next[book.id]) delete next[book.id];
      else next[book.id] = book;
      return next;
    });
  };

  const removeSelected = (id: number) => {
    setSelectedMap(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedCount === 0) return;
    setSaving(true);
    setError("");
    try {
      const result = await createPurchaseListFromLibrary({
        student_id: parseInt(studentId),
        list_type: listType,
        title,
        notes,
        stationery_name: stationeryName,
        stationery_address: stationeryAddress,
        default_source_note: defaultSource,
        items: selectedIds.map(id => ({
          resource_book_id: id,
          quantity: 1,
          source_note: sourceNotes[id] || "",
        })),
      });
      if (result.success && result.data?.id) {
        onCreated(result.data.id);
        onClose();
      } else {
        setError(typeof result.error === "string" ? result.error : "Liste oluşturulamadı");
      }
    } catch {
      setError("Liste oluşturulamadı");
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16,
    }}>
      <div style={{
        background: "white", borderRadius: "16px", width: "min(920px, 100%)",
        maxHeight: "92vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 60px rgba(31,60,136,0.2)",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 22px",
          background: isPurchase
            ? "linear-gradient(135deg, #1F3C88, #162D6B)"
            : "linear-gradient(135deg, #1F3C88, #2EC4B6)",
          color: "white", borderRadius: "16px 16px 0 0",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
                {isPurchase ? "🛒 Kırtasiye Listesi" : "🏫 Kurum Kaynak Listesi"}
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: "13px", opacity: 0.9 }}>
                Ders seçin, kitapları işaretleyin, başka derse geçip seçmeye devam edin.
              </p>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
        </div>

        {/* Liste ayarları (katlanır) */}
        <div style={{ borderBottom: "1px solid #e2e8f0" }}>
          <button
            type="button"
            onClick={() => setSettingsOpen(v => !v)}
            style={{
              width: "100%", padding: "10px 22px", background: "#f8fafc", border: "none",
              textAlign: "left", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#475569",
            }}
          >
            {settingsOpen ? "▼" : "▶"} Liste ayarları (ad, kırtasiye, not…)
          </button>
          {settingsOpen && (
            <div style={{ padding: "12px 22px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Liste adı</label>
                <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8 }} />
              </div>
              {isPurchase ? (
                <>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Kırtasiye</label>
                    <input value={stationeryName} onChange={e => setStationeryName(e.target.value)} placeholder="Çağrı Kitap" style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Temin yeri</label>
                    <input value={defaultSource} onChange={e => setDefaultSource(e.target.value)} placeholder="Çağrı Kitap Kırtasiye" style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8 }} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Adres</label>
                    <input value={stationeryAddress} onChange={e => setStationeryAddress(e.target.value)} style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8 }} />
                  </div>
                </>
              ) : (
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Varsayılan temin yeri</label>
                  <input value={defaultSource} onChange={e => setDefaultSource(e.target.value)} style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8 }} />
                </div>
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Not</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8 }} />
              </div>
            </div>
          )}
        </div>

        {/* Ders + kitap alanı */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Sol: dersler */}
          <div style={{
            width: 220, flexShrink: 0, borderRight: "1px solid #e2e8f0",
            display: "flex", flexDirection: "column", background: "#f8fafc",
          }}>
            <div style={{ padding: "12px 12px 8px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>DERSLER</div>
              <input
                value={dersSearch}
                onChange={e => setDersSearch(e.target.value)}
                placeholder="Ders ara..."
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12 }}
              />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
              {dersLoading ? (
                <div style={{ padding: 16, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>Yükleniyor…</div>
              ) : filteredDersler.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>Ders yok</div>
              ) : (
                filteredDersler.map(ders => {
                  const picked = selectedByDers[ders.id] || 0;
                  const loaded = booksByDers[ders.id];
                  const isActive = activeDersId === ders.id;
                  return (
                    <button
                      key={ders.id}
                      type="button"
                      onClick={() => { setActiveDersId(ders.id); setBookSearch(""); }}
                      style={{
                        width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 4,
                        border: isActive ? "2px solid #1F3C88" : "1px solid #e2e8f0",
                        borderRadius: 8, cursor: "pointer",
                        background: isActive ? "#eef2ff" : "white",
                        fontSize: 13, fontWeight: isActive ? 600 : 500,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ders.ad}</span>
                        {picked > 0 && (
                          <span style={{
                            background: "#1F3C88", color: "white", fontSize: 10, fontWeight: 700,
                            padding: "2px 6px", borderRadius: 999, flexShrink: 0,
                          }}>{picked}</span>
                        )}
                      </div>
                      {loaded && (
                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
                          {loaded.filter(b => !b.hidden && b.selectable !== false).length} seçilebilir
                          {(selectedByDers[ders.id] || 0) > 0 ? ` · ${selectedByDers[ders.id]} seçili` : ""}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Sağ: seçili dersin kitapları */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {activeDersId == null ? (
              <div style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#94a3b8", fontSize: 14, padding: 24, textAlign: "center",
              }}>
                ← Soldan bir ders seçin,<br />o derse ait kitaplar burada listelenir.
              </div>
            ) : (
              <>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{activeDers?.ad}</div>
                  <input
                    value={bookSearch}
                    onChange={e => setBookSearch(e.target.value)}
                    placeholder="Bu derste kitap ara..."
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 12px" }}>
                  {error && (
                    <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 8, borderRadius: 8, marginBottom: 8, fontSize: 12 }}>{error}</div>
                  )}
                  {booksLoading && !booksByDers[activeDersId] ? (
                    <div style={{ textAlign: "center", padding: 32, color: "#64748b" }}>Kitaplar yükleniyor…</div>
                  ) : booksToPick.length === 0 && booksBlocked.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 32, color: "#64748b" }}>
                      {hiddenBookCount > 0
                        ? "Bu dersteki kitapların tamamı zaten alınmış."
                        : "Bu derste uygun kitap bulunamadı."}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {booksToPick.map(book => {
                        const diff = formatDifficulty(book);
                        const diffStyle = difficultyStyle(diff);
                        const checked = !!selectedMap[book.id];
                        return (
                          <div key={book.id} style={{
                            border: checked ? "2px solid #1F3C88" : "1px solid #e2e8f0",
                            borderRadius: 8, padding: "10px 12px", background: checked ? "#f0f4ff" : "white",
                          }}>
                            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleBook(book)} style={{ marginTop: 3 }} />
                              <BookCover src={book.kapak_url} alt={book.ad} size="sm" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                  <span style={{ fontWeight: 600, fontSize: 13 }}>{book.ad}</span>
                                  <span style={{
                                    background: diffStyle.bg, color: diffStyle.color,
                                    padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, flexShrink: 0,
                                  }}>
                                    {diff || "—"}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                                  {book.book_type}{book.yayinevi ? ` · ${book.yayinevi}` : ""}{book.yayin_yili ? ` · ${book.yayin_yili}` : ""}
                                </div>
                                {checked && !isPurchase && (
                                  <input
                                    value={sourceNotes[book.id] || ""}
                                    onChange={e => setSourceNotes(prev => ({ ...prev, [book.id]: e.target.value }))}
                                    placeholder={defaultSource || "Temin yeri (opsiyonel)"}
                                    style={{ width: "100%", marginTop: 6, padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 11 }}
                                    onClick={e => e.stopPropagation()}
                                  />
                                )}
                              </div>
                            </label>
                          </div>
                        );
                      })}

                      {booksBlocked.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginTop: 8, marginBottom: 2 }}>
                            Listede / eklenemez
                          </div>
                          {booksBlocked.map(book => {
                            const diff = formatDifficulty(book);
                            return (
                              <div key={book.id} style={{
                                border: "1px solid #e2e8f0",
                                borderRadius: 8,
                                padding: "10px 12px",
                                background: "#f8fafc",
                                opacity: 0.85,
                              }}>
                                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                  <input type="checkbox" checked disabled style={{ marginTop: 3 }} />
                                  <BookCover src={book.kapak_url} alt={book.ad} size="sm" />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                                      <span style={{ fontWeight: 600, fontSize: 13, color: "#64748b" }}>{book.ad}</span>
                                      <span style={{
                                        background: "#e2e8f0", color: "#475569",
                                        padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                                      }}>
                                        {book.acquisition_label || "Listede"}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                                      {book.book_type}{diff ? ` · Zorluk ${diff}` : ""}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}

                      {hiddenBookCount > 0 && (
                        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
                          {hiddenBookCount} kitap daha önce alındığı için gösterilmiyor.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Seçilen kitaplar özeti */}
        {selectedCount > 0 && (
          <div style={{ borderTop: "1px solid #e2e8f0", background: "#fafbff" }}>
            <button
              type="button"
              onClick={() => setSelectedPanelOpen(v => !v)}
              style={{
                width: "100%", padding: "8px 22px", background: "transparent", border: "none",
                textAlign: "left", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#1F3C88",
              }}
            >
              {selectedPanelOpen ? "▼" : "▶"} Listeye eklenecek kitaplar ({selectedCount})
            </button>
            {selectedPanelOpen && (
              <div style={{ padding: "0 22px 12px", display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 88, overflowY: "auto" }}>
                {Object.values(selectedMap).map(book => (
                  <span key={book.id} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "white", border: "1px solid #c7d2fe", borderRadius: 999,
                    padding: "4px 6px 4px 10px", fontSize: 11, maxWidth: "100%",
                  }}>
                    <BookCover src={book.kapak_url} alt={book.ad} size="sm" />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {book.ders_ad}: {book.ad}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSelected(book.id)}
                      style={{ border: "none", background: "#fee2e2", color: "#b91c1c", borderRadius: 999, width: 18, height: 18, cursor: "pointer", fontSize: 12, lineHeight: 1 }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: "14px 22px", borderTop: "1px solid #e2e8f0",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {selectedCount === 0 ? "Henüz kitap seçilmedi" : `${selectedCount} kitap listeye eklenecek`}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "10px 18px", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" }}>İptal</button>
            <button
              onClick={handleSave}
              disabled={selectedCount === 0 || saving}
              style={{
                padding: "10px 20px",
                background: selectedCount === 0 ? "#94a3b8" : "#1F3C88",
                color: "white", border: "none", borderRadius: 8,
                cursor: selectedCount === 0 ? "not-allowed" : "pointer", fontWeight: 600,
              }}
            >
              {saving ? "Oluşturuluyor…" : `Listeyi Oluştur (${selectedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { formatDifficulty, difficultyStyle };
