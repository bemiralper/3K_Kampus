// ========== Modal Components (BookType, BulkTest, BulkUnit, BulkTopic, Import, Duplicate) ==========
"use client";
import React, { useEffect } from "react";
import type { BookType, BookTypeFormData, BulkTestFormState, BulkTestItemRow, BulkUnitRow, BulkTopicRow, ResourceBook } from "../types";

// ───── Shared modal backdrop ─────
function ModalBackdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        background: "white", borderRadius: 16, padding: 24, zIndex: 1001,
        maxHeight: "80vh", overflowY: "auto",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
      }}>
        {children}
      </div>
    </>
  );
}

// ────────────── BOOK TYPE MODAL ──────────────
interface BookTypeModalProps {
  open: boolean;
  onClose: () => void;
  bookTypes: BookType[];
  form: BookTypeFormData;
  setForm: (f: BookTypeFormData) => void;
  loading: boolean;
  onSave: () => void;
  onEdit: (bt: BookType) => void;
  onDelete: (id: number) => void;
  onReset: () => void;
}

export function BookTypeModal({ open, onClose, bookTypes, form, setForm, loading, onSave, onEdit, onDelete, onReset }: BookTypeModalProps) {
  if (!open) return null;
  return (
    <ModalBackdrop onClose={() => { onClose(); onReset(); }}>
      <div style={{ width: 600, maxWidth: "90vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>⚙️ Kitap Türü Yönetimi</h3>
          <button onClick={() => { onClose(); onReset(); }} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#64748b" }}>×</button>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, color: "#64748b" }}>Mevcut Türler</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bookTypes.map(bt => (
              <div key={bt.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, background: "#f8fafc", borderRadius: 8, border: form.id === bt.id ? "2px solid #667eea" : "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 20 }}>{bt.ikon || "📖"}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{bt.ad}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{bt.kod}</div>
                  </div>
                  <span className={`badge badge-${bt.renk}`}>{bt.renk}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onEdit(bt)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>✏️</button>
                  <button onClick={() => onDelete(bt.id)} style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "#dc2626" }}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 16 }}>
          <h4 style={{ margin: "0 0 16px", fontSize: 14 }}>{form.id ? "✏️ Türü Düzenle" : "➕ Yeni Tür Ekle"}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 500 }}>Kod *</label>
              <input type="text" value={form.kod} onChange={e => setForm({ ...form, kod: e.target.value.toUpperCase().replace(/\s/g, "_") })} placeholder="VIDEO_BOOK" style={{ width: "100%", padding: 10, border: "1px solid #e2e8f0", borderRadius: 8 }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 500 }}>Ad *</label>
              <input type="text" value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} placeholder="Video Kitabı" style={{ width: "100%", padding: 10, border: "1px solid #e2e8f0", borderRadius: 8 }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 500 }}>Renk</label>
              <select value={form.renk} onChange={e => setForm({ ...form, renk: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <option value="primary">🔵 Primary</option>
                <option value="success">🟢 Success</option>
                <option value="warning">🟡 Warning</option>
                <option value="danger">🔴 Danger</option>
                <option value="info">🔵 Info</option>
                <option value="secondary">⚪ Secondary</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 500 }}>İkon (Emoji)</label>
              <input type="text" value={form.ikon} onChange={e => setForm({ ...form, ikon: e.target.value })} placeholder="📚" style={{ width: "100%", padding: 10, border: "1px solid #e2e8f0", borderRadius: 8 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            {form.id && <button onClick={onReset} style={{ flex: 1, padding: 12, background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>İptal</button>}
            <button onClick={onSave} disabled={loading} style={{ flex: 1, padding: 12, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
              {loading ? "Kaydediliyor..." : form.id ? "Güncelle" : "Ekle"}
            </button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ────────────── BULK TEST MODAL ──────────────
interface BulkTestModalProps {
  open: boolean;
  onClose: () => void;
  topicName: string;
  form: BulkTestFormState;
  setForm: (f: BulkTestFormState, immediate?: boolean) => void;
  rows: BulkTestItemRow[];
  onUpdateRow: (index: number, field: "question_count" | "difficulty", value: string) => void;
  onApplyDefaults: () => void;
  previewLoading: boolean;
  loading: boolean;
  error: string | null;
  onSubmit: () => void;
}

export function BulkTestModal({
  open, onClose, topicName, form, setForm, rows, onUpdateRow, onApplyDefaults,
  previewLoading, loading, error, onSubmit,
}: BulkTestModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14,
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
      <div style={{
        position: "fixed",
        top: "8vh",
        left: "50%",
        transform: "translateX(-50%)",
        background: "white",
        borderRadius: 16,
        padding: 24,
        zIndex: 1001,
        maxHeight: "84vh",
        overflowY: "auto",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        width: 580,
        maxWidth: "92vw",
      }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Test Ekle</h3>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b" }}>
          <strong>{topicName}</strong> konusuna toplu test ekleyin
        </p>
        {error && (
          <div style={{ padding: 10, background: "#fee2e2", color: "#dc2626", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Adlandırma Türü</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
            <input
              type="radio"
              checked={form.namingMode === "numbered"}
              onChange={() => setForm({ ...form, namingMode: "numbered", startMode: "auto" }, true)}
            />
            Otomatik (Test-1, Test-2, …)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="radio"
              checked={form.namingMode === "series"}
              onChange={() => setForm({ ...form, namingMode: "series" }, true)}
            />
            Şablondan Üret
          </label>
        </div>

        <div style={{ marginBottom: 16, minHeight: 62 }}>
          {form.namingMode === "series" && (
            <>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Şablon Adı</label>
              <input
                type="text"
                value={form.templatePrefix}
                onChange={(e) => setForm({ ...form, templatePrefix: e.target.value })}
                placeholder="ÖSYM Tipi, Yıldızlar Yarışıyor, …"
                style={inputStyle}
              />
            </>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Başlangıç No</label>
            <select
              value={form.startMode}
              onChange={(e) => setForm({ ...form, startMode: e.target.value as "auto" | "manual" }, true)}
              style={inputStyle}
            >
              <option value="auto">Otomatik</option>
              <option value="manual">Manuel</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Numara</label>
            <input
              type="number"
              min={1}
              value={form.startNumber}
              disabled={form.startMode === "auto"}
              onChange={(e) => setForm({ ...form, startNumber: e.target.value }, true)}
              style={{
                ...inputStyle,
                opacity: form.startMode === "auto" ? 0.5 : 1,
                background: form.startMode === "auto" ? "#f1f5f9" : "white",
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Adet</label>
            <input
              type="number"
              min={1}
              max={100}
              value={form.count}
              onChange={(e) => setForm({ ...form, count: e.target.value }, true)}
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Varsayılan Soru Sayısı</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.defaultQuestionCount}
                  onChange={(e) => setForm({ ...form, defaultQuestionCount: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Varsayılan Zorluk</label>
                <select
                  value={form.defaultDifficulty}
                  onChange={(e) => setForm({ ...form, defaultDifficulty: e.target.value })}
                  style={inputStyle}
                >
                  <option value="EASY">Kolay</option>
                  <option value="MEDIUM">Orta</option>
                  <option value="HARD">Zor</option>
                  <option value="MIXED">Karma</option>
                </select>
              </div>
              <button
                type="button"
                onClick={onApplyDefaults}
                disabled={!rows.length}
                style={{
                  padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6,
                  background: "white", cursor: rows.length ? "pointer" : "not-allowed",
                  fontSize: 12, whiteSpace: "nowrap",
                }}
              >
                Tümüne uygula
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Test Listesi</span>
            {previewLoading && (
              <span style={{ fontSize: 11, color: "#64748b" }}>güncelleniyor…</span>
            )}
          </div>
          <div style={{
            border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden",
            opacity: previewLoading && rows.length ? 0.65 : 1,
            transition: "opacity 0.15s ease",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Test Adı</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#64748b", width: 90 }}>Soru</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#64748b", width: 110 }}>Zorluk</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((row, i) => (
                  <tr key={`${row.name}-${i}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 10px", color: "#334155" }}>{row.name}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={row.question_count}
                        onChange={(e) => onUpdateRow(i, "question_count", e.target.value)}
                        style={{ ...inputStyle, padding: "6px 8px" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <select
                        value={row.difficulty}
                        onChange={(e) => onUpdateRow(i, "difficulty", e.target.value)}
                        style={{ ...inputStyle, padding: "6px 8px" }}
                      >
                        <option value="EASY">Kolay</option>
                        <option value="MEDIUM">Orta</option>
                        <option value="HARD">Zor</option>
                        <option value="MIXED">Karma</option>
                      </select>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} style={{ padding: 16, color: "#94a3b8", textAlign: "center" }}>
                      {form.namingMode === "series" && !form.templatePrefix.trim()
                        ? "Şablon adını yazın"
                        : "Adet ve şablon bilgilerini girin"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "10px 20px", border: "1px solid #d1d5db", borderRadius: 8, background: "white", cursor: "pointer", fontSize: 14 }}>
            İptal
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading || !rows.length}
            style={{
              padding: "10px 20px", border: "none", borderRadius: 8, background: "#f59e0b", color: "white",
              cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600,
              opacity: loading || !rows.length ? 0.7 : 1,
            }}
          >
            {loading ? "Oluşturuluyor…" : `${rows.length || form.count} Test Oluştur`}
          </button>
        </div>
      </div>
    </>
  );
}

// ────────────── BULK UNIT/TOPIC MODAL (Reusable) ──────────────
interface BulkItemModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  rows: BulkUnitRow[] | BulkTopicRow[];
  setRows: (r: BulkUnitRow[]) => void;
  loading: boolean;
  error: string | null;
  onSubmit: () => void;
  color: string;
  placeholder: string;
}

export function BulkItemModal({ open, onClose, title, subtitle, rows, setRows, loading, error, onSubmit, color, placeholder }: BulkItemModalProps) {
  if (!open) return null;
  const addRow = () => setRows([...rows, { id: String(Date.now()), ad: "", kod: "" }] as BulkUnitRow[]);
  const removeRow = (id: string) => setRows(rows.filter(r => r.id !== id) as BulkUnitRow[]);
  const updateRow = (id: string, field: "ad" | "kod", value: string) => setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r) as BulkUnitRow[]);

  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{ width: 600, maxWidth: "90vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#64748b" }}>×</button>
        </div>
        <div style={{ marginBottom: 16, padding: 12, background: "#f0f9ff", borderRadius: 8 }}><strong>{subtitle}</strong></div>
        {error && <div style={{ padding: 12, background: "#fee2e2", color: "#dc2626", borderRadius: 8, marginBottom: 16 }}>{error}</div>}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={{ padding: 10, textAlign: "left", fontSize: 13 }}>#</th>
              <th style={{ padding: 10, textAlign: "left", fontSize: 13 }}>Ad *</th>
              <th style={{ padding: 10, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 8, fontSize: 14, color: "#64748b" }}>{i + 1}</td>
                <td style={{ padding: 8 }}>
                  <input type="text" value={row.ad} onChange={e => updateRow(row.id, "ad", e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }} />
                </td>
                <td style={{ padding: 8, textAlign: "center" }}>
                  {rows.length > 1 && <button onClick={() => removeRow(row.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 18 }}>×</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addRow} style={{ width: "100%", padding: 10, border: "2px dashed #d1d5db", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 14, color: "#64748b", marginBottom: 20 }}>+ Satır Ekle</button>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", border: "1px solid #d1d5db", borderRadius: 8, background: "white", cursor: "pointer", fontSize: 14 }}>İptal</button>
          <button onClick={onSubmit} disabled={loading} style={{ padding: "10px 20px", border: "none", borderRadius: 8, background: color, color: "white", cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Ekleniyor..." : `${rows.filter(r => r.ad.trim()).length} Ekle`}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ────────────── IMPORT MODAL ──────────────
interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  text: string;
  setText: (t: string) => void;
  loading: boolean;
  error: string | null;
  result: { units: number; topics: number; contents: number } | null;
  onSubmit: () => void;
}

export function ImportModal({ open, onClose, text, setText, loading, error, result, onSubmit }: ImportModalProps) {
  if (!open) return null;
  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{ width: 640 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>📥 Yapı İçe Aktarma</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          Aşağıdaki formatta ünite, konu ve içerik yapısını yapıştırın. Girinti seviyesi hiyerarşiyi belirler:
        </p>
        <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, fontSize: 13, fontFamily: "monospace", marginBottom: 16, lineHeight: 1.8, border: "1px solid #e2e8f0" }}>
          <div style={{ color: "#1e293b" }}>Ünite Adı | Ünite Kodu</div>
          <div style={{ color: "#3b82f6", paddingLeft: 24 }}>Konu Adı | Konu Kodu</div>
          <div style={{ color: "#8b5cf6", paddingLeft: 48 }}>İçerik Adı | İçerik Kodu | Soru Sayısı</div>
          <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 12 }}>— Tab veya 2 boşluk ile girintileme yapın<br />— Ayraç olarak | veya tab kullanın</div>
        </div>
        <div style={{ background: "#fffbeb", padding: 12, borderRadius: 8, fontSize: 12, color: "#92400e", marginBottom: 16, border: "1px solid #fef3c7" }}>
          💡 <strong>Excel&apos;den yapıştırma:</strong> Excel&apos;de sütunları seçip kopyalayın. Tab ile ayrılmış metin otomatik tanınacaktır.
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder={`1. Ünite | U1\n\tKonu 1 | K1\n\t\tTest 1 | T1 | 40`}
          style={{ width: "100%", minHeight: 200, padding: 16, border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontFamily: "monospace", resize: "vertical", lineHeight: 1.6 }} />
        {error && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 12, padding: 12, background: "#fef2f2", borderRadius: 8 }}>❌ {error}</div>}
        {result && <div style={{ color: "#16a34a", fontSize: 13, marginTop: 12, padding: 12, background: "#f0fdf4", borderRadius: 8 }}>✅ {result.units} ünite, {result.topics} konu, {result.contents} içerik eklendi.</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>İptal</button>
          <button onClick={onSubmit} disabled={loading || !text.trim()} style={{ padding: "10px 24px", background: loading ? "#94a3b8" : "#f59e0b", color: "white", border: "none", borderRadius: 8, cursor: loading ? "default" : "pointer", fontSize: 14, fontWeight: 600 }}>
            {loading ? "İçe aktarılıyor..." : "📥 İçe Aktar"}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ────────────── DUPLICATE MODAL ──────────────
interface DuplicateModalProps {
  open: boolean;
  onClose: () => void;
  selectedBook: ResourceBook | null;
  form: { ad: string; kod: string };
  setForm: (f: { ad: string; kod: string }) => void;
  loading: boolean;
  onSubmit: () => void;
}

export function DuplicateModal({ open, onClose, selectedBook, form, setForm, loading, onSubmit }: DuplicateModalProps) {
  if (!open || !selectedBook) return null;
  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 };
  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{ width: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>📋 Kitap Kopyala</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#64748b" }}>×</button>
        </div>
        <div style={{ marginBottom: 16, padding: 12, background: "#f0f9ff", borderRadius: 8, fontSize: 14 }}>
          <strong>Kaynak:</strong> {selectedBook.ad}
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            {selectedBook.unit_count} ünite, {selectedBook.topic_count} konu, {selectedBook.content_count} içerik kopyalanacak
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Yeni Kitap Adı *</label>
            <input type="text" value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Yeni Kod *</label>
            <input type="text" value={form.kod} onChange={e => setForm({ ...form, kod: e.target.value })} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", border: "1px solid #d1d5db", borderRadius: 8, background: "white", cursor: "pointer", fontSize: 14 }}>İptal</button>
          <button onClick={onSubmit} disabled={loading || !form.ad.trim() || !form.kod.trim()} style={{
            padding: "10px 24px", border: "none", borderRadius: 8,
            background: loading ? "#94a3b8" : "#667eea",
            color: "white", cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600,
          }}>
            {loading ? "Kopyalanıyor..." : "📋 Kopyala"}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
