"use client";

import { useCallback, useId, useRef, useState } from "react";
import { cariHesapService } from "../../services/cari-hesap-api";
import { FinansHttpError } from "../../services/finans-http";
import type { CariDosya } from "../../types/cari-hesap-types";
import "./cari-dosya.css";

const DOSYA_TURLERI = [
  { value: "sozlesme", label: "Sözleşme", icon: "📄" },
  { value: "fatura", label: "Fatura", icon: "🧾" },
  { value: "teklif", label: "Teklif", icon: "📋" },
  { value: "dekont", label: "Dekont", icon: "💳" },
  { value: "diger", label: "Diğer", icon: "📎" },
] as const;

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.rar";

function fmtBoyut(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fmtTarih(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function turIcon(tur: string) {
  return DOSYA_TURLERI.find((t) => t.value === tur)?.icon ?? "📎";
}

function turLabel(tur: string) {
  return DOSYA_TURLERI.find((t) => t.value === tur)?.label ?? tur;
}

/* ─── Upload Form ─── */

function CariDosyaUploadForm({
  cariHesapId,
  onClose,
  onSuccess,
  onError,
}: {
  cariHesapId: number;
  onClose: () => void;
  onSuccess: (msg?: string) => void;
  onError: (msg: string) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dosya, setDosya] = useState<File | null>(null);
  const [dosyaAdi, setDosyaAdi] = useState("");
  const [dosyaTuru, setDosyaTuru] = useState("diger");
  const [aciklama, setAciklama] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const pickFile = (f: File | null) => {
    setSubmitError(null);
    setDosya(f);
    if (f) {
      setDosyaAdi(f.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }, []);

  const handleSubmit = async () => {
    if (!dosya) {
      setSubmitError("Lütfen bir dosya seçin");
      return;
    }
    if (!dosyaAdi.trim()) {
      setSubmitError("Dosya adı zorunludur");
      return;
    }
    const formData = new FormData();
    formData.append("dosya", dosya);
    formData.append("dosya_adi", dosyaAdi.trim());
    formData.append("dosya_turu", dosyaTuru);
    formData.append("aciklama", aciklama.trim());
    setLoading(true);
    setSubmitError(null);
    try {
      await cariHesapService.dosyaYukle(cariHesapId, formData);
      onSuccess("Dosya başarıyla yüklendi");
    } catch (e: unknown) {
      const msg = e instanceof FinansHttpError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Dosya yüklenirken hata oluştu";
      setSubmitError(msg);
      onError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cdf-upload-card">
      <div className="cdf-upload-head">
        <h4 className="cdf-upload-title">
          <span className="cdf-upload-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          Yeni Dosya Yükle
        </h4>
        <button type="button" className="cdf-close-btn" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
      </div>

      {submitError && (
        <div className="cdf-error-banner" role="alert">
          {submitError}
        </div>
      )}

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="cdf-file-input-hidden"
        onChange={(e) => pickFile(e.target.files?.[0] || null)}
      />

      <div
        className={`cdf-dropzone${dragOver ? " is-dragover" : ""}${dosya ? " has-file" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {dosya ? (
          <div className="cdf-file-preview">
            <div className="cdf-file-preview-icon">
              <span style={{ fontSize: 20 }}>{turIcon(dosyaTuru)}</span>
            </div>
            <div className="cdf-file-preview-info">
              <div className="cdf-file-preview-name">{dosya.name}</div>
              <div className="cdf-file-preview-meta">{fmtBoyut(dosya.size)}</div>
            </div>
            <button
              type="button"
              className="cdf-file-remove"
              onClick={() => {
                setDosya(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Kaldır
            </button>
            <label htmlFor={inputId} className="cdf-pick-btn cdf-pick-btn--sm">
              Değiştir
            </label>
          </div>
        ) : (
          <>
            <div className="cdf-dropzone-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="cdf-dropzone-title">Dosyayı sürükleyip bırakın</div>
            <div className="cdf-dropzone-hint">PDF, Word, Excel, görsel veya arşiv</div>
            <label htmlFor={inputId} className="cdf-pick-btn">
              Dosya Seç
            </label>
          </>
        )}
      </div>

      <div className="cdf-form-grid">
        <div className="cdf-field cdf-field--full">
          <label className="cdf-label">Dosya Adı <span>*</span></label>
          <input
            type="text"
            className="cdf-input"
            value={dosyaAdi}
            onChange={(e) => setDosyaAdi(e.target.value)}
            placeholder="Görünecek dosya adı"
          />
        </div>
        <div className="cdf-field cdf-field--full">
          <label className="cdf-label">Açıklama</label>
          <textarea
            className="cdf-textarea"
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder="Belge hakkında kısa not (ör. dönem, sözleşme no, fatura detayı…)"
            rows={3}
          />
        </div>
        <div className="cdf-field cdf-field--full">
          <label className="cdf-label">Dosya Türü</label>
          <div className="cdf-type-chips">
            {DOSYA_TURLERI.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`cdf-type-chip${dosyaTuru === t.value ? " is-active" : ""}`}
                onClick={() => setDosyaTuru(t.value)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="cdf-actions">
        <button type="button" className="cdf-btn cdf-btn--ghost" onClick={onClose}>
          Vazgeç
        </button>
        <button
          type="button"
          className="cdf-btn cdf-btn--primary"
          onClick={handleSubmit}
          disabled={loading || !dosya}
        >
          {loading ? "Yükleniyor…" : "Dosyayı Yükle"}
        </button>
      </div>
    </div>
  );
}

/* ─── File Card ─── */

function CariDosyaCard({
  dosya,
  onDelete,
}: {
  dosya: CariDosya;
  onDelete: () => void;
}) {
  const iconClass = `cdf-file-card-icon cdf-file-card-icon--${dosya.dosya_turu}`;

  return (
    <div className="cdf-file-card">
      <div className={iconClass}>{turIcon(dosya.dosya_turu)}</div>
      <div className="cdf-file-card-body">
        <div className="cdf-file-card-top">
          {dosya.dosya_url ? (
            <a
              href={dosya.dosya_url}
              target="_blank"
              rel="noopener noreferrer"
              className="cdf-file-card-name"
            >
              {dosya.dosya_adi}
            </a>
          ) : (
            <span className="cdf-file-card-name">{dosya.dosya_adi}</span>
          )}
          <div className="cdf-file-card-actions">
            {dosya.dosya_url && (
              <a
                href={dosya.dosya_url}
                target="_blank"
                rel="noopener noreferrer"
                className="cdf-icon-btn"
                title="İndir / Görüntüle"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </a>
            )}
            <button type="button" className="cdf-icon-btn cdf-icon-btn--danger" onClick={onDelete} title="Sil">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
        <div className="cdf-file-card-meta">
          <span className="cdf-file-card-badge">{dosya.dosya_turu_display || turLabel(dosya.dosya_turu)}</span>
          <span>{dosya.dosya_boyutu_fmt}</span>
          <span>•</span>
          <span>{fmtTarih(dosya.created_at)}</span>
          {dosya.yukleyen_adi && (
            <>
              <span>•</span>
              <span>{dosya.yukleyen_adi}</span>
            </>
          )}
        </div>
        <div className="cdf-file-card-note">
          <span className="cdf-file-card-note-label">Açıklama</span>
          <p className="cdf-file-card-note-text">
            {dosya.aciklama?.trim() ? dosya.aciklama : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Panel ─── */

export default function CariDosyaPanel({
  cariHesapId,
  dosyalar,
  loading,
  showUpload,
  onShowUpload,
  onHideUpload,
  onRefresh,
  onSuccess,
  onError,
}: {
  cariHesapId: number;
  dosyalar: CariDosya[];
  loading: boolean;
  showUpload: boolean;
  onShowUpload: () => void;
  onHideUpload: () => void;
  onRefresh: () => void;
  onSuccess: (msg?: string) => void;
  onError: (msg: string) => void;
}) {
  const handleDelete = async (dosyaId: number) => {
    if (!confirm("Bu dosyayı silmek istediğinize emin misiniz?")) return;
    try {
      await cariHesapService.dosyaSil(cariHesapId, dosyaId);
      onSuccess("Dosya silindi");
      onRefresh();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Dosya silinemedi");
    }
  };

  if (loading && dosyalar.length === 0 && !showUpload) {
    return (
      <div className="cdf-loading">
        <div className="loading-spinner" />
        <span>Dosyalar yükleniyor…</span>
      </div>
    );
  }

  return (
    <div className="cdf-panel">
      {showUpload && (
        <CariDosyaUploadForm
          cariHesapId={cariHesapId}
          onClose={onHideUpload}
          onSuccess={(msg) => {
            onSuccess(msg);
            onHideUpload();
            onRefresh();
          }}
          onError={onError}
        />
      )}

      {!showUpload && dosyalar.length === 0 && (
        <div className="cdf-empty">
          <div className="cdf-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h4>Henüz dosya yok</h4>
          <p>Sözleşme, fatura, dekont ve diğer belgeleri buradan yükleyip arşivleyebilirsiniz.</p>
          <button type="button" className="cdf-btn cdf-btn--primary" style={{ marginTop: 16 }} onClick={onShowUpload}>
            İlk Dosyayı Yükle
          </button>
        </div>
      )}

      {dosyalar.length > 0 && (
        <div className={`cdf-list${loading ? " is-refreshing" : ""}`}>
          {loading && <div className="cdf-list-overlay"><div className="loading-spinner" /></div>}
          {dosyalar.map((d) => (
            <CariDosyaCard key={d.id} dosya={d} onDelete={() => handleDelete(d.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
