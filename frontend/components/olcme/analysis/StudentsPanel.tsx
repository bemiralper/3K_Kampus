'use client';

import { useState } from 'react';

import InfoTip from './InfoTip';
import PdfExportModal from '../PdfExportModal';
import KarneNotifyModal from './KarneNotifyModal';
import KarneBulkNotifyModal from './KarneBulkNotifyModal';
import { analysisApi } from '../api';
import { ALAN_LABELS } from '../pdfExport';
import Icon from '../ui/Icon';
import { Panel, EmptyState } from '../ui/analysis';
import type { StudentAnalysis } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

export default function StudentsPanel({
  students, search, onSearch, onSelect, examName, examType, examId, rankingYear,
}: {
  students: StudentAnalysis[];
  search: string;
  onSearch: (v: string) => void;
  onSelect: (s: StudentAnalysis) => void;
  examName: string;
  examType: string;
  examId: number;
  rankingYear?: number;
}) {
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [alanViewFilter, setAlanViewFilter] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const [notifyStudent, setNotifyStudent] = useState<StudentAnalysis | null>(null);
  const [showBulkNotify, setShowBulkNotify] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const downloadOne = async (st: StudentAnalysis) => {
    setPdfBusyId(st.answer_id);
    setPdfError('');
    try {
      await analysisApi.downloadKarnePdf(examId, st.answer_id, rankingYear);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Karne PDF indirilemedi.');
    } finally {
      setPdfBusyId(null);
    }
  };

  if (!students.length && !search) {
    return (
      <Panel title="Öğrenci Detay" icon="users">
        <EmptyState
          title="Öğrenci verisi yok"
          description="Sonuçlar yüklendikten sonra öğrenci bazlı net, puan ve sıralama bilgileri burada listelenir."
        />
      </Panel>
    );
  }

  const displayStudents = alanViewFilter
    ? students.filter(st => st.alan === alanViewFilter)
    : students;

  const uniqueSiniflar = Array.from(new Set(students.map(st => st.sinif).filter(Boolean))) as string[];
  const showPuanTurleri = examType === 'YKS_AYT' && displayStudents.some(st => st.puan_turleri);

  return (
    <>
      <Panel
        title="Öğrenci Detay"
        icon="users"
        subtitle={`${displayStudents.length} öğrenci listeleniyor${alanViewFilter ? ' (alan filtresi etkin)' : ''}`}
        flush
        actions={
          <>
            <select
              className={s.analysisSelect}
              value={alanViewFilter || ''}
              onChange={e => setAlanViewFilter(e.target.value || null)}
              aria-label="Alana göre filtrele"
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
            <button type="button" className={s.olcmeBtnPrimary} onClick={() => setShowPdfModal(true)}>
              <Icon name="download" size={14} />
              Karne PDF
            </button>
            <button type="button" className={s.olcmeBtnSuccess} onClick={() => setShowBulkNotify(true)}>
              <Icon name="users" size={14} />
              Toplu WhatsApp
            </button>
          </>
        }
      >
        {pdfError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            margin: '14px 22px 0', padding: '10px 14px',
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 10, color: '#991b1b', fontSize: 12.5,
          }}>
            <Icon name="error" size={16} />
            <span style={{ flex: 1 }}>{pdfError}</span>
            <button
              type="button"
              onClick={() => setPdfError('')}
              aria-label="Kapat"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', display: 'flex' }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        {displayStudents.length === 0 ? (
          <EmptyState
            icon="search"
            title="Eşleşen öğrenci bulunamadı"
            description="Arama teriminizi veya alan filtresini değiştirmeyi deneyin."
          />
        ) : (
          <div className={s.analysisTableWrap}>
            <table className={s.analysisTable}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Sıra</th>
                  <th>Öğrenci</th>
                  <th>Sınıf</th>
                  <th style={{ textAlign: 'center' }}>Net</th>
                  <th style={{ textAlign: 'center' }}>Puan</th>
                  {showPuanTurleri && (
                    <>
                      <th style={{ textAlign: 'center', color: '#0262a7' }}>SAY</th>
                      <th style={{ textAlign: 'center', color: '#7c3aed' }}>EA</th>
                      <th style={{ textAlign: 'center', color: '#059669' }}>SÖZ</th>
                    </>
                  )}
                  <th style={{ textAlign: 'center' }}>Kurum Sıra</th>
                  <th style={{ textAlign: 'center' }}>Tah. TR Sıra <InfoTip tip="tahminiSiralama" /></th>
                  <th style={{ textAlign: 'center' }}>Yüzdelik <InfoTip tip="yuzdelikDilim" /></th>
                  <th>Güçlü Alan</th>
                  <th>Zayıf Alan</th>
                  <th style={{ textAlign: 'right' }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {displayStudents.map(st => (
                  <tr key={st.answer_id}>
                    <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{st.kurum_ici_sira}</td>
                    <td style={{ fontWeight: 600 }}>
                      {st.student_name}
                      {!st.student_id && (
                        <div style={{ fontSize: 10.5, color: '#b45309' }}>öğrenci kaydıyla eşleşmedi</div>
                      )}
                    </td>
                    <td>{st.sinif || '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{st.toplam_net}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#0262a7' }}>{st.puan}</td>
                    {showPuanTurleri && (
                      <>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: '#0262a7', fontSize: 12 }}>{st.puan_turleri?.SAY.puan ?? '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: '#7c3aed', fontSize: 12 }}>{st.puan_turleri?.EA.puan ?? '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: '#059669', fontSize: 12 }}>{st.puan_turleri?.SOZ.puan ?? '—'}</td>
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
                    <td style={{ fontSize: 12, color: '#15803d' }}>
                      {st.strong_areas.map(a => a.name).join(', ') || '—'}
                    </td>
                    <td style={{ fontSize: 12, color: '#b91c1c' }}>
                      {st.weak_areas.map(a => a.name).join(', ') || '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <IconButton label="Detayı aç" icon="search" onClick={() => onSelect(st)} />
                        <IconButton
                          label="Karne PDF indir"
                          icon={pdfBusyId === st.answer_id ? 'refresh' : 'download'}
                          onClick={() => downloadOne(st)}
                          disabled={pdfBusyId === st.answer_id}
                          spinning={pdfBusyId === st.answer_id}
                        />
                        <IconButton
                          label={st.student_id ? 'WhatsApp ile gönder' : 'Öğrenci kaydı eşleşmediği için gönderilemez'}
                          icon="link"
                          onClick={() => setNotifyStudent(st)}
                          disabled={!st.student_id}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {showPdfModal && (
        <PdfExportModal
          mode="students"
          examId={examId}
          rankingYear={rankingYear}
          examName={examName}
          examType={examType}
          students={students}
          uniqueSiniflar={uniqueSiniflar}
          onClose={() => setShowPdfModal(false)}
        />
      )}
      {showBulkNotify && (
        <KarneBulkNotifyModal
          examId={examId}
          examName={examName}
          examType={examType}
          students={students}
          uniqueSiniflar={uniqueSiniflar}
          rankingYear={rankingYear}
          onClose={() => setShowBulkNotify(false)}
        />
      )}
      {notifyStudent && (
        <KarneNotifyModal
          examId={examId}
          answerId={notifyStudent.answer_id}
          studentName={notifyStudent.student_name}
          rankingYear={rankingYear}
          onClose={() => setNotifyStudent(null)}
        />
      )}
    </>
  );
}

function IconButton({ label, icon, onClick, disabled, spinning }: {
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  onClick: () => void;
  disabled?: boolean;
  spinning?: boolean;
}) {
  return (
    <button
      type="button"
      className={s.olcmeIconBtn}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} size={14} className={spinning ? s.olcmeSpinning : undefined} />
    </button>
  );
}
