'use client';

import { useState, useRef, useCallback, useEffect, useMemo, useLayoutEffect } from 'react';
import { uploadApi, mappingTemplateApi } from '../../../../components/olcme/api';
import type {
  ExamDetail,
  FieldMapping,
  DATUploadResponse,
  DATParseResultRow,
  DATSessionItem,
  MappingTemplate,
  StudentSearchResult,
  MatchSuggestion,
} from '../../../../components/olcme/types';
import Icon from '../../../../components/olcme/ui/Icon';
import OmrUploadPanel from './OmrUploadPanel';
import s from '../olcme.module.css';
import u from './upload.module.css';

/* ── Renkler ──────────────────────────────────────────────────────────────── */

const COLOR_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#14b8a6', '#e11d48',
];

type Step = 'upload' | 'mapping' | 'results';
type ResultFilter = 'all' | 'unmatched' | 'pending';

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Dosya' },
  { key: 'mapping', label: 'Alanlar' },
  { key: 'results', label: 'Sonuçlar' },
];

const matchMethodLabel = (method: string, score: number): string => {
  switch (method) {
    case 'tc':         return 'TC kimlik';
    case 'id':         return 'Öğrenci numarası';
    case 'name_exact': return 'Tam ad soyad';
    case 'name':       return `İsim benzerliği %${Math.round(score * 100)}`;
    case 'manual':     return 'Elle eşleştirildi';
    default:           return '';
  }
};

type MatchStatus = NonNullable<DATParseResultRow['match_status']>;

const STATUS_LABEL: Record<MatchStatus, string> = {
  matched: 'Eşleşti',
  manual: 'Elle eşleşti',
  pending: 'Öneri var',
  conflict: 'Çakışma',
  not_found: 'Bulunamadı',
};

const CONFIDENCE_LABEL = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' } as const;

function rowMatchStatus(row: DATParseResultRow): MatchStatus {
  if (row.match_status) return row.match_status;
  if (row.matched_student_id) return row.match_method === 'manual' ? 'manual' : 'matched';
  if (row.top_suggestion) return 'pending';
  return 'not_found';
}

function scoreToConfidence(score01: number): keyof typeof CONFIDENCE_LABEL {
  const pct = Math.round(score01 * 100);
  if (pct >= 95) return 'high';
  if (pct >= 80) return 'medium';
  return 'low';
}

function displayScorePct(score?: number | null, fallback01?: number): number | null {
  if (typeof score === 'number' && score > 1) return Math.round(score);
  if (typeof score === 'number' && score > 0) return Math.round(score * 100);
  if (typeof fallback01 === 'number' && fallback01 > 0) return Math.round(fallback01 * 100);
  return null;
}

const fmtNet = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtNet2 = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  OverlayLayer – Piksel bazlı overlay bileşeni                            */
/*  DOM'daki [data-text-line] span'ından ölçüm alır, ch birimi kullanmaz.   */
/* ═══════════════════════════════════════════════════════════════════════════ */
interface OverlayLayerProps {
  gridRef: React.RefObject<HTMLDivElement | null>;
  mappings: FieldMapping[];
  selLo: number | null;
  selHi: number | null;
  getColorIndex: (field: string) => number;
  linesCount: number;
}

function OverlayLayer({ gridRef, mappings, selLo, selHi, getColorIndex, linesCount }: OverlayLayerProps) {
  const [metrics, setMetrics] = useState<{ offsetPx: number; chPx: number; rulerH: number } | null>(null);

  const remeasure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return false;
    const datGridEl = (grid.querySelector(`.${s.datGrid}`) as HTMLElement) || grid;
    const spans = grid.querySelectorAll('[data-text-line]');
    let textSpan: HTMLElement | null = null;
    for (const el of spans) {
      const node = el as HTMLElement;
      if ((node.textContent?.length || 0) > 0 && node.getBoundingClientRect().width > 0) {
        textSpan = node;
        break;
      }
    }
    if (!textSpan) return false;
    const gridRect = datGridEl.getBoundingClientRect();
    const spanRect = textSpan.getBoundingClientRect();
    const len = textSpan.textContent?.length || 1;
    const chW = spanRect.width / len;
    if (chW <= 0.5) return false;
    const offsetPx = spanRect.left - gridRect.left;
    const rulerLine = datGridEl.querySelector(`.${s.datRulerLine}`) as HTMLElement | null;
    const rulerH = rulerLine ? rulerLine.getBoundingClientRect().height : 22;
    setMetrics((prev) => {
      if (
        prev
        && Math.abs(prev.offsetPx - offsetPx) < 0.5
        && Math.abs(prev.chPx - chW) < 0.05
        && Math.abs(prev.rulerH - rulerH) < 0.5
      ) {
        return prev;
      }
      return { offsetPx, chPx: chW, rulerH };
    });
    return true;
  }, [gridRef]);

  // İlk seçimde de ölç: font/layout hazır olmayınca overlay hiç çizilmiyordu.
  useLayoutEffect(() => {
    if (remeasure()) return;
    let attempts = 0;
    let raf = 0;
    const tick = () => {
      if (remeasure() || attempts++ > 24) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [remeasure, linesCount, mappings.length]);

  useLayoutEffect(() => {
    if (!metrics) remeasure();
  }, [remeasure, metrics, selLo, selHi]);

  useEffect(() => {
    const grid = gridRef.current;
    const handler = () => { remeasure(); };
    window.addEventListener('resize', handler);
    const fontsReady = document.fonts?.ready?.then(handler);
    let ro: ResizeObserver | null = null;
    if (grid && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(handler);
      ro.observe(grid);
    }
    return () => {
      window.removeEventListener('resize', handler);
      ro?.disconnect();
      fontsReady?.catch(() => undefined);
    };
  }, [remeasure, gridRef]);

  const offsetPx = metrics?.offsetPx ?? 54;
  const chPx = metrics?.chPx ?? 7.5;
  const rulerH = metrics?.rulerH ?? 22;

  return (
    <>
      {mappings.map((m) => {
        const ci = getColorIndex(m.field);
        const colorIdx = ci % 4;
        return (
          <div key={m.field} className={`${s.datMappedCol} ${s[`mapColor${colorIdx}`]}`}
            style={{
              left: `${offsetPx + m.start * chPx}px`,
              width: `${(m.end - m.start) * chPx}px`,
              top: `${rulerH}px`,
              height: `calc(100% - ${rulerH}px)`,
            }}>
            <span className={`${s.datMappedLabel} ${s[`mapLabelColor${colorIdx}`]}`}>{m.label}</span>
          </div>
        );
      })}

      {selLo !== null && selHi !== null && (
        <div className={s.datSelection}
          style={{
            left: `${offsetPx + selLo * chPx}px`,
            width: `${Math.max(selHi - selLo, 1) * chPx}px`,
            top: `${rulerH}px`,
            height: `calc(100% - ${rulerH}px)`,
          }}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Alan seçenekleri                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface FieldOption {
  field: string;
  label: string;
  color: number;
  group: 'genel' | 'ders';
  parentLabel?: string;
  isSubSection?: boolean;
  /** Sütunun olması gereken genişliği (ders: soru sayısı, TC: 11). */
  width?: number;
}

const BASE_FIELDS: FieldOption[] = [
  { field: 'ogrenci_no',    label: 'Öğrenci No',    color: 0, group: 'genel' },
  { field: 'tc_kimlik',     label: 'TC Kimlik',     color: 1, group: 'genel', width: 11 },
  { field: 'ad_soyad',      label: 'Ad Soyad',      color: 2, group: 'genel' },
  { field: 'kitapcik_turu', label: 'Kitapçık Türü', color: 3, group: 'genel', width: 1 },
];

/** Sıralanabilir sütun başlığı — render içinde tanımlanırsa her render'da başlık yeniden kurulur. */
function SortTh({ label, columnKey, activeKey, direction, align, onSort }: {
  label: string;
  columnKey: string;
  activeKey: string;
  direction: 'asc' | 'desc';
  align?: 'center';
  onSort: (key: string) => void;
}) {
  const active = activeKey === columnKey;
  return (
    <th
      className={u.sortTh}
      onClick={() => onSort(columnKey)}
      style={{ textAlign: align }}
      title={`${label} sütununa göre sırala`}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <span className={active ? u.sortOn : u.sortOff}>{active && direction === 'asc' ? '▲' : '▼'}</span>
    </th>
  );
}

interface Props {
  exam: ExamDetail;
  /** Okuma/silme sonrası sınav başlığındaki durum ve sayıları tazelemek için. */
  onExamChange?: () => void;
}

export default function UploadTab({ exam, onExamChange }: Props) {
  /* ── State ──────────────────────────────────────────────────────────────── */
  const [step, setStep]                 = useState<Step>('upload');
  const [uploading, setUploading]       = useState(false);
  const [parsing, setParsing]           = useState(false);
  const [error, setError]               = useState('');
  const [notice, setNotice]             = useState('');
  const [sourceMode, setSourceMode]     = useState<'dat' | 'omr'>('dat');

  const [uploadResp, setUploadResp]     = useState<DATUploadResponse | null>(null);
  const [lines, setLines]               = useState<string[]>([]);
  const [firstLineHeader, setFirstLineHeader] = useState(false);
  const [studentIdField, setStudentIdField]   = useState<string>('ogrenci_no');

  const [mappings, setMappings]         = useState<FieldMapping[]>([]);
  const [selStart, setSelStart]         = useState<number | null>(null);
  const [selEnd, setSelEnd]             = useState<number | null>(null);
  const [ctxMenu, setCtxMenu]           = useState<{ x: number; y: number } | null>(null);

  const [results, setResults]           = useState<DATParseResultRow[]>([]);
  const [totalRows, setTotalRows]       = useState(0);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [resultsSessionId, setResultsSessionId] = useState<number | null>(null);

  const [sessions, setSessions]         = useState<DATSessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [openingSessionId, setOpeningSessionId] = useState<number | null>(null);

  const [matchDialogRow, setMatchDialogRow] = useState<DATParseResultRow | null>(null);
  const [dialogError, setDialogError]   = useState('');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching]       = useState(false);
  const [suggestions, setSuggestions]   = useState<MatchSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [matchingBusy, setMatchingBusy] = useState(false);
  const searchSeq = useRef(0);

  const [rematching, setRematching]     = useState(false);

  const [dragOver, setDragOver]         = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const gridRef                         = useRef<HTMLDivElement>(null);
  const [hScroll, setHScroll]           = useState({ left: 0, max: 0 });
  const ctxMenuRef                      = useRef<HTMLDivElement>(null);

  const [templates, setTemplates]       = useState<MappingTemplate[]>([]);
  const [showSaveDialog, setShowSaveDialog]     = useState(false);
  const [templateName, setTemplateName]         = useState('');
  const [savingTemplate, setSavingTemplate]     = useState(false);

  const bookletChoices = exam.booklet_type === 'ABCD' ? ['A', 'B', 'C', 'D']
    : exam.booklet_type === 'AB' ? ['A', 'B'] : [];
  const hasAnswerKey = exam.status !== 'DRAFT';

  /* ── Sınav bölümlerinden ders seçenekleri ───────────────────────────────── */
  const sectionFieldOptions: FieldOption[] = useMemo(() => {
    const allSections = exam.sections || [];
    const mainSections = allSections.filter(sec => !sec.is_sub_section).sort((a, b) => a.order - b.order);
    const subSections = allSections.filter(sec => sec.is_sub_section).sort((a, b) => a.order - b.order);

    const options: FieldOption[] = [];
    let colorIdx = BASE_FIELDS.length;
    for (const main of mainSections) {
      const children = subSections.filter(sec => sec.parent_section === main.id);
      if (children.length > 0) {
        for (const child of children) {
          options.push({
            field: `ders_${child.id}`,
            label: child.name,
            color: colorIdx++,
            group: 'ders',
            parentLabel: main.name,
            isSubSection: true,
            width: child.question_end - child.question_start + 1,
          });
        }
      } else {
        options.push({
          field: `ders_${main.id}`,
          label: main.name,
          color: colorIdx++,
          group: 'ders',
          width: main.question_end - main.question_start + 1,
        });
      }
    }
    return options;
  }, [exam.sections]);

  const allFieldOptions: FieldOption[] = useMemo(
    () => [...BASE_FIELDS, ...sectionFieldOptions],
    [sectionFieldOptions],
  );

  const hasAnswerMapping = useMemo(
    () => mappings.some(m => m.field === 'cevaplar' || m.field.startsWith('ders_')),
    [mappings],
  );
  const hasIdentityMapping = useMemo(
    () => mappings.some(m => ['ogrenci_no', 'tc_kimlik', 'ad_soyad'].includes(m.field)),
    [mappings],
  );

  /** Genişliği beklenenden farklı alanlar — backend sessizce kırpar/boşlukla doldurur. */
  const widthIssues = useMemo(() => mappings.flatMap(m => {
    const opt = allFieldOptions.find(o => o.field === m.field);
    if (!opt?.width) return [];
    const got = m.end - m.start;
    return got === opt.width ? [] : [{ field: m.field, label: opt.label, got, want: opt.width }];
  }), [mappings, allFieldOptions]);
  const unmappedSections = sectionFieldOptions.filter(o => !mappings.some(m => m.field === o.field));

  /* ── Karakter ölçümü ────────────────────────────────────────────────────── */
  const chWidthRef = useRef<number>(0);

  const charPosFromEvent = useCallback((e: React.MouseEvent): number | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    const target = e.target as HTMLElement;
    const line = target.closest(`.${s.datGridLine}`) as HTMLElement | null;
    let textSpan: HTMLElement | null = null;
    if (line) textSpan = line.querySelector('[data-text-line]') as HTMLElement | null;
    if (!textSpan) textSpan = grid.querySelector('[data-text-line]') as HTMLElement | null;
    if (!textSpan) return null;
    const spanRect = textSpan.getBoundingClientRect();
    const len = textSpan.textContent?.length || 1;
    const measured = spanRect.width / len;
    const chW = measured > 0.5 ? measured : (chWidthRef.current || 7.5);
    chWidthRef.current = chW;
    const relX = e.clientX - spanRect.left;
    return Math.max(0, Math.floor(relX / chW));
  }, []);

  /* ── Veri yükleme ───────────────────────────────────────────────────────── */
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      setSessions(await uploadApi.listSessions(exam.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Önceki yüklemeler listelenemedi.');
    }
    setLoadingSessions(false);
  }, [exam.id]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await mappingTemplateApi.list(exam.exam_type);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[UploadTab] fetchTemplates error:', err);
    }
  }, [exam.exam_type]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 8000);
    return () => window.clearTimeout(t);
  }, [notice]);

  /* Uzun satır kutuyu büyütmeden yatay kaydırma. Range her zaman görünür. */
  useEffect(() => {
    if (step !== 'mapping') return;
    const wrap = gridRef.current;
    if (!wrap) return;
    const sync = () => {
      const max = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
      const left = wrap.scrollLeft;
      setHScroll(prev => (prev.left === left && prev.max === max ? prev : { left, max }));
    };
    sync();
    const raf = requestAnimationFrame(sync);
    wrap.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(wrap);
    if (wrap.firstElementChild) ro.observe(wrap.firstElementChild);
    return () => {
      cancelAnimationFrame(raf);
      wrap.removeEventListener('scroll', sync);
      ro.disconnect();
    };
  }, [step, lines]);

  /* ── Dosya yükleme ──────────────────────────────────────────────────────── */
  const handleFile = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const resp = await uploadApi.upload(exam.id, file);
      setUploadResp(resp);
      setLines(resp.preview_lines);
      chWidthRef.current = 0;
      setStep('mapping');
      setMappings([]);
      setResults([]);
      setSelStart(null);
      setSelEnd(null);
      fetchSessions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dosya yüklenemedi.');
    } finally {
      setUploading(false);
    }
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  /* ── Sütun seçimi (mousedown → mousemove → mouseup) ─────────────────────── */
  const draggingRef = useRef(false);
  const touchScrollRef = useRef(false);
  const dragClientXRef = useRef<number | null>(null);
  const dragScrollRafRef = useRef(0);
  const dragScrollFrameRef = useRef<() => void>(() => {});

  const stopColumnDrag = () => {
    draggingRef.current = false;
    dragClientXRef.current = null;
    if (dragScrollRafRef.current) {
      cancelAnimationFrame(dragScrollRafRef.current);
      dragScrollRafRef.current = 0;
    }
  };

  // Kenara sürükleyince görünmeyen ders sütunları kayarak seçilebilsin.
  dragScrollFrameRef.current = () => {
    const wrap = gridRef.current;
    const clientX = dragClientXRef.current;
    if (!wrap || clientX === null || !draggingRef.current) return;
    const rect = wrap.getBoundingClientRect();
    const edge = 56;
    let delta = 0;
    if (clientX > rect.right - edge) {
      delta = Math.min(42, 10 + (clientX - (rect.right - edge)) * 0.45);
    } else if (clientX < rect.left + edge) {
      delta = -Math.min(42, 10 + ((rect.left + edge) - clientX) * 0.45);
    }
    if (delta === 0) return;
    wrap.scrollLeft += delta;
    const textSpan = wrap.querySelector('[data-text-line]') as HTMLElement | null;
    if (!textSpan) return;
    const spanRect = textSpan.getBoundingClientRect();
    const len = textSpan.textContent?.length || 1;
    const measured = spanRect.width / len;
    const chW = measured > 0.5 ? measured : (chWidthRef.current || 7.5);
    chWidthRef.current = chW;
    setSelEnd(Math.max(0, Math.floor((clientX - spanRect.left) / chW)));
  };

  const ensureDragScroll = () => {
    if (dragScrollRafRef.current) return;
    const loop = () => {
      if (!draggingRef.current) {
        dragScrollRafRef.current = 0;
        return;
      }
      dragScrollFrameRef.current();
      dragScrollRafRef.current = requestAnimationFrame(loop);
    };
    dragScrollRafRef.current = requestAnimationFrame(loop);
  };

  const onGridMouseDown = (e: React.MouseEvent) => {
    if (touchScrollRef.current) {
      touchScrollRef.current = false;
      return;
    }
    if (e.button !== 0) return;
    // preventDefault kaydırma çubuğunun sürüklenmesini iptal ediyordu; çubuğun üstündeyse sütun seçme.
    const wrap = gridRef.current;
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      const barX = wrap.offsetWidth - wrap.clientWidth;
      const barY = wrap.offsetHeight - wrap.clientHeight;
      if ((barX > 1 && e.clientX >= rect.right - barX - 4) || (barY > 1 && e.clientY >= rect.bottom - barY - 4)) {
        return;
      }
    }
    const pos = charPosFromEvent(e);
    if (pos === null) return;
    if (mappings.some(m => pos >= m.start && pos < m.end)) return;
    setSelStart(pos);
    setSelEnd(pos);
    draggingRef.current = true;
    dragClientXRef.current = e.clientX;
    ensureDragScroll();
    setCtxMenu(null);
  };

  const onGridPointerDown = (e: React.PointerEvent) => {
    // Parmakla sağa-sola kaydırma sütun seçimine dönmesin.
    if (e.pointerType === 'touch') {
      touchScrollRef.current = true;
      window.setTimeout(() => { touchScrollRef.current = false; }, 700);
      return;
    }
    onGridMouseDown(e);
  };

  const onGridMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    dragClientXRef.current = e.clientX;
    const pos = charPosFromEvent(e);
    if (pos !== null) setSelEnd(pos);
  };

  const onGridMouseUp = () => {
    if (!draggingRef.current) return;
    stopColumnDrag();
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => { stopColumnDrag(); };
    const handleGlobalMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      dragClientXRef.current = ev.clientX;
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      if (dragScrollRafRef.current) cancelAnimationFrame(dragScrollRafRef.current);
    };
  }, []);

  const onGridContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (selStart === null || selEnd === null) return;
    const menuW = 260;
    const menuH = 400;
    const pad = 8;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuW + pad > window.innerWidth) x = window.innerWidth - menuW - pad;
    if (y + menuH + pad > window.innerHeight) y = window.innerHeight - menuH - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    setCtxMenu({ x, y });
  };

  const assignField = (field: string) => {
    if (selStart === null || selEnd === null) return;
    const lo = Math.min(selStart, selEnd);
    const hi = lo + Math.max(Math.max(selStart, selEnd) - lo, 1); // end exclusive, min 1 karakter
    const opt = allFieldOptions.find(o => o.field === field);
    const label = opt?.label || field;
    const clash = mappings.find(m => m.field !== field && lo < m.end && m.start < hi);
    if (clash) {
      setError(`Seçilen aralık "${clash.label}" alanıyla çakışıyor [${clash.start}–${clash.end}).`);
      setCtxMenu(null);
      return;
    }
    setError('');
    setMappings(prev => {
      const next = prev.filter(m => m.field !== field);
      return [...next, { field, start: lo, end: hi, label }];
    });
    setCtxMenu(null);
    setSelStart(null);
    setSelEnd(null);
  };

  const removeMapping = (field: string) => {
    setMappings(prev => prev.filter(m => m.field !== field));
  };

  // Windows'ta contextmenu'den hemen sonra click gelir; o tık menüyü açıldığı anda kapatmasın.
  useEffect(() => {
    if (!ctxMenu) return;
    let armed = false;
    const arm = window.setTimeout(() => { armed = true; }, 280);
    const handler = (e: MouseEvent) => {
      if (!armed) return;
      if (ctxMenuRef.current?.contains(e.target as Node)) return;
      setCtxMenu(null);
    };
    document.addEventListener('click', handler);
    document.addEventListener('contextmenu', handler);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener('click', handler);
      document.removeEventListener('contextmenu', handler);
    };
  }, [ctxMenu]);

  useEffect(() => {
    if (!ctxMenu || !ctxMenuRef.current) return;
    const rect = ctxMenuRef.current.getBoundingClientRect();
    const pad = 8;
    let { x, y } = ctxMenu;
    let changed = false;
    if (rect.right > window.innerWidth - pad) { x = window.innerWidth - rect.width - pad; changed = true; }
    if (rect.bottom > window.innerHeight - pad) { y = window.innerHeight - rect.height - pad; changed = true; }
    if (x < pad) { x = pad; changed = true; }
    if (y < pad) { y = pad; changed = true; }
    if (changed) setCtxMenu({ x, y });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxMenu]);

  /* ── Şablonlar ──────────────────────────────────────────────────────────── */
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      await mappingTemplateApi.create({
        name: templateName.trim(),
        exam_type: exam.exam_type,
        mappings,
        first_line_is_header: firstLineHeader,
        student_id_field: studentIdField,
      });
      setShowSaveDialog(false);
      setTemplateName('');
      setNotice(`"${templateName.trim()}" şablonu kaydedildi.`);
      fetchTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Şablon kaydedilemedi.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleLoadTemplate = (tpl: MappingTemplate) => {
    // Şablonda başka sınavın bölüm id'leri olabilir: bu sınavda yoksa bölüm adıyla eşlenir.
    const allSections = exam.sections || [];
    const nameToId = new Map(allSections.map(sec => [sec.name.trim().toLocaleLowerCase('tr'), sec.id]));
    const dropped: string[] = [];
    const remapped = tpl.mappings.flatMap(m => {
      if (!m.field.startsWith('ders_')) return [m];
      const oldId = parseInt(m.field.replace('ders_', ''), 10);
      if (allSections.some(sec => sec.id === oldId)) return [m];
      const newId = nameToId.get((m.label || '').trim().toLocaleLowerCase('tr'));
      if (newId) return [{ ...m, field: `ders_${newId}` }];
      dropped.push(m.label || m.field);
      return [];
    });
    setMappings(remapped);
    setFirstLineHeader(tpl.first_line_is_header);
    setStudentIdField(tpl.student_id_field);
    setSelStart(null);
    setSelEnd(null);
    if (dropped.length) {
      setError(`"${tpl.name}" yüklendi ama bu sınavda karşılığı olmayan alanlar atlandı: ${dropped.join(', ')}.`);
    } else {
      setError('');
      setNotice(`"${tpl.name}" şablonu yüklendi (${remapped.length} alan).`);
    }
  };

  const handleDeleteTemplate = async (tpl: MappingTemplate) => {
    if (!confirm(`"${tpl.name}" şablonu silinsin mi?`)) return;
    try {
      await mappingTemplateApi.delete(tpl.id);
      fetchTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Şablon silinemedi.');
    }
  };

  /* ── Oku ve skorla ──────────────────────────────────────────────────────── */
  const handleParse = async () => {
    if (!uploadResp) return;
    if (!hasAnswerMapping) {
      setError('En az bir ders cevap alanı eşleştirin.');
      return;
    }
    const warnings = [
      ...widthIssues.map(w => `${w.label}: ${w.got} karakter seçildi, ${w.want} olmalı`),
      unmappedSections.length ? `Eşleştirilmeyen dersler: ${unmappedSections.map(o => o.label).join(', ')}` : '',
      !hasIdentityMapping ? 'Kimlik alanı yok: hiçbir kayıt öğrenciyle eşleşmez' : '',
    ].filter(Boolean);
    if (warnings.length && !confirm(`${warnings.join('\n')}\n\nYine de okunsun mu?`)) return;

    setError('');
    setParsing(true);
    try {
      const resp = await uploadApi.parse(exam.id, uploadResp.session_id, {
        field_mappings: mappings,
        first_line_is_header: firstLineHeader,
        student_id_field: studentIdField,
      });
      fetchSessions();
      onExamChange?.();
      if (!resp.results || resp.results.length === 0) {
        setError('Dosya okundu ama hiç sonuç satırı çıkmadı. Alan eşleştirmesini kontrol edin.');
        return;
      }
      setResults(resp.results);
      setTotalRows(resp.total_rows);
      setResultsSessionId(resp.session?.id ?? uploadResp.session_id);
      setResultFilter('all');
      setCtxMenu(null);
      setSelStart(null);
      setSelEnd(null);
      setStep('results');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dosya okunamadı.');
    } finally {
      setParsing(false);
    }
  };

  /* ── Yüklemeler ─────────────────────────────────────────────────────────── */
  const handleDeleteSession = async (ses: DATSessionItem) => {
    const detail = ses.total_rows > 0
      ? `Bu yüklemedeki ${ses.total_rows} öğrencinin sonucu da silinir; analiz ve karneler değişir.`
      : 'Henüz okunmamış bir yükleme.';
    if (!confirm(`"${ses.original_filename}" silinsin mi?\n${detail}`)) return;
    try {
      await uploadApi.deleteSession(exam.id, ses.id);
      fetchSessions();
      onExamChange?.();
      if (resultsSessionId === ses.id) {
        setResults([]);
        setTotalRows(0);
        setResultsSessionId(null);
        if (step === 'results') setStep('upload');
      }
      if (uploadResp?.session_id === ses.id) {
        setUploadResp(null);
        setLines([]);
        setMappings([]);
        if (step === 'mapping') setStep('upload');
      }
      setNotice('Yükleme silindi.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Yükleme silinemedi.');
    }
  };

  const handleLoadSessionResults = async (sessionId: number) => {
    setOpeningSessionId(sessionId);
    setError('');
    setCtxMenu(null);
    setMatchDialogRow(null);
    try {
      const resp = await uploadApi.sessionResults(exam.id, sessionId);
      if (!resp.results || resp.results.length === 0) {
        setError('Bu yüklemede gösterilecek sonuç kaydı yok.');
        return;
      }
      setResults(resp.results);
      setTotalRows(resp.total_rows);
      setResultsSessionId(sessionId);
      setResultFilter('all');
      setStep('results');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sonuçlar yüklenemedi.');
    } finally {
      setOpeningSessionId(null);
    }
  };

  useEffect(() => {
    if (!resultsSessionId) return;
    const matched = results.filter(r => r.matched_student_id).length;
    setSessions(prev => prev.map(ses => (ses.id !== resultsSessionId ? ses : {
      ...ses,
      total_rows: results.length,
      matched_count: matched,
      unmatched_count: results.length - matched,
    })));
  }, [results, resultsSessionId]);

  const refreshResults = useCallback(async () => {
    if (!resultsSessionId) return false;
    const fresh = await uploadApi.sessionResults(exam.id, resultsSessionId);
    setResults(fresh.results);
    setTotalRows(fresh.total_rows);
    return true;
  }, [exam.id, resultsSessionId]);

  const handleRematch = useCallback(async () => {
    setRematching(true);
    setError('');
    try {
      const resp = await uploadApi.rematchUnmatched(exam.id);
      await refreshResults();
      fetchSessions();
      onExamChange?.();
      setNotice(resp.newly_matched > 0
        ? `${resp.newly_matched} kayıt yeni eşleşti${resp.still_unmatched ? ` · ${resp.still_unmatched} kayıt hâlâ eşleşmedi` : ''}.`
        : `Yeni eşleşme bulunamadı · ${resp.still_unmatched} kayıt eşleşmedi.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yeniden eşleştirme yapılamadı.');
    }
    setRematching(false);
  }, [exam.id, refreshResults, fetchSessions, onExamChange]);

  /* ── Elle eşleştirme ────────────────────────────────────────────────────── */
  const closeMatchDialog = useCallback(() => {
    searchSeq.current += 1;
    setMatchDialogRow(null);
    setSearchQuery('');
    setSearchResults([]);
    setSuggestions([]);
    setShowManualSearch(false);
    setSelectedCandidateId(null);
    setSuggestionsLoading(false);
    setDialogError('');
  }, []);

  useEffect(() => {
    if (!matchDialogRow) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !matchingBusy) closeMatchDialog(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [matchDialogRow, matchingBusy, closeMatchDialog]);

  const openMatchDialog = useCallback(async (row: DATParseResultRow) => {
    setMatchDialogRow(row);
    setSearchQuery('');
    setSearchResults([]);
    setShowManualSearch(false);
    setSelectedCandidateId(null);
    setDialogError('');
    setSuggestionsLoading(true);
    try {
      const data = await uploadApi.suggestStudents(exam.id, row.id);
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestions([]);
    }
    setSuggestionsLoading(false);
  }, [exam.id]);

  const handleSearchStudents = useCallback(async (q: string, answerId?: number) => {
    setSearchQuery(q);
    const seq = ++searchSeq.current;
    if (q.trim().length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    try {
      const data = await uploadApi.searchStudents(exam.id, q, answerId);
      if (seq === searchSeq.current) setSearchResults(data.filter(stu => stu.selectable !== false));
    } catch {
      if (seq === searchSeq.current) setSearchResults([]);
    }
    if (seq === searchSeq.current) setSearching(false);
  }, [exam.id]);

  const handleMatchStudent = async (answerId: number, studentId: number | null) => {
    setMatchingBusy(true);
    setDialogError('');
    try {
      const resp = await uploadApi.updateStudentMatch(exam.id, answerId, studentId);
      const refreshed = await refreshResults();
      if (!refreshed) {
        setResults(prev => prev.map(r => (r.id !== answerId ? r : {
          ...r,
          matched_student_id: resp.matched_student_id,
          matched_student_name: resp.matched_student_name,
          match_score: resp.match_score ?? (resp.matched_student_id ? 1.0 : 0),
          match_method: resp.match_method ?? (resp.matched_student_id ? 'manual' : ''),
          match_status: resp.matched_student_id ? (resp.match_method === 'manual' ? 'manual' : 'matched') : 'pending',
          top_suggestion: null,
        })));
      }
      fetchSessions();
      onExamChange?.();
      closeMatchDialog();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Eşleştirme yapılamadı.';
      if (matchDialogRow) setDialogError(msg); else setError(msg);
    } finally {
      setMatchingBusy(false);
    }
  };

  const handleUnmatch = async (row: DATParseResultRow) => {
    if (!confirm(`"${row.matched_student_name}" eşleşmesi kaldırılsın mı?`)) return;
    await handleMatchStudent(row.id, null);
  };

  const handleDeleteResultRow = async (row: DATParseResultRow) => {
    const label = row.student_name || row.student_id || 'bu kayıt';
    if (!confirm(`"${label}" optik kaydı silinsin mi?\nKurumdaki öğrenci kaydı silinmez.`)) return;
    setMatchingBusy(true);
    try {
      await uploadApi.deleteResultRow(exam.id, row.id);
      setResults(prev => prev.filter(r => r.id !== row.id));
      setTotalRows(n => Math.max(0, n - 1));
      if (matchDialogRow?.id === row.id) closeMatchDialog();
      fetchSessions();
      onExamChange?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kayıt silinemedi.');
    } finally {
      setMatchingBusy(false);
    }
  };

  const handleBookletChange = useCallback(async (answerId: number, newBooklet: string) => {
    if (!newBooklet) return;
    try {
      const updated = await uploadApi.updateStudentBooklet(exam.id, answerId, newBooklet);
      setResults(prev => prev.map(r => (r.id !== answerId ? r : {
        ...r,
        booklet: updated.booklet,
        booklet_auto_detected: updated.booklet_auto_detected,
        total_correct: Number(updated.total_correct),
        total_wrong: Number(updated.total_wrong),
        total_empty: Number(updated.total_empty),
        total_net: Number(updated.total_net),
        section_nets: Object.fromEntries(
          (updated.section_scores || []).map((ss: { section_name: string; net: number }) => [ss.section_name, Number(ss.net)]),
        ),
      })));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kitapçık değiştirilemedi.');
    }
  }, [exam.id]);

  /* ── Sıfırla ────────────────────────────────────────────────────────────── */
  const resetAll = () => {
    setStep('upload');
    setUploadResp(null);
    setLines([]);
    setMappings([]);
    setResults([]);
    setError('');
    setSelStart(null);
    setSelEnd(null);
    setCtxMenu(null);
    closeMatchDialog();
    setResultFilter('all');
    setResultsSessionId(null);
  };

  const switchSource = (mode: 'dat' | 'omr') => {
    setSourceMode(mode);
    setError('');
    // Tarama onayı yeni bir yükleme oluşturur; listeye dönünce görünsün.
    if (mode === 'dat') fetchSessions();
  };

  /* ── Türetilmiş değerler ────────────────────────────────────────────────── */
  const selLo = selStart !== null && selEnd !== null ? Math.min(selStart, selEnd) : null;
  const selHi = selStart !== null && selEnd !== null ? Math.max(selStart, selEnd) : null;
  const selCount = selLo !== null && selHi !== null ? Math.max(selHi - selLo, 1) : 0;

  const maxLen = lines.reduce((mx, l) => Math.max(mx, l.length), 0);
  const rulerChars = Array.from({ length: Math.min(maxLen, 4000) }, (_, i) => i);

  const nets = results.map(r => Number(r.total_net));
  const avgNet = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0;
  const maxNet = nets.length ? Math.max(...nets) : 0;
  const minNet = nets.length ? Math.min(...nets) : 0;

  const sectionNames = useMemo(() => {
    if (results.length === 0) return [];
    const resultKeys = new Set(Object.keys(results[0].section_nets || {}));
    if (resultKeys.size === 0) return [];
    const allSecs = exam.sections || [];
    const mainSecs = allSecs.filter(sec => !sec.is_sub_section).sort((a, b) => a.order - b.order);
    const subSecs = allSecs.filter(sec => sec.is_sub_section).sort((a, b) => a.order - b.order);
    const ordered: string[] = [];
    for (const main of mainSecs) {
      const children = subSecs.filter(sub => sub.parent_section === main.id);
      if (children.length > 0) {
        for (const child of children) if (resultKeys.has(child.name)) ordered.push(child.name);
      } else if (resultKeys.has(main.name)) {
        ordered.push(main.name);
      }
    }
    for (const key of resultKeys) if (!ordered.includes(key)) ordered.push(key);
    return ordered;
  }, [results, exam.sections]);

  const [sortKey, setSortKey] = useState<string>('row');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // setSortDir'i setSortKey updater'ı içinden çağırmak çift çalışmada toggle'ı katlıyordu.
  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'student_name' ? 'asc' : 'desc');
    }
  }, [sortKey]);

  const sortedResults = useMemo(() => {
    const arr = [...results];
    arr.sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      if (sortKey === 'student_name') { va = (a.student_name || '').toLocaleLowerCase('tr'); vb = (b.student_name || '').toLocaleLowerCase('tr'); }
      else if (sortKey === 'total_net') { va = Number(a.total_net); vb = Number(b.total_net); }
      else if (sortKey === 'total_correct') { va = a.total_correct; vb = b.total_correct; }
      else if (sortKey === 'total_wrong') { va = a.total_wrong; vb = b.total_wrong; }
      else if (sortKey === 'total_empty') { va = a.total_empty; vb = b.total_empty; }
      else if (sortKey.startsWith('sec:')) {
        const sn = sortKey.slice(4);
        va = a.section_nets[sn] != null ? Number(a.section_nets[sn]) : -999;
        vb = b.section_nets[sn] != null ? Number(b.section_nets[sn]) : -999;
      } else { va = a.row; vb = b.row; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [results, sortKey, sortDir]);

  const thProps = { activeKey: sortKey, direction: sortDir, onSort: handleSort };

  const matchedCount = results.filter(r => r.matched_student_id).length;
  const unmatchedCount = results.length - matchedCount;
  const pendingCount = results.filter(r => rowMatchStatus(r) === 'pending').length;
  const matchPct = results.length ? Math.round((matchedCount / results.length) * 100) : 0;

  const visibleResults = useMemo(() => sortedResults.filter(r =>
    resultFilter === 'all'
    || (resultFilter === 'unmatched' ? !r.matched_student_id : rowMatchStatus(r) === 'pending'),
  ), [sortedResults, resultFilter]);

  useEffect(() => {
    if (resultFilter === 'pending' && pendingCount === 0) setResultFilter(unmatchedCount ? 'unmatched' : 'all');
    else if (resultFilter === 'unmatched' && unmatchedCount === 0) setResultFilter('all');
  }, [resultFilter, pendingCount, unmatchedCount]);

  const getColorIndex = (field: string): number => {
    const opt = allFieldOptions.find(o => o.field === field);
    return opt ? opt.color % COLOR_PALETTE.length : 0;
  };

  const currentStepIdx = STEPS.findIndex(st => st.key === step);
  const doneSessions = sessions.filter(ses => ses.status === 'COMPLETED');

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  RENDER                                                                */
  /* ═══════════════════════════════════════════════════════════════════════ */

  return (
    <div className={u.page}>
      <div className={u.topBar}>
        <div className={u.seg} role="tablist" aria-label="Sonuç kaynağı">
          <button type="button" role="tab" aria-selected={sourceMode === 'dat'} className={sourceMode === 'dat' ? u.segOn : u.segBtn} onClick={() => switchSource('dat')}>
            Optik okuyucu dosyası
          </button>
          <button type="button" role="tab" aria-selected={sourceMode === 'omr'} className={sourceMode === 'omr' ? u.segOn : u.segBtn} onClick={() => switchSource('omr')}>
            Tarama (PDF / görsel)
          </button>
        </div>
        {sourceMode === 'dat' && (
          <ol className={u.steps} aria-label="Adımlar">
            {STEPS.map((st, i) => (
              <li key={st.key} className={i === currentStepIdx ? u.stepOn : i < currentStepIdx ? u.stepDone : u.step}>
                <b>{i < currentStepIdx ? '✓' : i + 1}</b>{st.label}
              </li>
            ))}
          </ol>
        )}
      </div>

      {sourceMode === 'omr' ? <OmrUploadPanel examId={exam.id} onConfirmed={() => { fetchSessions(); onExamChange?.(); }} /> : (
      <>
      {error && (
        <div className={u.alertErr} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Kapat">×</button>
        </div>
      )}
      {notice && (
        <div className={u.alertOk} role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Kapat">×</button>
        </div>
      )}

      {/* ═══════ 1: DOSYA ═══════ */}
      {step === 'upload' && (
        <>
          {!hasAnswerKey && (
            <div className={u.alertWarn}>
              <span>Bu sınavda kayıtlı cevap anahtarı yok. Dosyayı yükleyip alanları hazırlayabilirsiniz ama okuma için önce Cevap Anahtarı sekmesinden anahtarı kaydedin.</span>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".dat,.txt,.csv" hidden onChange={onFileInput} />
          <button
            type="button"
            className={dragOver ? u.dropOn : u.drop}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            disabled={uploading}
          >
            <Icon name={uploading ? 'refresh' : 'upload'} size={22} className={uploading ? s.olcmeSpinning : undefined} />
            <b>{uploading ? 'Dosya yükleniyor…' : 'Dosyayı sürükleyin veya seçin'}</b>
            <span>Optik okuyucu çıktısı: .dat, .txt veya .csv</span>
          </button>

          <section className={u.panel}>
            <header className={u.panelHead}>
              <h3>Önceki yüklemeler</h3>
              {doneSessions.length > 0 && (
                <span>{doneSessions.reduce((n, ses) => n + ses.total_rows, 0)} kayıt · {doneSessions.length} dosya</span>
              )}
            </header>
            {loadingSessions && sessions.length === 0 ? (
              <p className={u.muted}>Yükleniyor…</p>
            ) : sessions.length === 0 ? (
              <p className={u.muted}>Bu sınava henüz sonuç yüklenmedi.</p>
            ) : sessions.map(ses => {
              const openable = ses.status === 'COMPLETED';
              const tone = ses.status === 'COMPLETED' ? u.pillOk : ses.status === 'ERROR' ? u.pillErr : u.pillWait;
              return (
                <div key={ses.id} className={u.sessionRow}>
                  <button
                    type="button"
                    className={u.sessionMain}
                    disabled={!openable || openingSessionId !== null}
                    onClick={() => handleLoadSessionResults(ses.id)}
                    title={openable ? 'Sonuçları aç' : 'Bu yükleme okunmadığı için açılamaz'}
                  >
                    <b>{ses.source_type === 'OMR' ? 'Tarama · ' : ''}{ses.original_filename}</b>
                    <span>
                      {openable ? <>{ses.total_rows} kayıt · {ses.matched_count} eşleşti</> : 'Okunmadı'}
                      {openable && ses.unmatched_count > 0 && <em className={u.warnText}> · {ses.unmatched_count} eşleşmedi</em>}
                      {' · '}
                      {new Date(ses.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                  <span className={tone}>{openingSessionId === ses.id ? 'Açılıyor…' : ses.status_display || ses.status}</span>
                  <button type="button" className={u.iconBtn} onClick={() => handleDeleteSession(ses)} aria-label={`${ses.original_filename} yüklemesini sil`} title="Sil">
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              );
            })}
          </section>
        </>
      )}

      {/* ═══════ 2: ALANLAR ═══════ */}
      {step === 'mapping' && uploadResp && (
        <>
          <section className={u.bar}>
            <div className={u.barMain}>
              <b>{uploadResp.filename}</b>
              <span>{uploadResp.total_lines} satır{uploadResp.preview_truncated ? ` · ilk ${lines.length} satır gösteriliyor` : ''}</span>
            </div>
            <button type="button" className={u.btnGhost} onClick={resetAll}>Başka dosya</button>
            <button
              type="button"
              className={u.btnPrimary}
              disabled={parsing || !hasAnswerMapping}
              onClick={handleParse}
              title={!hasAnswerMapping ? 'Önce en az bir ders cevap alanı eşleştirin.' : undefined}
            >
              {parsing ? 'Okunuyor…' : 'Oku ve puanla'}
            </button>
          </section>

          <div className={u.mapGrid}>
            <section className={u.panel}>
              <header className={u.panelHead}>
                <h3>Alanlar</h3>
                <span>{mappings.length}/{allFieldOptions.length}</span>
              </header>
              <p className={u.help}>
                {selCount > 0
                  ? <>Seçili aralık <b>[{selLo}–{selHi! + 1})</b> · {selCount} karakter. Hangi alan olduğunu aşağıdan seçin.</>
                  : 'Önizlemede sütun aralığını sürükleyerek seçin, sonra aşağıdan alanı seçin.'}
              </p>
              <div className={u.fieldList}>
                {allFieldOptions.map((opt, i) => {
                  const m = mappings.find(x => x.field === opt.field);
                  const issue = widthIssues.find(w => w.field === opt.field);
                  const prevParent = allFieldOptions[i - 1]?.parentLabel;
                  return (
                    <div key={opt.field}>
                      {opt.group === 'ders' && (i === BASE_FIELDS.length || (opt.parentLabel && opt.parentLabel !== prevParent)) && (
                        <p className={u.fieldGroup}>{opt.parentLabel ?? 'Ders cevapları'}</p>
                      )}
                      <div className={m ? (issue ? u.fieldWarn : u.fieldOk) : u.field}>
                        <span className={u.dot} style={{ background: COLOR_PALETTE[opt.color % COLOR_PALETTE.length] }} />
                        <button
                          type="button"
                          className={u.fieldName}
                          disabled={selCount === 0}
                          onClick={() => assignField(opt.field)}
                          title={selCount ? `Seçili aralığı ${opt.label} olarak ata` : 'Önce önizlemede aralık seçin'}
                        >
                          {opt.label}
                          {opt.group === 'ders' && <small>{opt.width} soru</small>}
                        </button>
                        {m ? (
                          <>
                            <span className={u.range}>
                              [{m.start}–{m.end})
                              {issue && <em> {issue.got}/{issue.want}</em>}
                            </span>
                            <button type="button" className={u.x} onClick={() => removeMapping(opt.field)} aria-label={`${opt.label} eşleştirmesini kaldır`}>×</button>
                          </>
                        ) : (
                          <span className={u.rangeEmpty}>{selCount ? 'Ata' : '—'}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={u.options}>
                <label className={u.check}>
                  <input type="checkbox" checked={firstLineHeader} onChange={(e) => setFirstLineHeader(e.target.checked)} />
                  İlk satır başlık
                </label>
                <label className={u.inline}>
                  Kimlik sütunu
                  <select value={studentIdField} onChange={(e) => setStudentIdField(e.target.value)}>
                    <option value="ogrenci_no">Öğrenci no</option>
                    <option value="tc_kimlik">TC kimlik</option>
                  </select>
                </label>
              </div>

              <div className={u.templates}>
                <p className={u.fieldGroup}>Şablonlar</p>
                <div className={u.chips}>
                  {templates.length === 0 && <span className={u.muted}>Kayıtlı şablon yok.</span>}
                  {templates.map(tpl => (
                    <span key={tpl.id} className={u.chip}>
                      <button type="button" onClick={() => handleLoadTemplate(tpl)} title={`${tpl.mappings.length} alan`}>{tpl.name}</button>
                      <button type="button" className={u.chipX} onClick={() => handleDeleteTemplate(tpl)} aria-label={`${tpl.name} şablonunu sil`}>×</button>
                    </span>
                  ))}
                </div>
                {showSaveDialog ? (
                  <div className={u.saveRow}>
                    <input
                      type="text"
                      placeholder="Şablon adı"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTemplate(); if (e.key === 'Escape') setShowSaveDialog(false); }}
                      autoFocus
                    />
                    <button type="button" className={u.btnPrimary} onClick={handleSaveTemplate} disabled={!templateName.trim() || savingTemplate}>
                      {savingTemplate ? '…' : 'Kaydet'}
                    </button>
                    <button type="button" className={u.btnGhost} onClick={() => { setShowSaveDialog(false); setTemplateName(''); }}>Vazgeç</button>
                  </div>
                ) : mappings.length > 0 && (
                  <button type="button" className={u.linkBtn} onClick={() => setShowSaveDialog(true)}>Bu eşleştirmeyi şablon olarak kaydet</button>
                )}
              </div>
            </section>

            <section className={`${u.panel} ${u.previewPanel}`}>
              <header className={u.panelHead}>
                <h3>Önizleme</h3>
                <div className={u.rangeInputs}>
                  <label>
                    Başlangıç
                    <input
                      type="number"
                      min={0}
                      value={selLo ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? null : Number(e.target.value);
                        setSelStart(v);
                        if (selEnd === null && v !== null) setSelEnd(v);
                      }}
                    />
                  </label>
                  <label>
                    Bitiş
                    <input
                      type="number"
                      min={0}
                      value={selHi !== null ? selHi + 1 : ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? null : Number(e.target.value) - 1;
                        setSelEnd(v);
                        if (selStart === null && v !== null) setSelStart(Math.max(v, 0));
                      }}
                    />
                  </label>
                </div>
              </header>
              <div className={s.datPreviewContainer}>
                <div
                  ref={gridRef}
                  className={s.datGridWrap}
                  onMouseDown={onGridMouseDown}
                  onMouseMove={onGridMouseMove}
                  onMouseUp={onGridMouseUp}
                  onPointerDown={onGridPointerDown}
                  onPointerMove={onGridMouseMove}
                  onPointerUp={onGridMouseUp}
                  onContextMenu={onGridContextMenu}
                >
                  <div className={s.datGrid}>
                    <span className={`${s.datGridLine} ${s.datRulerLine}`}>
                      <span className={s.datGridLineNum} style={{ visibility: 'hidden' }}>0</span>
                      <span className={s.datRulerContent} data-ruler>
                        {rulerChars.map(i => (
                          <span key={i} className={s.datRulerChar}>{i % 10 === 0 ? i : (i % 5 === 0 ? '·' : '')}</span>
                        ))}
                      </span>
                    </span>
                    {lines.map((line, idx) => (
                      <span key={idx} className={s.datGridLine}>
                        <span className={s.datGridLineNum}>{idx + 1}</span>
                        <span className={s.datLineText} data-text-line>{line}</span>
                      </span>
                    ))}
                    <OverlayLayer
                      gridRef={gridRef}
                      mappings={mappings}
                      selLo={selLo}
                      selHi={selHi}
                      getColorIndex={getColorIndex}
                      linesCount={lines.length}
                    />
                  </div>
                </div>
                {hScroll.max > 1 && (
                  <input
                    type="range"
                    className={s.datHScroll}
                    min={0}
                    max={hScroll.max}
                    value={Math.min(hScroll.left, hScroll.max)}
                    onChange={(e) => {
                      const left = Number(e.target.value);
                      if (gridRef.current) gridRef.current.scrollLeft = left;
                      setHScroll(prev => ({ ...prev, left }));
                    }}
                    aria-label="Satırı sağa sola kaydır"
                  />
                )}
              </div>
              {(widthIssues.length > 0 || !hasIdentityMapping || (hasAnswerMapping && unmappedSections.length > 0)) && (
                <ul className={u.issues}>
                  {widthIssues.map(w => (
                    <li key={w.field}>
                      <b>{w.label}</b>: {w.got} karakter seçildi, {w.want} olmalı.
                      {w.got < w.want ? ' Son sorular boş sayılır.' : ' Fazla karakterler okunmaz.'}
                    </li>
                  ))}
                  {!hasIdentityMapping && <li>Kimlik alanı (öğrenci no, TC veya ad soyad) yok: kayıtlar öğrenciyle eşleşmez.</li>}
                  {hasAnswerMapping && unmappedSections.length > 0 && (
                    <li>Eşleştirilmeyen dersler boş sayılır: {unmappedSections.map(o => o.label).join(', ')}.</li>
                  )}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {/* ═══════ 3: SONUÇLAR ═══════ */}
      {step === 'results' && (
        <>
          <section className={u.bar}>
            <div className={u.summary}>
              <p className={u.count}>
                <b>{matchedCount}</b>/{results.length} öğrenci eşleşti
                <span>
                  {results.length > 0
                    ? `Ortalama net ${fmtNet(avgNet)} · en yüksek ${fmtNet(maxNet)} · en düşük ${fmtNet(minNet)}`
                    : 'Kayıt kalmadı'}
                  {totalRows > results.length ? ` · ${totalRows} satır okundu` : ''}
                </span>
              </p>
              <div className={u.meter} aria-hidden><i style={{ width: `${matchPct}%` }} /></div>
            </div>
            <div className={u.barActions}>
              {unmatchedCount > 0 && (
                <button type="button" className={u.btnPrimary} onClick={handleRematch} disabled={rematching}
                  title="Sonradan kayıt olan öğrenciler için eşleştirmeyi tekrar dener (sınavın tüm yüklemeleri)">
                  {rematching ? 'Eşleştiriliyor…' : 'Yeniden eşleştir'}
                </button>
              )}
              {uploadResp && uploadResp.session_id === resultsSessionId && (
                <button type="button" className={u.btnGhost} onClick={() => setStep('mapping')}>Alanlara dön</button>
              )}
              <button type="button" className={u.btnGhost} onClick={resetAll}>Yüklemeler</button>
            </div>
          </section>

          {unmatchedCount > 0 && (
            <p className={u.hint}>Eşleşmeyen kayıtlar sıralamada ham adıyla görünür; karne için öğrenciyle eşleşmeleri gerekir.</p>
          )}

          <section className={u.panel}>
            <div className={u.filters} role="group" aria-label="Süzgeç">
              <button type="button" className={resultFilter === 'all' ? u.filterOn : u.filter} onClick={() => setResultFilter('all')}>
                Tümü <b>{results.length}</b>
              </button>
              {unmatchedCount > 0 && (
                <button type="button" className={resultFilter === 'unmatched' ? u.filterOn : u.filter} onClick={() => setResultFilter('unmatched')}>
                  Eşleşmeyen <b>{unmatchedCount}</b>
                </button>
              )}
              {pendingCount > 0 && (
                <button type="button" className={resultFilter === 'pending' ? u.filterOn : u.filter} onClick={() => setResultFilter('pending')}>
                  Öneri var <b>{pendingCount}</b>
                </button>
              )}
            </div>

            {visibleResults.length === 0 ? (
              <p className={u.empty}>
                {results.length === 0 ? 'Bu yüklemede kayıt kalmadı.' : 'Bu süzgece uyan kayıt yok.'}
              </p>
            ) : (
              <div className={u.tableWrap}>
                <table className={u.table}>
                  <thead>
                    <tr>
                      <SortTh label="#" columnKey="row" {...thProps} />
                      <SortTh label="Optik kayıt" columnKey="student_name" {...thProps} />
                      <th>Öğrenci</th>
                      <th aria-label="İşlem" />
                      {bookletChoices.length > 0 && <th style={{ textAlign: 'center' }}>Kitapçık</th>}
                      <SortTh label="D" columnKey="total_correct" align="center" {...thProps} />
                      <SortTh label="Y" columnKey="total_wrong" align="center" {...thProps} />
                      <SortTh label="B" columnKey="total_empty" align="center" {...thProps} />
                      <SortTh label="Net" columnKey="total_net" align="center" {...thProps} />
                      {sectionNames.map(sn => (
                        <SortTh key={sn} label={sn} columnKey={`sec:${sn}`} align="center" {...thProps} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleResults.map(r => {
                      const status = rowMatchStatus(r);
                      const suggestion = r.top_suggestion;
                      const conf = r.matched_student_id
                        ? scoreToConfidence(r.match_score)
                        : suggestion?.confidence ?? (suggestion ? scoreToConfidence(suggestion.match_score) : null);
                      const pct = r.matched_student_id
                        ? displayScorePct(undefined, r.match_score)
                        : displayScorePct(suggestion?.score, suggestion?.match_score);
                      const net = Number(r.total_net);
                      return (
                        <tr key={r.id} className={r.matched_student_id ? undefined : u.rowOpen}>
                          <td className={u.dim}>{r.row}</td>
                          <td>
                            <div className={u.name}>{r.student_name || '—'}</div>
                            <div className={u.meta}>
                              {r.student_id ? `No ${r.student_id}` : ''}
                              {r.tc_kimlik ? `${r.student_id ? ' · ' : ''}TC ${r.tc_kimlik}` : ''}
                            </div>
                          </td>
                          <td>
                            {r.matched_student_id ? (
                              <>
                                <div className={u.nameOk}>{r.matched_student_name}</div>
                                <div className={u.meta}>{matchMethodLabel(r.match_method, r.match_score)}</div>
                              </>
                            ) : (
                              <>
                                <span className={status === 'pending' ? u.pillWait : u.pillErr}>{STATUS_LABEL[status]}</span>
                                {suggestion && (
                                  <div className={u.meta}>
                                    {suggestion.full_name}
                                    {pct != null && conf ? ` · %${pct} ${CONFIDENCE_LABEL[conf].toLocaleLowerCase('tr')}` : ''}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td>
                            <div className={u.rowActions}>
                              <button type="button" className={r.matched_student_id ? u.btnSmall : u.btnSmallPrimary} onClick={() => openMatchDialog(r)}>
                                {r.matched_student_id ? 'Değiştir' : 'Eşleştir'}
                              </button>
                              {r.matched_student_id && (
                                <button type="button" className={u.btnSmallDanger} onClick={() => handleUnmatch(r)} disabled={matchingBusy}>Kaldır</button>
                              )}
                              <button type="button" className={u.iconBtn} onClick={() => handleDeleteResultRow(r)} disabled={matchingBusy}
                                title="Optik kaydı sil (öğrenci kaydı silinmez)" aria-label="Optik kaydı sil">
                                <Icon name="trash" size={14} />
                              </button>
                            </div>
                          </td>
                          {bookletChoices.length > 0 && (
                            <td style={{ textAlign: 'center' }}>
                              <select
                                className={r.booklet_auto_detected ? u.bookletAuto : u.booklet}
                                value={r.booklet || ''}
                                onChange={e => handleBookletChange(r.id, e.target.value)}
                                title={r.booklet_auto_detected ? 'Netlere göre otomatik seçildi' : 'Kitapçık türü'}
                                aria-label="Kitapçık türü"
                              >
                                {!r.booklet && <option value="" disabled>—</option>}
                                {bookletChoices.map(b => <option key={b} value={b}>{b}</option>)}
                              </select>
                            </td>
                          )}
                          <td className={u.num}>{r.total_correct}</td>
                          <td className={u.num}>{r.total_wrong}</td>
                          <td className={`${u.num} ${u.dim}`}>{r.total_empty}</td>
                          <td className={u.num}><b className={net < 0 ? u.neg : undefined}>{fmtNet2(net)}</b></td>
                          {sectionNames.map(sn => (
                            <td key={sn} className={u.num}>
                              {r.section_nets[sn] != null ? fmtNet2(Number(r.section_nets[sn])) : '—'}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ═══════ ELLE EŞLEŞTİRME ═══════ */}
      {matchDialogRow && (
        <div className={u.modal} onClick={() => !matchingBusy && closeMatchDialog()}>
          <div className={u.sheet} role="dialog" aria-modal="true" aria-label="Öğrenci eşleştir" onClick={e => e.stopPropagation()}>
            <header className={u.sheetHead}>
              <h3>
                {matchDialogRow.student_name || 'Adsız kayıt'}
                <small>
                  Satır {matchDialogRow.row}
                  {matchDialogRow.student_id ? ` · No ${matchDialogRow.student_id}` : ''}
                  {matchDialogRow.tc_kimlik ? ` · TC ${matchDialogRow.tc_kimlik}` : ''}
                </small>
              </h3>
              <button type="button" className={u.x} onClick={closeMatchDialog} aria-label="Kapat">×</button>
            </header>
            <div className={u.sheetBody}>
              {matchDialogRow.matched_student_id && (
                <p className={u.current}>Şu an: <b>{matchDialogRow.matched_student_name}</b></p>
              )}
              {dialogError && <p className={u.errText}>{dialogError}</p>}
              <div className={u.seg}>
                <button type="button" className={!showManualSearch ? u.segOn : u.segBtn}
                  onClick={() => { setShowManualSearch(false); setSelectedCandidateId(null); }}>
                  Öneriler
                </button>
                <button type="button" className={showManualSearch ? u.segOn : u.segBtn}
                  onClick={() => { setShowManualSearch(true); setSelectedCandidateId(null); setSearchQuery(''); setSearchResults([]); }}>
                  Öğrenci ara
                </button>
              </div>
              {!showManualSearch ? (
                <div className={u.candidates}>
                  {suggestionsLoading && <p className={u.muted}>Adaylar hesaplanıyor…</p>}
                  {!suggestionsLoading && suggestions.length === 0 && (
                    <p className={u.muted}>Otomatik aday yok. &quot;Öğrenci ara&quot; ile elle bulun.</p>
                  )}
                  {suggestions.map(stu => (
                    <button key={stu.id} type="button"
                      className={selectedCandidateId === stu.id ? u.candOn : u.cand}
                      onClick={() => setSelectedCandidateId(stu.id)}>
                      <span>
                        <b>{stu.full_name}</b>
                        <small>
                          {[stu.okul_no && `No ${stu.okul_no}`, stu.sinif, stu.reason].filter(Boolean).join(' · ')}
                        </small>
                      </span>
                      <em>%{stu.score} · {(CONFIDENCE_LABEL[stu.confidence] ?? 'Düşük').toLocaleLowerCase('tr')}</em>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={u.candidates}>
                  <input
                    type="search"
                    className={u.search}
                    placeholder="Ad, soyad, öğrenci no veya TC"
                    value={searchQuery}
                    onChange={e => handleSearchStudents(e.target.value, matchDialogRow.id)}
                    autoFocus
                  />
                  {searching && <p className={u.muted}>Aranıyor…</p>}
                  {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                    <p className={u.muted}>Sonuç yok ya da adaylar başka kayıtla eşleşmiş.</p>
                  )}
                  {searchResults.map(stu => {
                    const pct = displayScorePct(stu.score);
                    return (
                      <button key={stu.id} type="button"
                        className={selectedCandidateId === stu.id ? u.candOn : u.cand}
                        onClick={() => setSelectedCandidateId(stu.id)}>
                        <span>
                          <b>{stu.full_name}</b>
                          <small>
                            {[stu.okul_no ? `No ${stu.okul_no}` : '', stu.sinif, stu.tc_kimlik_no ? `TC ${stu.tc_kimlik_no}` : '', stu.reason].filter(Boolean).join(' · ')}
                          </small>
                        </span>
                        {pct != null && <em>%{pct}</em>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <footer className={u.sheetFoot}>
              <button type="button" className={u.btnGhost} onClick={closeMatchDialog} disabled={matchingBusy}>Vazgeç</button>
              <button
                type="button"
                className={u.btnPrimary}
                disabled={!selectedCandidateId || matchingBusy}
                onClick={() => selectedCandidateId && handleMatchStudent(matchDialogRow.id, selectedCandidateId)}
              >
                {matchingBusy ? 'Kaydediliyor…' : 'Eşleştir'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ═══════ SAĞ TIK MENÜSÜ ═══════ */}
      {ctxMenu && (
        <div ref={ctxMenuRef} className={s.ctxMenu} style={{ left: ctxMenu.x, top: ctxMenu.y, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
          onClick={(e) => e.stopPropagation()}>
          <div className={s.ctxMenuTitle}>Alan seçin [{selLo}–{selHi! + 1}) · {selCount} karakter</div>
          {allFieldOptions.map((opt, i) => {
            const already = mappings.find(m => m.field === opt.field);
            const ci = opt.color % COLOR_PALETTE.length;
            const showGroup = opt.group === 'ders' && (i === BASE_FIELDS.length || (opt.parentLabel && opt.parentLabel !== allFieldOptions[i - 1]?.parentLabel));
            return (
              <span key={opt.field}>
                {i === 0 && <div className={s.ctxMenuGroupLabel}>Genel</div>}
                {showGroup && <div className={s.ctxMenuGroupLabel}>{opt.parentLabel ?? 'Ders cevapları'}</div>}
                <button
                  type="button"
                  className={`${s.ctxMenuItem} ${already ? s.ctxMenuItemDisabled : ''}`}
                  onClick={() => !already && assignField(opt.field)}
                  disabled={!!already}
                >
                  <span className={s.ctxMenuDot} style={{ background: already ? '#c0c8d0' : COLOR_PALETTE[ci] }} />
                  <span style={{ flex: 1 }}>
                    {opt.label}
                    {opt.group === 'ders' && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>({opt.width} soru)</span>}
                  </span>
                  {already && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>[{already.start}–{already.end})</span>}
                </button>
              </span>
            );
          })}
          <div className={s.ctxMenuSep} />
          <button type="button" className={s.ctxMenuItem} onClick={() => setCtxMenu(null)} style={{ color: 'var(--text-secondary)' }}>
            Vazgeç
          </button>
        </div>
      )}
      </>
      )}
    </div>
  );
}
