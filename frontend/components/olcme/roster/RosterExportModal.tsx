'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useKurum } from '@/lib/contexts/KurumContext';
import { brandingFromContext, getPdfHeaderLogo } from '@/lib/kurum-branding';
import { groupExportColumns } from '@/app/ogrenciler/lib/ogrenci-list-utils';
import type { PdfOrientation } from '@/app/ogrenciler/lib/ogrenciListPdfExport';
import type { ExamDetail, ExamParticipantRow, ExamRoomItem } from '../types';
import {
  DEFAULT_ROSTER_KEYS,
  ROSTER_EXPORT_COLUMNS,
  ROSTER_KIND_OPTIONS,
  ROSTER_KIND_TITLES,
  columnsForPageMode,
  downloadRosterPdf,
  downloadRosterWorkbook,
  rosterExportStamp,
  rosterFileBase,
  type RosterExportFormat,
  type RosterExportSort,
  type RosterPageMode,
  type RosterPdfKind,
} from './rosterExport';
import '@/app/ogrenciler/ogrenci-list.css';

interface Props {
  exam: ExamDetail;
  rows: ExamParticipantRow[];
  rooms?: ExamRoomItem[];
  /** Seçim veya arama daralttıysa alt başlıkta gösterilir. */
  scopeLabel?: string;
  onClose: () => void;
}

const FORMAT_OPTIONS: { id: RosterExportFormat; label: string; ext: string }[] = [
  { id: 'pdf', label: 'PDF', ext: '.pdf' },
  { id: 'xlsx', label: 'Excel', ext: '.xlsx' },
  { id: 'csv', label: 'CSV', ext: '.csv' },
];

export default function RosterExportModal({ exam, rows, rooms, scopeLabel, onClose }: Props) {
  const { activeKurum, activeSube } = useKurum();
  const branding = useMemo(
    () => brandingFromContext(activeKurum, activeSube),
    [activeKurum, activeSube],
  );
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [kind, setKind] = useState<RosterPdfKind>('yoklama');
  const [format, setFormat] = useState<RosterExportFormat>('pdf');
  const [orientation, setOrientation] = useState<PdfOrientation>('portrait');
  const [pageMode, setPageMode] = useState<RosterPageMode>('room');
  const [sort, setSort] = useState<RosterExportSort>('seat_asc');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([...DEFAULT_ROSTER_KEYS.yoklama]);
  const [markAttendance, setMarkAttendance] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const stamp = useMemo(() => rosterExportStamp(), []);
  const pageModeRef = useRef(pageMode);
  pageModeRef.current = pageMode;

  useEffect(() => { setPortalRoot(document.body); }, []);

  useEffect(() => {
    setSelectedKeys(columnsForPageMode([...DEFAULT_ROSTER_KEYS[kind]], pageModeRef.current));
    setError('');
  }, [kind]);

  useEffect(() => {
    setSelectedKeys(prev => columnsForPageMode(prev, pageMode));
  }, [pageMode]);

  const groupedColumns = useMemo(() => groupExportColumns(ROSTER_EXPORT_COLUMNS), []);
  const columnOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedKeys.forEach((key, i) => map.set(key, i + 1));
    return map;
  }, [selectedKeys]);

  const formatMeta = FORMAT_OPTIONS.find(f => f.id === format)!;
  const filePrefix = rosterFileBase(exam.name, kind, stamp);
  const roomLocked = pageMode === 'single';

  const toggleKey = (key: string) => {
    if (roomLocked && key === 'room_name') return;
    setSelectedKeys(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const handleExport = async () => {
    if (selectedKeys.length === 0) {
      setError('En az bir sütun seçin.');
      return;
    }
    if (rows.length === 0) {
      setError('Dışa aktarılacak öğrenci yok.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const examDate = exam.exam_date
        ? new Date(exam.exam_date).toLocaleDateString('tr-TR')
        : undefined;
      const applyAttendance = kind === 'yoklama' && markAttendance;
      if (format === 'pdf') {
        await downloadRosterPdf({
          examName: exam.name,
          examDate,
          kind,
          rows,
          rooms,
          columnKeys: selectedKeys,
          sort,
          pageMode,
          orientation,
          markAttendance: applyAttendance,
          stamp,
          branding: {
            kurumAd: branding.gorunen_ad || exam.kurum_adi || activeKurum?.ad || 'Kurum',
            subeAd: exam.sube_adi || activeSube?.ad,
            logoUrl: getPdfHeaderLogo(branding),
            temaRengi: branding.tema_rengi,
          },
        });
      } else {
        await downloadRosterWorkbook({
          examName: exam.name,
          kind,
          format,
          rows,
          rooms,
          columnKeys: selectedKeys,
          sort,
          pageMode,
          markAttendance: applyAttendance,
          stamp,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dışa aktarma başarısız.');
    } finally {
      setLoading(false);
    }
  };

  if (!portalRoot) return null;

  const content = (
    <div className="ogrenci-drawer-overlay" onClick={onClose}>
      <div
        className="ogrenci-export-modal ogrenci-export-modal--wide"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="roster-export-title"
      >
        <div className="ogrenci-filter-drawer-header">
          <div>
            <h3 id="roster-export-title">Listeyi dışa aktar</h3>
            <p className="ogrenci-filter-drawer-subtitle">
              {exam.name}{scopeLabel ? ` · ${scopeLabel}` : ''} · {rows.length} öğrenci
            </p>
          </div>
          <button type="button" className="ogrenci-drawer-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        <div className="ogrenci-filter-drawer-body">
          <div className="ogrenci-export-layout">
            <section className="ogrenci-export-section ogrenci-export-section--options">
              <div className="ogrenci-export-option-block">
                <h4 className="ogrenci-filter-subsection-title">Liste türü</h4>
                <div className="ogrenci-export-choice-list" role="group" aria-label="Liste türü">
                  {ROSTER_KIND_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`ogrenci-export-choice${kind === opt.id ? ' active' : ''}`}
                      onClick={() => setKind(opt.id)}
                    >
                      <strong style={{ display: 'block' }}>{opt.label}</strong>
                      <span style={{ display: 'block', marginTop: 2, fontWeight: 400, fontSize: 11, color: '#64748b' }}>
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="ogrenci-export-option-block">
                <h4 className="ogrenci-filter-subsection-title">Dosya formatı</h4>
                <div className="ogrenci-export-seg" role="group" aria-label="Dosya formatı">
                  {FORMAT_OPTIONS.map(opt => (
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
                  <h4 className="ogrenci-filter-subsection-title">Sayfa yönü</h4>
                  <div className="ogrenci-export-seg" role="group">
                    <button
                      type="button"
                      className={`ogrenci-export-seg-btn${orientation === 'portrait' ? ' active' : ''}`}
                      onClick={() => setOrientation('portrait')}
                    >
                      Dikey
                    </button>
                    <button
                      type="button"
                      className={`ogrenci-export-seg-btn${orientation === 'landscape' ? ' active' : ''}`}
                      onClick={() => setOrientation('landscape')}
                    >
                      Yatay
                    </button>
                  </div>
                </div>
              )}

              <div className="ogrenci-export-option-block">
                <h4 className="ogrenci-filter-subsection-title">Sayfalama</h4>
                <div className="ogrenci-export-seg" role="group">
                  <button
                    type="button"
                    className={`ogrenci-export-seg-btn${pageMode === 'room' ? ' active' : ''}`}
                    onClick={() => setPageMode('room')}
                  >
                    Her salon ayrı
                  </button>
                  <button
                    type="button"
                    className={`ogrenci-export-seg-btn${pageMode === 'single' ? ' active' : ''}`}
                    onClick={() => setPageMode('single')}
                  >
                    Tek liste
                  </button>
                </div>
                {roomLocked && (
                  <p className="ogrenci-export-columns-hint" style={{ marginTop: 6 }}>
                    Tek listede salon sütunu durur. Sıra sıralaması salonları karıştırmaz.
                  </p>
                )}
              </div>

              <div className="ogrenci-export-option-block">
                <h4 className="ogrenci-filter-subsection-title">Sıralama</h4>
                <div className="ogrenci-export-seg" role="group">
                  <button
                    type="button"
                    className={`ogrenci-export-seg-btn${sort === 'seat_asc' ? ' active' : ''}`}
                    onClick={() => setSort('seat_asc')}
                  >
                    Sıra
                  </button>
                  <button
                    type="button"
                    className={`ogrenci-export-seg-btn${sort === 'name_asc' ? ' active' : ''}`}
                    onClick={() => setSort('name_asc')}
                  >
                    Ad
                  </button>
                  <button
                    type="button"
                    className={`ogrenci-export-seg-btn${sort === 'okul_no_asc' ? ' active' : ''}`}
                    onClick={() => setSort('okul_no_asc')}
                  >
                    Numara
                  </button>
                </div>
              </div>

              {kind === 'yoklama' && (
                <label className="ogrenci-export-column-chip" style={{ marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={markAttendance}
                    onChange={e => setMarkAttendance(e.target.checked)}
                  />
                  <span className="ogrenci-export-column-label">Kayıtlı yoklamayı işaretle</span>
                </label>
              )}

              <div className="ogrenci-export-summary ogrenci-export-summary--compact">
                <div className="ogrenci-export-summary-row">
                  <span>Liste</span>
                  <strong>{ROSTER_KIND_TITLES[kind]}</strong>
                </div>
                <div className="ogrenci-export-summary-row">
                  <span>Sütun</span>
                  <strong>{selectedKeys.length} / {ROSTER_EXPORT_COLUMNS.length}</strong>
                </div>
                <div className="ogrenci-export-summary-row">
                  <span>Çıktı</span>
                  <strong>{filePrefix}{formatMeta.ext}</strong>
                </div>
              </div>
            </section>

            <section className="ogrenci-export-section">
              <div className="ogrenci-export-columns-header">
                <div>
                  <h4 className="ogrenci-filter-subsection-title">Sütun seçimi</h4>
                  <p className="ogrenci-export-columns-hint">
                    Öğrenci listesindeki gibi ad, soyad, TC, telefon ekleyebilirsiniz. Seçim sırası sütun sırasıdır.
                  </p>
                </div>
                <div className="ogrenci-export-columns-actions">
                  <button
                    type="button"
                    className="ogrenci-export-link-btn"
                    onClick={() => setSelectedKeys(columnsForPageMode(ROSTER_EXPORT_COLUMNS.map(c => c.key), pageMode))}
                  >
                    Tümünü seç
                  </button>
                  <button
                    type="button"
                    className="ogrenci-export-link-btn"
                    onClick={() => setSelectedKeys(roomLocked ? ['room_name'] : [])}
                  >
                    Temizle
                  </button>
                </div>
              </div>
              <div className="ogrenci-export-columns-groups">
                {groupedColumns.map(({ group, columns }) => (
                  <div className="ogrenci-export-column-group" key={group}>
                    <span className="ogrenci-export-column-group-label">{group}</span>
                    <div className="ogrenci-export-columns-grid">
                      {columns.map(col => {
                        const order = columnOrderMap.get(col.key);
                        return (
                          <label
                            key={col.key}
                            className={`ogrenci-export-column-chip${order ? ' selected' : ''}`}
                            title={roomLocked && col.key === 'room_name' ? 'Tek listede salon sütunu kalır' : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(order)}
                              onChange={() => toggleKey(col.key)}
                            />
                            <span className="ogrenci-export-column-label">{col.label}</span>
                            {order ? (
                              <span className="ogrenci-export-column-order">{order}</span>
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
            <div className="ogrenci-export-error-banner" role="alert">{error}</div>
          )}
        </div>

        <div className="ogrenci-filter-drawer-footer">
          <button type="button" className="btn-modern btn-secondary" onClick={onClose} disabled={loading}>
            Vazgeç
          </button>
          <button
            type="button"
            className="btn-modern btn-primary ogrenci-export-submit"
            onClick={handleExport}
            disabled={loading}
          >
            {loading ? 'Hazırlanıyor…' : `${formatMeta.label} indir`}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, portalRoot);
}
