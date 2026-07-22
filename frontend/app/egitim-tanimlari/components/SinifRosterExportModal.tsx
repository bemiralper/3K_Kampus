"use client";

import { useEffect, useMemo, useState } from "react";
import "@/app/ogrenciler/ogrenci-list.css";
import { AktifDonem, Sinif, SinifSeviyesi } from "../types";
import {
  DEFAULT_ROSTER_EXPORT_KEYS,
  ROSTER_EXPORT_COLUMN_OPTIONS,
  runSinifRosterExport,
  type SinifRosterScope,
} from "@/lib/sinif-roster-export";
import { useKurum } from "@/lib/contexts/KurumContext";

type ExportFormat = "csv" | "xlsx" | "pdf";

interface SinifRosterExportModalProps {
  open: boolean;
  onClose: () => void;
  siniflar: Sinif[];
  sinifSeviyeleri: SinifSeviyesi[];
  aktifDonem: AktifDonem | null;
  initialScope?: SinifRosterScope;
  initialSinifId?: number;
  initialSeviyeId?: number;
}

const FORMAT_OPTIONS: {
  id: ExportFormat;
  label: string;
  desc: string;
  ext: string;
}[] = [
  { id: "xlsx", label: "Excel", desc: "Her sınıf ayrı tablo bloğu", ext: ".xlsx" },
  { id: "csv", label: "CSV", desc: "Excel uyumlu noktalı virgül", ext: ".csv" },
  { id: "pdf", label: "PDF", desc: "Yazdırılabilir sınıf listeleri", ext: ".pdf" },
];

const SCOPE_OPTIONS: {
  id: SinifRosterScope;
  label: string;
  desc: string;
}[] = [
  { id: "all", label: "Tüm sınıflar", desc: "Şubedeki tüm aktif sınıflar" },
  { id: "seviye", label: "Seviye", desc: "Örn. tüm 11. sınıflar" },
  { id: "sinif", label: "Tek sınıf", desc: "Belirli bir sınıf listesi" },
  { id: "custom", label: "Seçili sınıflar", desc: "İstediğiniz sınıfları işaretleyin" },
];

export default function SinifRosterExportModal({
  open,
  onClose,
  siniflar,
  sinifSeviyeleri,
  aktifDonem,
  initialScope = "all",
  initialSinifId,
  initialSeviyeId,
}: SinifRosterExportModalProps) {
  const { activeKurum, activeSube } = useKurum();
  const [scope, setScope] = useState<SinifRosterScope>(initialScope);
  const [sinifId, setSinifId] = useState<number | "">(initialSinifId ?? "");
  const [seviyeId, setSeviyeId] = useState<number | "">(initialSeviyeId ?? "");
  const [selectedSinifIds, setSelectedSinifIds] = useState<number[]>([]);
  const [sinifSearch, setSinifSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setScope(initialScope);
    setSinifId(initialSinifId ?? "");
    setSeviyeId(initialSeviyeId ?? "");
    setSelectedSinifIds([]);
    setSinifSearch("");
    setSelectedKeys([...DEFAULT_ROSTER_EXPORT_KEYS]);
    setFormat("xlsx");
    setError(null);
  }, [open, initialScope, initialSinifId, initialSeviyeId]);

  const filteredSiniflarForSeviye = useMemo(() => {
    if (!seviyeId) return [];
    return siniflar.filter((s) => s.sinif_seviyesi?.id === Number(seviyeId));
  }, [siniflar, seviyeId]);

  const siniflarBySeviye = useMemo(() => {
    const q = sinifSearch.trim().toLowerCase();
    const filtered = q
      ? siniflar.filter(
          (s) =>
            s.ad.toLowerCase().includes(q) ||
            s.sinif_seviyesi?.ad?.toLowerCase().includes(q),
        )
      : siniflar;

    const groups = new Map<string, Sinif[]>();
    for (const s of filtered) {
      const key = s.sinif_seviyesi?.ad || "Diğer";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return groups;
  }, [siniflar, sinifSearch]);

  const columnOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedKeys.forEach((key, index) => map.set(key, index + 1));
    return map;
  }, [selectedKeys]);

  const orderedColumnLabels = useMemo(
    () =>
      selectedKeys.map(
        (key) => ROSTER_EXPORT_COLUMN_OPTIONS.find((c) => c.key === key)?.label || key,
      ),
    [selectedKeys],
  );

  const scopeSummary = useMemo(() => {
    if (scope === "all") return `${siniflar.length} sınıf`;
    if (scope === "seviye") {
      if (!seviyeId) return "Seviye seçin";
      const seviye = sinifSeviyeleri.find((s) => s.id === Number(seviyeId));
      return seviye
        ? `${seviye.ad} · ${filteredSiniflarForSeviye.length} sınıf`
        : "Seviye seçin";
    }
    if (scope === "sinif") {
      if (!sinifId) return "Sınıf seçin";
      const sinif = siniflar.find((s) => s.id === Number(sinifId));
      return sinif ? sinif.ad : "Sınıf seçin";
    }
    if (!selectedSinifIds.length) return "Sınıf seçin";
    return `${selectedSinifIds.length} sınıf seçildi`;
  }, [
    scope,
    siniflar,
    sinifId,
    seviyeId,
    selectedSinifIds,
    sinifSeviyeleri,
    filteredSiniflarForSeviye,
  ]);

  const formatMeta = FORMAT_OPTIONS.find((f) => f.id === format)!;

  const toggleSinif = (id: number) => {
    setSelectedSinifIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const selectAllColumns = () =>
    setSelectedKeys(ROSTER_EXPORT_COLUMN_OPTIONS.map((c) => c.key));
  const clearColumns = () => setSelectedKeys([]);

  const validateScope = (): string | null => {
    if (!aktifDonem) return "Aktif dönem bulunamadı";
    if (scope === "sinif" && !sinifId) return "Lütfen bir sınıf seçin";
    if (scope === "seviye" && !seviyeId) return "Lütfen bir seviye seçin";
    if (scope === "custom" && !selectedSinifIds.length) return "En az bir sınıf seçin";
    if (selectedKeys.length === 0) return "En az bir sütun seçin";
    return null;
  };

  const handleExport = async () => {
    const validationError = validateScope();
    if (validationError) {
      setError(validationError);
      return;
    }

    setExporting(true);
    setError(null);
    try {
      await runSinifRosterExport(
        {
          scope,
          term_id: aktifDonem!.id,
          sinif_id: scope === "sinif" && sinifId ? Number(sinifId) : undefined,
          sinif_seviyesi_id: scope === "seviye" && seviyeId ? Number(seviyeId) : undefined,
          sinif_ids: scope === "custom" ? selectedSinifIds : undefined,
          columns: selectedKeys,
        },
        format,
        {
          kurumAd: activeKurum?.ad || "Kurum",
          subeAd: activeSube?.ad,
          logoUrl: activeKurum?.app_logo_url || activeKurum?.login_logo_url,
          temaRengi: activeKurum?.tema_rengi,
        },
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dışa aktarma başarısız");
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="ogrenci-drawer-overlay" onClick={onClose}>
      <div
        className="ogrenci-export-modal ogrenci-export-modal--wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="sinif-roster-export-title"
      >
        <div className="ogrenci-filter-drawer-header">
          <div>
            <h3 id="sinif-roster-export-title">Sınıf Öğrenci Listeleri</h3>
            <p className="ogrenci-filter-drawer-subtitle">
              {aktifDonem
                ? `${aktifDonem.name} · Her sınıf ayrı tablo olarak dışa aktarılır`
                : "Aktif dönem bulunamadı — dışa aktarma yapılamaz"}
            </p>
          </div>
          <button
            type="button"
            className="ogrenci-drawer-close"
            onClick={onClose}
            aria-label="Kapat"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ogrenci-filter-drawer-body">
          <div className="ogrenci-export-layout">
            <section className="ogrenci-export-section">
              <h4 className="ogrenci-filter-subsection-title">Kapsam</h4>
              <div
                className="ogrenci-export-format-cards"
                style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
              >
                {SCOPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`ogrenci-export-format-card${scope === opt.id ? " active" : ""}`}
                    onClick={() => setScope(opt.id)}
                  >
                    <span className="ogrenci-export-format-label">{opt.label}</span>
                    <span className="ogrenci-export-format-desc">{opt.desc}</span>
                  </button>
                ))}
              </div>

              {scope === "sinif" && (
                <div className="ogrenci-filter-subsection" style={{ marginTop: 16 }}>
                  <label className="ogrenci-filter-subsection-title" htmlFor="roster-sinif-select">
                    Sınıf
                  </label>
                  <div className="ogrenci-filter-select-wrap">
                    <select
                      id="roster-sinif-select"
                      className="ogrenci-filter-select"
                      value={sinifId}
                      onChange={(e) => setSinifId(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">Sınıf seçin…</option>
                      {siniflar.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.ad}
                          {s.sinif_seviyesi ? ` (${s.sinif_seviyesi.ad})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {scope === "seviye" && (
                <div className="ogrenci-filter-subsection" style={{ marginTop: 16 }}>
                  <label className="ogrenci-filter-subsection-title" htmlFor="roster-seviye-select">
                    Sınıf seviyesi
                  </label>
                  <div className="ogrenci-filter-select-wrap">
                    <select
                      id="roster-seviye-select"
                      className="ogrenci-filter-select"
                      value={seviyeId}
                      onChange={(e) => setSeviyeId(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">Seviye seçin…</option>
                      {sinifSeviyeleri.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.ad}
                        </option>
                      ))}
                    </select>
                  </div>
                  {seviyeId ? (
                    <p className="ogrenci-filter-empty-hint">
                      {filteredSiniflarForSeviye.length} sınıf listeye dahil edilecek
                    </p>
                  ) : null}
                </div>
              )}

              {scope === "custom" && (
                <div className="ogrenci-filter-subsection" style={{ marginTop: 16 }}>
                  <label className="ogrenci-filter-subsection-title" htmlFor="roster-sinif-search">
                    Sınıflar
                  </label>
                  <input
                    id="roster-sinif-search"
                    type="search"
                    className="ogrenci-filter-select"
                    placeholder="Sınıf veya seviye ara…"
                    value={sinifSearch}
                    onChange={(e) => setSinifSearch(e.target.value)}
                    style={{ marginBottom: 10 }}
                  />
                  <div className="ogrenci-filter-select-chip-grid ogrenci-filter-select-chip-grid--scroll">
                    {Array.from(siniflarBySeviye.entries()).map(([seviyeAd, items]) => (
                      <div key={seviyeAd} className="ogrenci-filter-sinif-group" style={{ gridColumn: "1 / -1" }}>
                        <div className="ogrenci-filter-sinif-group-label">{seviyeAd}</div>
                        <div
                          className="ogrenci-filter-select-chip-grid"
                          style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
                        >
                          {items.map((s) => (
                            <label
                              key={s.id}
                              className={`ogrenci-filter-select-chip${
                                selectedSinifIds.includes(s.id) ? " selected" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedSinifIds.includes(s.id)}
                                onChange={() => toggleSinif(s.id)}
                              />
                              <span>{s.ad}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    {siniflarBySeviye.size === 0 && (
                      <p className="ogrenci-filter-empty-hint">Aramanızla eşleşen sınıf yok</p>
                    )}
                  </div>
                </div>
              )}

              <h4 className="ogrenci-filter-subsection-title" style={{ marginTop: 20 }}>
                Dosya Formatı
              </h4>
              <div className="ogrenci-export-format-cards">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`ogrenci-export-format-card${format === opt.id ? " active" : ""}`}
                    onClick={() => setFormat(opt.id)}
                  >
                    <span className="ogrenci-export-format-icon">
                      {opt.id === "csv" && (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="8" y1="13" x2="16" y2="13" />
                          <line x1="8" y1="17" x2="16" y2="17" />
                        </svg>
                      )}
                      {opt.id === "xlsx" && (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <line x1="3" y1="9" x2="21" y2="9" />
                          <line x1="3" y1="15" x2="21" y2="15" />
                          <line x1="9" y1="3" x2="9" y2="21" />
                        </svg>
                      )}
                      {opt.id === "pdf" && (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <path d="M10 12h4M10 16h4" />
                        </svg>
                      )}
                    </span>
                    <span className="ogrenci-export-format-label">{opt.label}</span>
                    <span className="ogrenci-export-format-desc">{opt.desc}</span>
                  </button>
                ))}
              </div>

              <div className="ogrenci-export-summary">
                <div className="ogrenci-export-summary-row">
                  <span>Dönem</span>
                  <strong>{aktifDonem?.name || "—"}</strong>
                </div>
                <div className="ogrenci-export-summary-row">
                  <span>Kapsam</span>
                  <strong>{scopeSummary}</strong>
                </div>
                <div className="ogrenci-export-summary-row">
                  <span>Sütun sırası</span>
                  <strong className="ogrenci-export-order-preview">
                    {orderedColumnLabels.length > 0
                      ? orderedColumnLabels.join(" → ")
                      : "Henüz seçilmedi"}
                  </strong>
                </div>
                <div className="ogrenci-export-summary-row">
                  <span>Sütun</span>
                  <strong>
                    {selectedKeys.length} / {ROSTER_EXPORT_COLUMN_OPTIONS.length}
                  </strong>
                </div>
                <div className="ogrenci-export-summary-row">
                  <span>Çıktı</span>
                  <strong>sinif_ogrenci_listesi{formatMeta.ext}</strong>
                </div>
              </div>
            </section>

            <section className="ogrenci-export-section">
              <div className="ogrenci-export-columns-header">
                <div>
                  <h4 className="ogrenci-filter-subsection-title">Sütun Seçimi</h4>
                  <p className="ogrenci-export-columns-hint">
                    Seçim sırası soldan sağa sütun sırasını belirler. Sınıf adı ve seviye tablo
                    başlığında gösterildiği için sütun olarak eklenmez.
                  </p>
                </div>
                <div className="ogrenci-export-columns-actions">
                  <button type="button" className="ogrenci-export-link-btn" onClick={selectAllColumns}>
                    Tümünü seç
                  </button>
                  <button type="button" className="ogrenci-export-link-btn" onClick={clearColumns}>
                    Temizle
                  </button>
                </div>
              </div>
              <div className="ogrenci-export-columns-grid">
                {ROSTER_EXPORT_COLUMN_OPTIONS.map((col) => {
                  const order = columnOrderMap.get(col.key);
                  return (
                    <label
                      key={col.key}
                      className={`ogrenci-export-column-chip${order ? " selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(order)}
                        onChange={() => toggleKey(col.key)}
                      />
                      <span className="ogrenci-export-column-label">{col.label}</span>
                      {order ? (
                        <span
                          className="ogrenci-export-column-order"
                          aria-label={`Sütun sırası ${order}`}
                        >
                          {order}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </section>
          </div>

          {error && (
            <div className="ogrenci-export-error-banner" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="ogrenci-filter-drawer-footer">
          <button
            type="button"
            className="btn-modern btn-secondary"
            onClick={onClose}
            disabled={exporting}
          >
            Vazgeç
          </button>
          <button
            type="button"
            className="btn-modern btn-primary ogrenci-export-submit"
            onClick={handleExport}
            disabled={exporting || !aktifDonem}
          >
            {exporting ? (
              <>
                <span className="ogrenci-export-spinner" aria-hidden />
                Hazırlanıyor…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {formatMeta.label} İndir
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
