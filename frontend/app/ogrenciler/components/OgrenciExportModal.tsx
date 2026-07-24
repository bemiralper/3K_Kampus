'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useKurum } from '@/lib/contexts/KurumContext';
import { brandingFromContext, getPdfHeaderLogo } from '@/lib/kurum-branding';
import {
  EXPORT_COLUMNS,
  DEFAULT_EXPORT_KEYS,
  buildListApiQuery,
  getContextHeadersFromStorage,
  groupExportColumns,
  type OgrenciListFilters,
} from '../lib/ogrenci-list-utils';
import { downloadBlob } from '@/lib/download-file';
import {
  exportGroupedOgrenciListPdf,
  exportOgrenciListPdf,
  type PdfOrientation,
} from '../lib/ogrenciListPdfExport';

type ExportFormat = 'csv' | 'xlsx' | 'pdf';
/** sinif = eğitim tanımlarındaki ders sınıfı (şube sınıfı); kurum şubesi değil */
type PageMode = 'single' | 'sinif' | 'sinif_seviyesi';
type ExportSort = 'name_asc' | 'okul_no_asc' | 'sinif_asc';

export interface OgrenciExportContext {
  title?: string;
  subtitle?: string;
  fileNamePrefix?: string;
  documentTitle?: string;
  filterSummary?: string;
  /** Kurumsal Excel/CSV başlığı (backend report_title) */
  reportTitle?: string;
}

/** Filtre tanımlarında bu boyutlar varsa sayfalama/sıralama seçenekleri çıkar */
export interface OgrenciExportFilterDimensions {
  hasSinif?: boolean;
  hasSinifSeviyesi?: boolean;
}

interface OgrenciExportModalProps {
  open: boolean;
  onClose: () => void;
  filters: OgrenciListFilters;
  selectedIds?: Set<number>;
  mode?: 'all' | 'selected';
  exportContext?: OgrenciExportContext;
  filterDimensions?: OgrenciExportFilterDimensions;
}

const FORMAT_OPTIONS: {
  id: ExportFormat;
  label: string;
  ext: string;
}[] = [
  { id: 'csv', label: 'CSV', ext: '.csv' },
  { id: 'xlsx', label: 'Excel', ext: '.xlsx' },
  { id: 'pdf', label: 'PDF', ext: '.pdf' },
];

function buildExportParams(
  filters: OgrenciListFilters,
  columnKeys: string[],
  selectedIds?: number[],
  asJson = false,
  reportTitle?: string,
  extra?: { sort?: string; group_by?: string },
): URLSearchParams {
  const query = buildListApiQuery({
    ...filters,
    page: 1,
    page_size: 5000,
    ...(extra?.sort ? { sort: extra.sort } : {}),
  });
  const params = new URLSearchParams(query.replace('?', ''));
  params.set('columns', columnKeys.join(','));
  if (asJson) params.set('format', 'json');
  if (selectedIds?.length) params.set('ids', selectedIds.join(','));
  if (reportTitle?.trim()) params.set('report_title', reportTitle.trim());
  if (extra?.group_by && extra.group_by !== 'none') {
    params.set('group_by', extra.group_by);
  }
  return params;
}

const ORIENTATION_OPTIONS: { id: PdfOrientation; label: string }[] = [
  { id: 'portrait', label: 'Dikey' },
  { id: 'landscape', label: 'Yatay' },
];

export default function OgrenciExportModal({
  open,
  onClose,
  filters,
  selectedIds,
  mode = 'all',
  exportContext,
  filterDimensions,
}: OgrenciExportModalProps) {
  const { activeKurum, activeSube } = useKurum();
  const branding = useMemo(
    () => brandingFromContext(activeKurum, activeSube),
    [activeKurum, activeSube],
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [orientation, setOrientation] = useState<PdfOrientation>('landscape');
  const [pageMode, setPageMode] = useState<PageMode>('single');
  const [exportSort, setExportSort] = useState<ExportSort>('name_asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtre tanımlarında sınıf / seviye varsa göster (seçili olması şart değil)
  const showSinifOptions = filterDimensions?.hasSinif ?? true;
  const showSeviyeOptions = filterDimensions?.hasSinifSeviyesi ?? true;

  const pageModeOptions = useMemo(() => {
    const opts: { id: PageMode; label: string }[] = [
      { id: 'single', label: 'Tek sayfa' },
    ];
    if (showSinifOptions) {
      opts.push({ id: 'sinif', label: 'Her şube ayrı sayfa' });
    }
    if (showSeviyeOptions) {
      opts.push({ id: 'sinif_seviyesi', label: 'Her sınıf seviyesi ayrı sayfa' });
    }
    return opts;
  }, [showSinifOptions, showSeviyeOptions]);

  const sortOptions = useMemo(() => {
    const opts: { id: ExportSort; label: string }[] = [
      { id: 'name_asc', label: 'Ad' },
      { id: 'okul_no_asc', label: 'Numara' },
    ];
    if (showSinifOptions) {
      opts.push({ id: 'sinif_asc', label: 'Şube' });
    }
    return opts;
  }, [showSinifOptions]);

  useEffect(() => {
    if (open) {
      setSelectedKeys([...DEFAULT_EXPORT_KEYS]);
      setPageMode('single');
      setExportSort('name_asc');
      setError(null);
    }
  }, [open]);

  // Görünür olmayan seçenekler seçili kalmasın
  useEffect(() => {
    if (!pageModeOptions.some((o) => o.id === pageMode)) {
      setPageMode('single');
    }
  }, [pageModeOptions, pageMode]);

  useEffect(() => {
    if (!sortOptions.some((o) => o.id === exportSort)) {
      setExportSort('name_asc');
    }
  }, [sortOptions, exportSort]);

  const columnOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedKeys.forEach((key, index) => map.set(key, index + 1));
    return map;
  }, [selectedKeys]);

  const groupedColumns = useMemo(() => groupExportColumns(EXPORT_COLUMNS), []);

  const selectedIdList = useMemo(
    () => (mode === 'selected' && selectedIds ? Array.from(selectedIds) : undefined),
    [mode, selectedIds],
  );

  const selectedCount = selectedIdList?.length ?? 0;

  const formatMeta = FORMAT_OPTIONS.find((f) => f.id === format)!;
  const fileNamePrefix = exportContext?.fileNamePrefix || 'ogrenciler';
  const modalTitle = exportContext?.title
    ?? (mode === 'selected' ? 'Seçili Öğrencileri Dışa Aktar' : 'Listeyi Dışa Aktar');
  const modalSubtitle = exportContext?.subtitle
    ?? (mode === 'selected'
      ? `${selectedCount} öğrenci · aktif filtreler uygulanır`
      : 'Filtrelenmiş listenin tamamını indirin');

  if (!open) return null;

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllColumns = () => setSelectedKeys(EXPORT_COLUMNS.map((c) => c.key));
  const clearColumns = () => setSelectedKeys([]);

  const groupByParam =
    pageMode === 'sinif' || pageMode === 'sinif_seviyesi' ? pageMode : 'none';

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
      const extra = { sort: exportSort, group_by: groupByParam };

      if (format === 'csv' || format === 'xlsx') {
        const params = buildExportParams(
          filters,
          selectedKeys,
          selectedIdList,
          false,
          exportContext?.reportTitle,
          extra,
        );
        params.set('format', format);
        const headers = getContextHeadersFromStorage();
        const res = await fetch(`/api/ogrenciler/api/export/?${params}`, {
          credentials: 'include',
          headers,
        });
        if (!res.ok) throw new Error(`${format.toUpperCase()} dışa aktarma başarısız`);
        const blob = await res.blob();
        downloadBlob(blob, `${fileNamePrefix}.${format}`);
      } else {
        const params = buildExportParams(
          filters,
          selectedKeys,
          selectedIdList,
          true,
          exportContext?.reportTitle,
          extra,
        );
        const headers = getContextHeadersFromStorage();
        const res = await fetch(`/api/ogrenciler/api/export/?${params}`, {
          credentials: 'include',
          headers,
        });
        if (!res.ok) throw new Error('Dışa aktarma verisi alınamadı');
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Dışa aktarma başarısız');

        const brandingPayload = {
          kurumAd: branding.gorunen_ad || activeKurum?.ad || 'Kurum',
          subeAd: activeSube?.ad,
          logoUrl: getPdfHeaderLogo(branding),
          temaRengi: branding.tema_rengi,
        };

        if (groupByParam !== 'none' && Array.isArray(data.groups) && data.groups.length > 0) {
          const sections = data.groups.map(
            (g: { title: string; rows: Record<string, string>[] }) => ({
              title: g.title,
              rows: g.rows || [],
            }),
          );
          const total = sections.reduce(
            (n: number, s: { rows: unknown[] }) => n + s.rows.length,
            0,
          );
          if (total === 0) throw new Error('Dışa aktarılacak kayıt bulunamadı');

          await exportGroupedOgrenciListPdf({
            sections,
            columnKeys: selectedKeys,
            orientation,
            branding: brandingPayload,
            documentTitle: exportContext?.documentTitle,
            filterSummary: exportContext?.filterSummary,
            fileName: `${fileNamePrefix}.pdf`,
            pageBreakBetweenSections: true,
          });
        } else {
          const rows = data.rows || [];
          if (rows.length === 0) {
            throw new Error('Dışa aktarılacak kayıt bulunamadı');
          }
          await exportOgrenciListPdf({
            rows,
            columnKeys: selectedKeys,
            orientation,
            branding: brandingPayload,
            documentTitle: exportContext?.documentTitle,
            filterSummary: exportContext?.filterSummary,
            fileName: `${fileNamePrefix}.pdf`,
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
            <h3 id="export-modal-title">{modalTitle}</h3>
            <p className="ogrenci-filter-drawer-subtitle">{modalSubtitle}</p>
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
            <section className="ogrenci-export-section ogrenci-export-section--options">
              <div className="ogrenci-export-option-block">
                <h4 className="ogrenci-filter-subsection-title">Dosya Formatı</h4>
                <div className="ogrenci-export-seg" role="group" aria-label="Dosya formatı">
                  {FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`ogrenci-export-seg-btn${format === opt.id ? ' active' : ''}`}
                      onClick={() => setFormat(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {format === 'pdf' && (
                <div className="ogrenci-export-option-block">
                  <h4 className="ogrenci-filter-subsection-title">Sayfa Yönü</h4>
                  <div className="ogrenci-export-seg" role="group" aria-label="Sayfa yönü">
                    {ORIENTATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`ogrenci-export-seg-btn${orientation === opt.id ? ' active' : ''}`}
                        onClick={() => setOrientation(opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="ogrenci-export-option-block">
                <h4 className="ogrenci-filter-subsection-title">Sayfalama</h4>
                <div className="ogrenci-export-choice-list" role="group" aria-label="Sayfalama">
                  {pageModeOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`ogrenci-export-choice${pageMode === opt.id ? ' active' : ''}`}
                      onClick={() => setPageMode(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ogrenci-export-option-block">
                <h4 className="ogrenci-filter-subsection-title">Sıralama</h4>
                <div className="ogrenci-export-seg" role="group" aria-label="Sıralama ölçütü">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`ogrenci-export-seg-btn${exportSort === opt.id ? ' active' : ''}`}
                      onClick={() => setExportSort(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ogrenci-export-summary ogrenci-export-summary--compact">
                <div className="ogrenci-export-summary-row">
                  <span>Kapsam</span>
                  <strong>{mode === 'selected' ? `${selectedCount} seçili` : 'Tüm liste'}</strong>
                </div>
                <div className="ogrenci-export-summary-row">
                  <span>Sütun</span>
                  <strong>{selectedKeys.length} / {EXPORT_COLUMNS.length}</strong>
                </div>
                <div className="ogrenci-export-summary-row">
                  <span>Çıktı</span>
                  <strong>{fileNamePrefix}{formatMeta.ext}</strong>
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
              <div className="ogrenci-export-columns-groups">
                {groupedColumns.map(({ group, columns }) => (
                  <div className="ogrenci-export-column-group" key={group}>
                    <span className="ogrenci-export-column-group-label">{group}</span>
                    <div className="ogrenci-export-columns-grid">
                      {columns.map((col) => {
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
                  </div>
                ))}
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
