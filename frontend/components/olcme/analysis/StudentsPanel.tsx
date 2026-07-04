'use client';

import { useState } from 'react';
import InfoTip from './InfoTip';
import PdfExportModal from '../PdfExportModal';
import { ALAN_LABELS } from '../pdfExport';
import type { StudentAnalysis } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

export default function StudentsPanel({
  students, search, onSearch, onSelect, examName, examType,
}: {
  students: StudentAnalysis[];
  search: string;
  onSearch: (v: string) => void;
  onSelect: (s: StudentAnalysis) => void;
  examName: string;
  examType: string;
}) {
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [alanViewFilter, setAlanViewFilter] = useState<string | null>(null);

  if (!students.length && !search) {
    return <div className={s.analysisEmpty}>Öğrenci verisi yok.</div>;
  }

  const displayStudents = alanViewFilter
    ? students.filter(st => st.alan === alanViewFilter)
    : students;

  const uniqueSiniflar = Array.from(new Set(students.map(st => st.sinif).filter(Boolean))) as string[];

  return (
    <div className={s.analysisPanel}>
      <div className={s.analysisPanelHeader}>
        <h3 className={s.analysisPanelTitle}>Öğrenci Bazlı Analiz</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Alan Filtresi */}
          <select
            className={s.analysisSelect}
            value={alanViewFilter || ''}
            onChange={e => setAlanViewFilter(e.target.value || null)}
            style={{ fontSize: 11 }}
          >
            <option value="">Tüm Alanlar</option>
            {Object.entries(ALAN_LABELS).map(([kod, label]) => {
              const count = students.filter(st => st.alan === kod).length;
              return count > 0 ? <option key={kod} value={kod}>{label} ({count})</option> : null;
            })}
          </select>
          <input
            className={s.analysisSearchInput}
            placeholder="Ad, numara veya sınıf ara…"
            value={search}
            onChange={e => onSearch(e.target.value)}
          />
          <button
            className={s.analysisBtnSmall}
            onClick={() => setShowPdfModal(true)}
            style={{ background: '#0262a7', color: '#fff', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            📄 PDF
          </button>
        </div>
      </div>

      {/* PDF Dışa Aktarma Modal */}
      {showPdfModal && (
        <PdfExportModal
          mode="students"
          examName={examName}
          examType={examType}
          students={students}
          uniqueSiniflar={uniqueSiniflar}
          onClose={() => setShowPdfModal(false)}
        />
      )}

      <div className={s.analysisTableWrap}>
        <table className={s.analysisTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Öğrenci</th>
              <th>Sınıf</th>
              <th style={{ textAlign: 'center' }}>Net</th>
              <th style={{ textAlign: 'center' }}>Puan</th>
              {examType === 'YKS_AYT' && displayStudents.length > 0 && displayStudents[0].puan_turleri && (
                <>
                  <th style={{ textAlign: 'center', color: '#0262a7', fontSize: 11 }}>SAY</th>
                  <th style={{ textAlign: 'center', color: '#7c3aed', fontSize: 11 }}>EA</th>
                  <th style={{ textAlign: 'center', color: '#059669', fontSize: 11 }}>SÖZ</th>
                </>
              )}
              <th style={{ textAlign: 'center' }}>Kurum Sıra</th>
              <th style={{ textAlign: 'center' }}>Tah. TR Sıra <InfoTip tip="tahminiSiralama" /></th>
              <th style={{ textAlign: 'center' }}>Yüzdelik <InfoTip tip="yuzdelikDilim" /></th>
              <th>Güçlü</th>
              <th>Zayıf</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayStudents.map((st, idx) => (
              <tr key={st.answer_id}>
                <td style={{ color: '#94a3b8', fontSize: 12 }}>{st.kurum_ici_sira}</td>
                <td style={{ fontWeight: 600 }}>{st.student_name}</td>
                <td>{st.sinif || '—'}</td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{st.toplam_net}</td>
                <td style={{ textAlign: 'center', fontWeight: 600, color: '#0262a7' }}>{st.puan}</td>
                {examType === 'YKS_AYT' && st.puan_turleri && (
                  <>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#0262a7', fontSize: 12 }}>{st.puan_turleri.SAY.puan}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#7c3aed', fontSize: 12 }}>{st.puan_turleri.EA.puan}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#059669', fontSize: 12 }}>{st.puan_turleri.SOZ.puan}</td>
                  </>
                )}
                <td style={{ textAlign: 'center' }}>{st.kurum_ici_sira}/{st.toplam_ogrenci}</td>
                <td style={{ textAlign: 'center', fontSize: 12 }}>
                  {st.tahmini_siralama ? st.tahmini_siralama.toLocaleString('tr-TR') : '—'}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`${s.percentileBadge} ${st.kurum_ici_yuzdelik >= 75 ? s.percentileHigh : st.kurum_ici_yuzdelik >= 50 ? s.percentileMid : s.percentileLow}`}>
                    %{st.kurum_ici_yuzdelik}
                  </span>
                </td>
                <td style={{ fontSize: 12 }}>
                  {st.strong_areas.map(a => a.name).join(', ') || '—'}
                </td>
                <td style={{ fontSize: 12, color: '#ef4444' }}>
                  {st.weak_areas.map(a => a.name).join(', ') || '—'}
                </td>
                <td>
                  <button className={s.analysisBtnSmall} onClick={() => onSelect(st)} title="Detay">
                    🔍
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
