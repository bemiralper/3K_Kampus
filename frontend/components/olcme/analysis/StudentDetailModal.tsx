'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { analysisApi } from '../api';
import KarneNotifyModal from './KarneNotifyModal';
import {
  KarneAreaPair, KarneComment, KarneFocus, KarneOverview, KarneTrend, SuccessPill, answerCounts, questionTotal,
} from './KarneVisuals';
import v from './KarneVisuals.module.css';
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

function diffLabel(n: number) {
  if (Math.abs(n) < 0.05) return { text: '—', cls: s.karneMuted };
  if (n > 0) return { text: `+${fmt(n, 1)}`, cls: s.karnePos };
  return { text: `−${fmt(Math.abs(n), 1)}`, cls: s.karneBelow };
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
  return ({ 1: 'Birinci', 2: 'İkinci', 3: 'Üçüncü' } as Record<number, string>)[rank] || '';
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
              {!detail.student_id && <span className={s.karneChipUnmatched}>Eşleşmedi</span>}
              {typeLabel && <span className={s.karneChip}>{typeLabel}</span>}
              {medal > 0 && (
                <span className={s.karneChipRank} data-rank={medal}>
                  {kurumRankLabel(medal)}
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

const DIFF_COPY: Record<string, { hint: string; tag: string }> = {
  kolay: { hint: 'Çoğu öğrenci bildi', tag: '%70+' },
  orta: { hint: 'Ayırt eden sorular', tag: '%40–70' },
  zor: { hint: 'Az öğrenci bildi', tag: '%40 altı' },
};

function difficultyFocus(band: { key: string; dogru: number; yanlis: number; bos: number; soru: number }) {
  const wrong = band.yanlis || 0;
  const empty = band.bos || 0;
  const correct = band.dogru || 0;
  let value = correct;
  let unit = 'doğru';
  let tone = 'ok';
  if (wrong && band.key === 'kolay') {
    value = wrong; unit = 'yanlış'; tone = 'alert';
  } else if (wrong && band.key === 'orta') {
    value = wrong; unit = 'yanlış'; tone = 'warn';
  } else if (wrong) {
    value = wrong; unit = 'yanlış'; tone = 'ink';
  } else if (empty && band.key === 'kolay') {
    value = empty; unit = 'boş'; tone = 'warn';
  }
  const bits: string[] = [];
  if (unit !== 'doğru' && correct) bits.push(`${correct} doğru`);
  if (unit !== 'yanlış' && wrong) bits.push(`${wrong} yanlış`);
  if (unit !== 'boş' && empty) bits.push(`${empty} boş`);
  bits.push(`${band.soru} soru`);
  const total = Math.max(band.soru || correct + wrong + empty, 1);
  return {
    value,
    unit,
    tone,
    meta: bits.join(' · '),
    dogruPct: (correct / total) * 100,
    yanlisPct: (wrong / total) * 100,
    bosPct: (empty / total) * 100,
  };
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
  questions: { q: number; n?: number; given: string; correct: string; result: string }[];
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
              {part.map(q => (
                <th key={q.q}>{q.n || q.q}</th>
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
  const isAyt11 = (detail?.exam_type || examType) === 'AYT_11';
  const typeLabel = detail?.exam_type_label || (isAyt ? 'AYT' : isAyt11 ? '11 AYT' : 'TYT');

  const sectionRows = (() => {
    if (!detail) return [] as { sd: StudentDetailSectionItem; main: boolean }[];
    const hidden = new Set(detail.karne_insights?.hidden_section_ids || []);
    const visible = detail.section_details.filter(sd => !hidden.has(sd.section_id));
    const mains = visible.filter(sd => !sd.is_sub_section);
    const subs = visible.filter(sd => sd.is_sub_section);
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
    if (isAyt11 && detail.puan_turleri?.SAY && detail.puan_turleri?.EA) {
      return (['SAY', 'EA'] as const).map(pt => ({
        key: pt,
        label: pt,
        net: detail.puan_turleri![pt].ayt_net,
        puan: detail.puan_turleri![pt].puan,
        avg: detail.puan_turleri_avgs?.[pt] ?? detail.kurum_avg_puan ?? 0,
        tahmini: null,
        kurumSira: detail.puan_turleri![pt].kurum_ici_sira ?? null,
        netSira: detail.puan_turleri![pt].net_kurum_ici_sira ?? null,
        sinifSira: detail.puan_turleri![pt].sinif_ici_sira ?? null,
      }));
    }
    if (isAyt && detail.puan_turleri) {
      return (['SAY', 'EA', 'SOZ'] as const).map(pt => ({
        key: pt,
        label: pt === 'SOZ' ? 'SÖZ' : pt,
        net: detail.puan_turleri![pt].ayt_net,
        puan: detail.puan_turleri![pt].puan,
        avg: detail.puan_turleri_avgs?.[pt] ?? detail.kurum_avg_puan ?? 0,
        tahmini: detail.puan_turleri![pt].tahmini_siralama ?? null,
        kurumSira: detail.puan_turleri![pt].kurum_ici_sira ?? null,
        netSira: detail.puan_turleri![pt].net_kurum_ici_sira ?? null,
        sinifSira: detail.puan_turleri![pt].sinif_ici_sira ?? null,
      }));
    }
    return [{
      key: typeLabel,
      label: typeLabel,
      net: null as number | null,
      puan: detail.puan,
      avg: detail.kurum_avg_puan ?? 0,
      tahmini: detail.tahmini_siralama,
      kurumSira: detail.kurum_ici_sira,
      netSira: null as number | null,
      sinifSira: null as number | null,
    }];
  })();
  const alanPt = detail?.alan_puan_turu || 'SAY';
  const tytRank = detail?.tyt_siralama;

  const hasClass = detail?.has_class ?? Boolean(detail?.sinif_student_count || detail?.sinif_rank);
  const insights = detail?.karne_insights;
  const hiddenGrids = new Set(insights?.hidden_grid_ids || []);
  const answerGrids = (detail?.answer_grids || []).filter(grid => !hiddenGrids.has(grid.section_id));
  const kpiTiles: [string, string, string][] = detail ? [
    ['Soru', fmtInt(questionTotal(detail) || null), 'ink'],
    ['Doğru', fmtInt(detail.total_correct), 'green'],
    ['Yanlış', fmtInt(detail.total_wrong), 'red'],
    ...(!isAyt && questionTotal(detail) ? [['Boş', fmtInt(answerCounts(detail).empty), 'muted'] as [string, string, string]] : []),
    [
      isAyt && detail.net_etiket ? detail.net_etiket : 'Net',
      fmt(isAyt && detail.alan_net != null ? detail.alan_net : detail.toplam_net, 2),
      'brand',
    ],
    ['Puan', fmt(detail.puan, 2), 'brand'],
    ['Kurum Sırası', fmtInt(detail.kurum_ici_sira), 'ink'],
  ] : [];

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
                {kpiTiles.map(([label, value, tone]) => (
                  <div key={label} className={s.karneSummaryBox} data-tone={tone}>
                    <span className={s.karneSummaryValue} data-tone={tone}>{value}</span>
                    <span className={s.karneSummaryLabel}>{label}</span>
                  </div>
                ))}
              </div>
              {isAyt && detail.alan_net != null && (
                <p className={s.karneNetNote}>
                  {detail.net_etiket === 'EA NET'
                    ? 'Eşit ağırlık neti'
                    : detail.net_etiket === 'SÖZ NET'
                      ? 'Sözel net'
                      : 'Sayısal net'}{' '}
                  öğrencinin alanına giren testlerdir. Tüm testler: {fmt(detail.toplam_net, 2)}. Alan dışı testler bu nete yazılmaz.
                </p>
              )}

              <KarneOverview detail={detail} rows={sectionRows} />
              <KarneComment lines={insights?.comment || []} />
              <KarneTrend history={detail.net_history || []} />

              <KarneSecHead
                title="Puan ve Sıralama"
                note={detail.referans_yil ? `Tahmini sıralama ${detail.referans_yil} verilerine göre` : ''}
              />
              {isAyt && detail.puan_turleri ? (
                <div className={s.karneRankSplit}>
                  <div className={s.karneRankPanel}>
                    <div className={s.karneRankCap}>TYT</div>
                    <div className={s.karneTableWrap}>
                      <table className={s.karneTable}>
                        <thead>
                          <tr>
                            <th>Net</th><th>Puan</th><th>Kurum</th><th>Sınıf</th><th>Türkiye</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{tytRank?.net != null ? fmt(tytRank.net, 2) : '—'}</td>
                            <td>{tytRank ? fmt(tytRank.puan, 2) : '—'}</td>
                            <td>{tytRank?.kurum_ici_sira ? fmtInt(tytRank.kurum_ici_sira) : '—'}</td>
                            <td>{hasClass && tytRank?.sinif_ici_sira ? fmtInt(tytRank.sinif_ici_sira) : '—'}</td>
                            <td>{tytRank?.tahmini_siralama ? fmtInt(tytRank.tahmini_siralama) : '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className={s.karneRankFoot}>
                      {tytRank ? `${fmtInt(tytRank.toplam_ogrenci)} öğrenci` : 'Bağlı TYT sonucu yok'}
                    </div>
                  </div>
                  <div className={s.karneRankPanel}>
                    <div className={s.karneRankCap}>AYT</div>
                    <div className={s.karneTableWrap}>
                      <table className={s.karneTable}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left' }}>Tür</th>
                            <th>Net</th>
                            <th title="Kurum içinde bu puan türünün AYT netine göre sıra">Net sıra</th>
                            <th>Puan</th>
                            <th title="Kurum içinde bu puan türünün puanına göre sıra">Puan sıra</th>
                            <th>Sınıf</th>
                            <th>Türkiye</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rankingRows.map(row => (
                            <tr key={row.key} className={row.key === alanPt ? s.karneAlanRow : undefined}>
                              <td className={s.karneLeft}>{row.label}</td>
                              <td>{row.net != null ? fmt(row.net, 2) : '—'}</td>
                              <td>{row.netSira ? fmtInt(row.netSira) : '—'}</td>
                              <td>{fmt(row.puan, 2)}</td>
                              <td>{row.kurumSira ? fmtInt(row.kurumSira) : '—'}</td>
                              <td>{hasClass && row.sinifSira ? fmtInt(row.sinifSira) : '—'}</td>
                              <td>{row.tahmini ? fmtInt(row.tahmini) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={s.karneRankFoot}>{fmtInt(detail.toplam_ogrenci)} öğrenci</div>
                  </div>
                </div>
              ) : (
              <div className={s.karneTableWrap}>
                <table className={s.karneTable}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Puan Türü</th>
                      <th>Puan</th>
                      <th>Kurum Ort.</th>
                      {hasClass && <th>Sınıf Sırası</th>}
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
                        {hasClass && <td>{row.sinifSira ? fmtInt(row.sinifSira) : (i === 0 && detail.sinif_rank ? fmtInt(detail.sinif_rank) : '—')}</td>}
                        <td>{row.kurumSira ? fmtInt(row.kurumSira) : '—'}</td>
                        <td>{row.tahmini ? fmtInt(row.tahmini) : '—'}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className={s.karneLeft}>Katılım</td>
                      <td className={s.karneMuted}>—</td>
                      <td className={s.karneMuted}>—</td>
                      {hasClass && <td className={s.karneMuted}>{fmtInt(detail.sinif_student_count)} öğrenci</td>}
                      <td className={s.karneMuted}>{fmtInt(detail.toplam_ogrenci)} öğrenci</td>
                      <td className={s.karneMuted}>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              )}
            </div>

            <div className={s.karnePage}>
              <KarneRunHead title="Ders Analizi" detail={detail} />
              {(detail.strong_areas?.length || detail.weak_areas?.length) ? (
                <>
                  <KarneSecHead title="Güçlü ve Geliştirilecek Alanlar" note="Başarı = net / soru · kurum farkı net" />
                  <KarneAreaPair detail={detail} />
                </>
              ) : null}

              {sectionRows.length > 0 && (
                <>
                  <KarneSecHead title="Ders / Test Performansı" note="Fark sütunları öğrencinin ortalamaya göre konumudur" />
                  <div className={s.karneTableWrap}>
                    <table className={s.karneTable}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>Ders / Test</th>
                          <th>Soru</th><th>D</th><th>Y</th><th>B</th>
                          <th>Net</th><th>Başarı</th>
                          {hasClass && <><th>Sınıf Ort.</th><th>Sınıf Farkı</th></>}
                          <th>Kurum Ort.</th><th>Kurum Farkı</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let tytHead = false;
                          return sectionRows.map(({ sd, main }) => {
                            const ds = diffLabel(sd.diff_sinif);
                            const dk = diffLabel(sd.diff_kurum);
                            const row = (
                              <tr key={sd.section_id} className={main ? s.karneMainRow : undefined}>
                                <td className={main ? s.karneLeft : s.karneSub}>{sd.section_name}</td>
                                <td>{sd.question_count}</td>
                                <td>{sd.correct}</td>
                                <td>{sd.wrong}</td>
                                <td>{sd.empty}</td>
                                <td>{fmt(sd.net, 2)}</td>
                                <td><SuccessPill value={sd.verimlilik || 0} /></td>
                                {hasClass && (
                                  <>
                                    <td>{fmt(sd.sinif_avg_net, 2)}</td>
                                    <td className={ds.cls}>{ds.text}</td>
                                  </>
                                )}
                                <td>{fmt(sd.kurum_avg_net, 2)}</td>
                                <td className={dk.cls}>{dk.text}</td>
                              </tr>
                            );
                            if (sd.source === 'tyt' && !tytHead) {
                              tytHead = true;
                              return (
                                <Fragment key={`tyt-${sd.section_id}`}>
                                  <tr className={s.karneMainRow}>
                                    <td className={s.karneLeft} colSpan={hasClass ? 11 : 9}>{detail.linked_tyt_exam_name || 'TYT'}</td>
                                  </tr>
                                  {row}
                                </Fragment>
                              );
                            }
                            return row;
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {detail.difficulty && detail.difficulty.bands.length > 0 ? (
                <>
                  <KarneSecHead
                    title="Zorluk Seviyesi"
                    note="Soru, kurumun doğru oranına göre gruplandı"
                  />
                  <div className={s.karneDiffGrid}>
                    {detail.difficulty.bands.map(band => {
                      const focus = difficultyFocus(band);
                      const copy = DIFF_COPY[band.key];
                      const hint = band.scope === 'alan' && band.key === 'orta'
                        ? 'Alanındaki ayırt eden sorular'
                        : band.scope === 'alan' && band.key === 'zor'
                          ? 'Alanındaki zor sorular'
                          : copy?.hint;
                      return (
                        <article key={band.key} className={s.karneDiffCard} data-band={band.key} data-tone={focus.tone}>
                          <header className={s.karneDiffHead}>
                            <strong>{band.label}</strong>
                            <span>{copy?.tag}</span>
                          </header>
                          <p className={s.karneDiffHint}>{hint}</p>
                          <p className={s.karneDiffHero}>
                            <b>{focus.value}</b> {focus.unit}
                          </p>
                          <p className={s.karneDiffMeta}>{focus.meta}</p>
                          <div className={s.karneDiffMeter} aria-hidden>
                            <i data-part="dogru" style={{ width: `${focus.dogruPct}%` }} />
                            <i data-part="yanlis" style={{ width: `${focus.yanlisPct}%` }} />
                            <i data-part="bos" style={{ width: `${focus.bosPct}%` }} />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {insights?.unbanded_questions ? (
                    <p className={v.unbanded}>
                      {insights.unbanded_questions} soru iptal edildiği ya da cevap anahtarında eşleşmediği için gruplara girmedi.
                    </p>
                  ) : null}
                  {detail.difficulty.note ? (
                    <p className={s.karneDifficultyNote}>{detail.difficulty.note}</p>
                  ) : null}
                </>
              ) : null}

              {!!insights?.focus.items.length && (
                <>
                  <KarneSecHead title={insights.focus.title} note={insights.focus.note} />
                  <KarneFocus items={insights.focus.items} />
                </>
              )}

              {answerGrids.length > 0 && (
                <>
                  <KarneSecHead title="Cevaplar" note="Öğrenci cevabı ve doğru cevap" />
                  <div className={s.karneBarLegend}>
                    <span className={s.karneGridLegOk}>Doğru</span>
                    <span className={s.karneGridLegBad}>Yanlış</span>
                    <span className={s.karneGridLegEmpty}>Boş</span>
                  </div>
                  {answerGrids.map(grid => (
                    <AnswerGrid key={grid.section_id} title={grid.section_name} questions={grid.questions} />
                  ))}
                </>
              )}
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
                                <td><SuccessPill value={row.basari} /></td>
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
