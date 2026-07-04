'use client';

import { useState } from 'react';
import InfoTip from './InfoTip';
import PdfExportModal from '../PdfExportModal';
import { ALAN_LABELS } from '../pdfExport';
import type { RankingItem, RankingSectionInfo } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

// Alan kodu → puan türü key mapping
const ALAN_TO_PT: Record<string, string> = {
  SAYISAL: 'SAY',
  ESIT_AGIRLIK: 'EA',
  SOZEL: 'SOZ',
};

export default function RankingsPanel({ rankings, meta, rankingYear, onRankingYearChange, sections, examName, examType, sectionAvgs, avgNet, puanTurleriAvgs, sinifAvgs }: {
  rankings: RankingItem[];
  meta: { top_10_count: number; bottom_10_count: number; avg_score: number; referans_yil: number };
  rankingYear: number;
  onRankingYearChange: (y: number) => void;
  sections: RankingSectionInfo[];
  examName: string;
  examType: string;
  sectionAvgs?: Record<string, { avg_correct: number; avg_wrong: number; avg_net: number }>;
  avgNet?: number;
  puanTurleriAvgs?: Record<string, number>;
  sinifAvgs?: Record<string, any>;
}) {
  const [showSubSections, setShowSubSections] = useState(true);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [alanViewFilter, setAlanViewFilter] = useState<string | null>(null);

  if (!rankings.length) return <div className={s.analysisEmpty}>Sıralama verisi yok.</div>;

  // Alan bazlı view filtresi
  // Alan filtresi seçilince o alana ait öğrencileri filtrele VE ilgili PT puanına göre sırala
  const displayRankings = (() => {
    let list = alanViewFilter
      ? rankings.filter(r => r.alan === alanViewFilter)
      : [...rankings];

    // Alan filtresi aktifken ilgili PT puanına göre sırala
    if (alanViewFilter) {
      const ptKey = ALAN_TO_PT[alanViewFilter]; // SAYISAL→SAY, ESIT_AGIRLIK→EA, SOZEL→SOZ
      if (ptKey) {
        list.sort((a, b) => {
          const pa = a.puan_turleri?.[ptKey]?.puan ?? a.puan;
          const pb = b.puan_turleri?.[ptKey]?.puan ?? b.puan;
          return pb - pa;
        });
      }
    }

    // Sıra numarasını yeniden ata (alan filtresi aktifken 1'den başlar)
    return list.map((r, idx) => ({
      ...r,
      _displaySira: alanViewFilter ? idx + 1 : r.kurum_ici_sira,
    }));
  })();

  // Benzersiz sınıf listesi (pdf filtre için)
  const uniqueSiniflar = Array.from(new Set(rankings.map(r => r.sinif).filter(Boolean))) as string[];

  // Alanlar (parent) ve dersler (child) grupla
  const mainSections = sections.filter(sec => !sec.is_sub_section);
  const subSectionsMap: Record<number, typeof sections> = {};
  sections.filter(sec => sec.is_sub_section && sec.parent_id).forEach(sec => {
    if (!subSectionsMap[sec.parent_id!]) subSectionsMap[sec.parent_id!] = [];
    subSectionsMap[sec.parent_id!].push(sec);
  });

  const hasSubSections = sections.some(sec => sec.is_sub_section);

  // Dersler açıkken: her alan/ders için D/Y/Net = 3 sütun
  // Dersler kapalıyken: her alan için sadece Net = 1 sütun
  const colsPerSection = showSubSections ? 3 : 1;

  // Alanın soru sayısından derslerin soru sayısını çıkararak residual hesapla
  const getResidualQuestionCount = (main: typeof sections[0]): number => {
    const subs = subSectionsMap[main.id];
    if (!subs || subs.length === 0) return main.question_count;
    const subTotal = subs.reduce((sum, sub) => sum + sub.question_count, 0);
    return main.question_count - subTotal;
  };

  // Grouped header: alan başlıkları (colspan = (ders_sayısı + 1) * colsPerSection)
  const buildGroupedHeaders = () => {
    if (!showSubSections) return null;
    const groups: { name: string; span: number; qCount: number; residualQ: number; hasSubs: boolean }[] = [];
    mainSections.forEach(main => {
      const subs = subSectionsMap[main.id];
      const residual = getResidualQuestionCount(main);
      // Dersler alanın tüm sorularını kapsıyorsa, alan sütunu atla
      const showMainCol = !subs || subs.length === 0 || residual > 0;
      const count = subs && subs.length > 0 ? subs.length + (showMainCol ? 1 : 0) : 1;
      groups.push({ name: main.name, span: count * colsPerSection, qCount: main.question_count, residualQ: residual, hasSubs: !!(subs && subs.length > 0) });
    });
    return groups;
  };

  const groupedHeaders = buildGroupedHeaders();

  // Flat ordered list: her alan → alan (residual>0 ise) + dersleri
  const orderedSections: typeof sections = [];
  mainSections.forEach(main => {
    const residual = getResidualQuestionCount(main);
    const subs = subSectionsMap[main.id];
    // Dersler alanın tüm sorularını kapsıyorsa, alan sütunu atla (showSubSections'a bağlı değil)
    const showMainCol = !subs || subs.length === 0 || residual > 0;
    if (showMainCol) orderedSections.push(main);
    if (showSubSections && subSectionsMap[main.id]) {
      subSectionsMap[main.id].forEach(sub => orderedSections.push(sub));
    }
  });

  // Kısa isim + soru sayısı (alan ise residual, ders ise kendi soru sayısı)
  const shortName = (sec: typeof sections[0]) => {
    if (sec.is_sub_section) {
      return `${sec.name.substring(0, 4)}. (${sec.question_count})`;
    }
    // Alan (parent): her zaman residual soru sayısı göster
    const subs = subSectionsMap[sec.id];
    if (subs && subs.length > 0) {
      const residualQ = getResidualQuestionCount(sec);
      return `${sec.name.substring(0, 5)}. (${residualQ})`;
    }
    return `${sec.name.substring(0, 5)}. (${sec.question_count})`;
  };

  // Per-row: alandan dersleri çıkararak residual D/Y/B/Net hesapla (HER ZAMAN)
  const getRowData = (r: RankingItem, sec: typeof sections[0]): { net: number; correct: number; wrong: number; empty: number } | undefined => {
    const data = r.section_nets?.[String(sec.id)];
    if (!data) return undefined;
    if (sec.is_sub_section) return data;
    // Alan (parent): her zaman alt derslerini çıkar
    const subs = subSectionsMap[sec.id];
    if (!subs || subs.length === 0) return data;
    let subCorrect = 0, subWrong = 0, subEmpty = 0, subNet = 0;
    subs.forEach(sub => {
      const sd = r.section_nets?.[String(sub.id)];
      if (sd) {
        subCorrect += sd.correct;
        subWrong += sd.wrong;
        subEmpty += sd.empty;
        subNet += sd.net;
      }
    });
    return {
      correct: data.correct - subCorrect,
      wrong: data.wrong - subWrong,
      empty: data.empty - subEmpty,
      net: Math.round((data.net - subNet) * 100) / 100,
    };
  };

  return (
    <div className={s.analysisPanel}>
      <div className={s.analysisPanelHeader}>
        <h3 className={s.analysisPanelTitle}>Sıralama ve Yüzdelik Dilim</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Alan Filtresi */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>Alan:</label>
            <select
              className={s.analysisSelect}
              value={alanViewFilter || ''}
              onChange={e => setAlanViewFilter(e.target.value || null)}
              style={{ fontSize: 11 }}
            >
              <option value="">Tümü ({rankings.length})</option>
              {Object.entries(ALAN_LABELS).map(([kod, label]) => {
                const count = rankings.filter(r => r.alan === kod).length;
                return count > 0 ? <option key={kod} value={kod}>{label} ({count})</option> : null;
              })}
            </select>
          </div>
          {hasSubSections && (
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#64748b' }}>
              <input
                type="checkbox"
                checked={showSubSections}
                onChange={e => setShowSubSections(e.target.checked)}
              />
              Dersler
            </label>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>Referans Yılı:</label>
            <select
              className={s.analysisSelect}
              value={rankingYear}
              onChange={e => onRankingYearChange(Number(e.target.value))}
            >
              <option value={2025}>2025 YKS</option>
              <option value={2024}>2024 YKS</option>
              <option value={2023}>2023 YKS</option>
            </select>
          </div>
          {/* PDF Dışa Aktar Butonu */}
          <button
            className={s.analysisBtnSmall}
            onClick={() => setShowPdfModal(true)}
            style={{ background: '#0262a7', color: '#fff', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            📄 PDF İndir
          </button>
        </div>
      </div>

      {/* PDF Dışa Aktarma Modal */}
      {showPdfModal && (
        <PdfExportModal
          mode="rankings"
          examName={examName}
          examType={examType}
          sections={sections}
          rankings={rankings}
          uniqueSiniflar={uniqueSiniflar}
          referansYil={rankingYear}
          sectionAvgs={sectionAvgs}
          avgScore={meta.avg_score}
          avgNet={avgNet}
          puanTurleriAvgs={puanTurleriAvgs}
          sinifAvgs={sinifAvgs}
          onClose={() => setShowPdfModal(false)}
        />
      )}

      <div className={s.analysisGrid4}>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue}>{displayRankings.length}{alanViewFilter ? <span style={{ fontSize: 11, color: '#94a3b8' }}>/{rankings.length}</span> : ''}</div>
          <div className={s.analysisStatLabel}>Toplam Öğrenci</div>
        </div>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue} style={{ color: '#0262a7' }}>
            {alanViewFilter && displayRankings.length > 0
              ? (displayRankings.reduce((sum, r) => sum + r.puan, 0) / displayRankings.length).toFixed(2)
              : meta.avg_score
            }
          </div>
          <div className={s.analysisStatLabel}>Ortalama Puan</div>
        </div>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue} style={{ color: '#16a34a' }}>
            {alanViewFilter
              ? displayRankings.filter(r => r.kurum_ici_yuzdelik >= 90).length
              : meta.top_10_count
            }
          </div>
          <div className={s.analysisStatLabel}>İlk %10 Dilim</div>
        </div>
        <div className={s.analysisStatCard}>
          <div className={s.analysisStatValue} style={{ color: '#ef4444' }}>
            {alanViewFilter
              ? displayRankings.filter(r => r.kurum_ici_yuzdelik <= 10).length
              : meta.bottom_10_count
            }
          </div>
          <div className={s.analysisStatLabel}>Son %10 Dilim</div>
        </div>
      </div>

      <div className={s.analysisTableWrap}>
        <table className={s.analysisTable} style={{ fontSize: 11 }}>
          <thead>
            {/* Grup başlık satırı (dersler açıkken) */}
            {showSubSections && groupedHeaders && (
              <tr>
                <th colSpan={3} style={{ borderBottom: 'none' }}></th>
                {groupedHeaders.map((g, i) => (
                  <th
                    key={i}
                    colSpan={g.span}
                    style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#0262a7', borderBottom: '2px solid #0262a7', background: '#f0f7ff' }}
                  >
                    {g.name}
                  </th>
                ))}
                <th colSpan={examType === 'YKS_AYT' && displayRankings.length > 0 && displayRankings[0].puan_turleri ? 6 : 4} style={{ borderBottom: 'none' }}></th>
              </tr>
            )}
            {/* Alt başlık satırı: alan/ders adları + D/Y/Net */}
            <tr>
              <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2 }}>Sıra</th>
              <th style={{ position: 'sticky', left: 40, background: '#f8fafc', zIndex: 2 }}>Öğrenci</th>
              <th style={{ textAlign: 'center' }}>Net</th>
              {orderedSections.map(sec => {
                const isSub = sec.is_sub_section;
                const baseStyle = {
                  textAlign: 'center' as const,
                  whiteSpace: 'nowrap' as const,
                  fontSize: isSub ? 9 : 10,
                  fontWeight: isSub ? 500 : 700,
                  color: isSub ? '#64748b' : '#334155',
                  padding: '4px 2px',
                };
                if (showSubSections) {
                  return [
                    <th key={`${sec.id}-d`} style={{ ...baseStyle, color: '#16a34a' }} title={`${sec.name} Doğru`}>D</th>,
                    <th key={`${sec.id}-y`} style={{ ...baseStyle, color: '#ef4444' }} title={`${sec.name} Yanlış`}>Y</th>,
                    <th key={`${sec.id}-n`} style={{ ...baseStyle, borderRight: '1px solid #e2e8f0' }} title={`${sec.name} Net`}>{shortName(sec)}</th>,
                  ];
                }
                return (
                  <th key={sec.id} style={baseStyle}>{shortName(sec)}</th>
                );
              })}
              {/* AYT'de puan türleri ayrı gösteriliyor, tekrar Puan sütunu gereksiz */}
              {!(examType === 'YKS_AYT' && displayRankings.length > 0 && displayRankings[0].puan_turleri) && (
                <th style={{ textAlign: 'center' }}>Puan</th>
              )}
              {examType === 'YKS_AYT' && displayRankings.length > 0 && displayRankings[0].puan_turleri && (
                <>
                  <th style={{ textAlign: 'center', color: '#0262a7', fontSize: 10, whiteSpace: 'nowrap' }}>SAY</th>
                  <th style={{ textAlign: 'center', color: '#7c3aed', fontSize: 10, whiteSpace: 'nowrap' }}>EA</th>
                  <th style={{ textAlign: 'center', color: '#059669', fontSize: 10, whiteSpace: 'nowrap' }}>SÖZ</th>
                </>
              )}
              <th style={{ textAlign: 'center' }}>Kurum %</th>
              <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Tah. Sıra ({meta.referans_yil}) <InfoTip tip="tahminiSiralama" /></th>
              <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Yüzdelik <InfoTip tip="yuzdelikDilim" /></th>
            </tr>
          </thead>
          <tbody>
            {displayRankings.map(r => (
              <tr key={r.answer_id}>
                <td style={{ fontWeight: 700, color: r._displaySira <= 3 ? '#f59e0b' : '#64748b', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                  {r._displaySira <= 3 ? '🏅 ' : ''}{r._displaySira}
                </td>
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', left: 40, background: '#fff', zIndex: 1 }}>{r.student_name}</td>
                <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.toplam_net.toFixed(2)}</td>
                {orderedSections.map(sec => {
                  const data = getRowData(r, sec);
                  const net = data?.net;
                  const correct = data?.correct;
                  const wrong = data?.wrong;
                  const isSub = sec.is_sub_section;

                  if (showSubSections) {
                    return [
                      <td key={`${sec.id}-d`} style={{ textAlign: 'center', fontSize: 10, color: correct && correct > 0 ? '#16a34a' : '#cbd5e1', padding: '3px 2px' }}>
                        {correct ?? 0}
                      </td>,
                      <td key={`${sec.id}-y`} style={{ textAlign: 'center', fontSize: 10, color: wrong && wrong > 0 ? '#ef4444' : '#cbd5e1', padding: '3px 2px' }}>
                        {wrong ?? 0}
                      </td>,
                      <td key={`${sec.id}-n`} style={{
                        textAlign: 'center',
                        fontSize: isSub ? 10 : 11,
                        fontWeight: isSub ? 500 : 700,
                        color: net != null && net > 0 ? '#334155' : '#cbd5e1',
                        padding: '3px 2px',
                        borderRight: '1px solid #e2e8f0',
                      }}>
                        {net != null ? net.toFixed(2) : '—'}
                      </td>,
                    ];
                  }
                  return (
                    <td
                      key={sec.id}
                      style={{
                        textAlign: 'center',
                        fontSize: isSub ? 10 : 11,
                        fontWeight: isSub ? 400 : 600,
                        color: net != null && net > 0 ? '#334155' : '#cbd5e1',
                        padding: '3px 2px',
                      }}
                    >
                      {net != null ? net.toFixed(2) : '—'}
                    </td>
                  );
                })}
                {/* AYT'de puan türleri ayrı gösteriliyor, tekrar Puan gereksiz */}
                {!(examType === 'YKS_AYT' && r.puan_turleri) && (
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#0262a7' }}>{r.puan}</td>
                )}
                {examType === 'YKS_AYT' && r.puan_turleri && (
                  <>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#0262a7', fontSize: 10 }}>{r.puan_turleri.SAY?.puan}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#7c3aed', fontSize: 10 }}>{r.puan_turleri.EA?.puan}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#059669', fontSize: 10 }}>{r.puan_turleri.SOZ?.puan}</td>
                  </>
                )}
                <td style={{ textAlign: 'center' }}>
                  <span className={`${s.percentileBadge} ${r.kurum_ici_yuzdelik >= 75 ? s.percentileHigh : r.kurum_ici_yuzdelik >= 50 ? s.percentileMid : s.percentileLow}`}>
                    %{r.kurum_ici_yuzdelik}
                  </span>
                </td>
                <td style={{ textAlign: 'center', fontSize: 11 }}>
                  {(() => {
                    // Alan filtresi aktifse o alana ait tahmini sıralamayı göster
                    const ptKey = alanViewFilter ? ALAN_TO_PT[alanViewFilter] : null;
                    const sira = ptKey && r.puan_turleri?.[ptKey]?.tahmini_siralama
                      ? r.puan_turleri[ptKey].tahmini_siralama
                      : r.tahmini_siralama;
                    return sira ? sira.toLocaleString('tr-TR') : '—';
                  })()}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {(() => {
                    const ptKey = alanViewFilter ? ALAN_TO_PT[alanViewFilter] : null;
                    const yd = ptKey && r.puan_turleri?.[ptKey]?.yuzdelik_dilim != null
                      ? r.puan_turleri[ptKey].yuzdelik_dilim
                      : r.yuzdelik_dilim;
                    return yd ? `%${yd}` : '—';
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.analysisDisclaimer}>
        ⚠️ Tahmini Türkiye sıralaması ve yüzdelik dilim, {meta.referans_yil} YKS verileri referans alınarak hesaplanmıştır. Kesin değildir.
      </div>
    </div>
  );
}
