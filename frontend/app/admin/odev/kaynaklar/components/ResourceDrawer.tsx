// ========== Drawer (Book/Unit/Topic/Content Forms) ==========
"use client";
import React, { useEffect } from "react";
import type { BookFormData, UnitFormData, TopicFormData, ContentFormData, Ders, SinifSeviyesi, BookType } from "../types";

const CURRENT_YEAR = new Date().getFullYear();

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  mode: "book" | "unit" | "topic" | "content";
  editingId: number | null;
  loading: boolean;
  error: string | null;
  onSave: () => void;
  bookForm: BookFormData;
  setBookForm: (f: BookFormData) => void;
  unitForm: UnitFormData;
  setUnitForm: (f: UnitFormData) => void;
  topicForm: TopicFormData;
  setTopicForm: (f: TopicFormData) => void;
  contentForm: ContentFormData;
  setContentForm: (f: ContentFormData) => void;
  dersler: Ders[];
  sinifSeviyeleri: SinifSeviyesi[];
  bookTypes: BookType[];
}

function YearStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const year = parseInt(value, 10) || CURRENT_YEAR;
  return (
    <div className="kk-year-stepper">
      <button type="button" aria-label="Önceki yıl" onClick={() => onChange(String(year - 1))}>−</button>
      <span>{year}</span>
      <button type="button" aria-label="Sonraki yıl" onClick={() => onChange(String(year + 1))}>+</button>
    </div>
  );
}

export function ResourceDrawer(props: DrawerProps) {
  const {
    open, onClose, mode, editingId, loading, error, onSave,
    bookForm, setBookForm, unitForm, setUnitForm,
    topicForm, setTopicForm, contentForm, setContentForm,
    dersler, sinifSeviyeleri, bookTypes,
  } = props;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const title = {
    book: editingId ? "Kitap Düzenle" : "Yeni Kitap",
    unit: unitForm.id ? "Ünite Düzenle" : "Yeni Ünite",
    topic: topicForm.id ? "Konu Düzenle" : "Yeni Konu",
    content: contentForm.id ? "İçerik Düzenle" : "Yeni İçerik",
  }[mode];

  const toggleSinif = (id: number) => {
    const selected = bookForm.sinif_seviyeleri.includes(id);
    const next = selected
      ? bookForm.sinif_seviyeleri.filter((x) => x !== id)
      : [...bookForm.sinif_seviyeleri, id];
    setBookForm({ ...bookForm, sinif_seviyeleri: next });
  };

  return (
    <>
      <div className="kk-drawer-backdrop" onClick={onClose} />
      <div className="kk-drawer">
        <div className="kk-drawer-header">
          <h3>{title}</h3>
          <button type="button" onClick={onClose} className="kk-btn" style={{ background: "none", fontSize: 24, padding: 0 }}>×</button>
        </div>

        <div className="kk-drawer-body">
          {error && <div className="kk-error">{error}</div>}

          {mode === "book" && (
            <div className="kk-form-stack">
              <div className="kk-field">
                <label className="kk-label">Kitap Adı *</label>
                <input type="text" className="kk-input" value={bookForm.ad} onChange={(e) => setBookForm({ ...bookForm, ad: e.target.value })} />
              </div>

              <div className="kk-form-grid">
                <div className="kk-field">
                  <label className="kk-label">Kitap Türü *</label>
                  <select className="kk-select" value={bookForm.book_type} onChange={(e) => setBookForm({ ...bookForm, book_type: e.target.value })}>
                    <option value="">Seçiniz</option>
                    {bookTypes.map((bt) => <option key={bt.id} value={bt.id}>{bt.ikon} {bt.ad}</option>)}
                  </select>
                </div>
                <div className="kk-field">
                  <label className="kk-label">Ders *</label>
                  <select className="kk-select" value={bookForm.ders} onChange={(e) => setBookForm({ ...bookForm, ders: e.target.value })}>
                    <option value="">Seçiniz</option>
                    {dersler.map((d) => <option key={d.id} value={d.id}>{d.ad}</option>)}
                  </select>
                </div>
              </div>

              <div className="kk-field">
                <label className="kk-label">Sınıf Seviyesi * <span className="kk-hint">(birden fazla seçilebilir)</span></label>
                <div className="kk-chip-grid">
                  {sinifSeviyeleri.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`kk-chip${bookForm.sinif_seviyeleri.includes(s.id) ? " is-selected" : ""}`}
                      onClick={() => toggleSinif(s.id)}
                    >
                      {s.ad}
                    </button>
                  ))}
                </div>
              </div>

              <div className="kk-form-grid">
                <div className="kk-field">
                  <label className="kk-label">Yayınevi</label>
                  <input type="text" className="kk-input" value={bookForm.yayinevi} onChange={(e) => setBookForm({ ...bookForm, yayinevi: e.target.value })} />
                </div>
                <div className="kk-field">
                  <label className="kk-label">Yazar</label>
                  <input type="text" className="kk-input" value={bookForm.yazar} onChange={(e) => setBookForm({ ...bookForm, yazar: e.target.value })} />
                </div>
              </div>

              <div className="kk-form-grid">
                <div className="kk-field">
                  <label className="kk-label">Yayın Yılı</label>
                  <YearStepper
                    value={bookForm.yayin_yili || String(CURRENT_YEAR)}
                    onChange={(y) => setBookForm({ ...bookForm, yayin_yili: y })}
                  />
                </div>
                <div className="kk-field">
                  <label className="kk-label">Toplam Sayfa</label>
                  <input type="number" className="kk-input" value={bookForm.toplam_sayfa} onChange={(e) => setBookForm({ ...bookForm, toplam_sayfa: e.target.value })} />
                </div>
              </div>

              <div className="kk-difficulty-box">
                <label className="kk-label">Zorluk Seviyesi (1-10)</label>
                <div className="kk-form-grid">
                  <div className="kk-field">
                    <label className="kk-hint">Minimum</label>
                    <input type="number" min={1} max={10} className="kk-input" value={bookForm.zorluk_min} onChange={(e) => setBookForm({ ...bookForm, zorluk_min: e.target.value })} placeholder="1" />
                  </div>
                  <div className="kk-field">
                    <label className="kk-hint">Maksimum</label>
                    <input type="number" min={1} max={10} className="kk-input" value={bookForm.zorluk_max} onChange={(e) => setBookForm({ ...bookForm, zorluk_max: e.target.value })} placeholder="10" />
                  </div>
                </div>
              </div>

              <div className="kk-field">
                <label className="kk-label">Açıklama</label>
                <textarea className="kk-input" value={bookForm.aciklama} onChange={(e) => setBookForm({ ...bookForm, aciklama: e.target.value })} rows={3} style={{ resize: "vertical" }} />
              </div>
            </div>
          )}

          {mode === "unit" && (
            <div className="kk-form-stack">
              <div className="kk-form-grid">
                <div className="kk-field" style={{ gridColumn: "1 / -1" }}>
                  <label className="kk-label">Ünite Adı *</label>
                  <input type="text" className="kk-input" value={unitForm.ad} onChange={(e) => setUnitForm({ ...unitForm, ad: e.target.value })} />
                </div>
                <div className="kk-field">
                  <label className="kk-label">Sıra</label>
                  <input type="number" className="kk-input" value={unitForm.sira} onChange={(e) => setUnitForm({ ...unitForm, sira: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="kk-field">
                <label className="kk-label">Açıklama</label>
                <textarea className="kk-input" value={unitForm.aciklama} onChange={(e) => setUnitForm({ ...unitForm, aciklama: e.target.value })} rows={3} style={{ resize: "vertical" }} />
              </div>
            </div>
          )}

          {mode === "topic" && (
            <div className="kk-form-stack">
              <div className="kk-form-grid">
                <div className="kk-field" style={{ gridColumn: "1 / -1" }}>
                  <label className="kk-label">Konu Adı *</label>
                  <input type="text" className="kk-input" value={topicForm.ad} onChange={(e) => setTopicForm({ ...topicForm, ad: e.target.value })} />
                </div>
                <div className="kk-field">
                  <label className="kk-label">Sıra</label>
                  <input type="number" className="kk-input" value={topicForm.sira} onChange={(e) => setTopicForm({ ...topicForm, sira: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="kk-field">
                <label className="kk-label">Açıklama</label>
                <textarea className="kk-input" value={topicForm.aciklama} onChange={(e) => setTopicForm({ ...topicForm, aciklama: e.target.value })} rows={3} style={{ resize: "vertical" }} />
              </div>
            </div>
          )}

          {mode === "content" && (
            <div className="kk-form-stack">
              <div className="kk-field">
                <label className="kk-label">İçerik Adı *</label>
                <input type="text" className="kk-input" value={contentForm.ad} onChange={(e) => setContentForm({ ...contentForm, ad: e.target.value })} />
              </div>
              <div className="kk-form-grid">
                <div className="kk-field">
                  <label className="kk-label">İçerik Türü *</label>
                  <select className="kk-select" value={contentForm.content_type} onChange={(e) => setContentForm({ ...contentForm, content_type: e.target.value })}>
                    <option value="CUSTOM">Özel İçerik</option>
                    <option value="TEST_SET">Test Seti</option>
                    <option value="SUBJECT_SECTION">Konu Anlatımı</option>
                    <option value="PAGE_RANGE">Sayfa Aralığı</option>
                    <option value="EXERCISE">Alıştırma</option>
                    <option value="VIDEO">Video</option>
                  </select>
                </div>
                <div className="kk-field">
                  <label className="kk-label">Sıra</label>
                  <input type="number" className="kk-input" value={contentForm.sira} onChange={(e) => setContentForm({ ...contentForm, sira: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              {contentForm.content_type === "TEST_SET" && (
                <div className="kk-form-grid">
                  <div className="kk-field">
                    <label className="kk-label">Soru Sayısı *</label>
                    <input type="number" className="kk-input" value={contentForm.question_count} onChange={(e) => setContentForm({ ...contentForm, question_count: e.target.value })} />
                  </div>
                  <div className="kk-field">
                    <label className="kk-label">Zorluk</label>
                    <select className="kk-select" value={contentForm.difficulty} onChange={(e) => setContentForm({ ...contentForm, difficulty: e.target.value })}>
                      <option value="EASY">Kolay</option>
                      <option value="MEDIUM">Orta</option>
                      <option value="HARD">Zor</option>
                      <option value="MIXED">Karışık</option>
                    </select>
                  </div>
                </div>
              )}
              {contentForm.content_type === "PAGE_RANGE" && (
                <div className="kk-form-grid">
                  <div className="kk-field">
                    <label className="kk-label">Başlangıç Sayfa</label>
                    <input type="number" className="kk-input" value={contentForm.page_start} onChange={(e) => setContentForm({ ...contentForm, page_start: e.target.value })} />
                  </div>
                  <div className="kk-field">
                    <label className="kk-label">Bitiş Sayfa</label>
                    <input type="number" className="kk-input" value={contentForm.page_end} onChange={(e) => setContentForm({ ...contentForm, page_end: e.target.value })} />
                  </div>
                </div>
              )}
              {contentForm.content_type === "SUBJECT_SECTION" && (
                <div className="kk-field">
                  <label className="kk-label">Tahmini Süre (dk)</label>
                  <input type="number" className="kk-input" value={contentForm.estimated_minutes} onChange={(e) => setContentForm({ ...contentForm, estimated_minutes: e.target.value })} />
                </div>
              )}
              {contentForm.content_type === "VIDEO" && (
                <div className="kk-field">
                  <label className="kk-label">Video URL *</label>
                  <input type="url" className="kk-input" value={contentForm.video_url} onChange={(e) => setContentForm({ ...contentForm, video_url: e.target.value })} placeholder="https://..." />
                </div>
              )}
              <div className="kk-field">
                <label className="kk-label">Açıklama</label>
                <textarea className="kk-input" value={contentForm.aciklama} onChange={(e) => setContentForm({ ...contentForm, aciklama: e.target.value })} rows={3} style={{ resize: "vertical" }} />
              </div>
            </div>
          )}
        </div>

        <div className="kk-drawer-footer">
          <button type="button" className="kk-btn" style={{ background: "#fff", border: "1px solid #e2e8f0" }} onClick={onClose}>İptal</button>
          <button type="button" className="kk-btn kk-btn-primary" style={{ background: "#0061a6", color: "#fff" }} onClick={onSave} disabled={loading}>
            {loading ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </>
  );
}
