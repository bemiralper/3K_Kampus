'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useKurum } from '@/lib/contexts/KurumContext';
import { brandingFromKurum, getAppLogo } from '@/lib/kurum-branding';
import {
  EXPORT_COLUMNS,
  buildListApiQuery,
  getContextHeadersFromStorage,
  type OgrenciListFilters,
} from '../lib/ogrenci-list-utils';
import { exportOgrenciListPdf, type PdfOrientation } from '../lib/ogrenciListPdfExport';

type ExportFormat = 'csv' | 'xlsx' | 'pdf';

interface OgrenciExportModalProps {
  open: boolean;
  onClose: () => void;
  filters: OgrenciListFilters;
  selectedIds?: Set<number>;
  mode?: 'all' | 'selected';
}

const FORMAT_OPTIONS: {
  id: ExportFormat;
  label: string;
  desc: string;
  ext: string;
}[] = [
  { id: 'csv', label: 'CSV', desc: 'Virgül ayracı, Excel uyumlu', ext: '.csv' },
  { id: 'xlsx', label: 'Excel', desc: 'XLSX çalışma kitabı', ext: '.xlsx' },
  { id: 'pdf', label: 'PDF', desc: 'Yazdırılabilir tablo', ext: '.pdf' },
];

function buildExportParams(
  filters: OgrenciListFilters,
  columnKeys: string[],
  selectedIds?: number[],
  asJson = false
): URLSearchParams {
  const query = buildListApiQuery({ ...filters, page: 1, page_size: 5000 });
  const params = new URLSearchParams(query.replace('?', ''));
  params.set('columns', columnKeys.join(','));
  if (asJson) params.set('format', 'json');
  if (selectedIds?.length) params.set('ids', selectedIds.join(','));
  return params;
}

async function fetchExportRows(
  filters: OgrenciListFilters,
  columnKeys: string[],
  selectedIds?: number[]
): Promise<{ rows: Record<string, string>[]; columns: string[]; total: number }> {
  const params = buildExportParams(filters, columnKeys, selectedIds, true);
  const headers = getContextHeadersFromStorage();
  const res = await fetch(`/api/ogrenciler/api/export/?${params}`, {
    credentials: 'include',
    headers,
  });
  if (!res.ok) throw new Error('Dışa aktarma verisi alınamadı');

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Dışa aktarma başarısız');

  return {
    rows: data.rows || [],
    columns: data.columns || columnKeys,
    total: data.total ?? (data.rows?.length || 0),
  };
}

function cellValue(row: Record<string, string>, key: string): string {
  const val = row[key];
  return val != null ? String(val) : '';
}

function exportXlsx(rows: Record<string, string>[], keys: string[]) {
  const labels = keys.map((k) => EXPORT_COLUMNS.find((c) => c.key === k)?.label || k);
  const data = rows.map((row) => keys.map((k) => cellValue(row, k)));
  const ws = XLSX.utils.aoa_to_sheet([labels, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Öğrenciler');
  XLSX.writeFile(wb, 'ogrenciler.xlsx');
}

const ORIENTATION_OPTIONS: { id: PdfOrientation; label: string; desc: string }[] = [
  { id: 'portrait', label: 'Dikey', desc: 'A4 dikey — az sütun' },
  { id: 'landscape', label: 'Yatay', desc: 'A4 yatay — çok sütun' },
];

export default function OgrenciExportModal({
  open,
  onClose,
  filters,
  selectedIds,
  mode = 'all',
}: OgrenciExportModalProps) {
  const { activeKurum, activeSube } = useKurum();
  const branding = useMemo(
    () => (activeKurum ? brandingFromKurum(activeKurum) : null),
    [activeKurum],
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [orientation, setOrientation] = useState<PdfOrientation>('landscape');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedKeys([]);
      setError(null);
    }
  }, [open]);

  const columnOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedKeys.forEach((key, index) => map.set(key, index + 1));
    return map;
  }, [selectedKeys]);

  const orderedColumnLabels = useMemo(
    () =>
      selectedKeys.map(
        (key) => EXPORT_COLUMNS.find((c) => c.key === key)?.label || key
      ),
    [selectedKeys]
  );

  const selectedIdList = useMemo(
    () => (mode === 'selected' && selectedIds ? Array.from(selectedIds) : undefined),
    [mode, selectedIds],
  );

  const selectedCount = selectedIdList?.length ?? 0;

  const formatMeta = FORMAT_OPTIONS.find((f) => f.id === format)!;

  if (!open) return null;

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllColumns = () => setSelectedKeys(EXPORT_COLUMNS.map((c) => c.key));
  const clearColumns = () => setSelectedKeys([]);

  const handleExport = async () => {
    if (selectedKeys.length === 0) {
      setError('En az bir sütun seçin');
      return;
    }
    if (mode === 'selected' && selectedCount === 0) {
      setError('Dışa aktarılacak seçili öğrenci yok');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (format === 'csv') {
        const params = buildExportParams(filters, selectedKeys, selectedIdList, false);
        const headers = getContextHeadersFromStorage();
        const res = await fetch(`/api/ogrenciler/api/export/?${params}`, {
          credentials: 'include',
          headers,
        });
        if (!res.ok) throw new Error('CSV dışa aktarma başarısız');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ogrenciler.csv';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const { rows } = await fetchExportRows(filters, selectedKeys, selectedIdList);

        if (rows.length === 0) {
          throw new Error('Dışa aktarılacak kayıt bulunamadı');
        }

        if (format === 'xlsx') {
          exportXlsx(rows, selectedKeys);
        } else {
          await exportOgrenciListPdf({
            rows,
            columnKeys: selectedKeys,
            orientation,
            branding: {
              kurumAd: activeKurum?.ad || 'Kurum',
              subeAd: activeSube?.ad,
              logoUrl: branding ? getAppLogo(branding) : '/img/3k-logo.png',
              temaRengi: branding?.tema_rengi,
            },
          });
        }
      }

      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Dışa aktarma hatası';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ogrenci-drawer-overlay" onClick={onClose}>
      <div
        className="ogrenci-export-modal ogrenci-export-modal--wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="export-modal-title"
      >
        <div className="ogrenci-filter-drawer-header">
          <div>
            <h3 id="export-modal-title">
              {mode === 'selected' ? 'Seçili Öğrencileri Dışa Aktar' : 'Listeyi Dışa Aktar'}
            </h3>
            <p className="ogrenci-filter-drawer-subtitle">
              {mode === 'selected'
                ? `${selectedCount} öğrenci · aktif filtreler uygulanır`
                : 'Filtrelenmiş listenin tamamını indirin'}
            </p>
          </div>
          <button type="button" className="ogrenci-drawer-close" onClick={onClose} aria-label="Kapat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ogrenci-filter-drawer-body">
          <div className="ogrenci-export-layout">
            <section className="ogrenci-export-section">
              <h4 className="ogrenci-filter-subsection-title">Dosya Formatı</h4>
              <div className="ogrenci-export-format-cards">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`ogrenci-export-format-card${format === opt.id ? ' active' : ''}`}
                    onClick={() => setFormat(opt.id)}
                  >
                    <span className="ogrenci-export-format-icon">
                      {opt.id === 'csv' && (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="8" y1="13" x2="16" y2="13" />
                          <line x1="8" y1="17" x2="16" y2="17" />
                        </svg>
                      )}
                      {opt.id === 'xlsx' && (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <line x1="3" y1="9" x2="21" y2="9" />
                          <line x1="3" y1="15" x2="21" y2="15" />
                          <line x1="9" y1="3" x2="9" y2="21" />
                        </svg>
                      )}
                      {opt.id === 'pdf' && (
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

              {format === 'pdf' && (
                <>
                  <h4 className="ogrenci-filter-subsection-title" style={{ marginTop: 16 }}>
                    Sayfa Yönü
                  </h4>
                  <div className="ogrenci-export-format-cards ogrenci-export-orientation-cards">
                    {ORIENTATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`ogrenci-export-format-card${orientation === opt.id ? ' active' : ''}`}
                        onClick={() => setOrientation(opt.id)}
                      >
                        <span className="ogrenci-export-format-icon">
                          {opt.id === 'portrait' ? (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                              <rect x="5" y="3" width="14" height="18" rx="2" />
                            </svg>
                          ) : (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                              <rect x="3" y="5" width="18" height="14" rx="2" />
                            </svg>
                          )}
                        </span>
                        <span className="ogrenci-export-format-label">{opt.label}</span>
                        <span className="ogrenci-export-format-desc">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="ogrenci-export-summary">
                <div className="ogrenci-export-summary-row">
                  <span>Kapsam</span>
                  <strong>{mode === 'selected' ? `${selectedCount} seçili` : 'Tüm liste'}</strong>
                </div>
                <div className="ogrenci-export-summary-row">
                  <span>Sütun sırası</span>
                  <strong className="ogrenci-export-order-preview">
                    {orderedColumnLabels.length > 0
                      ? orderedColumnLabels.join(' → ')
                      : 'Henüz seçilmedi'}
                  </strong>
                </div>
                <div className="ogrenci-export-summary-row">
                  <span>Sütun</span>
                  <strong>{selectedKeys.length} / {EXPORT_COLUMNS.length}</strong>
                </div>
                <div className="ogrenci-export-summary-row">
                  <span>Çıktı</span>
                  <strong>ogrenciler{formatMeta.ext}</strong>
                </div>
              </div>
            </section>

            <section className="ogrenci-export-section">
              <div className="ogrenci-export-columns-header">
                <div>
                  <h4 className="ogrenci-filter-subsection-title">Sütun Seçimi</h4>
                  <p className="ogrenci-export-columns-hint">
                    Seçim sırası soldan sağa sütun sırasını belirler. Sağdaki numara sırayı gösterir.
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
                {EXPORT_COLUMNS.map((col) => {
                  const order = columnOrderMap.get(col.key);
                  return (
                    <label
                      key={col.key}
                      className={`ogrenci-export-column-chip${order ? ' selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(order)}
                        onChange={() => toggleKey(col.key)}
                      />
                      <span className="ogrenci-export-column-label">{col.label}</span>
                      {order ? (
                        <span className="ogrenci-export-column-order" aria-label={`Sütun sırası ${order}`}>
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
          <button type="button" className="btn-modern btn-secondary" onClick={onClose} disabled={loading}>
            Vazgeç
          </button>
          <button type="button" className="btn-modern btn-primary ogrenci-export-submit" onClick={handleExport} disabled={loading}>
            {loading ? (
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
