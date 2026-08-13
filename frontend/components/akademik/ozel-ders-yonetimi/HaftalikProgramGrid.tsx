'use client';

import { useMemo, useRef, useState, type Ref } from 'react';
import {
  GUN_LABELS,
  resolveDersLabel,
  type BirebirSlot,
} from '@/lib/ozel-ders-api';
import { weekBlockColor } from './ozelDersUi';
import {
  matchLessonToPeriod,
  type PeriodRow,
} from './haftalikGridUtils';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

type Props = {
  lessons: BirebirSlot[];
  periods: PeriodRow[];
  useKisaAd: boolean;
  moving?: boolean;
  /** Scroll konumunu korumak için (şablon sayfası) */
  scrollRef?: Ref<HTMLDivElement>;
  /** Sürükleme başlamadan önce (scroll capture vb.) */
  onBeforeDrag?: () => void;
  onCreateAt: (gun: number, period: PeriodRow) => void;
  onOpenLesson: (lesson: BirebirSlot) => void;
  onMove: (lesson: BirebirSlot, gun: number, period: PeriodRow) => void;
  onSwap: (a: BirebirSlot, b: BirebirSlot) => void;
};

export default function HaftalikProgramGrid({
  lessons,
  periods,
  useKisaAd,
  moving,
  scrollRef,
  onBeforeDrag,
  onCreateAt,
  onOpenLesson,
  onMove,
  onSwap,
}: Props) {
  const dragLessonIdRef = useRef<number | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const lessonPeriods = useMemo(() => periods.filter((p) => !p.isBreak), [periods]);
  const activeLessons = useMemo(() => lessons.filter((s) => s.aktif), [lessons]);

  const cellMap = useMemo(() => {
    const map = new Map<string, BirebirSlot>();
    for (const lesson of activeLessons) {
      const period = matchLessonToPeriod(lesson, periods);
      if (!period) continue;
      const key = `${lesson.gun}:${period.key}`;
      if (!map.has(key)) map.set(key, lesson);
    }
    return map;
  }, [activeLessons, periods]);

  function endDrag() {
    dragLessonIdRef.current = null;
    dropTargetRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  }

  function onBlockDragStart(e: React.DragEvent, lesson: BirebirSlot) {
    onBeforeDrag?.();
    dragLessonIdRef.current = lesson.id;
    setDraggingId(lesson.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(lesson.id));
    const el = e.currentTarget as HTMLElement;
    try {
      e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
    } catch {
      /* ignore */
    }
  }

  function onCellDragOver(e: React.DragEvent, key: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetRef.current !== key) {
      dropTargetRef.current = key;
      setDropTarget(key);
    }
  }

  function onCellDrop(e: React.DragEvent, gun: number, period: PeriodRow) {
    e.preventDefault();
    const id = dragLessonIdRef.current;
    endDrag();
    if (!id) return;
    const lesson = activeLessons.find((l) => l.id === id);
    if (!lesson) return;
    suppressClickRef.current = true;
    const key = `${gun}:${period.key}`;
    const existing = cellMap.get(key);
    if (existing && existing.id !== lesson.id) {
      onSwap(lesson, existing);
    } else if (
      lesson.gun !== gun ||
      lesson.baslangic.slice(0, 5) !== period.baslangic
    ) {
      onMove(lesson, gun, period);
    }
  }

  function handleOpen(lesson: BirebirSlot) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpenLesson(lesson);
  }

  return (
    <div ref={scrollRef} className={`od-table-scroll${moving ? ' is-moving' : ''}`}>
      <table className="od-grid-table">
        <thead>
          <tr>
            <th className="od-grid-time-col">Saat</th>
            {DAYS.map((d) => (
              <th key={d}>
                <span className="od-week-head-day">{GUN_LABELS[d]}</span>
                <span className="od-week-head-count">
                  {activeLessons.filter((s) => s.gun === d).length} ders
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lessonPeriods.map((period) => (
            <tr key={period.key}>
              <td className="od-grid-time-col">
                <strong>{period.label}</strong>
                <span>
                  {period.baslangic}–{period.bitis}
                </span>
              </td>
              {DAYS.map((gun) => {
                const key = `${gun}:${period.key}`;
                const lesson = cellMap.get(key);
                const isDrop = dropTarget === key;
                return (
                  <td
                    key={gun}
                    className={`od-grid-cell${lesson ? ' is-filled' : ''}${isDrop ? ' is-drop' : ''}`}
                    onDragOver={(e) => onCellDragOver(e, key)}
                    onDragLeave={() => {
                      if (dropTargetRef.current === key) {
                        dropTargetRef.current = null;
                        setDropTarget(null);
                      }
                    }}
                    onDrop={(e) => onCellDrop(e, gun, period)}
                    onClick={() => {
                      if (lesson) handleOpen(lesson);
                      else onCreateAt(gun, period);
                    }}
                  >
                    {lesson ? (
                      <div
                        className={`od-grid-lesson${draggingId === lesson.id ? ' is-dragging' : ''}`}
                        draggable={!moving}
                        style={{ background: weekBlockColor(lesson.ders_ad || lesson.ders) }}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          onBlockDragStart(e, lesson);
                        }}
                        onDragEnd={endDrag}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpen(lesson);
                        }}
                      >
                        <div className="od-week-block-title">
                          {resolveDersLabel(lesson, useKisaAd)}
                        </div>
                        <div className="od-week-block-sub">{lesson.ogretmen_ad}</div>
                      </div>
                    ) : (
                      <span className="od-grid-empty">+</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
