'use client';

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { analysisApi } from '../api';
import KarneNotifyModal from './KarneNotifyModal';
import type { StudentAnalysis, StudentDetailResponse, StudentDetailSectionItem } from '../types';
import { resolveCoachPhotoUrl } from '@/lib/coach-media';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtInt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('tr-TR');
}

function avgClass(v: number, avg: number) {
  if (avg == null) return s.karneAbove;
  return v + 0.001 < avg ? s.karneBelow : s.karneAbove;
}

function verimColor(v: number) {
  if (v >= 70) return '#16a34a';
  if (v >= 40) return '#d97706';
  return '#dc2626';
}

function diffLabel(n: number) {
  if (Math.abs(n) < 0.05) return { text: '—', cls: s.karneMuted };
  if (n > 0) return { text: `+${n.toFixed(1)}`, cls: s.karnePos };
  return { text: `−${Math.abs(n).toFixed(1)}`, cls: s.karneBelow };
}

function studentInitials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr-TR');
  return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase('tr-TR');
}

function formatSessionWhen(detail: StudentDetailResponse) {
  const parts: string[] = [];
  if (detail.session_date) {
    const d = new Date(`${detail.session_date}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      parts.push(d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }));
    }
  }
  if (detail.session_start_time) parts.push(detail.session_start_time.slice(0, 5));
  return parts.join('  ·  ');
}

function top3Rank(detail: StudentDetailResponse) {
  const rank = Number(detail.kurum_ici_sira);
  return rank >= 1 && rank <= 3 ? rank : 0;
}

function kurumRankLabel(rank: number) {
  return `Kurum ${rank}. si`;
}

function KarneRozet({ rank }: { rank: number }) {
  const uid = useId().replace(/:/g, '');
  const metal = `rm${uid}`;
  const leaves = [
    [17, 74, 58], [13, 66, 42], [11, 57, 26], [12, 48, 12], [15, 40, -2], [19, 33, -16],
  ];
  return (
    <svg className={s.karneRozet} data-rank={rank} viewBox="0 0 80 96" aria-hidden>
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" className={s.karneRozetStopHi} />
          <stop offset="42%" className={s.karneRozetStopMid} />
          <stop offset="100%" className={s.karneRozetStopLo} />
        </linearGradient>
      </defs>
      <g fill={`url(#${metal})`}>
        {leaves.map(([x, y, r], i) => (
          <ellipse key={`l${i}`} cx={x} cy={y} rx="6.4" ry="3" transform={`rotate(${r} ${x} ${y})`} />
        ))}
        {leaves.map(([x, y, r], i) => (
          <ellipse key={`r${i}`} cx={80 - x} cy={y} rx="6.4" ry="3" transform={`rotate(${-r} ${80 - x} ${y})`} />
        ))}
        <path d="M40 86 L44 78 H36 Z" />
      </g>
      <circle cx="40" cy="52" r="26.5" fill={`url(#${metal})`} />
      <circle cx="40" cy="52" r="21.2" className={s.karneRozetDisc} />
      <circle cx="40" cy="52" r="21.2" fill="none" stroke={`url(#${metal})`} strokeWidth="1.3" />
      <g fill={`url(#${metal})`}>
        <path d="M25 30 L29.2 16.5 C29.8 15 32.2 15 32.8 16.5 L36.2 26 L40 12.2 C40.4 10.8 43.6 10.8 44 12.2 L47.8 26 L51.2 16.5 C51.8 15 54.2 15 54.8 16.5 L59 30 Z" />
        <circle cx="29.4" cy="15.6" r="2.15" />
        <circle cx="54.6" cy="15.6" r="2.15" />
        <path d="M40 10.4 L42.4 15.2 L40 14.1 L37.6 15.2 Z" />
      </g>
      <text x="40" y="61" textAnchor="middle" fill={`url(#${metal})`} className={s.karneRozetNum}>
        {rank}
      </text>
    </svg>
  );
}

function KarneHeader({ detail }: { detail: StudentDetailResponse }) {
  const photo = resolveCoachPhotoUrl(detail.profil_foto);
  const branch = (detail.sube_ad || detail.kurum_ad || '3K KAMPÜS').toLocaleUpperCase('tr-TR');
  const when = formatSessionWhen(detail);
  const medal = top3Rank(detail);
  return (
    <>
      <div className={s.karneBanner}>
        <img src="/img/beyaz-logo.png" alt="3K Kampüs" className={s.karneLogo} />
        <div className={s.karneBannerText}>
          <p className={s.karneKurum}>{branch}</p>
        </div>
        {when && <div className={s.karneBannerWhen}>{when}</div>}
      </div>
      <div className={s.karneExamBar}>{(detail.exam_name || 'Sınav').toLocaleUpperCase('tr-TR')}</div>
      <div className={s.karneStudentBar}>
        <div className={s.karnePhotoWrap}>
          {photo ? (
            <img src={photo} alt="" className={s.karnePhoto} />
          ) : (
            <div className={s.karnePhotoFallback}>{studentInitials(detail.student_name)}</div>
          )}
        </div>
        <div className={s.karneStudentMain}>
          <div className={s.karneStudentNameRow}>
            {medal > 0 && <KarneRozet rank={medal} />}
            <div className={s.karneStudentNameBlock}>
              <span className={s.karneStudentName}>
                {detail.student_name}
              </span>
              {medal > 0 && (
                <span className={s.karneRankCaption} data-rank={medal}>
                  {kurumRankLabel(medal)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className={s.karneStudentNo}>
          <span className={s.karneStudentNoLabel}>Öğr. No</span>
          <span className={s.karneStudentNoValue}>{detail.raw_student_id || '—'}</span>
        </div>
      </div>
    </>
  );
}

function AnswerGrid({
  title,
  questions,
}: {
  title: string;
  questions: { q: number; given: string; correct: string; result: string }[];
}) {
  if (!questions.length) return null;
  const chunk = 20;
  const rows: typeof questions[] = [];
  for (let i = 0; i < questions.length; i += chunk) rows.push(questions.slice(i, i + chunk));

  return (
    <div className={s.karneGridBlock}>
      <div className={s.karneGridTitle}>{title} — Cevap Anahtarı</div>
      {rows.map((part, ri) => (
        <table key={ri} className={s.karneGrid}>
          <thead>
            <tr>
              {part.map((q, i) => (
                <th key={q.q} className={s.karneQ}>{i + 1 + ri * chunk}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {part.map(q => {
                const empty = !q.given || q.result === 'empty';
                const wrong = q.result === 'wrong';
                return (
                  <td
                    key={`g-${q.q}`}
                    className={empty ? s.karneEmpty : wrong ? s.karneWrong : s.karneOk}
                  >
                    {empty ? '.' : wrong ? q.given.toLocaleLowerCase('tr-TR') : q.given}
                  </td>
                );
              })}
            </tr>
            <tr>
              {part.map(q => (
                <td key={`c-${q.q}`} className={s.karneOk}>{q.correct || ''}</td>
              ))}
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  );
}

export default function StudentDetailModal({
  student, examId, examType, rankingYear, onClose,
}: {
  student: StudentAnalysis;
  examId: number;
  examType?: string;
  rankingYear?: number;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<StudentDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showNotify, setShowNotify] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const karneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');
    analysisApi.studentDetail(examId, student.answer_id, rankingYear)
      .then(data => { if (!cancelled) setDetail(data); })
      .catch(err => { if (!cancelled) setDetailError(err.message); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [examId, student.answer_id, rankingYear]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const printKarne = () => {
    const node = karneRef.current;
    if (!node) return;
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML).join('');
    printWin.document.write(`<!DOCTYPE html><html><head><title>${student.student_name} — Sınav Sonuç Belgesi</title>${styles}
      <style>
        @page { size: A4 portrait; margin: 8mm; }
        body { margin: 0; background: #fff; }
        .${s.karneToolbar} { display: none !important; }
        .${s.studentDetailModal} { box-shadow: none !important; max-height: none !important; overflow: visible !important; max-width: 100% !important; width: 100% !important; background: #fff !important; }
        .${s.karnePage} { page-break-after: always; }
        .${s.karnePage}:last-child { page-break-after: auto; }
      </style></head><body>${node.outerHTML}</body></html>`);
    printWin.document.close();
    setTimeout(() => { printWin.print(); }, 400);
  };

  const isAyt = (detail?.exam_type || examType) === 'YKS_AYT';
  const typeLabel = detail?.exam_type_label || (isAyt ? 'AYT' : 'TYT');

  const sectionRows = (() => {
    if (!detail) return [] as { sd: StudentDetailSectionItem; main: boolean }[];
    const mains = detail.section_details.filter(sd => !sd.is_sub_section);
    const subs = detail.section_details.filter(sd => sd.is_sub_section);
    const rows: { sd: StudentDetailSectionItem; main: boolean }[] = [];
    mains.forEach(sd => {
      rows.push({ sd, main: true });
      subs.filter(sub => sub.parent_id === sd.section_id).forEach(sub => rows.push({ sd: sub, main: false }));
    });
    subs.filter(sub => !mains.some(m => m.section_id === sub.parent_id)).forEach(sub => {
      rows.push({ sd: sub, main: false });
    });
    return rows;
  })();

  const rankingRows = (() => {
    if (!detail) return [];
    if (isAyt && detail.puan_turleri) {
      return (['SAY', 'EA', 'SOZ'] as const).map(pt => ({
        label: pt === 'SOZ' ? 'SÖZ' : pt,
        puan: detail.puan_turleri![pt].puan,
        avg: detail.puan_turleri_avgs?.[pt] ?? detail.kurum_avg_puan ?? 0,
      }));
    }
    return [{ label: typeLabel, puan: detail.puan, avg: detail.kurum_avg_puan ?? 0 }];
  })();

  const topicMid = detail?.topic_blocks ? Math.ceil(detail.topic_blocks.length / 2) : 0;
  const topicLeft = detail?.topic_blocks?.slice(0, topicMid) || [];
  const topicRight = detail?.topic_blocks?.slice(topicMid) || [];

  return (
    <div className={s.matchDialogOverlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={s.studentDetailModal} onClick={e => e.stopPropagation()}>
        <div className={s.karneToolbar}>
          <button onClick={printKarne} className={s.analysisBtnSmall} title="Yazdır" disabled={!detail}>🖨️</button>
          <button
            onClick={async () => {
              setPdfBusy(true);
              try {
                await analysisApi.downloadKarnePdf(examId, student.answer_id, rankingYear);
              } catch (err) {
                alert(err instanceof Error ? err.message : 'PDF indirilemedi');
              } finally {
                setPdfBusy(false);
              }
            }}
            className={s.analysisBtnSmall}
            title="Karne PDF indir"
            disabled={!detail || pdfBusy}
          >
            {pdfBusy ? '…' : '📄'}
          </button>
          <button
            onClick={() => setShowNotify(true)}
            className={s.analysisBtnSmall}
            title="WhatsApp ile gönder"
            disabled={!detail || !student.student_id}
          >
            💬
          </button>
          <button onClick={onClose} className={s.analysisBtnSmall}>✕</button>
        </div>
        {showNotify && (
          <KarneNotifyModal
            examId={examId}
            answerId={student.answer_id}
            studentName={student.student_name}
            rankingYear={rankingYear}
            onClose={() => setShowNotify(false)}
          />
        )}

        {detailLoading && (
          <div className={s.studentDetailLoading}>⏳ Sonuç belgesi yükleniyor…</div>
        )}
        {detailError && <div className={s.analysisError}>⚠️ {detailError}</div>}

        {!detailLoading && !detailError && detail && (
          <div className={s.karne} ref={karneRef}>
            <div className={s.karnePage}>
              <KarneHeader detail={detail} />

              <div className={s.karneSummary}>
                {[
                  ['Soru', detail.total_questions],
                  ['Doğru', detail.total_correct],
                  ['Yanlış', detail.total_wrong],
                  ['Boş', detail.total_empty],
                  ['Net', detail.toplam_net],
                ].map(([label, value]) => (
                  <div key={String(label)} className={s.karneSummaryBox}>
                    <span className={s.karneSummaryLabel}>{label}</span>
                    <span className={s.karneSummaryValue}>
                      {label === 'Net' ? fmt(Number(value), 2) : fmtInt(Number(value))}
                    </span>
                  </div>
                ))}
              </div>

              <div className={s.karneYearNote}>
                Tahmini sıralama yılı: {detail.referans_yil} · Puan sıralı
              </div>

              <div className={s.karneTableWrap}>
                <table className={s.karneTable}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>Puan Türü</th>
                      <th rowSpan={2}>Puan</th>
                      <th rowSpan={2}>Kurum Ort.</th>
                      <th colSpan={3}>Sıralamalar</th>
                    </tr>
                    <tr>
                      <th>Sınıf</th>
                      <th>Kurum</th>
                      <th>Tah. TR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingRows.map((row, i) => (
                      <tr key={row.label}>
                        <td className={s.karneLeft}>{row.label}</td>
                        <td>{fmt(row.puan, 3)}</td>
                        <td>{fmt(row.avg, 3)}</td>
                        <td>{i === 0 && detail.sinif_rank ? detail.sinif_rank : i === 0 ? '—' : ''}</td>
                        <td>{i === 0 ? detail.kurum_ici_sira : ''}</td>
                        <td>{i === 0 ? (detail.tahmini_siralama ? fmtInt(detail.tahmini_siralama) : '—') : ''}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className={s.karneLeft} colSpan={3}>Katılımlar</td>
                      <td>{detail.sinif_student_count || '—'}</td>
                      <td>{detail.toplam_ogrenci}</td>
                      <td>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className={s.karneTableWrap}>
                <table className={s.karneTable}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ textAlign: 'left' }}>Ders / Test</th>
                      <th rowSpan={2}>Soru</th>
                      <th rowSpan={2}>Doğru</th>
                      <th rowSpan={2}>Yanlış</th>
                      <th rowSpan={2}>Net</th>
                      <th rowSpan={2}>Başarı %</th>
                      <th colSpan={2}>Ortalamalar</th>
                    </tr>
                    <tr>
                      <th>Sınıf</th>
                      <th>Kurum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRows.map(({ sd, main }) => (
                      <tr key={sd.section_id} className={main ? s.karneMainRow : undefined}>
                        <td className={s.karneLeft}>{sd.section_name}</td>
                        <td>{sd.question_count}</td>
                        <td>{sd.correct}</td>
                        <td>{sd.wrong}</td>
                        <td>{fmt(sd.net, 2)}</td>
                        <td>{Math.round(sd.verimlilik)}</td>
                        <td className={avgClass(sd.net, sd.sinif_avg_net)}>{fmt(sd.sinif_avg_net, 2)}</td>
                        <td className={avgClass(sd.net, sd.kurum_avg_net)}>{fmt(sd.kurum_avg_net, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(detail.answer_grids || []).map(grid => (
                <AnswerGrid key={grid.section_id} title={grid.section_name} questions={grid.questions} />
              ))}
            </div>

            <div className={s.karnePage}>
              <div className={s.karneSectionTitle}>Alan / Ders Bazlı Performans</div>
              <div className={s.karneTableWrap}>
                <table className={s.karneTable}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Alan / Ders</th>
                      <th>D</th><th>Y</th><th>B</th><th>Net</th>
                      <th>Verim %</th>
                      <th>Sınıf</th><th>Fark</th>
                      <th>Kurum</th><th>Fark</th>
                      <th>Hata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRows.map(({ sd, main }) => {
                      const ds = diffLabel(sd.diff_sinif);
                      const dk = diffLabel(sd.diff_kurum);
                      return (
                        <tr key={`p-${sd.section_id}`} className={main ? s.karneMainRow : undefined}>
                          <td className={s.karneLeft}>{sd.section_name}</td>
                          <td>{sd.correct}</td>
                          <td>{sd.wrong}</td>
                          <td>{sd.empty}</td>
                          <td>{fmt(sd.net, 2)}</td>
                          <td style={{ color: verimColor(sd.verimlilik), fontWeight: 700 }}>{Math.round(sd.verimlilik)}</td>
                          <td>{fmt(sd.sinif_avg_net, 2)}</td>
                          <td className={ds.cls}>{ds.text}</td>
                          <td>{fmt(sd.kurum_avg_net, 2)}</td>
                          <td className={dk.cls}>{dk.text}</td>
                          <td className={sd.hata_orani > 30 ? s.karneBelow : undefined}>%{Math.round(sd.hata_orani)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={s.karneSectionTitle}>Karşılaştırma (Net)</div>
              <div className={s.karneBarLegend}>
                <span className={s.karneBarStudent}>Öğrenci</span>
                <span className={s.karneBarSinif}>Sınıf</span>
                <span className={s.karneBarKurum}>Kurum</span>
              </div>
              <div className={s.karneBarList}>
                {sectionRows.filter(r => r.main).map(({ sd }) => {
                  const cap = Math.max(sd.question_count || 1, 1);
                  const lines = [
                    { label: 'Öğrenci', value: sd.net, fill: s.karneBarFillStudent, color: '#0262a7' },
                    { label: 'Sınıf', value: sd.sinif_avg_net, fill: s.karneBarFillSinif, color: '#7c3aed' },
                    { label: 'Kurum', value: sd.kurum_avg_net, fill: s.karneBarFillKurum, color: '#d97706' },
                  ];
                  return (
                    <div key={`b-${sd.section_id}`} className={s.karneCompareCard}>
                      <div className={s.karneBarName}>{sd.section_name}</div>
                      {lines.map(line => (
                        <div key={line.label} className={s.karneBarLine}>
                          <span>{line.label}</span>
                          <div className={s.karneBarTrack}>
                            <div className={`${s.karneBarFill} ${line.fill}`} style={{ width: `${Math.min(100, (line.value / cap) * 100)}%` }} />
                          </div>
                          <strong style={{ color: line.color }}>{fmt(line.value, 1)}</strong>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div className={s.karneSectionTitle}>Verimlilik &amp; Potansiyel Analizi</div>
              <div className={s.karneVerimGrid}>
                {detail.section_details.map(sd => (
                  <div key={`v-${sd.section_id}`} className={s.karneVerimCard} style={{ borderTopColor: verimColor(sd.verimlilik) }}>
                    <div className={s.karneVerimVal} style={{ color: verimColor(sd.verimlilik) }}>
                      %{Math.round(sd.verimlilik)}
                    </div>
                    <div className={s.karneVerimName}>{sd.section_name}</div>
                    {sd.bos_potansiyel > 0 && (
                      <div className={s.karneVerimPot}>+{fmt(sd.bos_potansiyel, 1)} pot.</div>
                    )}
                  </div>
                ))}
              </div>

              <div className={s.karneSectionTitle}>Güçlü ve Zayıf Alanlar</div>
              <div className={s.karneAreaPair}>
                <div className={s.karneAreaCard}>
                  <div className={`${s.karneAreaHead} ${s.karneAreaStrong}`}>Güçlü Alanlar</div>
                  <div className={s.karneAreaBody}>
                    {detail.strong_areas.length
                      ? detail.strong_areas.map(a => (
                        <div key={a.name} className={s.karneAreaItem}>
                          <b>{a.name}</b> · {fmt(a.net, 2)} net
                        </div>
                      ))
                      : <div className={s.karneMuted}>—</div>}
                  </div>
                </div>
                <div className={s.karneAreaCard}>
                  <div className={`${s.karneAreaHead} ${s.karneAreaWeak}`}>Zayıf Alanlar</div>
                  <div className={s.karneAreaBody}>
                    {detail.weak_areas.length
                      ? detail.weak_areas.map(a => (
                        <div key={a.name} className={s.karneAreaItemWeak}>
                          <b>{a.name}</b> · {fmt(a.net, 2)} net
                        </div>
                      ))
                      : <div className={s.karneMuted}>—</div>}
                  </div>
                </div>
              </div>
            </div>

            {!!detail.topic_blocks?.length && (
              <div className={s.karnePage}>
                <div className={s.karneTopicCols}>
                  {[topicLeft, topicRight].map((col, ci) => (
                    <div key={ci}>
                      {col.map(block => (
                        <div key={block.heading}>
                          <div className={s.karneTopicHead}>{block.heading}</div>
                          {block.tables.map(table => (
                            <div key={table.title}>
                              {table.title !== block.heading && (
                                <div className={s.karneTopicSub}>{table.title}</div>
                              )}
                              <table className={s.karneTopicTable}>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'left' }}>{table.title}</th>
                                    <th>S</th><th>D</th><th>Y</th><th>B</th><th>%</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {table.rows.map(row => (
                                    <tr key={row.name}>
                                      <td>{row.name}</td>
                                      <td>{row.soru}</td>
                                      <td>{row.dogru}</td>
                                      <td>{row.yanlis}</td>
                                      <td>{row.bos}</td>
                                      <td>{row.basari}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
