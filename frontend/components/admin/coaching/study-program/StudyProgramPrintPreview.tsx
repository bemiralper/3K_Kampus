'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type {
  WeeklyProgram,
  ProgramBlock,
  BlockType,
  GoalType,
  Priority,
} from '@/lib/study-program-api';
import {
  BLOCK_TYPE_META,
  GOAL_TYPE_META,
  PRIORITY_META,
  WEEKDAY_LABELS,
} from '@/lib/study-program-api';
import { usePdfPrint } from '@/lib/usePdfPrint';

/* ═══════════════════════════════════════════════════════
   PROPS
   ═══════════════════════════════════════════════════════ */
interface StudyProgramPrintPreviewProps {
  program: WeeklyProgram;
  onClose: () => void;
}

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */
function formatDateTR(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ═══════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function StudyProgramPrintPreview({ program, onClose }: StudyProgramPrintPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');

  const logoUrl = '/img/3k-logo.png';
  const todayStr = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const weekStartStr = formatDateTR(program.week_start);
  const weekEndStr = formatDateTR(addDaysStr(program.week_start, 6));
  const currentYear = new Date().getFullYear();

  /* Escape key */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  /* ─── Sorted days ─── */
  const sortedDays = [...(program.days || [])].sort((a, b) => a.weekday - b.weekday);

  /* ─── Stats ─── */
  const allBlocks = sortedDays.flatMap(d => d.blocks);
  const completedBlocks = allBlocks.filter(b => b.is_completed).length;
  const totalDuration = allBlocks.reduce((s, b) => s + (b.estimated_duration_minutes || 0), 0);

  /* ─── Priority distribution ─── */
  const priCounts: Record<string, number> = {};
  for (const b of allBlocks) { priCounts[b.priority || 'MEDIUM'] = (priCounts[b.priority || 'MEDIUM'] || 0) + 1; }

  /* ─── Goal type distribution ─── */
  const goalCounts: Record<string, number> = {};
  for (const b of allBlocks) {
    const k = b.goal_type || '';
    if (k) goalCounts[k] = (goalCounts[k] || 0) + 1;
  }

  /* ─── Block type distribution ─── */
  const btCounts: Record<string, number> = {};
  for (const b of allBlocks) { btCounts[b.block_type || 'SORU_COZUMU'] = (btCounts[b.block_type || 'SORU_COZUMU'] || 0) + 1; }

  /* ─── Day stats for mini chart ─── */
  const dayMaxQ = Math.max(...sortedDays.map(d => d.total_question_count || 0), 1);

  /* columns per row in block grid — adaptive for orientation */
  const blockCols = orientation === 'landscape' ? 4 : 3;

  /* ─── PDF hooks ─── */
  const [pdfBusy, setPdfBusy] = useState(false);

  const { generatePdf } = usePdfPrint({
    fileName: `calisma-programi-${program.student_name}`,
    orientation,
    mode: 'open',
    marginMm: 8,
    scale: 2,
    externalRef: printRef as React.RefObject<HTMLDivElement>,
  });

  const { generatePdf: downloadPdf } = usePdfPrint({
    fileName: `calisma-programi-${program.student_name}`,
    orientation,
    mode: 'download',
    marginMm: 8,
    scale: 2,
    externalRef: printRef as React.RefObject<HTMLDivElement>,
  });

  const handlePDF = useCallback(async () => {
    setPdfBusy(true);
    try {
      await generatePdf();
    } finally {
      setPdfBusy(false);
    }
  }, [generatePdf]);

  const handleDownload = useCallback(async () => {
    setPdfBusy(true);
    try {
      await downloadPdf();
    } finally {
      setPdfBusy(false);
    }
  }, [downloadPdf]);

  /* ─── Render a single block card ─── */
  const renderBlockCard = (block: ProgramBlock) => {
    const priMeta = PRIORITY_META[block.priority as Priority] || PRIORITY_META.MEDIUM;
    const btMeta = BLOCK_TYPE_META[block.block_type as BlockType] || { icon: '📝', label: block.block_type, color: '#6b7280' };
    const goalMeta = (block.goal_type && (block.goal_type as string) !== '')
      ? GOAL_TYPE_META[block.goal_type as GoalType]
      : null;

    return (
      <div
        key={block.id}
        style={{
          padding: '5px 7px',
          borderLeft: `3px solid ${priMeta.color}`,
          borderRight: '1px solid #f1f5f9',
          borderBottom: '1px solid #f1f5f9',
          background: block.is_completed ? '#f0fdf4' : '#fff',
          fontSize: 9,
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 }}>
          <span style={{ fontSize: 10 }}>{btMeta.icon || '📝'}</span>
          <span style={{
            fontWeight: 600, fontSize: 9.5, flex: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{block.title}</span>
          {block.is_completed && <span style={{ fontSize: 10 }}>✅</span>}
        </div>

        {/* Topic */}
        {block.topic_name && (
          <div style={{ color: '#64748b', fontSize: 8, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📂 {block.topic_name}
          </div>
        )}
        {/* Resource */}
        {block.resource_name && (
          <div style={{ color: '#64748b', fontSize: 8, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📖 {block.resource_name}
          </div>
        )}

        {/* Meta tags: Çalışma Türü + Öncelik + Hedef Türü + Soru + Süre */}
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 2 }}>
          {/* Çalışma Türü */}
          <span style={tagStyle(btMeta.color)}>
            {btMeta.icon} {btMeta.label}
          </span>
          {/* Öncelik Seviyesi */}
          <span style={tagStyle(priMeta.color)}>
            {priMeta.icon} {priMeta.label}
          </span>
          {/* Hedef Türü */}
          {goalMeta && (
            <span style={tagStyle('#0369a1')}>
              {goalMeta.icon} {goalMeta.label}
            </span>
          )}
          {/* Soru */}
          {block.question_count > 0 && (
            <span style={tagStyle('#b45309')}>
              ✏️ {block.question_count}S
            </span>
          )}
          {/* Süre */}
          {block.estimated_duration_minutes && block.estimated_duration_minutes > 0 && (
            <span style={tagStyle('#7c3aed')}>
              ⏱ {block.estimated_duration_minutes}dk
            </span>
          )}
        </div>

        {/* Actual duration */}
        {block.is_completed && block.actual_duration && (
          <div style={{ fontSize: 7.5, color: '#059669', marginTop: 2 }}>⏱ Gerçek: {block.actual_duration}dk</div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '16px', overflowY: 'auto',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16,
        maxWidth: orientation === 'landscape' ? 1160 : 860,
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', marginBottom: 40,
      }}>
        {/* ═══ TOOLBAR ═══ */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 24px', borderBottom: '1px solid #e4e9f2',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1, borderRadius: '16px 16px 0 0',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#172b4c' }}>
            📋 Yazdırma Önizleme
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              display: 'flex', borderRadius: 8, overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}>
              <button
                onClick={() => setOrientation('portrait')}
                style={{
                  padding: '6px 14px', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: orientation === 'portrait' ? '#0061a6' : '#fff',
                  color: orientation === 'portrait' ? '#fff' : '#64748b',
                }}
              >📄 Dikey</button>
              <button
                onClick={() => setOrientation('landscape')}
                style={{
                  padding: '6px 14px', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: orientation === 'landscape' ? '#0061a6' : '#fff',
                  color: orientation === 'landscape' ? '#fff' : '#64748b',
                }}
              >📃 Yatay</button>
            </div>

            <button onClick={handlePDF} disabled={pdfBusy} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: pdfBusy ? '#93c5fd' : '#0061a6', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: pdfBusy ? 'not-allowed' : 'pointer',
            }}>{pdfBusy ? '⏳ Hazırlanıyor...' : '🖨️ PDF Önizle'}</button>
            <button onClick={handleDownload} disabled={pdfBusy} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: '1px solid #0061a6',
              background: '#fff', color: '#0061a6', fontSize: 12, fontWeight: 600,
              cursor: pdfBusy ? 'not-allowed' : 'pointer',
            }}>⬇️ İndir</button>
            <button onClick={onClose} style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #e4e9f2',
              background: '#fff', color: '#8c98a4', fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}>✕</button>
          </div>
        </div>

        {/* ═══════════ A4 CONTENT ═══════════ */}
        <div ref={printRef} style={{
          padding: orientation === 'landscape' ? '18px 24px' : '22px 28px',
          fontFamily: "'Poppins', sans-serif",
          color: '#172b4c', lineHeight: 1.4,
          maxWidth: orientation === 'landscape' ? 1100 : 780,
          margin: '0 auto',
        }}>

          {/* ═══ PREMIUM HEADER ═══ */}
          <div style={{
            position: 'relative', overflow: 'hidden',
            background: 'linear-gradient(135deg, #003d6b 0%, #0061a6 40%, #0085e0 100%)',
            borderRadius: 12, padding: '16px 20px', marginBottom: 12, color: '#fff',
          }}>
            {/* Decorative */}
            <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ position: 'absolute', bottom: -20, right: 60, width: 65, height: 65, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

            {/* Row 1: Logo + Title + Doc info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 8,
                  background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="3K" crossOrigin="anonymous" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>3K KAMPÜS</div>
                  <div style={{ fontSize: 8, opacity: 0.75 }}>Koçluk &amp; Danışmanlık Merkezi</div>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  display: 'inline-block', padding: '2px 14px', borderRadius: 16,
                  background: 'rgba(255,255,255,0.15)', fontSize: 8, fontWeight: 600,
                  letterSpacing: 2, textTransform: 'uppercase', marginBottom: 3,
                }}>
                  HAFTALIK ÇALIŞMA PROGRAMI
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {weekStartStr} — {weekEndStr}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 8, opacity: 0.7, lineHeight: 1.7 }}>
                <div>HÇP-{new Date().getTime().toString(36).toUpperCase().slice(-6)}</div>
                <div>{todayStr}</div>
              </div>
            </div>

            {/* Row 2: Student bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(255,255,255,0.12)', borderRadius: 8,
              padding: '8px 12px',
            }}>
              {/* Photo */}
              {program.student_photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={program.student_photo} alt={program.student_name} crossOrigin="anonymous"
                  style={{
                    width: 40, height: 40, borderRadius: '50%', objectFit: 'cover',
                    border: '2px solid rgba(255,255,255,0.5)', flexShrink: 0,
                  }} />
              ) : (
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                }}>
                  {program.student_name.split(' ').map(w => w.charAt(0)).join('').substring(0, 2)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>🎓 {program.student_name}</div>
                <div style={{ fontSize: 8, opacity: 0.75 }}>
                  Öğrenci{program.student_class ? ` · ${program.student_class}` : ''}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 12, fontSize: 9 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Maestro Koç</div>
                  <div style={{ fontWeight: 600, fontSize: 10 }}>👨‍🏫 {program.coach_name || '—'}</div>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Soru</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#fbbf24' }}>✏️ {program.total_question_count}</div>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Blok</div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>📦 {program.total_block_count}</div>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 1 }}>Tamamlanma</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#34d399' }}>✅ %{program.completion_percent}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ SUMMARY ROW — chips + mini chart ═══ */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'stretch' }}>
            {/* Chips */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
              <span style={chipS('#eef2ff', '#4338ca', '1px solid #c7d2fe')}>📚 {sortedDays.length} Gün</span>
              <span style={chipS('#ecfdf5', '#059669', '1px solid #a7f3d0')}>📦 {program.total_block_count} Blok</span>
              <span style={chipS('#fff7ed', '#ea580c', '1px solid #fed7aa')}>✏️ {program.total_question_count} Soru</span>
              <span style={chipS('#f0fdf4', '#166534', '1px solid #bbf7d0')}>✅ {completedBlocks}/{allBlocks.length}</span>
              {totalDuration > 0 && <span style={chipS('#fdf4ff', '#7c3aed', '1px solid #e9d5ff')}>⏱ {totalDuration}dk</span>}
              {program.badges && program.badges.length > 0 && (
                <span style={chipS('#fffbeb', '#b45309', '1px solid #fde68a')}>🏆 {program.badges.length} Rozet</span>
              )}
            </div>
            {/* Mini bar chart */}
            <div style={{
              display: 'flex', gap: 3, alignItems: 'flex-end',
              padding: '5px 8px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0',
              minWidth: 160,
            }}>
              <div style={{ fontSize: 7, fontWeight: 600, color: '#475569', marginRight: 3, alignSelf: 'center', writingMode: 'vertical-lr', transform: 'rotate(180deg)', letterSpacing: 1 }}>GÜNLÜK</div>
              {sortedDays.map(day => {
                const pct = dayMaxQ > 0 ? ((day.total_question_count || 0) / dayMaxQ) * 100 : 0;
                const done = day.blocks.filter(b => b.is_completed).length;
                const tot = day.blocks.length;
                return (
                  <div key={day.id} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 7, fontWeight: 700, color: '#374151', marginBottom: 1 }}>
                      {day.total_question_count || 0}
                    </div>
                    <div style={{ height: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div style={{
                        width: '60%', minHeight: 3,
                        height: `${Math.max(pct, 10)}%`,
                        borderRadius: '2px 2px 0 0',
                        background: tot > 0 && done === tot
                          ? 'linear-gradient(180deg, #34d399, #059669)'
                          : 'linear-gradient(180deg, #60a5fa, #3b82f6)',
                      }} />
                    </div>
                    <div style={{ fontSize: 7, fontWeight: 600, color: '#64748b', marginTop: 1 }}>
                      {WEEKDAY_LABELS[day.weekday]?.slice(0, 3)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ═══ COACH NOTE ═══ */}
          {program.coach_note && (
            <div style={{
              padding: '6px 12px', marginBottom: 10,
              background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: 6, fontSize: 9, color: '#92400e', lineHeight: 1.5,
            }}>
              <strong>📌 Koç Notu:</strong> {program.coach_note}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
             GÜN GÜN PROGRAM — HER GÜN AYRI BÖLÜM, BLOKLAR GRİD
             Her gün 1 satır header + altında bloklar grid olarak
             Bu sayede hem dikey hem yatay A4'e rahatça sığar
             ═══════════════════════════════════════════════════════ */}
          {sortedDays.map(day => {
            const orderedBlocks = [...day.blocks].sort((a, b) => a.order - b.order);
            const dayCompleted = day.blocks.filter(b => b.is_completed).length;
            const dayTotal = day.blocks.length;
            const allDone = dayTotal > 0 && dayCompleted === dayTotal;
            const dayDuration = day.blocks.reduce((s, b) => s + (b.estimated_duration_minutes || 0), 0);

            return (
              <div key={day.id} style={{ marginBottom: 8, pageBreakInside: 'avoid' }}>
                {/* Day header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 10px',
                  background: allDone
                    ? 'linear-gradient(135deg, #059669, #10b981)'
                    : 'linear-gradient(135deg, #0061a6, #3b82f6)',
                  borderRadius: '6px 6px 0 0',
                  color: '#fff', fontSize: 10,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 11 }}>
                    {WEEKDAY_LABELS[day.weekday]}
                  </span>
                  <span style={{ fontSize: 8, opacity: 0.85 }}>
                    {day.total_question_count || 0} soru · {dayCompleted}/{dayTotal} blok
                    {dayDuration > 0 ? ` · ${dayDuration}dk` : ''}
                    {allDone && dayTotal > 0 ? ' ✅' : ''}
                  </span>
                </div>

                {/* Blocks grid */}
                {orderedBlocks.length > 0 ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${blockCols}, 1fr)`,
                    border: '1px solid #e2e8f0',
                    borderTop: 'none',
                    borderRadius: '0 0 6px 6px',
                    overflow: 'hidden',
                  }}>
                    {orderedBlocks.map(block => renderBlockCard(block))}
                    {/* Fill empty cells */}
                    {orderedBlocks.length % blockCols !== 0 &&
                      Array.from({ length: blockCols - (orderedBlocks.length % blockCols) }).map((_, i) => (
                        <div key={`empty-${day.id}-${i}`} style={{ borderBottom: '1px solid #f1f5f9', background: '#fafbfc', minHeight: 20 }} />
                      ))
                    }
                  </div>
                ) : (
                  <div style={{
                    padding: '8px', textAlign: 'center', fontSize: 9, color: '#94a3b8',
                    border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 6px 6px',
                    background: '#fafbfc',
                  }}>
                    Blok yok
                  </div>
                )}
              </div>
            );
          })}

          {/* ═══ STATISTICS PANEL ═══ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8, marginTop: 12, marginBottom: 12,
          }}>
            {/* Öncelik Dağılımı */}
            <div style={statCardStyle}>
              <div style={statCardTitle}>🎯 Öncelik Dağılımı</div>
              {(Object.keys(PRIORITY_META) as Priority[]).map(p => {
                const pm = PRIORITY_META[p];
                const count = priCounts[p] || 0;
                if (count === 0) return null;
                const pct = Math.round((count / (allBlocks.length || 1)) * 100);
                return (
                  <div key={p} style={{ marginBottom: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginBottom: 1 }}>
                      <span style={{ fontWeight: 600, color: pm.color }}>{pm.icon} {pm.label}</span>
                      <span style={{ color: '#6b7280' }}>{count} (%{pct})</span>
                    </div>
                    <div style={{ height: 3, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: pm.color, borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Çalışma Türü Dağılımı */}
            <div style={statCardStyle}>
              <div style={statCardTitle}>📦 Çalışma Türü Dağılımı</div>
              {(Object.keys(BLOCK_TYPE_META) as BlockType[]).map(bt => {
                const bm = BLOCK_TYPE_META[bt];
                const count = btCounts[bt] || 0;
                if (count === 0) return null;
                const pct = Math.round((count / (allBlocks.length || 1)) * 100);
                return (
                  <div key={bt} style={{ marginBottom: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginBottom: 1 }}>
                      <span style={{ fontWeight: 600, color: bm.color }}>{bm.icon} {bm.label}</span>
                      <span style={{ color: '#6b7280' }}>{count} (%{pct})</span>
                    </div>
                    <div style={{ height: 3, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: bm.color, borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hedef Türü Dağılımı */}
            <div style={statCardStyle}>
              <div style={statCardTitle}>🏁 Hedef Türü Dağılımı</div>
              {(Object.keys(GOAL_TYPE_META) as GoalType[]).map(gt => {
                const gm = GOAL_TYPE_META[gt];
                const count = goalCounts[gt] || 0;
                if (count === 0) return null;
                const pct = Math.round((count / (allBlocks.length || 1)) * 100);
                return (
                  <div key={gt} style={{ marginBottom: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginBottom: 1 }}>
                      <span style={{ fontWeight: 600, color: '#0369a1' }}>{gm.icon} {gm.label}</span>
                      <span style={{ color: '#6b7280' }}>{count} (%{pct})</span>
                    </div>
                    <div style={{ height: 3, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#0ea5e9', borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
              {Object.keys(goalCounts).length === 0 && (
                <div style={{ fontSize: 8, color: '#94a3b8', textAlign: 'center', padding: 4 }}>Hedef türü atanmamış</div>
              )}
            </div>
          </div>

          {/* ═══ BADGES ═══ */}
          {program.badges && program.badges.length > 0 && (
            <div style={{
              padding: '6px 10px', marginBottom: 10,
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#92400e', marginBottom: 3 }}>🏆 Kazanılan Rozetler</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {program.badges.map(badge => (
                  <span key={badge.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                    padding: '2px 7px', borderRadius: 12,
                    background: '#fef3c7', fontSize: 8, fontWeight: 600, color: '#92400e',
                  }}>
                    🏅 {badge.code}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ═══ BOTTOM NOTICE ═══ */}
          <div style={{
            padding: '6px 12px', marginBottom: 8,
            background: '#f0f7ff', borderRadius: 6, border: '1px solid #dbeafe',
            fontSize: 8, color: '#1e40af', lineHeight: 1.6, textAlign: 'center',
          }}>
            Bu çalışma programı, öğrenci maestro koçu <strong>{program.coach_name || '—'}</strong> tarafından
            öğrenci analizi yapılarak hazırlanmıştır. Programa uygun çalışma yapılması ve takip edilmesi önerilir.
          </div>

          {/* ═══ FOOTER ═══ */}
          <div style={{
            paddingTop: 6, borderTop: '2px solid #0061a6',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 7, color: '#8c98a4',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="3K" crossOrigin="anonymous" style={{ width: 10, height: 10, objectFit: 'contain', opacity: 0.5 }} />
              <span style={{ fontWeight: 600 }}>3K Kampüs Koçluk &amp; Danışmanlık Merkezi</span>
            </div>
            <span>© {currentYear} Tüm hakları saklıdır.</span>
          </div>
        </div>
      </div>

      {/* ─── Print Styles ─── */}

    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   STYLE HELPERS
   ═══════════════════════════════════════════════════════ */
function chipS(bg: string, color: string, border: string): React.CSSProperties {
  return {
    padding: '3px 8px', borderRadius: 14, fontSize: 8, fontWeight: 600,
    background: bg, color, border, display: 'inline-flex', alignItems: 'center', gap: 2,
  };
}

function tagStyle(color: string): React.CSSProperties {
  return {
    fontSize: 7, padding: '1px 4px', borderRadius: 3,
    background: `${color}15`, color, fontWeight: 600, whiteSpace: 'nowrap',
  };
}

const statCardStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 6,
  border: '1px solid #e2e8f0', background: '#fff',
};

const statCardTitle: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: '#1e293b', marginBottom: 5,
};
