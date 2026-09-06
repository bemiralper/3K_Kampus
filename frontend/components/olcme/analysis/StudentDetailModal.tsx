'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

function sessionHours(detail: StudentDetailResponse) {
  const start = (detail.session_start_time || '').slice(0, 5);
  const end = (detail.session_end_time || '').slice(0, 5);
  if (start && end) return `${start} - ${end}`;
  return start;
}

function KarneHeader({ detail }: { detail: StudentDetailResponse }) {
  const photo = resolveCoachPhotoUrl(detail.profil_foto);
  const when = formatSessionWhen(detail);
  const medal = top3Rank(detail);
  const place = (detail.sube_ad || '').trim();
  const caption = [place, when].filter(Boolean).join('  ·  ');
  const typeLabel = detail.exam_type_label || '';
  const programLabel = (detail.sinif || '').trim();
  const programKey = detail.has_class ? 'Sınıf' : (detail.sinif_meta_label || 'Program');
  const hours = sessionHours(detail);
  const meta = [
    ['Öğrenci no', detail.raw_student_id || '—'],
    [programKey, programLabel],
    ['Oturum', detail.session_name || ''],
    ['Saat', hours],
  ].filter(([, val]) => val);
  return (
    <div className={s.karneHero}>
      <div className={s.karneHeroBrand}>
        <img src="/img/beyaz-logo.png" alt="3K Kampüs" className={s.karneLogo} />
        <div className={s.karneHeroExam}>{(detail.exam_name || 'Sınav').trim()}</div>
        <div className={s.karneHeroDoc}>Sınav Sonuç Belgesi</div>
        {caption && <div className={s.karneHeroCap}>{caption}</div>}
      </div>
      <div className={s.karneHeroId}>
        <div className={s.karnePhotoWrap}>
          {photo ? (
            <img src={photo} alt="" className={s.karnePhoto} />
          ) : (
            <div className={s.karnePhotoFallback}>{studentInitials(detail.student_name)}</div>
          )}
        </div>
        <div className={s.karneHeroMain}>
          <div className={s.karneStudentNameRow}>
            <span className={s.karneStudentName}>{detail.student_name}</span>
            <span className={s.karneHeroChips}>
              {typeLabel && <span className={s.karneChip}>{typeLabel}</span>}
              {medal > 0 && (
                <span className={s.karneChipRank} data-rank={medal}>
                  {kurumRankLabel(medal)}
                  {detail.toplam_ogrenci ? ` / ${detail.toplam_ogrenci}` : ''}
                </span>
              )}
            </span>
          </div>
          <dl className={s.karneHeroMeta}>
            {meta.map(([lab, val]) => (
              <div key={lab}>
                <dt>{lab}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

function KarneSecHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className={s.karneSecHead}>
      <span>{title}</span>
      {note ? <em>{note}</em> : null}
    </div>
  );
}

function KarneRunHead({ title, detail }: { title: string; detail: StudentDetailResponse }) {
  return (
    <div className={s.karneRunHead}>
      <strong>{title}</strong>
      <span>{detail.student_name} · {detail.exam_name}</span>
    </div>
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
      <div className={s.karneGridName}>{title}</div>
      {rows.map((part, ri) => (
        <table key={ri} className={s.karneGrid}>
          <thead>
            <tr>
              <th className={s.karneGridLabel} />
              {part.map((q, i) => (
                <th key={q.q}>{i + 1 + ri * chunk}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className={s.karneGridLabel}>Cevap</th>
              {part.map(q => {
                const empty = !q.given || q.result === 'empty';
                const wrong = q.result === 'wrong';
                return (
                  <td
                    key={`g-${q.q}`}
                    className={empty ? s.karneEmpty : wrong ? s.karneWrong : s.karneOk}
                  >
                    {empty ? '·' : q.given.toLocaleUpperCase('tr-TR')}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th className={s.karneGridLabel}>Anahtar</th>
              {part.map(q => (
                <td key={`c-${q.q}`}>{q.correct || ''}</td>
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

  const hasClass = detail?.has_class ?? Boolean(detail?.sinif_student_count || detail?.sinif_rank);

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
                  ['Doğru', fmtInt(detail.total_correct), 'green'],
                  ['Yanlış', fmtInt(detail.total_wrong), 'red'],
                  ['Boş', fmtInt(detail.total_empty), 'muted'],
                  ['Net', fmt(detail.toplam_net, 2), 'brand'],
                  ['Puan', fmt(detail.puan, 2), 'brand'],
                  ['Kurum Sırası', fmtInt(detail.kurum_ici_sira), 'ink'],
                ].map(([label, value, tone]) => (
                  <div key={label} className={s.karneSummaryBox} data-tone={tone}>
                    <span className={s.karneSummaryValue} data-tone={tone}>{value}</span>
                    <span className={s.karneSummaryLabel}>{label}</span>
                  </div>
                ))}
              </div>

              <KarneSecHead
                title="Puan ve Sıralama"
                note={detail.referans_yil ? `Tahmini sıralama ${detail.referans_yil} verilerine göre` : ''}
              />
              <div className={s.karneTableWrap}>
                <table className={s.karneTable}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Puan Türü</th>
                      <th>Puan</th>
                      <th>Kurum Ort.</th>
                      <th>Sınıf Sırası</th>
                      <th>Kurum Sırası</th>
                      <th>Tahmini TR Sırası</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingRows.map((row, i) => (
                      <tr key={row.label}>
                        <td className={s.karneLeft}>{row.label}</td>
                        <td>{fmt(row.puan, 2)}</td>
                        <td>{fmt(row.avg, 2)}</td>
                        <td>{i === 0 ? (hasClass && detail.sinif_rank ? fmtInt(detail.sinif_rank) : '—') : ''}</td>
                        <td>{i === 0 ? fmtInt(detail.kurum_ici_sira) : ''}</td>
                        <td>{i === 0 ? (detail.tahmini_siralama ? fmtInt(detail.tahmini_siralama) : '—') : ''}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className={s.karneLeft}>Katılım</td>
                      <td className={s.karneMuted}>—</td>
                      <td className={s.karneMuted}>—</td>
                      <td className={s.karneMuted}>
                        {hasClass
                          ? `${fmtInt(detail.sinif_student_count)} öğrenci`
                          : (detail.sinif || 'Sınıf tanımlı değil')}
                      </td>
                      <td className={s.karneMuted}>{fmtInt(detail.toplam_ogrenci)} öğrenci</td>
                      <td className={s.karneMuted}>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <KarneSecHead title="Ders / Test Performansı" note="Fark sütunları öğrencinin ortalamaya göre konumudur" />
              <div className={s.karneTableWrap}>
                <table className={s.karneTable}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Ders / Test</th>
                      <th>Soru</th><th>D</th><th>Y</th><th>B</th>
                      <th>Net</th><th>Başarı</th>
                      <th>Sınıf Ort.</th><th>Fark</th>
                      <th>Kurum Ort.</th><th>Fark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRows.map(({ sd, main }) => {
                      const ds = hasClass ? diffLabel(sd.diff_sinif) : { text: '—', cls: s.karneMuted };
                      const dk = diffLabel(sd.diff_kurum);
                      return (
                        <tr key={sd.section_id} className={main ? s.karneMainRow : undefined}>
                          <td className={main ? s.karneLeft : s.karneSub}>{sd.section_name}</td>
                          <td>{sd.question_count}</td>
                          <td>{sd.correct}</td>
                          <td>{sd.wrong}</td>
                          <td>{sd.empty}</td>
                          <td>{fmt(sd.net, 2)}</td>
                          <td style={{ color: verimColor(sd.verimlilik), fontWeight: 700 }}>
                            %{Math.round(sd.verimlilik)}
                          </td>
                          <td>{hasClass ? fmt(sd.sinif_avg_net, 2) : '—'}</td>
                          <td className={ds.cls}>{ds.text}</td>
                          <td>{fmt(sd.kurum_avg_net, 2)}</td>
                          <td className={dk.cls}>{dk.text}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {!!detail.answer_grids?.length && (
              <div className={s.karnePage}>
                <KarneRunHead title="Cevap Anahtarı" detail={detail} />
                <div className={s.karneBarLegend}>
                  <span className={s.karneGridLegOk}>Doğru</span>
                  <span className={s.karneGridLegBad}>Yanlış</span>
                  <span className={s.karneGridLegEmpty}>Boş</span>
                </div>
                {(detail.answer_grids || []).map(grid => (
                  <AnswerGrid key={grid.section_id} title={grid.section_name} questions={grid.questions} />
                ))}
              </div>
            )}

            <div className={s.karnePage}>
              <KarneRunHead title="Performans Analizi" detail={detail} />
              <KarneSecHead title="Net Karşılaştırması" />
              <div className={s.karneBarLegend}>
                <span className={s.karneBarStudent}>Öğrenci</span>
                {hasClass && <span className={s.karneBarSinif}>Sınıf ortalaması</span>}
                <span className={s.karneBarKurum}>Kurum ortalaması</span>
              </div>
              <div className={s.karneBarList}>
                {sectionRows.filter(r => r.main).map(({ sd }) => {
                  const cap = Math.max(sd.question_count || 1, 1);
                  const lines = [
                    { label: 'Öğrenci', value: sd.net, fill: s.karneBarFillStudent, color: '#0262a7' },
                    ...(hasClass ? [{ label: 'Sınıf', value: sd.sinif_avg_net, fill: s.karneBarFillSinif, color: '#7c3aed' }] : []),
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

              <KarneSecHead title="Verimlilik" note="Doğru / (doğru + yanlış) oranı" />
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

              <KarneSecHead title="Güçlü ve Geliştirilecek Alanlar" />
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
                  <div className={`${s.karneAreaHead} ${s.karneAreaWeak}`}>Geliştirilecek Alanlar</div>
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
                <KarneRunHead title="Kazanım Analizi" detail={detail} />
                <div className={s.karneTopicStack}>
                  {detail.topic_blocks.map(block => (
                    block.tables.map(table => {
                      const caption = [block.heading, table.title].filter((part, i, all) => part && all.indexOf(part) === i).join(' — ') || 'Kazanım';
                      return (
                        <table key={`${block.heading}-${table.title}`} className={s.karneTopicTable}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left' }}>{caption}</th>
                              <th>Soru</th><th>D</th><th>Y</th><th>B</th><th>Başarı</th>
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
                                <td style={{ color: verimColor(row.basari), fontWeight: 700 }}>
                                  %{row.basari}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })
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
