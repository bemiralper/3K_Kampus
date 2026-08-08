"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_NOT_KATEGORILER,
  NOT_KATEGORI_COLORS,
  createOgrenciNot,
  deleteOgrenciNot,
  fetchOgrenciNotGecmis,
  fetchOgrenciNotlar,
  updateOgrenciNot,
  type OgrenciNotAuditItem,
  type OgrenciNotItem,
  type OgrenciNotKategori,
  type OgrenciNotPayload,
} from "@/lib/ogrenci-notlar-api";

const KURUM_COLOR = "#0262a7";

interface NotlarTabProps {
  ogrenciId: number;
}

type FormState = {
  baslik: string;
  icerik: string;
  kategori: string;
  tarih: string;
  saat: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalParts(iso: string | null | undefined): { tarih: string; saat: string } {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return {
      tarih: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
      saat: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    };
  }
  return {
    tarih: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    saat: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

function partsToIso(tarih: string, saat: string): string {
  const t = saat && saat.length === 5 ? `${saat}:00` : saat || "00:00:00";
  return `${tarih}T${t}`;
}

function formatDayHeader(iso: string | null): string {
  if (!iso) return "Tarihsiz";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Tarihsiz";
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayKey(iso: string | null): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function emptyForm(kategori = "genel"): FormState {
  const parts = toLocalParts(null);
  return {
    baslik: "",
    icerik: "",
    kategori,
    tarih: parts.tarih,
    saat: parts.saat,
  };
}

export default function NotlarTab({ ogrenciId }: NotlarTabProps) {
  const [notes, setNotes] = useState<OgrenciNotItem[]>([]);
  const [kategoriler, setKategoriler] = useState<OgrenciNotKategori[]>(DEFAULT_NOT_KATEGORILER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKategori, setActiveKategori] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OgrenciNotItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<OgrenciNotItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [historyNote, setHistoryNote] = useState<OgrenciNotItem | null>(null);
  const [history, setHistory] = useState<OgrenciNotAuditItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const drawerOpen = formOpen || Boolean(historyNote);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchOgrenciNotlar(ogrenciId, {
      kategori: activeKategori || undefined,
      q: q || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    });
    if (res.success && res.data) {
      setNotes(res.data.notlar || []);
      if (res.data.kategoriler?.length) setKategoriler(res.data.kategoriler);
    } else {
      setError(res.error || "Notlar yüklenemedi.");
    }
    setLoading(false);
  }, [ogrenciId, activeKategori, q, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const closeForm = useCallback(() => {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setFormError(null);
  }, [saving]);

  const closeHistory = useCallback(() => {
    setHistoryNote(null);
    setHistory([]);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deleteTarget) {
        if (!deleting) setDeleteTarget(null);
        return;
      }
      if (formOpen) closeForm();
      else if (historyNote) closeHistory();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget, deleting, formOpen, historyNote, closeForm, closeHistory]);

  useEffect(() => {
    if (drawerOpen || deleteTarget) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen, deleteTarget]);

  const grouped = useMemo(() => {
    const map = new Map<string, OgrenciNotItem[]>();
    for (const note of notes) {
      const key = dayKey(note.not_zamani);
      const list = map.get(key) || [];
      list.push(note);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [notes]);

  const openCreate = () => {
    setHistoryNote(null);
    setEditing(null);
    setForm(emptyForm(activeKategori && activeKategori !== "sozlesme" ? activeKategori : "genel"));
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (note: OgrenciNotItem) => {
    if (!note.editable) return;
    setHistoryNote(null);
    const parts = toLocalParts(note.not_zamani);
    setEditing(note);
    setForm({
      baslik: note.baslik,
      icerik: note.icerik,
      kategori: note.kategori,
      tarih: parts.tarih,
      saat: parts.saat,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = async () => {
    setSaving(true);
    setFormError(null);
    const payload: OgrenciNotPayload = {
      baslik: form.baslik.trim(),
      icerik: form.icerik.trim(),
      kategori: form.kategori,
      not_zamani: partsToIso(form.tarih, form.saat),
    };
    if (!payload.baslik || !payload.icerik) {
      setFormError("Başlık ve içerik zorunludur.");
      setSaving(false);
      return;
    }
    const res = editing
      ? await updateOgrenciNot(ogrenciId, editing.id, payload)
      : await createOgrenciNot(ogrenciId, payload);
    if (!res.success) {
      setFormError(res.error || "Kayıt başarısız.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setFormOpen(false);
    setEditing(null);
    await load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.editable) return;
    setDeleting(true);
    const res = await deleteOgrenciNot(ogrenciId, deleteTarget.id);
    setDeleting(false);
    if (!res.success) {
      setError(res.error || "Silme başarısız.");
      return;
    }
    setDeleteTarget(null);
    await load();
  };

  const openHistory = async (note: OgrenciNotItem) => {
    if (note.source !== "manual" || typeof note.id !== "number") return;
    setFormOpen(false);
    setHistoryNote(note);
    setHistory([]);
    setHistoryLoading(true);
    const res = await fetchOgrenciNotGecmis(ogrenciId, note.id);
    if (res.success && res.data) setHistory(res.data.gecmis || []);
    setHistoryLoading(false);
  };

  if (loading) {
    return (
      <div className="tab-panel">
        <div className="notlar-loading">
          <div className="notlar-spinner" />
          <p>Notlar yükleniyor…</p>
        </div>
        <style jsx>{`
          .notlar-loading { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 20px; gap:16px; }
          .notlar-spinner { width:40px; height:40px; border:3px solid #e2e8f0; border-top-color:${KURUM_COLOR}; border-radius:50%; animation:nSpin .8s linear infinite; }
          @keyframes nSpin { to { transform: rotate(360deg); } }
          .notlar-loading p { color:#64748b; font-size:14px; }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tab-panel">
        <div className="notlar-error">
          <p>{error}</p>
          <button type="button" className="btn-modern btn-secondary btn-sm" onClick={load}>
            Tekrar dene
          </button>
        </div>
        <style jsx>{`
          .notlar-error { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 20px; gap:12px; }
          .notlar-error p { color:#ef4444; font-size:14px; text-align:center; max-width:480px; }
        `}</style>
      </div>
    );
  }

  const selectedKategoriColor = NOT_KATEGORI_COLORS[form.kategori] || "#64748b";

  return (
    <div className="tab-panel notlar-tab">
      <div className="card-modern notlar-card">
        <div className="card-modern-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Notlar
            <span className="notlar-count">{notes.length}</span>
          </h3>
          <div className="card-modern-header-actions">
            <button type="button" className="btn-modern btn-primary btn-sm" onClick={openCreate}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Not Ekle
            </button>
          </div>
        </div>

        <div className="card-modern-body notlar-body">
          <div className="notlar-filters">
            <div className="notlar-search-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                placeholder="Notlarda ara…"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setQ(qDraft.trim());
                }}
                onBlur={() => setQ(qDraft.trim())}
              />
            </div>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Başlangıç" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Bitiş" />
          </div>

          <div className="notlar-chips">
            <button
              type="button"
              className={`notlar-chip ${activeKategori === "" ? "active" : ""}`}
              onClick={() => setActiveKategori("")}
            >
              Tümü
            </button>
            {kategoriler.map((k) => {
              const color = NOT_KATEGORI_COLORS[k.code] || "#64748b";
              return (
                <button
                  key={k.code}
                  type="button"
                  className={`notlar-chip ${activeKategori === k.code ? "active" : ""}`}
                  style={
                    activeKategori === k.code
                      ? { background: color, borderColor: color, color: "#fff" }
                      : undefined
                  }
                  onClick={() => setActiveKategori(k.code)}
                >
                  <span className="notlar-chip-dot" style={{ background: color }} />
                  {k.label}
                </button>
              );
            })}
          </div>

          {notes.length === 0 ? (
            <div className="notlar-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p>Bu öğrenci için not bulunmuyor.</p>
              <button type="button" className="btn-modern btn-primary btn-sm" onClick={openCreate}>
                İlk notu ekle
              </button>
            </div>
          ) : (
            <div className="notlar-timeline">
              {grouped.map(([key, dayNotes]) => (
                <div key={key} className="notlar-day">
                  <div className="notlar-day-label">{formatDayHeader(dayNotes[0]?.not_zamani)}</div>
                  {dayNotes.map((note) => {
                    const color = NOT_KATEGORI_COLORS[note.kategori] || "#64748b";
                    const isContract = note.source === "sozlesme";
                    return (
                      <article
                        key={String(note.id)}
                        className={`notlar-item ${isContract ? "notlar-item--contract" : ""}`}
                      >
                        <div className="notlar-item-time">{formatTime(note.not_zamani)}</div>
                        <div className="notlar-item-dot" style={{ background: color, boxShadow: `0 0 0 3px ${color}22` }} />
                        <div className="notlar-item-card">
                          <div className="notlar-item-top">
                            <span className="notlar-kategori" style={{ color, background: `${color}14` }}>
                              {note.kategori_label || note.kategori}
                            </span>
                            {isContract && (
                              <span className="notlar-source">Sözleşmeden otomatik geldi</span>
                            )}
                            {isContract && note.sozlesme_no && (
                              <span className="notlar-soz-no">{note.sozlesme_no}</span>
                            )}
                          </div>
                          <h4>{note.baslik}</h4>
                          <p>{note.icerik}</p>
                          <div className="notlar-item-bottom">
                            <span>
                              {note.created_by_name || "—"}
                              {note.created_at ? ` · ${formatDateTime(note.created_at)}` : ""}
                            </span>
                            {!isContract && (
                              <div className="notlar-actions">
                                <button type="button" onClick={() => openHistory(note)}>Geçmiş</button>
                                <button type="button" onClick={() => openEdit(note)}>Düzenle</button>
                                <button type="button" className="danger" onClick={() => setDeleteTarget(note)}>Sil</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Form drawer — Veli sekmesiyle aynı kalıp */}
      <div
        className={`drawer-overlay ${formOpen ? "drawer-overlay-visible" : ""}`}
        onClick={closeForm}
      />
      <div className={`drawer drawer-right ${formOpen ? "drawer-open" : ""}`}>
        <div className="drawer-header">
          <h3>{editing ? "Notu Düzenle" : "Yeni Not Ekle"}</h3>
          <button type="button" className="drawer-close-btn" onClick={closeForm} aria-label="Kapat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="drawer-body">
          {formError && (
            <div className="notlar-form-alert" role="alert">
              {formError}
            </div>
          )}

          <div className="notlar-form">
            <div className="notlar-form-section">
              <div className="notlar-form-section-title">Not bilgisi</div>
              <div className="notlar-field">
                <label htmlFor="not-baslik">Başlık <span className="req">*</span></label>
                <input
                  id="not-baslik"
                  type="text"
                  className="notlar-input"
                  value={form.baslik}
                  onChange={(e) => setForm((f) => ({ ...f, baslik: e.target.value }))}
                  maxLength={255}
                  placeholder="Örn. Ödeme planı görüşmesi"
                  autoFocus
                />
              </div>
              <div className="notlar-field">
                <label htmlFor="not-icerik">İçerik <span className="req">*</span></label>
                <textarea
                  id="not-icerik"
                  className="notlar-input notlar-textarea"
                  rows={6}
                  value={form.icerik}
                  onChange={(e) => setForm((f) => ({ ...f, icerik: e.target.value }))}
                  placeholder="Görüşme, olay veya kayıt detayını yazın…"
                />
              </div>
            </div>

            <div className="notlar-form-section">
              <div className="notlar-form-section-title">Kategori</div>
              <div className="notlar-kategori-grid">
                {kategoriler.map((k) => {
                  const color = NOT_KATEGORI_COLORS[k.code] || "#64748b";
                  const selected = form.kategori === k.code;
                  return (
                    <button
                      key={k.code}
                      type="button"
                      className={`notlar-kategori-option ${selected ? "selected" : ""}`}
                      style={
                        selected
                          ? {
                              borderColor: color,
                              background: `${color}12`,
                              boxShadow: `0 0 0 2px ${color}22`,
                            }
                          : undefined
                      }
                      onClick={() => setForm((f) => ({ ...f, kategori: k.code }))}
                    >
                      <span className="notlar-kategori-option-dot" style={{ background: color }} />
                      <span>{k.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="notlar-field-hint">
                Seçili:{" "}
                <strong style={{ color: selectedKategoriColor }}>
                  {kategoriler.find((k) => k.code === form.kategori)?.label || form.kategori}
                </strong>
              </p>
            </div>

            <div className="notlar-form-section">
              <div className="notlar-form-section-title">Olay zamanı</div>
              <p className="notlar-field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                Geçmiş bir görüşme veya işlem için tarihi sonradan ayarlayabilirsiniz.
              </p>
              <div className="notlar-field-row">
                <div className="notlar-field">
                  <label htmlFor="not-tarih">Tarih</label>
                  <input
                    id="not-tarih"
                    type="date"
                    className="notlar-input"
                    value={form.tarih}
                    onChange={(e) => setForm((f) => ({ ...f, tarih: e.target.value }))}
                  />
                </div>
                <div className="notlar-field">
                  <label htmlFor="not-saat">Saat</label>
                  <input
                    id="not-saat"
                    type="time"
                    className="notlar-input"
                    value={form.saat}
                    onChange={(e) => setForm((f) => ({ ...f, saat: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="drawer-footer">
          <button type="button" className="btn-modern btn-secondary" disabled={saving} onClick={closeForm}>
            İptal
          </button>
          <button type="button" className="btn-modern btn-primary" disabled={saving} onClick={submitForm}>
            {saving ? "Kaydediliyor…" : editing ? "Değişiklikleri Kaydet" : "Notu Kaydet"}
          </button>
        </div>
      </div>

      {/* Geçmiş drawer */}
      <div
        className={`drawer-overlay ${historyNote && !formOpen ? "drawer-overlay-visible" : ""}`}
        onClick={closeHistory}
      />
      <div className={`drawer drawer-right ${historyNote && !formOpen ? "drawer-open" : ""}`}>
        <div className="drawer-header">
          <h3>İşlem Geçmişi</h3>
          <button type="button" className="drawer-close-btn" onClick={closeHistory} aria-label="Kapat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="drawer-body">
          {historyNote && (
            <>
              <div className="notlar-history-summary">
                <span className="notlar-kategori" style={{
                  color: NOT_KATEGORI_COLORS[historyNote.kategori] || "#64748b",
                  background: `${NOT_KATEGORI_COLORS[historyNote.kategori] || "#64748b"}14`,
                }}>
                  {historyNote.kategori_label}
                </span>
                <h4>{historyNote.baslik}</h4>
              </div>
              {historyLoading && <p className="notlar-muted">Yükleniyor…</p>}
              {!historyLoading && history.length === 0 && (
                <p className="notlar-muted">Kayıtlı işlem yok.</p>
              )}
              <ul className="notlar-history">
                {history.map((h) => (
                  <li key={h.id}>
                    <div className="notlar-history-meta">
                      <strong>{formatDateTime(h.performed_at)}</strong>
                      <span className={`notlar-history-action notlar-history-action--${h.action}`}>
                        {h.action_label}
                      </span>
                    </div>
                    <p>{h.description || h.action_label}</p>
                    {h.performed_by_name && (
                      <span className="notlar-history-actor">{h.performed_by_name}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="drawer-footer">
          <button type="button" className="btn-modern btn-secondary" onClick={closeHistory}>
            Kapat
          </button>
        </div>
      </div>

      {/* Silme onayı */}
      {deleteTarget && (
        <div className="notlar-confirm-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="notlar-confirm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="notlar-confirm-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3>Notu silmek istediğinize emin misiniz?</h3>
            <p>&ldquo;{deleteTarget.baslik}&rdquo;</p>
            <div className="notlar-confirm-actions">
              <button type="button" className="btn-modern btn-secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Vazgeç
              </button>
              <button type="button" className="btn-modern btn-primary" disabled={deleting} onClick={confirmDelete}>
                {deleting ? "Siliniyor…" : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .notlar-tab { display:flex; flex-direction:column; gap:20px; min-width:0; }
        .notlar-count {
          margin-left: 6px;
          font-size: 12px;
          font-weight: 700;
          color: ${KURUM_COLOR};
          background: rgba(2,98,167,.08);
          border-radius: 999px;
          padding: 2px 8px;
        }
        .notlar-body { padding: 20px 24px 24px; }
        .notlar-filters {
          display: grid;
          grid-template-columns: minmax(220px, 1.6fr) 150px 150px;
          gap: 10px;
          margin-bottom: 14px;
        }
        .notlar-search-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .notlar-search-wrap svg {
          position: absolute;
          left: 12px;
          color: #94a3b8;
          pointer-events: none;
        }
        .notlar-search-wrap input { padding-left: 36px !important; }
        .notlar-filters input {
          width: 100%;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 13px;
          background: #fff;
          color: #0f172a;
          outline: none;
        }
        .notlar-filters input:focus {
          border-color: ${KURUM_COLOR};
          box-shadow: 0 0 0 3px rgba(2,98,167,.12);
        }
        .notlar-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 20px;
        }
        .notlar-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #475569;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .notlar-chip:hover { border-color: #cbd5e1; background: #f8fafc; }
        .notlar-chip.active {
          background: #0f172a;
          border-color: #0f172a;
          color: #fff;
        }
        .notlar-chip-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .notlar-chip.active .notlar-chip-dot { background: #fff !important; }
        .notlar-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 56px 16px;
          color: #64748b;
        }
        .notlar-empty p { margin: 0; font-size: 14px; }
        .notlar-timeline { display: flex; flex-direction: column; gap: 22px; }
        .notlar-day-label {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          text-transform: capitalize;
          margin-bottom: 12px;
        }
        .notlar-item {
          display: grid;
          grid-template-columns: 48px 14px 1fr;
          gap: 0 12px;
          position: relative;
          margin-bottom: 12px;
        }
        .notlar-item:not(:last-child)::before {
          content: "";
          position: absolute;
          left: 53px;
          top: 18px;
          bottom: -12px;
          width: 2px;
          background: #e2e8f0;
        }
        .notlar-item-time {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          padding-top: 2px;
          text-align: right;
        }
        .notlar-item-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-top: 5px;
          z-index: 1;
          justify-self: center;
        }
        .notlar-item-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 16px;
          min-width: 0;
        }
        .notlar-item--contract .notlar-item-card {
          background: linear-gradient(135deg, #faf5ff 0%, #f8fafc 100%);
          border-color: #e9d5ff;
        }
        .notlar-item-top {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .notlar-kategori {
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 999px;
        }
        .notlar-source {
          font-size: 11px;
          font-weight: 600;
          color: #6b21a8;
          background: #f3e8ff;
          border-radius: 6px;
          padding: 3px 8px;
        }
        .notlar-soz-no {
          font-size: 11px;
          color: #7c3aed;
          font-weight: 600;
        }
        .notlar-item-card h4 {
          margin: 0 0 6px;
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
        }
        .notlar-item-card p {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: #475569;
          white-space: pre-wrap;
        }
        .notlar-item-bottom {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 8px;
          font-size: 12px;
          color: #64748b;
        }
        .notlar-actions { display: flex; gap: 12px; }
        .notlar-actions button {
          background: none;
          border: none;
          padding: 0;
          font-size: 12px;
          font-weight: 600;
          color: ${KURUM_COLOR};
          cursor: pointer;
        }
        .notlar-actions button.danger { color: #dc2626; }

        /* Form drawer content */
        .notlar-form-alert {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .notlar-form {
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .notlar-form-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .notlar-form-section-title {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: .04em;
          text-transform: uppercase;
          color: #64748b;
        }
        .notlar-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .notlar-field label {
          font-size: 13px;
          font-weight: 500;
          color: #172b4c;
        }
        .notlar-field .req { color: #dc2626; }
        .notlar-field-hint {
          margin: 0;
          font-size: 12px;
          color: #64748b;
        }
        .notlar-field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .notlar-input {
          width: 100%;
          padding: 11px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 14px;
          color: #172b4c;
          background: #fff;
          transition: border-color .2s, box-shadow .2s;
        }
        .notlar-input:focus {
          outline: none;
          border-color: ${KURUM_COLOR};
          box-shadow: 0 0 0 3px rgba(2, 98, 167, 0.12);
        }
        .notlar-textarea {
          resize: vertical;
          min-height: 140px;
          line-height: 1.5;
          font-family: inherit;
        }
        .notlar-kategori-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .notlar-kategori-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #fff;
          color: #334155;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          text-align: left;
          transition: border-color .15s, background .15s, box-shadow .15s;
        }
        .notlar-kategori-option:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        .notlar-kategori-option-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .notlar-history-summary {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 18px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e2e8f0;
        }
        .notlar-history-summary h4 {
          margin: 0;
          font-size: 16px;
          color: #0f172a;
        }
        .notlar-muted { color: #64748b; font-size: 14px; }
        .notlar-history {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .notlar-history li {
          padding: 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
        }
        .notlar-history-meta {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }
        .notlar-history-meta strong {
          font-size: 12px;
          color: #0f172a;
        }
        .notlar-history-action {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 999px;
          background: #e2e8f0;
          color: #475569;
        }
        .notlar-history-action--created { background: #dcfce7; color: #166534; }
        .notlar-history-action--updated { background: #dbeafe; color: #1e40af; }
        .notlar-history-action--deleted { background: #fee2e2; color: #991b1b; }
        .notlar-history li p {
          margin: 0;
          font-size: 13px;
          color: #334155;
          line-height: 1.45;
        }
        .notlar-history-actor {
          display: inline-block;
          margin-top: 8px;
          font-size: 12px;
          color: #64748b;
        }

        .notlar-confirm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1100;
          padding: 16px;
        }
        .notlar-confirm {
          width: min(420px, 100%);
          background: #fff;
          border-radius: 16px;
          padding: 28px 24px 22px;
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
          text-align: center;
        }
        .notlar-confirm-icon {
          width: 56px;
          height: 56px;
          margin: 0 auto 14px;
          border-radius: 50%;
          background: #fef2f2;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .notlar-confirm h3 {
          margin: 0 0 8px;
          font-size: 16px;
          color: #0f172a;
        }
        .notlar-confirm p {
          margin: 0 0 20px;
          font-size: 14px;
          color: #64748b;
          font-weight: 600;
        }
        .notlar-confirm-actions {
          display: flex;
          justify-content: center;
          gap: 10px;
        }

        @media (max-width: 720px) {
          .notlar-filters { grid-template-columns: 1fr 1fr; }
          .notlar-search-wrap { grid-column: 1 / -1; }
          .notlar-item { grid-template-columns: 40px 12px 1fr; }
          .notlar-field-row,
          .notlar-kategori-grid { grid-template-columns: 1fr; }
          .notlar-body { padding: 16px; }
        }
      `}</style>
    </div>
  );
}
