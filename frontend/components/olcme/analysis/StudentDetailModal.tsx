'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import InfoTip from './InfoTip';
import { analysisApi } from '../api';
import type { StudentAnalysis, StudentDetailResponse } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

export default function StudentDetailModal({ student, examId, examType, onClose }: { student: StudentAnalysis; examId: number; examType?: string; onClose: () => void }) {
  const [detail, setDetail] = useState<StudentDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  // API'den zengin detay verisini çek
  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');
    analysisApi.studentDetail(examId, student.answer_id)
      .then(data => { if (!cancelled) setDetail(data); })
      .catch(err => { if (!cancelled) setDetailError(err.message); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [examId, student.answer_id]);

  // Overlay tıklama — sadece overlay'e tıklandıysa kapat (TypeError fix)
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);

  // ESC ile kapatma
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Karşılaştırma bar yardımcısı
  const CompBar = ({ label, studentVal, sinifVal, kurumVal, maxVal }: { label: string; studentVal: number; sinifVal: number; kurumVal: number; maxVal: number }) => {
    const cap = Math.max(maxVal, 1);
    const pctS = Math.min(100, (studentVal / cap) * 100);
    const pctSinif = Math.min(100, (sinifVal / cap) * 100);
    const pctKurum = Math.min(100, (kurumVal / cap) * 100);
    const diffK = studentVal - kurumVal;
    const diffSn = studentVal - sinifVal;
    return (
      <div className={s.compBarItem}>
        <div className={s.compBarLabel}>
          <span>{label}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <span className={`${s.compBarDiff} ${diffSn > 0 ? s.compBarDiffPos : diffSn < 0 ? s.compBarDiffNeg : s.compBarDiffNeutral}`}>
              Sınıf: {diffSn > 0 ? '+' : ''}{diffSn.toFixed(1)}
            </span>
            <span className={`${s.compBarDiff} ${diffK > 0 ? s.compBarDiffPos : diffK < 0 ? s.compBarDiffNeg : s.compBarDiffNeutral}`}>
              Kurum: {diffK > 0 ? '+' : ''}{diffK.toFixed(1)}
            </span>
          </span>
        </div>
        <div className={s.compBarTrack}>
          <div className={`${s.compBarFill} ${s.compBarFillKurum}`} style={{ width: `${pctKurum}%` }} />
          <div className={`${s.compBarFill} ${s.compBarFillSinif}`} style={{ width: `${pctSinif}%` }} />
          <div className={`${s.compBarFill} ${s.compBarFillStudent}`} style={{ width: `${pctS}%` }} />
        </div>
      </div>
    );
  };

  // Doğruluk oranı gauge
  const Gauge = ({ pct, color }: { pct: number; color: string }) => {
    const r = 34;
    const circ = 2 * Math.PI * r;
    const offset = circ - (Math.min(pct, 100) / 100) * circ;
    return (
      <div className={s.gaugeCircle}>
        <svg viewBox="0 0 80 80">
          <circle className={s.gaugeTrack} cx="40" cy="40" r={r} />
          <circle className={s.gaugeFill} cx="40" cy="40" r={r} stroke={color} strokeDasharray={circ} strokeDashoffset={offset} />
        </svg>
        <span className={s.gaugeText}>%{pct.toFixed(0)}</span>
      </div>
    );
  };

  return (
    <div className={s.matchDialogOverlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={s.studentDetailModal} onClick={e => e.stopPropagation()}>
        <div className={s.studentDetailHeader}>
          <h3>{student.student_name}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                const modal = document.querySelector(`.${s.studentDetailModal}`) as HTMLElement;
                if (!modal) return;
                const printWin = window.open('', '_blank');
                if (!printWin) return;
                // Stilleri kopyala
                const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
                  .map(el => el.outerHTML).join('');
                printWin.document.write(`<!DOCTYPE html><html><head><title>${student.student_name} — Öğrenci Raporu</title>${styles}
                  <style>body{padding:20px;background:#fff;font-family:system-ui,-apple-system,sans-serif;}
                  .${s.matchDialogOverlay}{position:static!important;background:none!important;}
                  .${s.studentDetailModal}{box-shadow:none!important;max-height:none!important;overflow:visible!important;max-width:100%!important;}
                  @media print{body{padding:0;}.${s.analysisBtnSmall}{display:none!important;}}</style>
                  </head><body>${modal.outerHTML}</body></html>`);
                printWin.document.close();
                setTimeout(() => { printWin.print(); }, 500);
              }}
              className={s.analysisBtnSmall}
              title="Yazdır"
            >
              🖨️
            </button>
            <button onClick={onClose} className={s.analysisBtnSmall}>✕</button>
          </div>
        </div>
        <p className={s.studentDetailSubtitle}>
          {student.sinif || '—'} · #{student.raw_student_id}
        </p>

        {detailLoading && (
          <div className={s.studentDetailLoading}>⏳ Detay yükleniyor…</div>
        )}

        {detailError && (
          <div className={s.analysisError}>⚠️ {detailError}</div>
        )}

        {!detailLoading && !detailError && detail && (
          <>
            {/* ── Genel Performans ─────────────────────────────────────── */}
            <div className={s.analysisGrid4}>
              <div className={s.analysisMiniStat}>
                <span className={s.miniStatValue}>{detail.toplam_net}</span>
                <span className={s.miniStatLabel}>Toplam Net</span>
              </div>
              <div className={s.analysisMiniStat}>
                <span className={s.miniStatValue} style={{ color: '#0262a7' }}>{detail.puan}</span>
                <span className={s.miniStatLabel}>Puan</span>
              </div>
              <div className={s.analysisMiniStat}>
                <span className={s.miniStatValue}>
                  {detail.sinif_rank}/{detail.sinif_student_count}
                </span>
                <span className={s.miniStatLabel}>Sınıf Sırası</span>
              </div>
              <div className={s.analysisMiniStat}>
                <span className={s.miniStatValue}>{detail.kurum_ici_sira}/{detail.toplam_ogrenci}</span>
                <span className={s.miniStatLabel}>Kurum Sırası</span>
              </div>
            </div>

            {/* ── AYT Puan Türleri (SAY / EA / SÖZ) ───────────────────── */}
            {examType !== 'YKS_TYT' && detail.puan_turleri && (
              <div style={{ marginTop: 8, marginBottom: 8 }}>
                <div className={s.analysisGrid3}>
                  {(['SAY', 'EA', 'SOZ'] as const).map(pt => {
                    const d = detail.puan_turleri![pt];
                    const label = pt === 'SOZ' ? 'SÖZ' : pt;
                    const color = pt === 'SAY' ? '#0262a7' : pt === 'EA' ? '#7c3aed' : '#059669';
                    return (
                      <div key={pt} className={s.analysisMiniStat} style={{ borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>
                        <span className={s.miniStatValue} style={{ color }}>{d.puan}</span>
                        <span className={s.miniStatLabel}>{label} Puanı</span>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>
                          AYT: {d.ayt_net} · TYT: {d.tyt_net}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={s.analysisGrid4}>
              <div className={s.analysisMiniStat}>
                <span className={s.miniStatValue}>
                  {detail.tahmini_siralama ? detail.tahmini_siralama.toLocaleString('tr-TR') : '—'}
                </span>
                <span className={s.miniStatLabel}>Tah. TR Sırası ({detail.referans_yil}) <InfoTip tip="tahminiSiralama" /></span>
              </div>
              <div className={s.analysisMiniStat}>
                <span className={s.miniStatValue}>
                  <span className={`${s.percentileBadge} ${detail.kurum_ici_yuzdelik >= 75 ? s.percentileHigh : detail.kurum_ici_yuzdelik >= 50 ? s.percentileMid : s.percentileLow}`}>
                    %{detail.kurum_ici_yuzdelik}
                  </span>
                </span>
                <span className={s.miniStatLabel}>Yüzdelik <InfoTip tip="yuzdelikDilim" /></span>
              </div>
              <div className={s.analysisMiniStat}>
                <span className={s.miniStatValue} style={{ color: '#16a34a' }}>{detail.total_correct}</span>
                <span className={s.miniStatLabel}>Toplam Doğru</span>
              </div>
              <div className={s.analysisMiniStat}>
                <span className={s.miniStatValue} style={{ color: '#ef4444' }}>{detail.total_wrong}</span>
                <span className={s.miniStatLabel}>Toplam Yanlış</span>
              </div>
            </div>

            {/* ── Doğruluk Oranı + Genel İstatistikler ────────────────── */}
            <div className={s.studentDetailSection}>
              <h4><span className="sectionIcon">🎯</span> Genel Metrikler</h4>
              <div className={s.gaugeWrap}>
                <Gauge pct={detail.dogruluk_orani} color={detail.dogruluk_orani >= 70 ? '#16a34a' : detail.dogruluk_orani >= 50 ? '#f59e0b' : '#ef4444'} />
                <div className={s.gaugeInfo}>
                  <div>Doğruluk Oranı <InfoTip tip="dogrulukOrani" />: <strong>%{detail.dogruluk_orani.toFixed(1)}</strong></div>
                  <div>Toplam Boş Potansiyel <InfoTip tip="bosPotansiyel" />: <strong>{detail.toplam_bos_potansiyel.toFixed(1)} net</strong></div>
                  <div>Kurum Ort. Net: <strong>{detail.kurum_avg_net}</strong> · Sınıf Ort. Net: <strong>{detail.sinif_avg_net}</strong></div>
                  <div>Toplam Boş: <strong>{detail.total_empty}</strong> / {detail.total_questions} soru</div>
                </div>
              </div>
            </div>

            {/* ── Ders Karşılaştırma Tablosu ──────────────────────────── */}
            <div className={s.studentDetailSection}>
              <h4><span className="sectionIcon">📚</span> Alan/Ders Bazlı Performans</h4>
              <div className={s.analysisTableWrap}>
                <table className={s.analysisTable}>
                  <thead>
                    <tr>
                      <th>Alan/Ders</th>
                      <th style={{ textAlign: 'center' }}>D</th>
                      <th style={{ textAlign: 'center' }}>Y</th>
                      <th style={{ textAlign: 'center' }}>B</th>
                      <th style={{ textAlign: 'center' }}>Net</th>
                      <th style={{ textAlign: 'center' }}>Verimlilik <InfoTip tip="verimlilik" /></th>
                      <th style={{ textAlign: 'center' }}>Sınıf Ort.</th>
                      <th style={{ textAlign: 'center' }}>Fark <InfoTip tip="diffSinif" /></th>
                      <th style={{ textAlign: 'center' }}>Kurum Ort.</th>
                      <th style={{ textAlign: 'center' }}>Fark <InfoTip tip="diffKurum" /></th>
                      <th style={{ textAlign: 'center' }}>Hata <InfoTip tip="hataOrani" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Alanlar + derslerini grupla
                      const mainSections = detail.section_details.filter(sd => !sd.is_sub_section);
                      const subSections = detail.section_details.filter(sd => sd.is_sub_section);
                      const rows: React.ReactNode[] = [];
                      mainSections.forEach(sd => {
                        // Ana bölüm satırı
                        rows.push(
                          <tr key={sd.section_id} style={{ background: '#f8fafc' }}>
                            <td style={{ fontWeight: 700 }}>{sd.section_name}</td>
                            <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{sd.correct}</td>
                            <td style={{ textAlign: 'center', color: '#ef4444', fontWeight: 600 }}>{sd.wrong}</td>
                            <td style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>{sd.empty}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>{sd.net}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600, color: sd.verimlilik >= 70 ? '#16a34a' : sd.verimlilik >= 40 ? '#f59e0b' : '#ef4444' }}>
                              %{sd.verimlilik.toFixed(0)}
                            </td>
                            <td style={{ textAlign: 'center', color: '#7c3aed', fontWeight: 600 }}>{sd.sinif_avg_net}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600, color: sd.diff_sinif > 0 ? '#16a34a' : sd.diff_sinif < 0 ? '#ef4444' : '#64748b' }}>
                              {sd.diff_sinif > 0 ? '▲' : sd.diff_sinif < 0 ? '▼' : '—'} {sd.diff_sinif !== 0 ? Math.abs(sd.diff_sinif).toFixed(1) : ''}
                            </td>
                            <td style={{ textAlign: 'center', color: '#f59e0b', fontWeight: 600 }}>{sd.kurum_avg_net}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600, color: sd.diff_kurum > 0 ? '#16a34a' : sd.diff_kurum < 0 ? '#ef4444' : '#64748b' }}>
                              {sd.diff_kurum > 0 ? '▲' : sd.diff_kurum < 0 ? '▼' : '—'} {sd.diff_kurum !== 0 ? Math.abs(sd.diff_kurum).toFixed(1) : ''}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: sd.hata_orani > 30 ? '#ef4444' : '#64748b' }}>
                              %{sd.hata_orani.toFixed(0)}
                            </td>
                          </tr>
                        );
                        // Ders satırları (Fizik, Kimya, Biyoloji, Geometri vb.)
                        subSections.filter(sub => sub.parent_id === sd.section_id).forEach(sub => {
                          rows.push(
                            <tr key={sub.section_id}>
                              <td style={{ paddingLeft: 24, fontSize: 12, color: '#475569' }}>↳ {sub.section_name}</td>
                              <td style={{ textAlign: 'center', color: '#16a34a', fontSize: 12 }}>{sub.correct}</td>
                              <td style={{ textAlign: 'center', color: '#ef4444', fontSize: 12 }}>{sub.wrong}</td>
                              <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{sub.empty}</td>
                              <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 12 }}>{sub.net}</td>
                              <td style={{ textAlign: 'center', fontSize: 12, color: sub.verimlilik >= 70 ? '#16a34a' : sub.verimlilik >= 40 ? '#f59e0b' : '#ef4444' }}>
                                %{sub.verimlilik.toFixed(0)}
                              </td>
                              <td style={{ textAlign: 'center', color: '#7c3aed', fontSize: 12 }}>{sub.sinif_avg_net}</td>
                              <td style={{ textAlign: 'center', fontSize: 12, color: sub.diff_sinif > 0 ? '#16a34a' : sub.diff_sinif < 0 ? '#ef4444' : '#64748b' }}>
                                {sub.diff_sinif > 0 ? '▲' : sub.diff_sinif < 0 ? '▼' : '—'} {sub.diff_sinif !== 0 ? Math.abs(sub.diff_sinif).toFixed(1) : ''}
                              </td>
                              <td style={{ textAlign: 'center', color: '#f59e0b', fontSize: 12 }}>{sub.kurum_avg_net}</td>
                              <td style={{ textAlign: 'center', fontSize: 12, color: sub.diff_kurum > 0 ? '#16a34a' : sub.diff_kurum < 0 ? '#ef4444' : '#64748b' }}>
                                {sub.diff_kurum > 0 ? '▲' : sub.diff_kurum < 0 ? '▼' : '—'} {sub.diff_kurum !== 0 ? Math.abs(sub.diff_kurum).toFixed(1) : ''}
                              </td>
                              <td style={{ textAlign: 'center', fontSize: 11, color: sub.hata_orani > 30 ? '#ef4444' : '#64748b' }}>
                                %{sub.hata_orani.toFixed(0)}
                              </td>
                            </tr>
                          );
                        });
                      });
                      // Herhangi bir alana bağlı olmayan bağımsız dersler
                      subSections.filter(sub => !mainSections.some(m => m.section_id === sub.parent_id)).forEach(sub => {
                        rows.push(
                          <tr key={sub.section_id}>
                            <td style={{ paddingLeft: 24, fontSize: 12, color: '#475569' }}>↳ {sub.section_name}</td>
                            <td style={{ textAlign: 'center', color: '#16a34a', fontSize: 12 }}>{sub.correct}</td>
                            <td style={{ textAlign: 'center', color: '#ef4444', fontSize: 12 }}>{sub.wrong}</td>
                            <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{sub.empty}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 12 }}>{sub.net}</td>
                            <td style={{ textAlign: 'center', fontSize: 12, color: sub.verimlilik >= 70 ? '#16a34a' : sub.verimlilik >= 40 ? '#f59e0b' : '#ef4444' }}>
                              %{sub.verimlilik.toFixed(0)}
                            </td>
                            <td style={{ textAlign: 'center', color: '#7c3aed', fontSize: 12 }}>{sub.sinif_avg_net}</td>
                            <td style={{ textAlign: 'center', fontSize: 12, color: sub.diff_sinif > 0 ? '#16a34a' : sub.diff_sinif < 0 ? '#ef4444' : '#64748b' }}>
                              {sub.diff_sinif > 0 ? '▲' : sub.diff_sinif < 0 ? '▼' : '—'} {sub.diff_sinif !== 0 ? Math.abs(sub.diff_sinif).toFixed(1) : ''}
                            </td>
                            <td style={{ textAlign: 'center', color: '#f59e0b', fontSize: 12 }}>{sub.kurum_avg_net}</td>
                            <td style={{ textAlign: 'center', fontSize: 12, color: sub.diff_kurum > 0 ? '#16a34a' : sub.diff_kurum < 0 ? '#ef4444' : '#64748b' }}>
                              {sub.diff_kurum > 0 ? '▲' : sub.diff_kurum < 0 ? '▼' : '—'} {sub.diff_kurum !== 0 ? Math.abs(sub.diff_kurum).toFixed(1) : ''}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: 11, color: sub.hata_orani > 30 ? '#ef4444' : '#64748b' }}>
                              %{sub.hata_orani.toFixed(0)}
                            </td>
                          </tr>
                        );
                      });
                      return rows;
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Ders Karşılaştırma Barları ──────────────────────────── */}
            <div className={s.studentDetailSection}>
              <h4><span className="sectionIcon">📊</span> Karşılaştırma (Net)</h4>
              <div className={s.compBarLegend}>
                <span className={s.legendStudent}>Öğrenci</span>
                <span className={s.legendSinif}>Sınıf Ort.</span>
                <span className={s.legendKurum}>Kurum Ort.</span>
              </div>
              <div className={s.compBarGroup}>
                {detail.section_details.map(sd => (
                  <CompBar
                    key={sd.section_id}
                    label={sd.section_name}
                    studentVal={sd.net}
                    sinifVal={sd.sinif_avg_net}
                    kurumVal={sd.kurum_avg_net}
                    maxVal={sd.question_count}
                  />
                ))}
              </div>
            </div>

            {/* ── Verimlilik & Boş Potansiyel ─────────────────────────── */}
            <div className={s.studentDetailSection}>
              <h4><span className="sectionIcon">⚡</span> Verimlilik & Potansiyel Analizi</h4>
              <div className={s.detailStatRow}>
                {detail.section_details.map(sd => (
                  <div key={sd.section_id} className={s.detailStatItem}>
                    <div className={s.detailStatValue} style={{ color: sd.verimlilik >= 70 ? '#16a34a' : sd.verimlilik >= 40 ? '#f59e0b' : '#ef4444' }}>
                      %{sd.verimlilik.toFixed(0)}
                    </div>
                    <div className={s.detailStatLabel}>{sd.section_name}</div>
                    {sd.bos_potansiyel > 0 && (
                      <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 2 }}>
                        +{sd.bos_potansiyel.toFixed(1)} pot.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Net Gelişim Trendi ───────────────────────────────────── */}
            {detail.net_trend && detail.net_trend.length > 1 && (
              <div className={s.studentDetailSection}>
                <h4><span className="sectionIcon">📈</span> Net Gelişim Trendi</h4>
                <div className={s.trendChart}>
                  {detail.net_trend.map((t, i) => {
                    const maxNet = Math.max(...detail.net_trend.map(x => x.toplam_net), 1);
                    const pct = (t.toplam_net / maxNet) * 100;
                    return (
                      <div key={i} className={s.trendChartItem}>
                        <div className={s.trendChartBar}>
                          <div className={s.trendChartFill} style={{ height: `${pct}%` }} />
                        </div>
                        <div className={s.trendChartVal}>{t.toplam_net}</div>
                        <div className={s.trendChartLabel}>{t.exam_name}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Ders bazlı trend tablosu */}
                {detail.net_trend.some(t => t.section_nets && Object.keys(t.section_nets).length > 0) && (
                  <div className={s.analysisTableWrap} style={{ marginTop: 10 }}>
                    <table className={s.analysisTable}>
                      <thead>
                        <tr>
                          <th>Sınav</th>
                          <th style={{ textAlign: 'center' }}>Toplam</th>
                          {Object.keys(detail.net_trend.find(t => Object.keys(t.section_nets || {}).length > 0)?.section_nets || {}).map(sn => (
                            <th key={sn} style={{ textAlign: 'center' }}>{sn}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.net_trend.map((t, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: 12 }}>{t.exam_name}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>{t.toplam_net}</td>
                            {Object.values(t.section_nets || {}).map((v, j) => (
                              <td key={j} style={{ textAlign: 'center' }}>{v}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Güçlü / Zayıf Alanlar ──────────────────────────────── */}
            <div style={{ display: 'flex', gap: 16, marginTop: 20 }}>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#16a34a' }}>✅ Güçlü Alanlar</h4>
                {detail.strong_areas.length ? detail.strong_areas.map(a => (
                  <div key={a.name} style={{ fontSize: 13 }}>{a.name}: <strong>{a.net}</strong> net</div>
                )) : <div style={{ fontSize: 12, color: '#94a3b8' }}>—</div>}
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#ef4444' }}>⚠️ Zayıf Alanlar</h4>
                {detail.weak_areas.length ? detail.weak_areas.map(a => (
                  <div key={a.name} style={{ fontSize: 13 }}>{a.name}: <strong>{a.net}</strong> net</div>
                )) : <div style={{ fontSize: 12, color: '#94a3b8' }}>—</div>}
              </div>
            </div>
          </>
        )}

        {/* Fallback: API yüklenirken basit bilgi göster */}
        {detailLoading && (
          <div className={s.analysisGrid4} style={{ marginTop: 12 }}>
            <div className={s.analysisMiniStat}>
              <span className={s.miniStatValue}>{student.toplam_net}</span>
              <span className={s.miniStatLabel}>Toplam Net</span>
            </div>
            <div className={s.analysisMiniStat}>
              <span className={s.miniStatValue} style={{ color: '#0262a7' }}>{student.puan}</span>
              <span className={s.miniStatLabel}>Puan</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
