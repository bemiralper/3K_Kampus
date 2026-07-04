'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  exportRankingsPdf, exportStudentsPdf,
  ALAN_LABELS, SORT_OPTIONS, AYT_ALAN_DERSLERI, isSectionForAlan,
  DEFAULT_COLUMN_CONFIG,
  type SortField, type PdfColumnConfig,
  type SectionAvgInfo, type SinifAvgInfo,
} from './pdfExport';
import type { RankingItem, StudentAnalysis, RankingSectionInfo } from './types';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PROPS                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface BaseProps {
  examName: string;
  examType: string;
  uniqueSiniflar: string[];
  onClose: () => void;
}

interface RankingsProps extends BaseProps {
  mode: 'rankings';
  rankings: RankingItem[];
  sections: RankingSectionInfo[];
  referansYil: number;
  sectionAvgs?: Record<string, SectionAvgInfo>;
  avgScore?: number;
  avgNet?: number;
  puanTurleriAvgs?: Record<string, number>;
  sinifAvgs?: Record<string, SinifAvgInfo>;
  students?: never;
}

interface StudentsProps extends BaseProps {
  mode: 'students';
  students: StudentAnalysis[];
  rankings?: never;
  sections?: never;
  referansYil?: never;
}

type PdfExportModalProps = RankingsProps | StudentsProps;

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MODAL BİLEŞENİ                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function PdfExportModal(props: PdfExportModalProps) {
  const { mode, examName, examType, uniqueSiniflar, onClose } = props;
  const isAyt = examType === 'YKS_AYT';

  /* ── Portal root ── */
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalRoot(document.body); }, []);

  /* ── Genel filtreler ── */
  const [sortBy, setSortBy] = useState<SortField>('kurum_sira');
  const [alanFilter, setAlanFilter] = useState<string | null>(null);
  const [sinifFilter, setSinifFilter] = useState<string | null>(null);

  /* ── Sütun yapılandırması ── */
  const [columns, setColumns] = useState<PdfColumnConfig>({ ...DEFAULT_COLUMN_CONFIG });

  /* ── Section seçimi (sadece rankings modu) ── */
  const rawSections = mode === 'rankings' ? props.sections : undefined;
  const sections = useMemo(() => rawSections ?? [], [rawSections]);
  const mainSections = sections.filter(sec => !sec.is_sub_section);
  const subSectionsMap: Record<number, RankingSectionInfo[]> = {};
  sections.filter(sec => sec.is_sub_section && sec.parent_id).forEach(sec => {
    if (!subSectionsMap[sec.parent_id!]) subSectionsMap[sec.parent_id!] = [];
    subSectionsMap[sec.parent_id!].push(sec);
  });

  /* ── Loading state ── */
  const [generating, setGenerating] = useState(false);

  /* ── Alan değişince section visibility'yi güncelle ── */
  useEffect(() => {
    if (!isAyt || !alanFilter || mode !== 'rankings') return;
    // Alan filtresi seçilince sadece o alana ait alanları/dersleri görünür yap
    const visibleIds = sections
      .filter(sec => isSectionForAlan(sec.name, alanFilter))
      .map(sec => sec.id);
    setColumns(prev => ({ ...prev, visibleSections: visibleIds }));
  }, [alanFilter, isAyt, mode, sections]);

  /* ── Section toggle helper ── */
  const toggleSection = useCallback((id: number, checked: boolean) => {
    setColumns(prev => {
      const current = prev.visibleSections ?? sections.map(sec => sec.id);
      const next = checked ? [...current, id] : current.filter(x => x !== id);
      return { ...prev, visibleSections: next.length === sections.length ? undefined : next };
    });
  }, [sections]);

  const isSectionVisible = (id: number) => {
    if (!columns.visibleSections) return true;
    return columns.visibleSections.includes(id);
  };

  /* ── Puan türü toggle ── */
  const togglePuanTuru = useCallback((pt: 'SAY' | 'EA' | 'SOZ', checked: boolean) => {
    setColumns(prev => {
      const next = checked
        ? [...prev.visiblePuanTurleri, pt]
        : prev.visiblePuanTurleri.filter(x => x !== pt);
      return { ...prev, visiblePuanTurleri: next };
    });
  }, []);

  /* ── PDF oluştur ── */
  const handleExport = async () => {
    setGenerating(true);
    try {
      if (mode === 'rankings') {
        await exportRankingsPdf({
          examName,
          examType,
          rankings: props.rankings,
          sections: props.sections,
          sortBy,
          alanFilter,
          sinifFilter,
          columns,
          referansYil: props.referansYil,
          sectionAvgs: props.sectionAvgs,
          avgScore: props.avgScore,
          avgNet: props.avgNet,
          puanTurleriAvgs: props.puanTurleriAvgs,
          sinifAvgs: props.sinifAvgs,
        });
      } else {
        await exportStudentsPdf({
          examName,
          examType,
          students: props.students,
          sortBy,
          alanFilter,
          sinifFilter,
          columns,
        });
      }
      onClose();
    } catch (err) {
      console.error('PDF oluşturma hatası:', err);
      alert('PDF oluşturulurken bir hata oluştu. Konsolu kontrol edin.');
    } finally {
      setGenerating(false);
    }
  };

  /* ── Tümünü Seç / Kaldır (sections) ── */
  const selectAllSections = () => setColumns(prev => ({ ...prev, visibleSections: undefined }));
  const deselectAllSections = () => setColumns(prev => ({ ...prev, visibleSections: [] }));

  /* ── Alan preset ── */
  const ALAN_TO_SORT: Record<string, SortField> = {
    SAYISAL: 'say',
    ESIT_AGIRLIK: 'ea',
    SOZEL: 'soz',
  };
  const applyAlanPreset = (alan: string) => {
    setAlanFilter(alan);
    // Alan seçilince sıralama kriterini otomatik değiştir
    if (ALAN_TO_SORT[alan]) setSortBy(ALAN_TO_SORT[alan]);
    if (mode === 'rankings') {
      const visibleIds = sections
        .filter(sec => isSectionForAlan(sec.name, alan))
        .map(sec => sec.id);
      setColumns(prev => ({ ...prev, visibleSections: visibleIds }));
    }
  };

  if (!portalRoot) return null;

  const content = (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 16, width: 620, maxWidth: '94vw',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
          animation: 'slideUp 0.2s ease-out',
        }}
      >
        {/* ── HEADER ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0262a7, #0284c7)',
          padding: '18px 24px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              📄 PDF Dışa Aktarma
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.85 }}>
              {mode === 'rankings' ? 'Sıralama Tablosu' : 'Öğrenci Listesi'} · {examName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>

        {/* ── BODY (scrollable) ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>

          {/* ─── 1. SIRALAMA & FİLTRELER ─── */}
          <SectionTitle icon="🔽" title="Sıralama ve Filtreler" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            <FieldGroup label="Sıralama Kriteri">
              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortField)} style={selectStyle}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FieldGroup>
            <FieldGroup label="Alan Filtresi">
              <select value={alanFilter || ''} onChange={e => {
                const v = e.target.value || null;
                if (v) {
                  applyAlanPreset(v);
                } else {
                  setAlanFilter(null);
                  setSortBy('kurum_sira');
                }
              }} style={selectStyle}>
                <option value="">Tümü</option>
                {Object.entries(ALAN_LABELS).map(([kod, label]) => (
                  <option key={kod} value={kod}>{label}</option>
                ))}
              </select>
            </FieldGroup>
            <FieldGroup label="Sınıf Filtresi">
              <select value={sinifFilter || ''} onChange={e => setSinifFilter(e.target.value || null)} style={selectStyle}>
                <option value="">Tümü</option>
                {uniqueSiniflar.map(sn => <option key={sn} value={sn}>{sn}</option>)}
              </select>
            </FieldGroup>
          </div>

          {/* ─── 2. GÖRÜNÜR ALANLAR/DERSLER (sadece rankings) ─── */}
          {mode === 'rankings' && sections.length > 0 && (
            <>
              <SectionTitle icon="📚" title="Görünür Alanlar ve Dersler" />
              <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                <MiniBtn label="Tümünü Seç" onClick={selectAllSections} />
                <MiniBtn label="Tümünü Kaldır" onClick={deselectAllSections} />
                {isAyt && Object.entries(ALAN_LABELS).map(([kod, label]) => (
                  <MiniBtn key={kod} label={`${label} Alanı`} onClick={() => applyAlanPreset(kod)} active={alanFilter === kod} />
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, marginBottom: 20 }}>
                {mainSections.map(main => {
                  const subs = subSectionsMap[main.id] || [];
                  return (
                    <div key={main.id} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', border: '1px solid #e2e8f0' }}>
                      <CheckItem
                        label={`${main.name} (${main.question_count})`}
                        checked={isSectionVisible(main.id)}
                        onChange={c => {
                          toggleSection(main.id, c);
                          subs.forEach(sub => toggleSection(sub.id, c));
                        }}
                        bold
                      />
                      {subs.map(sub => (
                        <div key={sub.id} style={{ paddingLeft: 16, marginTop: 2 }}>
                          <CheckItem
                            label={`${sub.name} (${sub.question_count})`}
                            checked={isSectionVisible(sub.id)}
                            onChange={c => toggleSection(sub.id, c)}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ─── 3. SÜTUN SEÇENEKLERİ ─── */}
          <SectionTitle icon="📊" title="Sütun Seçenekleri" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            <CheckItem
              label="Öğrenci No (Ö.No)"
              checked={columns.showStudentId}
              onChange={c => setColumns(prev => ({ ...prev, showStudentId: c }))}
            />
            {columns.showStudentId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Alan:</label>
                <select
                  value={columns.studentIdField}
                  onChange={e => setColumns(prev => ({ ...prev, studentIdField: e.target.value as 'raw_student_id' | 'student_id' }))}
                  style={{ ...selectStyle, width: 'auto', padding: '3px 6px' }}
                >
                  <option value="raw_student_id">Ham Öğrenci No</option>
                  <option value="student_id">Öğrenci ID</option>
                </select>
              </div>
            )}
            <CheckItem
              label="Sınıf Sütunu"
              checked={columns.showSinif}
              onChange={c => setColumns(prev => ({ ...prev, showSinif: c }))}
            />
            {mode === 'rankings' && (
              <CheckItem
                label="Ders Detayları"
                checked={columns.showSubSections}
                onChange={c => setColumns(prev => ({ ...prev, showSubSections: c }))}
              />
            )}
            <CheckItem
              label="D / Y / B Detayı"
              checked={columns.showDYB}
              onChange={c => setColumns(prev => ({ ...prev, showDYB: c }))}
            />
            <CheckItem
              label="Tahmini TR Sıralaması"
              checked={columns.showTahminiSiralama}
              onChange={c => setColumns(prev => ({ ...prev, showTahminiSiralama: c }))}
            />
            <CheckItem
              label="Yüzdelik Dilim (TR)"
              checked={columns.showYuzdelikDilim}
              onChange={c => setColumns(prev => ({ ...prev, showYuzdelikDilim: c }))}
            />
            <CheckItem
              label="Kurum İçi Yüzdelik"
              checked={columns.showKurumYuzdelik}
              onChange={c => setColumns(prev => ({ ...prev, showKurumYuzdelik: c }))}
            />
            {mode === 'rankings' && (
              <CheckItem
                label="Kurs Ortalaması Satırı"
                checked={columns.showKursOrtalamasi}
                onChange={c => setColumns(prev => ({ ...prev, showKursOrtalamasi: c }))}
              />
            )}
            {mode === 'rankings' && (
              <CheckItem
                label="İstatistik Grafikleri (Son Sayfa)"
                checked={columns.showCharts}
                onChange={c => setColumns(prev => ({ ...prev, showCharts: c }))}
              />
            )}
          </div>

          {/* ─── 4. PUAN TÜRLERİ (Sadece AYT) ─── */}
          {isAyt && (
            <>
          <SectionTitle icon="🎯" title="Puan Türleri" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <CheckItem
              label="Puan Türleri Göster"
              checked={columns.showPuanTurleri}
              onChange={c => setColumns(prev => ({ ...prev, showPuanTurleri: c }))}
            />
            {columns.showPuanTurleri && (
              <div style={{ display: 'flex', gap: 12, marginLeft: 8 }}>
                {(['SAY', 'EA', 'SOZ'] as const).map(pt => (
                  <CheckItem
                    key={pt}
                    label={pt}
                    checked={columns.visiblePuanTurleri.includes(pt)}
                    onChange={c => togglePuanTuru(pt, c)}
                  />
                ))}
              </div>
            )}
          </div>
            </>
          )}

          {/* ─── Önizleme bilgi ─── */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 12, fontSize: 12, color: '#0369a1' }}>
            <strong>ℹ️ Önizleme:</strong>{' '}
            {mode === 'rankings' ? (
              <>
                {columns.visibleSections ? columns.visibleSections.length : sections.length} alan/ders ·{' '}
                {columns.showDYB ? 'D/Y/Net detaylı' : 'Sadece Net'} ·{' '}
                {isAyt ? (columns.showPuanTurleri ? columns.visiblePuanTurleri.join('/') : 'Puan türleri gizli') : ''}{isAyt ? ' · ' : ''}
                {columns.showTahminiSiralama ? 'Tah. sıralama ✓' : 'Tah. sıralama ✗'} ·{' '}
                {alanFilter ? ALAN_LABELS[alanFilter] : 'Tüm alanlar'}
              </>
            ) : (
              <>
                {columns.showDYB ? 'D/Y/B detaylı' : 'Özet'} ·{' '}
                {isAyt ? (columns.showPuanTurleri ? columns.visiblePuanTurleri.join('/') : 'Puan türleri gizli') : ''}{isAyt ? ' · ' : ''}
                {columns.showTahminiSiralama ? 'Tah. sıralama ✓' : 'Tah. sıralama ✗'} ·{' '}
                {alanFilter ? ALAN_LABELS[alanFilter] : 'Tüm alanlar'}
              </>
            )}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc',
        }}>
          <button
            onClick={onClose}
            style={{ background: '#e2e8f0', color: '#475569', padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            İptal
          </button>
          <button
            onClick={handleExport}
            disabled={generating}
            style={{
              background: generating ? '#94a3b8' : 'linear-gradient(135deg, #0262a7, #0284c7)',
              color: '#fff', padding: '8px 28px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: generating ? 'none' : '0 2px 8px rgba(2,98,167,0.3)',
            }}
          >
            {generating ? (
              <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span> Oluşturuluyor…</>
            ) : (
              <>📄 PDF Oluştur ve İndir</>
            )}
          </button>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );

  return createPortal(content, portalRoot);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  YARDIMCI BİLEŞENLER                                                       */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{title}</h4>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

function CheckItem({ label, checked, onChange, bold }: { label: string; checked: boolean; onChange: (c: boolean) => void; bold?: boolean }) {
  return (
    <label style={{
      fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
      color: checked ? '#0f172a' : '#94a3b8', fontWeight: bold ? 600 : 400,
      transition: 'color 0.15s',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: '#0262a7' }}
      />
      {label}
    </label>
  );
}

function MiniBtn({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#0262a7' : '#e2e8f0',
        color: active ? '#fff' : '#475569',
        padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 12,
  background: '#fff',
  color: '#0f172a',
  outline: 'none',
};
