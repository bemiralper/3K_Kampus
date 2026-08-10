'use client';

import { forwardRef, useMemo } from 'react';
import type { WeeklyProgram, ProgramBlock, ProgramDay, BlockType, GoalType } from '@/lib/study-program-api';
import { BLOCK_TYPE_META, GOAL_TYPE_META, WEEKDAY_FULL } from '@/lib/study-program-api';
import { MetaCol } from '@/components/odev/odevPdfMeta';
import {
  excludeControlDay,
  studyRangeEnd,
} from '@/components/coaching/study-program/programDateUtils';
import { stripCompletionTitleSuffix } from '@/components/odev/odevCompletionHelpers';

export interface StudyProgramDocumentProps {
  program: WeeklyProgram;
}

function formatDateRangeTR(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    return `${s.getDate()}–${e.getDate()} ${s.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}`;
  }
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  return `${s.toLocaleDateString('tr-TR', opts)} – ${e.toLocaleDateString('tr-TR', opts)}`;
}

function formatDayShortTR(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
  });
}

function formatDayHeading(dateStr: string, weekday: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  const dayName = (WEEKDAY_FULL[weekday] || '').toLocaleUpperCase('tr-TR');
  const rest = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }).toLocaleUpperCase('tr-TR');
  return `${dayName} · ${rest}`;
}

function blockDisplayTitle(block: ProgramBlock): string {
  const topic = block.topic_name?.trim();
  if (topic) return topic;
  const t = (block.title || '').trim();
  if (t && !/hafta\s*ödev/i.test(t) && !/ayı\s*\d/i.test(t) && !/^ödev\b/i.test(t)) {
    return t;
  }
  return block.lesson_name?.trim() || t || 'Çalışma';
}

interface FocusLessonRow {
  lesson: string;
  topics: string[];
}

/** Çalışma günü sırasına göre ders → benzersiz konular (max 8 ders). */
function focusByLesson(days: ProgramDay[]): FocusLessonRow[] {
  type Acc = { lesson: string; topics: string[]; topicSeen: Set<string>; firstDayIndex: number };
  const byLesson = new Map<string, Acc>();

  days.forEach((day, dayIndex) => {
    const blocks = [...(day.blocks || [])].sort((a, b) => a.order - b.order);
    for (const b of blocks) {
      const lesson = b.lesson_name?.trim();
      const topic = b.topic_name?.trim();
      if (!lesson || !topic) continue;
      const lessonKey = lesson.toLocaleLowerCase('tr-TR');
      let acc = byLesson.get(lessonKey);
      if (!acc) {
        acc = {
          lesson,
          topics: [],
          topicSeen: new Set(),
          firstDayIndex: dayIndex,
        };
        byLesson.set(lessonKey, acc);
      }
      const topicKey = topic.toLocaleLowerCase('tr-TR');
      if (acc.topicSeen.has(topicKey)) continue;
      acc.topicSeen.add(topicKey);
      acc.topics.push(topic);
    }
  });

  return Array.from(byLesson.values())
    .sort((a, b) => a.firstDayIndex - b.firstDayIndex || a.lesson.localeCompare(b.lesson, 'tr'))
    .slice(0, 8)
    .map(({ lesson, topics }) => ({ lesson, topics }));
}

function WorkRow({ block }: { block: ProgramBlock }) {
  // Zayıf konu seçilebilir tür değil — PDF'te çalışma türü olarak Soru Çözümü göster
  const typeKey: BlockType =
    block.block_type === 'ZAYIF_KONU' ? 'SORU_COZUMU' : (block.block_type as BlockType);
  const btMeta = BLOCK_TYPE_META[typeKey] || {
    label: block.block_type_display || block.block_type,
    icon: '📝',
    color: '#64748b',
  };
  const goalMeta = block.goal_type
    ? GOAL_TYPE_META[block.goal_type as GoalType]
    : null;
  const primary = blockDisplayTitle(block);
  const lesson = block.lesson_name?.trim();
  const resource = block.resource_name?.trim();
  const showLesson =
    lesson && lesson.toLocaleLowerCase('tr-TR') !== primary.toLocaleLowerCase('tr-TR');

  const qty =
    block.question_count > 0
      ? `${block.question_count} Soru`
      : (block.estimated_duration_minutes ?? 0) > 0
        ? `${block.estimated_duration_minutes} dk`
        : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '7px 12px',
        minHeight: 34,
        borderBottom: '1px solid #f0f2f5',
        fontSize: 11,
        color: '#172b4c',
        background: '#fff',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          width: 12,
          height: 12,
          marginTop: 2,
          border: '1.5px solid #cbd5e1',
          borderRadius: 3,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            lineHeight: 1.3,
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          {primary}
        </div>
        {showLesson && (
          <div
            style={{
              fontSize: 10,
              color: '#334155',
              marginTop: 2,
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}
          >
            {lesson}
          </div>
        )}
        {resource && (
          <div
            style={{
              fontSize: 9,
              color: '#64748b',
              marginTop: 2,
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}
          >
            {resource}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, alignItems: 'center' }}>
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: '#1d4ed8',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            {btMeta.icon} {btMeta.label}
          </span>
          {goalMeta && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: '#9a3412',
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                borderRadius: 4,
                padding: '1px 6px',
              }}
            >
              {goalMeta.icon} {goalMeta.label}
            </span>
          )}
        </div>
      </div>
      {qty && (
        <div
          style={{
            flexShrink: 0,
            textAlign: 'right',
            fontSize: 10,
            fontWeight: 600,
            color: '#475569',
            whiteSpace: 'nowrap',
            paddingTop: 1,
            minWidth: 52,
          }}
        >
          {qty}
        </div>
      )}
    </div>
  );
}

const StudyProgramDocument = forwardRef<HTMLDivElement, StudyProgramDocumentProps>(
  function StudyProgramDocument({ program }, ref) {
    const headerLogoUrl = '/img/beyaz-logo.png';
    const footerLogoUrl = '/img/3k-logo.png';
    const currentYear = new Date().getFullYear();
    const docRef = `ÇPP-${program.id}-${Date.now().toString(36).toUpperCase().slice(-5)}`;

    // PDF: sadece çalışma günleri (kontrol = aralığın son günü, kart olarak basılmaz)
    const sortedDays = useMemo(() => {
      const sorted = [...(program.days || [])].sort((a, b) => a.day_date.localeCompare(b.day_date));
      return excludeControlDay(sorted, program.week_end);
    }, [program.days, program.week_end]);

    const homeworkTitles = useMemo(() => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const d of program.days || []) {
        for (const b of d.blocks || []) {
          const t = stripCompletionTitleSuffix(b.source_assignment_title);
          if (!t) continue;
          const key = t.toLocaleLowerCase('tr-TR');
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(t);
        }
      }
      return out;
    }, [program.days]);

    const allBlocks = sortedDays.flatMap((d) => d.blocks);
    const totalQuestions = allBlocks.reduce((s, b) => s + (b.question_count || 0), 0);
    const totalWork = allBlocks.length;
    const studyEnd = studyRangeEnd(program.week_end);
    const rangeLabel = formatDateRangeTR(
      program.week_start,
      studyEnd && studyEnd >= program.week_start ? studyEnd : program.week_end,
    );
    const controlLabel = program.week_end ? formatDayShortTR(program.week_end) : '';
    const focuses = focusByLesson(sortedDays);
    const coachName = program.coach_name || '—';
    const studentName = program.student_name || 'Öğrenci';
    const initials = studentName
      .split(' ')
      .map((w) => w.charAt(0))
      .join('')
      .substring(0, 2);

    return (
      <div
        ref={ref}
        id="study-program-print-area"
        style={{
          padding: '14px 10px',
          fontFamily: "'Poppins', sans-serif",
          color: '#172b4c',
          lineHeight: 1.4,
          maxWidth: 860,
          margin: '0 auto',
          background: '#fff',
        }}
      >
        {/* Header — ödev planı ile aynı dil */}
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #003d6b 0%, #0061a6 40%, #0085e0 100%)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 12,
            color: '#fff',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -24,
              right: -24,
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
            }}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={headerLogoUrl}
                alt="3K"
                crossOrigin="anonymous"
                style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.6, lineHeight: 1.2 }}>
                  3K KAMPÜS
                </div>
                <div
                  style={{
                    marginTop: 3,
                    display: 'inline-block',
                    padding: '1px 8px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.16)',
                    fontSize: 8,
                    fontWeight: 600,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                  }}
                >
                  Haftalık Çalışma Programı
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  margin: 0,
                  lineHeight: 1.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {rangeLabel}
              </h1>
              <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>
                {docRef}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(255,255,255,0.12)',
              borderRadius: 8,
              padding: '7px 12px',
            }}
          >
            {program.student_photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={program.student_photo}
                alt={studentName}
                crossOrigin="anonymous"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '1.5px solid rgba(255,255,255,0.5)',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {initials}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {studentName}
              </div>
              <div style={{ fontSize: 9, opacity: 0.75 }}>
                {program.student_class ? program.student_class : 'Öğrenci'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 10, opacity: 0.95, flexShrink: 0 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, opacity: 0.7, lineHeight: 1.2 }}>Çalışma</div>
                <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{rangeLabel}</div>
              </div>
              {controlLabel && (
                <>
                  <div style={{ width: 1, background: 'rgba(255,255,255,0.3)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 8, opacity: 0.7, lineHeight: 1.2 }}>Kontrol</div>
                    <div style={{ fontWeight: 600, color: '#fbbf24', lineHeight: 1.2 }}>{controlLabel}</div>
                  </div>
                </>
              )}
              <div style={{ width: 1, background: 'rgba(255,255,255,0.3)' }} />
              <div style={{ textAlign: 'center', maxWidth: 100 }}>
                <div style={{ fontSize: 8, opacity: 0.7, lineHeight: 1.2 }}>Koç</div>
                <div
                  style={{
                    fontWeight: 600,
                    lineHeight: 1.2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {coachName}
                </div>
              </div>
            </div>
          </div>
        </div>

        {homeworkTitles.length > 0 && (
          <div
            style={{
              marginBottom: 10,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #dbeafe',
              background: '#f0f7ff',
            }}
          >
            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: '#64748b',
                marginBottom: 3,
              }}
            >
              Ödev planı
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>
              {homeworkTitles.join(' · ')}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          <MetaCol
            label="Gün"
            value={String(sortedDays.length)}
            minWidth={56}
            valueColor="#4338ca"
            borderColor="#c7d2fe"
            background="#eef2ff"
          />
          <MetaCol
            label="Çalışma"
            value={String(totalWork)}
            minWidth={56}
            valueColor="#059669"
            borderColor="#a7f3d0"
            background="#ecfdf5"
          />
          {totalQuestions > 0 && (
            <MetaCol
              label="Soru"
              value={String(totalQuestions)}
              minWidth={56}
              valueColor="#ea580c"
              borderColor="#fed7aa"
              background="#fff7ed"
            />
          )}
        </div>

        {focuses.length > 0 && (
          <div
            style={{
              marginBottom: 12,
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid #bfdbfe',
              background: 'linear-gradient(180deg, #eff6ff 0%, #fff 55%)',
            }}
          >
            <div
              style={{
                padding: '8px 14px',
                background: 'linear-gradient(90deg, #1d4ed8 0%, #0061a6 100%)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              🎯 Bu Haftanın Odak Noktaları
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px 16px',
                padding: '12px 14px',
              }}
            >
              {focuses.map((row, i) => {
                const shown = row.topics.slice(0, 3);
                const extra = row.topics.length - shown.length;
                const topicLine =
                  shown.join(' · ') + (extra > 0 ? ` · +${extra}` : '');
                return (
                  <div
                    key={row.lesson}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: '#fff',
                      border: '1px solid #bfdbfe',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 800,
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {i + 1}
                    </span>
                    <div style={{ minWidth: 0, lineHeight: 1.35 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: '#1e3a8a',
                          wordBreak: 'break-word',
                        }}
                      >
                        {row.lesson}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: '#334155',
                          marginTop: 2,
                          wordBreak: 'break-word',
                        }}
                      >
                        {topicLine}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(() => {
          const weekNote = program.coach_note?.trim() || '';
          if (!weekNote) return null;
          return (
            <div
              style={{
                padding: '10px 14px',
                marginBottom: 12,
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 8,
                fontSize: 11,
                color: '#92400e',
                lineHeight: 1.55,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 11 }}>
                📌 Haftalık Koç Notu
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{weekNote}</div>
            </div>
          );
        })()}

        {sortedDays.map((day) => {
          const ordered = [...day.blocks].sort((a, b) => a.order - b.order);
          const dayQ = ordered.reduce((s, b) => s + (b.question_count || 0), 0);
          const dayNote = day.coach_note?.trim() || '';
          return (
            <div key={day.id} style={{ marginBottom: 12, pageBreakInside: 'avoid' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: '#0061a6',
                  color: '#fff',
                  borderRadius: '8px 8px 0 0',
                  fontSize: 13,
                  fontWeight: 600,
                  gap: 8,
                }}
              >
                <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.3 }}>
                  {formatDayHeading(day.day_date, day.weekday)}
                </span>
                <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85, flexShrink: 0 }}>
                  {ordered.length} çalışma
                  {dayQ > 0 ? ` · ${dayQ} soru` : ''}
                </span>
              </div>
              <div
                style={{
                  border: '1px solid #e4e9f2',
                  borderTop: 'none',
                  borderRadius: dayNote ? '0' : '0 0 8px 8px',
                  overflow: 'hidden',
                }}
              >
                {ordered.length > 0 ? (
                  ordered.map((b) => <WorkRow key={b.id} block={b} />)
                ) : (
                  <div
                    style={{
                      padding: '10px 14px',
                      fontSize: 11,
                      color: '#94a3b8',
                      background: '#fafafa',
                    }}
                  >
                    Dinlenme / serbest çalışma
                  </div>
                )}
              </div>
              {dayNote && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: '#fffbeb',
                    border: '1px solid #e4e9f2',
                    borderTop: '1px solid #fde68a',
                    borderRadius: '0 0 8px 8px',
                    fontSize: 11,
                    color: '#78350f',
                    lineHeight: 1.45,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: '#b45309',
                      marginBottom: 3,
                    }}
                  >
                    Koç notu
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{dayNote}</div>
                </div>
              )}
            </div>
          );
        })}

        <div
          style={{
            padding: '12px 18px',
            marginBottom: 20,
            background: '#f0f7ff',
            borderRadius: 8,
            border: '1px solid #dbeafe',
            fontSize: 10,
            color: '#1e40af',
            lineHeight: 1.7,
            textAlign: 'center',
          }}
        >
          Bu çalışma programı, öğrenci maestro koçu <strong>{coachName}</strong> tarafından
          öğrenci analizi yapılarak hazırlanmıştır. Her satırdaki kutuyu tamamladığınızda işaretleyin.
        </div>

        <div
          style={{
            paddingTop: 12,
            borderTop: '2px solid #0061a6',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 9,
            color: '#8c98a4',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={footerLogoUrl}
              alt="3K"
              crossOrigin="anonymous"
              style={{ width: 16, height: 16, objectFit: 'contain', opacity: 0.5 }}
            />
            <span style={{ fontWeight: 600 }}>3K Kampüs Koçluk Merkezi</span>
          </div>
          <span>© {currentYear} Tüm hakları saklıdır.</span>
        </div>
      </div>
    );
  },
);

export default StudyProgramDocument;
