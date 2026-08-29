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
import type { IconName } from '../../../../components/olcme/ui/Icon';
import s from '../olcme.module.css';

/* ── Renkler ──────────────────────────────────────────────────────────────── */

const COLOR_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#14b8a6', '#e11d48',
];

type Step = 'upload' | 'mapping' | 'results';

/** Sihirbaz adımları — kullanıcının nerede olduğunu ve ne kaldığını gösterir. */
const STEPS: { key: Step; label: string; icon: IconName }[] = [
  { key: 'upload',  label: 'Dosya Yükle',     icon: 'upload'    },
  { key: 'mapping', label: 'Alan Eşleştir',   icon: 'layers'    },
  { key: 'results', label: 'Sonuçları Onayla', icon: 'checkCircle' },
];

/**
 * Eşleşmenin hangi yolla kurulduğunu okunur biçimde anlatır.
 * Önceki sürümde bu bilgi emoji kısaltmalarla veriliyordu ve ne anlama
 * geldiği ekrandan anlaşılmıyordu.
 */
const matchMethodLabel = (method: string, score: number): string => {
  switch (method) {
    case 'tc':         return 'TC kimlik tam eşleşmesi';
    case 'id':         return 'Öğrenci numarası tam eşleşmesi';
    case 'name_exact': return 'Tam ad + soyad eşleşmesi';
    case 'name':       return `İsim benzerliği %${Math.round(score * 100)}`;
    case 'manual':     return 'Manuel eşleştirildi';
    default:           return '';
  }
};

type MatchStatus = NonNullable<DATParseResultRow['match_status']>;

const STATUS_META: Record<MatchStatus, { label: string; cls: string }> = {
  matched:   { label: 'Eşleşti',            cls: s.matchStatusMatched },
  manual:    { label: 'Manuel eşleştirildi', cls: s.matchStatusManual },
  pending:   { label: 'Eşleşme bekliyor',    cls: s.matchStatusPending },
  conflict:  { label: 'Çakışma',             cls: s.matchStatusConflict },
  not_found: { label: 'Eşleşme bulunamadı',  cls: s.matchStatusNone },
};

const CONFIDENCE_META = {
  high:   { label: 'Yüksek', cls: s.matchConfHigh },
  medium: { label: 'Orta',   cls: s.matchConfMid },
  low:    { label: 'Düşük',  cls: s.matchConfLow },
} as const;

function rowMatchStatus(row: DATParseResultRow): MatchStatus {
  if (row.match_status) return row.match_status;
  if (row.matched_student_id) return row.match_method === 'manual' ? 'manual' : 'matched';
  if (row.top_suggestion) return 'pending';
  return 'not_found';
}

function scoreToConfidence(score01: number): keyof typeof CONFIDENCE_META {
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

  /** DOM'dan text span ölçümlerini al */
  const remeasure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const textSpan = grid.querySelector('[data-text-line]') as HTMLElement | null;
    if (!textSpan) return;
    const datGridEl = grid.querySelector(`.${s.datGrid}`) as HTMLElement || grid;
    const gridRect = datGridEl.getBoundingClientRect();
    const spanRect = textSpan.getBoundingClientRect();
    const len = textSpan.textContent?.length || 1;
    const chW = spanRect.width / len;
    if (chW <= 0) return;
    // offsetPx = metin span'ının sol kenarının, datGrid'in sol kenarına göre piksel uzaklığı
    const offsetPx = spanRect.left - gridRect.left;
    // Ruler satırının yüksekliğini ölç (overlay'lar ruler'ın altından başlamalı)
    const rulerLine = datGridEl.querySelector(`.${s.datRulerLine}`) as HTMLElement | null;
    const rulerH = rulerLine ? rulerLine.getBoundingClientRect().height : 0;
    setMetrics({ offsetPx, chPx: chW, rulerH });
  }, [gridRef]);

  // İlk render ve her satır/mapping değişiminde ölçüm yap
  useLayoutEffect(() => {
    remeasure();
  }, [remeasure, linesCount, mappings.length]);

  // Pencere boyutu değişince yeniden ölç
  useEffect(() => {
    const handler = () => remeasure();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [remeasure]);

  if (!metrics) return null;
  const { offsetPx, chPx, rulerH } = metrics;

  return (
    <>
      {/* Eşleştirilmiş alan overlay'ları */}
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

      {/* Aktif seçim overlay'ı (tek karakter de dahil) */}
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
/*  Genel alan seçenekleri (sabit)                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface FieldOption {
  field: string;
  label: string;
  color: number;
  group: 'genel' | 'ders';
  parentLabel?: string;  // Alt bölümler için üst bölüm adı
  isSubSection?: boolean;
}

const BASE_FIELDS: FieldOption[] = [
  { field: 'ogrenci_no',    label: 'Öğrenci No',    color: 0, group: 'genel' },
  { field: 'tc_kimlik',     label: 'TC Kimlik',     color: 1, group: 'genel' },
  { field: 'ad_soyad',      label: 'Ad Soyad',      color: 2, group: 'genel' },
  { field: 'kitapcik_turu', label: 'Kitapçık Türü', color: 3, group: 'genel' },
];

/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Sıralanabilir sütun başlığı.
 *
 * Bileşen bilerek dosya seviyesinde tanımlı: render fonksiyonunun içinde
 * tanımlansaydı her render'da yeni bir bileşen tipi oluşur ve React tüm tablo
 * başlığını söküp yeniden kurardı.
 */
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
      className={s.sortableTh}
      onClick={() => onSort(columnKey)}
      style={{ textAlign: align, whiteSpace: 'nowrap' }}
      title={`${label} sütununa göre sırala`}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <Icon
          name={active && direction === 'asc' ? 'chevronUp' : 'chevronDown'}
          size={11}
          strokeWidth={3}
          style={{ opacity: active ? 1 : 0.25 }}
        />
      </span>
    </th>
  );
}

interface Props { exam: ExamDetail }

export default function UploadTab({ exam }: Props) {
  /* ── State ──────────────────────────────────────────────────────────────── */
  const [step, setStep]                 = useState<Step>('upload');
  const [uploading, setUploading]       = useState(false);
  const [parsing, setParsing]           = useState(false);
  const [error, setError]               = useState('');

  // Upload
  const [uploadResp, setUploadResp]     = useState<DATUploadResponse | null>(null);
  const [lines, setLines]               = useState<string[]>([]);
  const [firstLineHeader, setFirstLineHeader] = useState(false);
  const [studentIdField, setStudentIdField]   = useState<string>('ogrenci_no');

  // Column selection
  const [mappings, setMappings]         = useState<FieldMapping[]>([]);
  const [selStart, setSelStart]         = useState<number | null>(null);
  const [selEnd, setSelEnd]             = useState<number | null>(null);
  const [, setIsDragging]               = useState(false);

  // Context menu
  const [ctxMenu, setCtxMenu]           = useState<{ x: number; y: number } | null>(null);

  // Results
  const [results, setResults]           = useState<DATParseResultRow[]>([]);
  const [totalRows, setTotalRows]       = useState(0);
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [resultsSessionId, setResultsSessionId] = useState<number | null>(null);

  // Previous sessions
  const [sessions, setSessions]         = useState<DATSessionItem[]>([]);
  const [, setLoadingSessions]          = useState(false);
  const [loadingSessionResults, setLoadingSessionResults] = useState(false);

  // Manuel eşleştirme dialog
  const [matchDialogRow, setMatchDialogRow] = useState<DATParseResultRow | null>(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching]       = useState(false);
  const [suggestions, setSuggestions]   = useState<MatchSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [matchingBusy, setMatchingBusy] = useState(false);

  // Yeniden eşleştirme
  const [rematching, setRematching]     = useState(false);
  const [rematchResult, setRematchResult] = useState<{ newly_matched: number; still_unmatched: number } | null>(null);

  // Drag & drop
  const [dragOver, setDragOver]         = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const gridRef                         = useRef<HTMLDivElement>(null);
  const ctxMenuRef                      = useRef<HTMLDivElement>(null);

  // ── Eşleştirme Şablonları ──────────────────────────────────────────────
  const [templates, setTemplates]       = useState<MappingTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showSaveDialog, setShowSaveDialog]     = useState(false);
  const [templateName, setTemplateName]         = useState('');
  const [savingTemplate, setSavingTemplate]     = useState(false);

  /* ── Sınav bölümlerinden ders seçenekleri oluştur ───────────────────────── */
  const sectionFieldOptions: FieldOption[] = useMemo(() => {
    const allSections = exam.sections || [];
    const mainSections = allSections
      .filter(sec => !sec.is_sub_section)
      .sort((a, b) => a.order - b.order);
    const subSections = allSections
      .filter(sec => sec.is_sub_section)
      .sort((a, b) => a.order - b.order);

    const options: FieldOption[] = [];
    let colorIdx = BASE_FIELDS.length;

    for (const main of mainSections) {
      // Alt bölümleri bu ana bölümün altında bul
      const children = subSections.filter(sec => sec.parent_section === main.id);

      if (children.length > 0) {
        // Alt bölümler varsa — sadece alt bölümleri göster (ana bölüm grup başlığı olacak)
        for (const child of children) {
          options.push({
            field: `ders_${child.id}`,
            label: child.name,
            color: colorIdx++,
            group: 'ders' as const,
            parentLabel: main.name,
            isSubSection: true,
          });
        }
      } else {
        // Alt bölüm yoksa ana bölümü doğrudan göster
        options.push({
          field: `ders_${main.id}`,
          label: main.name,
          color: colorIdx++,
          group: 'ders' as const,
        });
      }
    }

    return options;
  }, [exam.sections]);

  /** Tüm alan seçenekleri (genel + ders bazlı) */
  const allFieldOptions: FieldOption[] = useMemo(() => {
    return [...BASE_FIELDS, ...sectionFieldOptions];
  }, [sectionFieldOptions]);

  /** Cevap eşleştirmesi var mı kontrolü */
  const hasAnswerMapping = useMemo(() => {
    return mappings.some(m => m.field === 'cevaplar' || m.field.startsWith('ders_'));
  }, [mappings]);

  /** Kimlik alanı eşleştirilmiş mi — eşleşme kalitesini doğrudan etkiler. */
  const hasIdentityMapping = useMemo(
    () => mappings.some(m => ['ogrenci_no', 'tc_kimlik', 'ad_soyad'].includes(m.field)),
    [mappings],
  );

  /* ── Helpers ────────────────────────────────────────────────────────────── */

  /**
   * Karakter genişliği ve metin başlangıcı ölçümü.
   *
   * Strateji: Grid'deki her satırın metin span'ına `data-text-line` attribute
   * veriyoruz. Bu span'ın getBoundingClientRect().left değeri metnin gerçek
   * piksel başlangıcını verir. Karakter genişliği de span.width / textLength
   * ile tam doğru hesaplanır (monospace font garantisi).
   *
   * Bu yaklaşım CSS ch birimi, padding/margin hesabı gibi dolaylı yöntemlere
   * bağımlılığı tamamen ortadan kaldırır.
   */
  const chWidthRef = useRef<number>(0);

  /**
   * Mouse event'inden karakter pozisyonu hesaplar.
   *
   * Tıklanan satırdaki metin span'ının sol kenarını referans alır.
   * Her satırda aynı layout olduğu için herhangi bir satırın metin
   * span'ından ölçüm almak yeterlidir.
   */
  const charPosFromEvent = useCallback((e: React.MouseEvent): number | null => {
    const grid = gridRef.current;
    if (!grid) return null;

    // Tıklanan satırdaki veya herhangi bir satırdaki metin span'ını bul
    const target = e.target as HTMLElement;
    const line = target.closest(`.${s.datGridLine}`) as HTMLElement | null;

    let textSpan: HTMLElement | null = null;
    if (line) {
      textSpan = line.querySelector('[data-text-line]') as HTMLElement | null;
    }
    // Fallback: ilk metin span'ını kullan (overlay veya grid boşluğuna tıklanmışsa)
    if (!textSpan) {
      textSpan = grid.querySelector('[data-text-line]') as HTMLElement | null;
    }
    if (!textSpan) return null;

    const spanRect = textSpan.getBoundingClientRect();
    const len = textSpan.textContent?.length || 1;
    const chW = spanRect.width / len;
    if (chW <= 0) return null;
    chWidthRef.current = chW;

    const relX = e.clientX - spanRect.left;
    const pos = Math.floor(relX / chW);
    return Math.max(0, pos);
  }, []);

  /* ── Fetch Previous Sessions ────────────────────────────────────────────── */
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await uploadApi.listSessions(exam.id);
      setSessions(data);
    } catch { /* */ }
    setLoadingSessions(false);
  }, [exam.id]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  /* ── Fetch Templates ────────────────────────────────────────────────────── */
  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const data = await mappingTemplateApi.list(exam.exam_type);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[UploadTab] fetchTemplates error:', err);
    }
    setLoadingTemplates(false);
  }, [exam.exam_type]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  /* ── File Upload ────────────────────────────────────────────────────────── */
  const handleFile = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const resp = await uploadApi.upload(exam.id, file);
      setUploadResp(resp);
      setLines(resp.preview_lines);
      chWidthRef.current = 0; // reset cache for new file
      setStep('mapping');
      setMappings([]);
      setResults([]);
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

  /* ── Column Selection (mousedown → mousemove → mouseup) ─────────────────── */
  const draggingRef = useRef(false);

  const onGridMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Ruler satırına tıklanmışsa seçimi başlatma
    const target = e.target as HTMLElement;
    if (target.closest(`.${s.datRulerLine}`)) return;
    e.preventDefault(); // prevent native text selection during drag
    const pos = charPosFromEvent(e);
    if (pos === null) return;

    // Eşleştirilmiş alan üzerine tıklanmışsa seçimi engelle
    const isOverlapping = mappings.some(m => pos >= m.start && pos < m.end);
    if (isOverlapping) return;

    setSelStart(pos);
    setSelEnd(pos);
    setIsDragging(true);
    draggingRef.current = true;
    setCtxMenu(null);
  };

  const onGridMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const pos = charPosFromEvent(e);
    if (pos !== null) setSelEnd(pos);
  };

  const onGridMouseUp = (_e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
  };

  // Document-level mouseup to catch releases outside grid
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        setIsDragging(false);
      }
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  /* ── Context Menu (right-click) ─────────────────────────────────────────── */
  const onGridContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (selStart === null || selEnd === null) return;

    // Viewport-safe positioning
    const menuW = 260; // estimated menu width
    const menuH = 400; // estimated menu height
    const pad = 8;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuW + pad > window.innerWidth) {
      x = window.innerWidth - menuW - pad;
    }
    if (y + menuH + pad > window.innerHeight) {
      y = window.innerHeight - menuH - pad;
    }
    if (x < pad) x = pad;
    if (y < pad) y = pad;

    setCtxMenu({ x, y });
  };

  const assignField = (field: string) => {
    if (selStart === null || selEnd === null) return;
    const lo = Math.min(selStart, selEnd);
    const hi = lo + Math.max(Math.max(selStart, selEnd) - lo, 1); // end exclusive, min 1 char

    const opt = allFieldOptions.find(o => o.field === field);
    const label = opt?.label || field;

    setMappings(prev => {
      const idx = prev.findIndex(m => m.field === field);
      const newMapping: FieldMapping = { field, start: lo, end: hi, label };
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = newMapping;
        return updated;
      }
      return [...prev, newMapping];
    });
    setCtxMenu(null);
    setSelStart(null);
    setSelEnd(null);
  };

  const removeMapping = (field: string) => {
    setMappings(prev => prev.filter(m => m.field !== field));
  };

  // Click dışına tıklayınca context menu kapat.
  // Windows'ta contextmenu'den hemen sonra click gelir; o tık menüyü
  // açıldığı anda kapatmasın diye kısa bir süre yok sayılır.
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

  // Context menu viewport düzeltme (render sonrası gerçek boyutla)
  useEffect(() => {
    if (!ctxMenu || !ctxMenuRef.current) return;
    const el = ctxMenuRef.current;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let { x, y } = ctxMenu;
    let changed = false;
    if (rect.right > window.innerWidth - pad) {
      x = window.innerWidth - rect.width - pad;
      changed = true;
    }
    if (rect.bottom > window.innerHeight - pad) {
      y = window.innerHeight - rect.height - pad;
      changed = true;
    }
    if (x < pad) { x = pad; changed = true; }
    if (y < pad) { y = pad; changed = true; }
    if (changed) setCtxMenu({ x, y });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxMenu]);

  /* ── Şablon Kaydet ──────────────────────────────────────────────────────── */
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      await mappingTemplateApi.create({
        name: templateName.trim(),
        exam_type: exam.exam_type,
        mappings: mappings,
        first_line_is_header: firstLineHeader,
        student_id_field: studentIdField,
      });
      setShowSaveDialog(false);
      setTemplateName('');
      fetchTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Şablon kaydedilemedi.');
    } finally {
      setSavingTemplate(false);
    }
  };

  /* ── Şablon Yükle ──────────────────────────────────────────────────────── */
  const handleLoadTemplate = (tpl: MappingTemplate) => {
    // Şablondaki ders_X ID'lerini mevcut sınavın bölüm ID'lerine dönüştür.
    // Kaydedilmiş şablonlarda başka bir sınavın section ID'leri olabilir.
    const allSections = exam.sections || [];
    const nameToId: Record<string, number> = {};
    allSections.forEach(sec => {
      nameToId[sec.name.trim().toLowerCase()] = sec.id;
    });

    const remappedMappings = tpl.mappings.map(m => {
      if (!m.field.startsWith('ders_')) return m;
      // Bu ders ID'si mevcut sınavda var mı?
      const oldId = parseInt(m.field.replace('ders_', ''), 10);
      const existsInExam = allSections.some(sec => sec.id === oldId);
      if (existsInExam) return m;

      // Eşleşmiyorsa label (bölüm adı) üzerinden dönüştür
      const label = (m.label || '').trim().toLowerCase();
      const newId = nameToId[label];
      if (newId) {
        return { ...m, field: `ders_${newId}` };
      }
      return m; // Dönüştüremediyse orijinali koru
    });

    setMappings(remappedMappings);
    setFirstLineHeader(tpl.first_line_is_header);
    setStudentIdField(tpl.student_id_field);
  };

  /* ── Şablon Sil ────────────────────────────────────────────────────────── */
  const handleDeleteTemplate = async (tplId: number) => {
    if (!confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;
    try {
      await mappingTemplateApi.delete(tplId);
      fetchTemplates();
    } catch { /* */ }
  };

  /* ── Parse & Score ──────────────────────────────────────────────────────── */
  const handleParse = async () => {
    if (!uploadResp) return;
    if (mappings.length === 0) {
      setError('En az bir alan eşleştirmesi yapmalısınız.');
      return;
    }
    if (!hasAnswerMapping) {
      setError('En az bir ders cevap alanını seçmeniz zorunludur.');
      return;
    }

    setError('');
    setParsing(true);
    try {
      const resp = await uploadApi.parse(exam.id, uploadResp.session_id, {
        field_mappings: mappings,
        first_line_is_header: firstLineHeader,
        student_id_field: studentIdField,
      });
      if (!resp.results || resp.results.length === 0) {
        setError('Dosya okundu ancak hiçbir sonuç satırı çıkarılamadı. Alan eşleştirmesini gözden geçirin.');
        fetchSessions();
        return;
      }
      setResults(resp.results);
      setTotalRows(resp.total_rows);
      setResultsSessionId(resp.session?.id ?? uploadResp.session_id);
      setCtxMenu(null);
      setSelStart(null);
      setSelEnd(null);
      setStep('results');
      fetchSessions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Parse hatası.');
    } finally {
      setParsing(false);
    }
  };

  /* ── Delete Session ─────────────────────────────────────────────────────── */
  const handleDeleteSession = async (sessionId: number) => {
    if (!confirm('Bu yükleme oturumunu silmek istediğinize emin misiniz?')) return;
    try {
      await uploadApi.deleteSession(exam.id, sessionId);
      fetchSessions();
      // Eğer o session'ın sonuçları gösteriliyorsa temizle
      setResults([]);
      setTotalRows(0);
      setResultsSessionId(null);
    } catch { /* */ }
  };

  /* ── Session Sonuçlarını Yükle ─────────────────────────────────────────── */
  const handleLoadSessionResults = async (sessionId: number) => {
    setLoadingSessionResults(true);
    setError('');
    setCtxMenu(null);
    setMatchDialogRow(null);
    try {
      const resp = await uploadApi.sessionResults(exam.id, sessionId);
      // Sonuç ekranı boş listeyle hiçbir şey göstermez; kullanıcıyı boş
      // ekranda bırakmak yerine yükleme adımında tutup nedenini söylüyoruz.
      if (!resp.results || resp.results.length === 0) {
        setError('Bu yüklemede gösterilecek sonuç kaydı bulunamadı.');
        return;
      }
      setResults(resp.results);
      setTotalRows(resp.total_rows);
      setResultsSessionId(sessionId);
      setStep('results');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sonuçlar yüklenemedi.');
    } finally {
      setLoadingSessionResults(false);
    }
  };

  /* ── Yeniden Eşleştirme (sonradan kayıt olan öğrenciler) ────────────────── */
  const handleRematch = useCallback(async () => {
    setRematching(true);
    setRematchResult(null);
    setError('');
    try {
      const resp = await uploadApi.rematchUnmatched(exam.id);
      setRematchResult({ newly_matched: resp.newly_matched, still_unmatched: resp.still_unmatched });
      if (resultsSessionId) {
        const fresh = await uploadApi.sessionResults(exam.id, resultsSessionId);
        setResults(fresh.results);
        setTotalRows(fresh.total_rows);
      } else if (resp.newly_matched > 0) {
        setResults(prev => prev.map(r => {
          const matched = resp.matched.find(m => m.answer_id === r.id);
          if (!matched) return r;
          return {
            ...r,
            matched_student_id: matched.matched_student_id,
            matched_student_name: matched.matched_student_name,
            match_score: matched.match_score,
            match_method: matched.match_method,
            match_status: 'matched',
            top_suggestion: null,
          };
        }));
      }
      setTimeout(() => setRematchResult(null), 8000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Yeniden eşleştirme başarısız.';
      setError(msg);
    }
    setRematching(false);
  }, [exam.id, resultsSessionId]);

  const closeMatchDialog = () => {
    setMatchDialogRow(null);
    setSearchQuery('');
    setSearchResults([]);
    setSuggestions([]);
    setShowManualSearch(false);
    setSelectedCandidateId(null);
    setSuggestionsLoading(false);
  };

  const openMatchDialog = useCallback(async (row: DATParseResultRow) => {
    setMatchDialogRow(row);
    setSearchQuery('');
    setSearchResults([]);
    setShowManualSearch(false);
    setSelectedCandidateId(null);
    setError('');
    setSuggestionsLoading(true);
    try {
      const data = await uploadApi.suggestStudents(exam.id, row.id);
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestions([]);
    }
    setSuggestionsLoading(false);
  }, [exam.id]);

  /* ── Manuel Eşleştirme ─────────────────────────────────────────────────── */
  const handleSearchStudents = useCallback(async (q: string, answerId?: number) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await uploadApi.searchStudents(exam.id, q, answerId);
      setSearchResults(data.filter(stu => stu.selectable !== false));
    } catch { setSearchResults([]); }
    setSearching(false);
  }, [exam.id]);

  const refreshResultsAfterMatch = useCallback(async () => {
    if (!resultsSessionId) return false;
    const fresh = await uploadApi.sessionResults(exam.id, resultsSessionId);
    setResults(fresh.results);
    setTotalRows(fresh.total_rows);
    return true;
  }, [exam.id, resultsSessionId]);

  const handleMatchStudent = async (answerId: number, studentId: number | null) => {
    setMatchingBusy(true);
    try {
      const resp = await uploadApi.updateStudentMatch(exam.id, answerId, studentId);
      const refreshed = await refreshResultsAfterMatch();
      if (!refreshed) {
        setResults(prev => prev.map(r => {
          if (r.id !== answerId) {
            if (studentId && r.top_suggestion?.id === studentId) {
              return { ...r, top_suggestion: null, match_status: r.matched_student_id ? r.match_status : 'not_found' };
            }
            return r;
          }
          return {
            ...r,
            matched_student_id: resp.matched_student_id,
            matched_student_name: resp.matched_student_name,
            match_score: resp.match_score ?? (resp.matched_student_id ? 1.0 : 0),
            match_method: resp.match_method ?? (resp.matched_student_id ? 'manual' : ''),
            match_status: resp.matched_student_id
              ? (resp.match_method === 'manual' ? 'manual' : 'matched')
              : 'pending',
            top_suggestion: null,
          };
        }));
      }
      closeMatchDialog();
      setError('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Eşleştirme başarısız.';
      setError(msg);
      setTimeout(() => setError(''), 5000);
    } finally {
      setMatchingBusy(false);
    }
  };

  /* ── Reset ──────────────────────────────────────────────────────────────── */
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
    setRematchResult(null);
    setOnlyUnmatched(false);
    setResultsSessionId(null);
  };

  /* ── Selection coordinates ───────────────────────────────────────────────── */
  const selLo = selStart !== null && selEnd !== null ? Math.min(selStart, selEnd) : null;
  const selHi = selStart !== null && selEnd !== null ? Math.max(selStart, selEnd) : null;
  const selCount = selLo !== null && selHi !== null ? Math.max(selHi - selLo, 1) : 0;

  /* ── Ruler chars ────────────────────────────────────────────────────────── */
  const maxLen = lines.reduce((mx, l) => Math.max(mx, l.length), 0);
  const rulerChars = Array.from({ length: Math.min(maxLen, 300) }, (_, i) => i);

  /* ── Result stats ───────────────────────────────────────────────────────── */
  const avgNet  = results.length > 0 ? results.reduce((sum, r) => sum + Number(r.total_net), 0) / results.length : 0;
  const maxNet  = results.length > 0 ? Math.max(...results.map(r => Number(r.total_net))) : 0;
  const minNet  = results.length > 0 ? Math.min(...results.map(r => Number(r.total_net))) : 0;

  /* ── Section names: exam.sections'dan ÖSYM sırasıyla türet ────────────── */
  const sectionNames = useMemo(() => {
    if (results.length === 0) return [];
    const resultKeys = new Set(Object.keys(results[0].section_nets || {}));
    if (resultKeys.size === 0) return [];

    // exam.sections'dan sıralı bölüm adları oluştur (context menu ile aynı mantık)
    const allSecs = exam.sections || [];
    const mainSecs = allSecs.filter(sec => !sec.is_sub_section).sort((a, b) => a.order - b.order);
    const subSecs = allSecs.filter(sec => sec.is_sub_section).sort((a, b) => a.order - b.order);
    const subsByParent = new Map<number, typeof subSecs>();
    for (const sub of subSecs) {
      if (sub.parent_section) {
        const arr = subsByParent.get(sub.parent_section) || [];
        arr.push(sub);
        subsByParent.set(sub.parent_section, arr);
      }
    }

    const ordered: string[] = [];
    for (const main of mainSecs) {
      const children = subsByParent.get(main.id) || [];
      if (children.length > 0) {
        // Alt bölümleri olan ana bölümü atla, alt bölüm isimlerini ekle
        for (const child of children) {
          if (resultKeys.has(child.name)) ordered.push(child.name);
        }
      } else {
        if (resultKeys.has(main.name)) ordered.push(main.name);
      }
    }

    // results'ta olup sections'da olmayan bölümleri de sona ekle
    for (const key of resultKeys) {
      if (!ordered.includes(key)) ordered.push(key);
    }

    return ordered;
  }, [results, exam.sections]);

  /* ── Sıralama ───────────────────────────────────────────────────────────── */
  const [sortKey, setSortKey]   = useState<string>('row');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc');

  // setSortDir'i setSortKey updater'ının içinden çağırmak React'in updater'ı
  // iki kez çalıştırdığı durumlarda toggle'ı kendi üzerine katlıyordu; bu yüzden
  // iki state ayrı ayrı güncelleniyor.
  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'student_name' ? 'asc' : 'desc');
    }
  }, [sortKey]);

  const sortedResults = useMemo(() => {
    if (!results.length) return results;
    const arr = [...results];
    arr.sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      if (sortKey === 'row')           { va = a.row; vb = b.row; }
      else if (sortKey === 'student_id') { va = (a.student_id || '').toLowerCase(); vb = (b.student_id || '').toLowerCase(); }
      else if (sortKey === 'student_name') { va = (a.student_name || '').toLowerCase(); vb = (b.student_name || '').toLowerCase(); }
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

  /** Tüm sıralanabilir başlıkların paylaştığı sıralama durumu. */
  const thProps = { activeKey: sortKey, direction: sortDir, onSort: handleSort };

  /** Ekranda gösterilen satırlar — "sadece eşleşmeyenler" filtresi istemci tarafında. */
  const visibleResults = useMemo(
    () => (onlyUnmatched ? sortedResults.filter(r => !r.matched_student_id) : sortedResults),
    [sortedResults, onlyUnmatched],
  );

  /* ── Eşleşme istatistikleri ─────────────────────────────────────────────── */
  const matchedCount = results.filter(r => r.matched_student_id).length;
  const unmatchedCount = totalRows - matchedCount;
  const matchPct = totalRows > 0 ? Math.round((matchedCount / totalRows) * 100) : 0;

  /* ── Kitapçık Değiştirme ────────────────────────────────────────────────── */
  const handleBookletChange = useCallback(async (answerId: number, newBooklet: string) => {
    const row = results.find(r => r.id === answerId);
    if (!row) return;
    try {
      const updated = await uploadApi.updateStudentBooklet(exam.id, answerId, newBooklet);
      // Sonuçları güncelle
      setResults(prev => prev.map(r => {
        if (r.id !== answerId) return r;
        return {
          ...r,
          booklet: updated.booklet,
          booklet_auto_detected: updated.booklet_auto_detected,
          total_correct: Number(updated.total_correct),
          total_wrong: Number(updated.total_wrong),
          total_empty: Number(updated.total_empty),
          total_net: Number(updated.total_net),
          section_nets: Object.fromEntries(
            (updated.section_scores || []).map((ss: { section_name: string; net: number }) => [ss.section_name, Number(ss.net)])
          ),
        };
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kitapçık değiştirilemedi.');
    }
  }, [results, exam.id]);

  /** mapping'den field'a renk index bul */
  const getColorIndex = (field: string): number => {
    const opt = allFieldOptions.find(o => o.field === field);
    return opt ? opt.color % COLOR_PALETTE.length : 0;
  };

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  RENDER                                                                */
  /* ═══════════════════════════════════════════════════════════════════════ */

  const currentStepIdx = STEPS.findIndex(st => st.key === step);

  return (
    <div>
      {/* ── Sihirbaz adımları ────────────────────────────────────────────── */}
      <ol className={s.uploadStepper}>
        {STEPS.map((st, i) => {
          const done = i < currentStepIdx;
          const current = i === currentStepIdx;
          return (
            <li
              key={st.key}
              className={`${s.uploadStep} ${done ? s.uploadStepDone : ''} ${current ? s.uploadStepCurrent : ''}`}
            >
              <span className={s.uploadStepDot}>
                <Icon name={done ? 'check' : st.icon} size={13} strokeWidth={done ? 3 : 2} />
              </span>
              <span className={s.uploadStepLabel}>{st.label}</span>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className={s.uploadErrorBar}>
          <Icon name="error" size={17} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} aria-label="Kapat" className={s.uploadErrorClose}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      {/* ═══════ STEP 1: UPLOAD ═══════ */}
      {step === 'upload' && (
        <div className="card-modern">
          <div className="card-modern-header">
            <h3 className="card-modern-title">
              <Icon name="upload" size={19} />
              Optik Sonuç Dosyası Yükle
            </h3>
          </div>
          <div className={s.cardBody}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".dat,.txt,.csv"
              style={{ display: 'none' }}
              onChange={onFileInput}
            />

            <div
              className={`${s.uploadDropZone} ${dragOver ? s.uploadDropZoneDragOver : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <div className={s.uploadDropZoneIcon}>
                <Icon
                  name={uploading ? 'refresh' : 'upload'}
                  size={24}
                  className={uploading ? s.olcmeSpinning : undefined}
                />
              </div>
              <div className={s.uploadDropZoneTitle}>
                {uploading ? 'Dosya yükleniyor…' : 'Dosyayı sürükleyin veya tıklayarak seçin'}
              </div>
              <div className={s.uploadDropZoneHint}>
                {uploading ? 'Lütfen bekleyin' : 'Optik okuyucu çıktısı — .dat, .txt veya .csv'}
              </div>
            </div>

            {/* Önceki Yüklemeler */}
            {sessions.length > 0 && (
              <div className={s.prevSessionsWrap}>
                <h4 className={s.prevSessionsTitle}>
                  <Icon name="clock" size={15} />
                  Önceki Yüklemeler
                  <span className={s.prevSessionsHint}>
                    Tamamlanmış bir yüklemeye tıklayarak sonuçlarını yeniden açabilirsiniz.
                  </span>
                </h4>
                {loadingSessionResults && (
                  <div className={s.prevSessionsLoading}>
                    <Icon name="refresh" size={14} className={s.olcmeSpinning} />
                    Sonuçlar yükleniyor…
                  </div>
                )}
                {sessions.map(ses => {
                  const openable = ses.status === 'COMPLETED';
                  return (
                    <div key={ses.id} className={s.prevSessionItem}>
                      {/* Satırın kendisi gerçek bir buton: klavyeyle odaklanılabilir
                          ve tamamlanmamış yüklemelerde devre dışı kalır. */}
                      <button
                        type="button"
                        className={s.prevSessionMain}
                        disabled={!openable}
                        onClick={() => handleLoadSessionResults(ses.id)}
                        title={openable ? 'Sonuçları görüntüle' : 'Bu yükleme tamamlanmadığı için açılamaz'}
                      >
                        <span className={s.prevSessionIcon}>
                          <Icon name="document" size={16} />
                        </span>
                        <span className={s.prevSessionText}>
                          <span className={s.prevSessionName}>{ses.original_filename}</span>
                          <span className={s.prevSessionMeta}>
                            {ses.total_rows} satır
                            {ses.matched_count > 0 && <> · <span style={{ color: '#16a34a' }}>{ses.matched_count} eşleşen</span></>}
                            {ses.unmatched_count > 0 && <> · <span style={{ color: '#ef4444' }}>{ses.unmatched_count} eşleşmeyen</span></>}
                            {' · '}
                            {new Date(ses.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                        <span className={`${s.prevSessionBadge} ${
                          ses.status === 'COMPLETED' ? s.prevSessionBadgeCompleted
                            : ses.status === 'ERROR' ? s.prevSessionBadgeError
                            : s.prevSessionBadgePending
                        }`}>
                          {ses.status_display || ses.status}
                        </span>
                      </button>
                      <button
                        className={s.prevSessionDelete}
                        onClick={() => handleDeleteSession(ses.id)}
                        title="Bu yüklemeyi sil"
                        aria-label={`${ses.original_filename} yüklemesini sil`}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ STEP 2: MAPPING ═══════ */}
      {step === 'mapping' && uploadResp && (
        <div className="card-modern">
          <div className="card-modern-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-modern-title" style={{ margin: 0 }}>
              <Icon name="layers" size={19} />
              Alan Eşleştirme
            </h3>
            <button className="btn-modern btn-secondary" onClick={resetAll} style={{ fontSize: 13 }}>
              <Icon name="back" size={14} />
              Yüklemelere Dön
            </button>
          </div>

          <div className={s.cardBody}>
            {/* File info */}
            <div className={s.uploadFileInfo}>
              <div className={s.uploadFileIcon}>
                <Icon name="document" size={18} />
              </div>
              <div>
                <div className={s.uploadFileName}>{uploadResp.filename}</div>
                <div className={s.uploadFileSize}>{uploadResp.total_lines} satır</div>
              </div>
              <button className={s.uploadFileRemove} onClick={resetAll}>Değiştir</button>
            </div>

            {/* Instructions */}
            <div className={s.uploadHowTo}>
              <Icon name="info" size={17} style={{ marginTop: 1 }} />
              <div>
                <strong>Nasıl yapılır:</strong> Aşağıdaki önizlemede bir sütun aralığını
                <strong> sol tuşla sürükleyerek seçin</strong>, sonra üstteki
                <strong> “Bu aralık hangi alan?”</strong> listesinden alanı seçin
                (sağ tık menüsü de çalışır). Aynı eşleştirmeyi tekrar
                kullanacaksanız şablon olarak kaydedin.
              </div>
            </div>

            {/* ── Şablon Yönetimi ─────────────────────────────────────────── */}
            <div className={s.templateSection}>
              <div className={s.templateHeader}>
                <Icon name="save" size={15} />
                <span>Kayıtlı Şablonlar ({exam.exam_type_display})</span>
              </div>

              <div className={s.templateRow}>
                {loadingTemplates ? (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Yükleniyor…</span>
                ) : templates.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    Bu sınav türü için kayıtlı şablon yok
                  </span>
                ) : (
                  templates.map(tpl => (
                    <div key={tpl.id} className={s.templateChip}>
                      <button
                        className={s.templateChipBtn}
                        onClick={() => handleLoadTemplate(tpl)}
                        title={`${tpl.mappings.length} alan eşleştirmesi • ${new Date(tpl.updated_at).toLocaleDateString('tr-TR')}`}
                      >
                        <Icon name="document" size={12} />
                        {tpl.name}
                      </button>
                      <button
                        className={s.templateChipDel}
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        title="Şablonu sil"
                        aria-label="Şablonu sil"
                      >
                        <Icon name="close" size={11} />
                      </button>
                    </div>
                  ))
                )}

                {/* Kaydet butonu */}
                {mappings.length > 0 && !showSaveDialog && (
                  <button
                    className={s.templateSaveBtn}
                    onClick={() => setShowSaveDialog(true)}
                    title="Mevcut eşleştirmeyi şablon olarak kaydet"
                  >
                    <Icon name="save" size={13} />
                    Şablon Kaydet
                  </button>
                )}
              </div>

              {/* Kaydet dialog */}
              {showSaveDialog && (
                <div className={s.templateSaveDialog}>
                  <input
                    className={s.templateSaveInput}
                    type="text"
                    placeholder="Şablon adı…"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTemplate(); if (e.key === 'Escape') setShowSaveDialog(false); }}
                    autoFocus
                  />
                  <button
                    className={s.templateSaveConfirm}
                    onClick={handleSaveTemplate}
                    disabled={!templateName.trim() || savingTemplate}
                    aria-label="Şablonu kaydet"
                  >
                    <Icon name={savingTemplate ? 'refresh' : 'check'} size={13} className={savingTemplate ? s.olcmeSpinning : undefined} />
                  </button>
                  <button
                    className={s.templateSaveCancel}
                    onClick={() => { setShowSaveDialog(false); setTemplateName(''); }}
                    aria-label="İptal"
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div className={s.datToolbar}>
              <div className={s.datToolbarLeft}>
                <label className={s.datToolbarChk}>
                  <input type="checkbox" checked={firstLineHeader} onChange={(e) => setFirstLineHeader(e.target.checked)} />
                  İlk satır başlık
                </label>
                <label className={s.datToolbarChk} style={{ marginLeft: 8 }}>
                  Kimlik alanı:
                  <select value={studentIdField} onChange={(e) => setStudentIdField(e.target.value)}
                    style={{ marginLeft: 4, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12 }}>
                    <option value="ogrenci_no">Öğrenci No</option>
                    <option value="tc_kimlik">TC Kimlik</option>
                  </select>
                </label>

                {/* ── Seçim Sayacı ────────────────────────────────────────── */}
                {selCount > 0 && (
                  <>
                    <span className={s.selectionCounter}>
                      <Icon name="layers" size={12} />
                      {selCount} karakter seçili
                      <span className={s.selectionCounterRange}>[{selLo}–{selHi! + 1})</span>
                    </span>
                    <select
                      className={s.fieldAssignSelect}
                      value=""
                      onChange={(e) => {
                        if (e.target.value) assignField(e.target.value);
                      }}
                      aria-label="Seçilen aralığı alana ata"
                    >
                      <option value="" disabled>Bu aralık hangi alan?</option>
                      <optgroup label="Genel">
                        {BASE_FIELDS.map(opt => (
                          <option key={opt.field} value={opt.field}>{opt.label}</option>
                        ))}
                      </optgroup>
                      {sectionFieldOptions.length > 0 && (
                        <optgroup label="Ders Cevapları">
                          {sectionFieldOptions.map(opt => (
                            <option key={opt.field} value={opt.field}>
                              {opt.parentLabel ? `${opt.parentLabel} · ${opt.label}` : opt.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </>
                )}
              </div>
              <div className={s.datToolbarRight}>
                <button
                  className="btn-modern btn-primary"
                  disabled={parsing || !hasAnswerMapping}
                  onClick={handleParse}
                  style={{ fontSize: 13, padding: '7px 20px' }}
                  title={!hasAnswerMapping ? 'Önce en az bir ders cevap alanı eşleştirin.' : 'Dosyayı oku ve netleri hesapla'}
                >
                  <Icon name={parsing ? 'refresh' : 'exam'} size={15} className={parsing ? s.olcmeSpinning : undefined} />
                  {parsing ? 'Okunuyor…' : 'Oku ve Skorla'}
                </button>
              </div>
            </div>

            {uploadResp.preview_truncated && (
              <div className={`${s.uploadNotice} ${s.uploadNoticeWarn}`}>
                <Icon name="info" size={16} />
                Önizlemede ilk {lines.length} satır gösteriliyor ({uploadResp.total_lines} satırın).
                Alan seçimi bu satırlardan yapılır; skorlama tüm dosyayı kullanır.
              </div>
            )}
            {sectionFieldOptions.length === 0 && (
              <div className={`${s.uploadNotice} ${s.uploadNoticeWarn}`}>
                <Icon name="alert" size={16} />
                Bu sınavda henüz <strong>ders bölümü</strong> yok. Ders cevap alanlarını
                seçmek için önce sınavı düzenleyip bölüm ekleyin.
              </div>
            )}

            {/* Eksik eşleştirme uyarıları — kullanıcı butona basmadan önce görsün */}
            {!hasAnswerMapping && (
              <div className={`${s.uploadNotice} ${s.uploadNoticeWarn}`}>
                <Icon name="alert" size={16} />
                Devam etmek için en az bir <strong>ders cevap alanı</strong> eşleştirmelisiniz.
              </div>
            )}
            {hasAnswerMapping && !hasIdentityMapping && (
              <div className={`${s.uploadNotice} ${s.uploadNoticeWarn}`}>
                <Icon name="alert" size={16} />
                Kimlik alanı (Öğrenci No, TC veya Ad Soyad) eşleştirilmedi. Sonuçlar okunur
                ancak <strong>hiçbir öğrenciyle eşleşmez</strong>.
              </div>
            )}

            {/* Mapped fields badges */}
            {mappings.length > 0 && (
              <div className={s.mappedFieldsList}>
                {mappings.map((m) => {
                  const ci = getColorIndex(m.field);
                  return (
                    <span key={m.field} className={s.mappedFieldBadge}
                      style={{ borderColor: COLOR_PALETTE[ci], color: COLOR_PALETTE[ci], background: `${COLOR_PALETTE[ci]}11` }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_PALETTE[ci], display: 'inline-block' }} />
                      {m.label}: [{m.start}–{m.end})
                      <button
                        className={s.mappedFieldBadgeRemove}
                        onClick={() => removeMapping(m.field)}
                        aria-label={`${m.label} eşleştirmesini kaldır`}
                      >
                        <Icon name="close" size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* DAT Preview Grid */}
            <div className={s.datPreviewContainer} style={{ marginTop: 16 }}>
              {/* Grid */}
              <div
                ref={gridRef}
                className={s.datGridWrap}
                onMouseDown={onGridMouseDown}
                onMouseMove={onGridMouseMove}
                onMouseUp={onGridMouseUp}
                onContextMenu={onGridContextMenu}
              >
                <div className={s.datGrid}>
                  {/* Ruler — grid içinde, satırlarla aynı layout'u paylaşır */}
                  <span className={`${s.datGridLine} ${s.datRulerLine}`}>
                    <span className={s.datGridLineNum} style={{ visibility: 'hidden' }}>0</span>
                    <span className={s.datRulerContent} data-ruler>
                      {rulerChars.map(i => (
                        <span key={i} className={s.datRulerChar}>{i % 10 === 0 ? i : (i % 5 === 0 ? '·' : '')}</span>
                      ))}
                    </span>
                  </span>

                  {/* Satırlar — her satırın metin span'ına data-text-line attribute */}
                  {lines.map((line, idx) => (
                    <span key={idx} className={s.datGridLine}>
                      <span className={s.datGridLineNum}>{idx + 1}</span>
                      <span data-text-line>{line}</span>
                    </span>
                  ))}

                  {/* Mapping overlays — OverlayLayer bileşeni ile pixel bazlı */}
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
            </div>
          </div>
        </div>
      )}

      {/* ═══════ STEP 3: RESULTS ═══════ */}
      {step === 'results' && results.length > 0 && (
        <div className="card-modern">
          <div className="card-modern-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-modern-title" style={{ margin: 0 }}>
              <Icon name="checkCircle" size={19} />
              Okuma Sonuçları
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {uploadResp && (
                <button className="btn-modern btn-secondary" onClick={() => setStep('mapping')} style={{ fontSize: 13 }}>
                  <Icon name="back" size={14} />
                  Eşleştirmeye Dön
                </button>
              )}
              <button className="btn-modern btn-secondary" onClick={resetAll} style={{ fontSize: 13 }}>
                <Icon name="upload" size={14} />
                Yeni Dosya Yükle
              </button>
            </div>
          </div>

          <div className={s.cardBody}>
            {/* Eşleşme durumu — bu ekrandaki en kritik bilgi, en üstte ve eyleme
                bağlı olarak gösterilir. Eskiden iki ayrı sayı kartıydı ve
                "Yeniden Eşleştir" butonu bir kartın içine sıkıştırılmıştı. */}
            <div className={`${s.matchBanner} ${unmatchedCount > 0 ? s.matchBannerWarn : s.matchBannerOk}`}>
              <span className={s.matchBannerIcon}>
                <Icon name={unmatchedCount > 0 ? 'alert' : 'checkCircle'} size={20} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={s.matchBannerTitle}>
                  {unmatchedCount > 0
                    ? `${unmatchedCount} kayıt öğrenciyle eşleşmedi`
                    : 'Tüm kayıtlar öğrencilerle eşleşti'}
                </div>
                <div className={s.matchBannerBar}>
                  <div className={s.matchBannerFill} style={{ width: `${matchPct}%` }} />
                </div>
                <div className={s.matchBannerMeta}>
                  {matchedCount} / {totalRows} eşleşti (%{matchPct})
                  {unmatchedCount > 0 && ' — eşleşmeyen kayıtlar analiz ve karnelerde yer almaz.'}
                </div>
              </div>
              {unmatchedCount > 0 && (
                <button
                  className={s.olcmeBtnPrimary}
                  onClick={handleRematch}
                  disabled={rematching}
                  title="Sonradan kayıt olan öğrenciler için eşleştirmeyi tekrar dener"
                >
                  <Icon name="refresh" size={14} className={rematching ? s.olcmeSpinning : undefined} />
                  {rematching ? 'Eşleştiriliyor…' : 'Yeniden Eşleştir'}
                </button>
              )}
            </div>

            {/* Yeniden eşleştirme sonuç bildirimi */}
            {rematchResult && (
              <div className={`${s.uploadNotice} ${rematchResult.newly_matched > 0 ? s.uploadNoticeOk : s.uploadNoticeWarn}`}>
                <Icon name={rematchResult.newly_matched > 0 ? 'checkCircle' : 'alert'} size={16} />
                {rematchResult.newly_matched > 0 ? (
                  <span>
                    <strong>{rematchResult.newly_matched}</strong> öğrenci yeni eşleştirildi.
                    {rematchResult.still_unmatched > 0 && <> Hâlâ <strong>{rematchResult.still_unmatched}</strong> eşleşmeyen kayıt var.</>}
                  </span>
                ) : (
                  <span>
                    Yeni eşleşme bulunamadı. {rematchResult.still_unmatched} kayıt hâlâ eşleşmemiş durumda.
                  </span>
                )}
              </div>
            )}

            {/* Net istatistikleri */}
            <div className={s.uploadStatsRow}>
              <div className={s.uploadStatCard}>
                <div className={s.uploadStatValue}>{totalRows}</div>
                <div className={s.uploadStatLabel}>Okunan Kayıt</div>
              </div>
              <div className={s.uploadStatCard}>
                <div className={s.uploadStatValue} style={{ color: '#0262a7' }}>{avgNet.toFixed(1)}</div>
                <div className={s.uploadStatLabel}>Ortalama Net</div>
              </div>
              <div className={s.uploadStatCard}>
                <div className={s.uploadStatValue} style={{ color: '#16a34a' }}>{maxNet.toFixed(1)}</div>
                <div className={s.uploadStatLabel}>En Yüksek Net</div>
              </div>
              <div className={s.uploadStatCard}>
                <div className={s.uploadStatValue} style={{ color: '#ef4444' }}>{minNet.toFixed(1)}</div>
                <div className={s.uploadStatLabel}>En Düşük Net</div>
              </div>
            </div>

            {/* Tablo araç çubuğu */}
            <div className={s.resultsToolbar}>
              <span className={s.resultsToolbarCount}>
                {visibleResults.length} kayıt gösteriliyor
              </span>
              {unmatchedCount > 0 && (
                <label className={s.resultsToolbarChk}>
                  <input
                    type="checkbox"
                    checked={onlyUnmatched}
                    onChange={e => setOnlyUnmatched(e.target.checked)}
                  />
                  Sadece eşleşmeyenleri göster ({unmatchedCount})
                </label>
              )}
            </div>

            {/* Results Table */}
            <div className={s.resultsTableWrap} style={{ maxHeight: 520, overflow: 'auto' }}>
              <table className={s.resultsTable}>
                <thead>
                  <tr>
                    <SortTh label="#" columnKey="row" {...thProps} />
                    <SortTh label="DAT Kaydı" columnKey="student_name" {...thProps} />
                    <th>Eşleşen / Önerilen</th>
                    <th style={{ textAlign: 'center' }}>Güven</th>
                    <th style={{ textAlign: 'center' }}>Durum</th>
                    <th style={{ textAlign: 'center' }}>İşlem</th>
                    <th style={{ textAlign: 'center' }}>Kitapçık</th>
                    <SortTh label="Doğru" columnKey="total_correct" align="center" {...thProps} />
                    <SortTh label="Yanlış" columnKey="total_wrong" align="center" {...thProps} />
                    <SortTh label="Boş" columnKey="total_empty" align="center" {...thProps} />
                    <SortTh label="Toplam Net" columnKey="total_net" align="center" {...thProps} />
                    {sectionNames.map(sn => (
                      <SortTh key={sn} label={sn} columnKey={`sec:${sn}`} align="center" {...thProps} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleResults.map((r) => {
                    const status = rowMatchStatus(r);
                    const statusMeta = STATUS_META[status];
                    const suggestion = r.top_suggestion;
                    const confKey = r.matched_student_id
                      ? scoreToConfidence(r.match_score)
                      : suggestion?.confidence ?? (suggestion ? scoreToConfidence(suggestion.match_score) : null);
                    const confMeta = confKey ? CONFIDENCE_META[confKey] : null;
                    const pct = r.matched_student_id
                      ? displayScorePct(undefined, r.match_score)
                      : displayScorePct(suggestion?.score, suggestion?.match_score);
                    return (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.row}</td>
                      <td>
                        <div className={s.matchDatName}>{r.student_name || '—'}</div>
                        <div className={s.matchDatMeta}>
                          {r.student_id ? <>No: {r.student_id}</> : null}
                          {r.tc_kimlik ? <> · TC: {r.tc_kimlik}</> : null}
                        </div>
                      </td>
                      <td>
                        {r.matched_student_id ? (
                          <div>
                            <div className={s.matchLinkedName}>
                              <Icon name="check" size={12} strokeWidth={3} />
                              {r.matched_student_name}
                            </div>
                            <div className={s.matchDatMeta}>
                              {matchMethodLabel(r.match_method, r.match_score)}
                            </div>
                          </div>
                        ) : suggestion ? (
                          <div>
                            <div className={s.matchSuggestName}>{suggestion.full_name}</div>
                            <div className={s.matchDatMeta}>
                              {suggestion.okul_no ? <>No: {suggestion.okul_no}</> : null}
                              {suggestion.sinif ? <> · {suggestion.sinif}</> : null}
                              {suggestion.reason ? <> · {suggestion.reason}</> : null}
                            </div>
                          </div>
                        ) : (
                          <span className={s.matchDatMeta}>Öneri yok</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {confMeta && pct != null ? (
                          <span className={`${s.matchConfChip} ${confMeta.cls}`}>
                            %{pct} · {confMeta.label}
                          </span>
                        ) : (
                          <span className={s.matchDatMeta}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`${s.matchStatusChip} ${statusMeta.cls}`}>{statusMeta.label}</span>
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {r.matched_student_id ? (
                          <div className={s.matchRowActions}>
                            <button type="button" className={s.matchActionBtn} onClick={() => openMatchDialog(r)}>
                              Değiştir
                            </button>
                            <button
                              type="button"
                              className={`${s.matchActionBtn} ${s.matchActionDanger}`}
                              onClick={() => handleMatchStudent(r.id, null)}
                            >
                              Kaldır
                            </button>
                          </div>
                        ) : (
                          <button type="button" className={s.matchActionPrimary} onClick={() => openMatchDialog(r)}>
                            Eşleştir
                          </button>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <select
                            className={`${s.bookletSelect} ${r.booklet_auto_detected ? s.bookletSelectAuto : ''}`}
                            value={r.booklet || ''}
                            onChange={e => handleBookletChange(r.id, e.target.value)}
                            title={r.booklet_auto_detected ? 'Otomatik tespit edildi — değiştirmek için seçin' : 'Kitapçık türünü değiştir'}
                            aria-label="Kitapçık türü"
                          >
                            <option value="">—</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                          </select>
                          {r.booklet_auto_detected && (
                            <span className={s.bookletAutoIcon} title="Kitapçık otomatik tespit edildi">
                              <Icon name="refresh" size={10} />
                            </span>
                          )}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', color: '#16a34a' }}>{r.total_correct}</td>
                      <td style={{ textAlign: 'center', color: '#ef4444' }}>{r.total_wrong}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{r.total_empty}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`${s.resultsNetBadge} ${Number(r.total_net) > 0 ? s.resultsNetPositive : Number(r.total_net) < 0 ? s.resultsNetNegative : s.resultsNetZero}`}>
                          {Number(r.total_net).toFixed(2)}
                        </span>
                      </td>
                      {sectionNames.map(sn => (
                        <td key={sn} style={{ textAlign: 'center', fontWeight: 500 }}>
                          {r.section_nets[sn] != null ? Number(r.section_nets[sn]).toFixed(2) : '—'}
                        </td>
                      ))}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {visibleResults.length === 0 && (
                <div className={s.resultsTableEmpty}>
                  <Icon name="checkCircle" size={22} />
                  Eşleşmeyen kayıt kalmadı.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ EŞLEŞTİRME DİALOG ═══════ */}
      {matchDialogRow && (
        <div className={s.matchDialogOverlay} onClick={closeMatchDialog}>
          <div className={s.matchDialog} onClick={e => e.stopPropagation()}>
            <div className={s.matchDialogHeader}>
              <h4 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="users" size={16} />
                {matchDialogRow.matched_student_id ? 'Eşleşmeyi Değiştir' : 'Öğrenci Eşleştir'}
              </h4>
              <button
                onClick={closeMatchDialog}
                aria-label="Kapat"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className={s.matchDialogDat}>
              <div>
                <div className={s.matchDialogDatLabel}>DAT kaydı</div>
                <div className={s.matchDialogDatName}>{matchDialogRow.student_name || '—'}</div>
                <div className={s.matchDatMeta}>
                  Satır {matchDialogRow.row}
                  {matchDialogRow.student_id ? ` · No: ${matchDialogRow.student_id}` : ''}
                  {matchDialogRow.tc_kimlik ? ` · TC: ${matchDialogRow.tc_kimlik}` : ''}
                </div>
              </div>
              {matchDialogRow.matched_student_id && (
                <div className={s.matchDialogCurrent}>
                  <Icon name="checkCircle" size={14} />
                  {matchDialogRow.matched_student_name}
                </div>
              )}
            </div>
            {error && (
              <div className={s.matchDialogError}>
                <Icon name="alert" size={14} />
                {error}
              </div>
            )}
            <div className={s.matchDialogBody}>
              {!showManualSearch ? (
                <>
                  <div className={s.matchDialogSectionTitle}>Önerilen öğrenciler</div>
                  {suggestionsLoading && (
                    <div className={s.matchDialogEmpty}>Adaylar hesaplanıyor…</div>
                  )}
                  {!suggestionsLoading && suggestions.length === 0 && (
                    <div className={s.matchDialogEmpty}>
                      Otomatik aday bulunamadı. Farklı öğrenci arayarak manuel eşleştirebilirsiniz.
                    </div>
                  )}
                  {suggestions.map((stu, idx) => {
                    const conf = CONFIDENCE_META[stu.confidence] || CONFIDENCE_META.low;
                    const selected = selectedCandidateId === stu.id;
                    return (
                      <button
                        key={stu.id}
                        type="button"
                        className={`${s.matchSuggestCard} ${selected ? s.matchSuggestCardOn : ''}`}
                        onClick={() => setSelectedCandidateId(stu.id)}
                      >
                        <div className={s.matchSuggestRank}>{idx + 1}</div>
                        <div className={s.matchSuggestMain}>
                          <div className={s.matchSuggestTitle}>{stu.full_name}</div>
                          <div className={s.matchDatMeta}>
                            {stu.okul_no ? <>No: {stu.okul_no}</> : null}
                            {stu.sinif ? <> · {stu.sinif}</> : null}
                            {stu.reason ? <> · {stu.reason}</> : null}
                          </div>
                        </div>
                        <div className={s.matchSuggestScore}>
                          <span className={`${s.matchConfChip} ${conf.cls}`}>%{stu.score}</span>
                          <span className={s.matchDatMeta}>{conf.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </>
              ) : (
                <>
                  <div className={s.matchDialogSectionTitle}>Farklı öğrenci ara</div>
                  <input
                    type="text"
                    placeholder="Ad, soyad, öğrenci no veya TC…"
                    value={searchQuery}
                    onChange={e => handleSearchStudents(e.target.value, matchDialogRow.id)}
                    className={s.matchSearchInput}
                    autoFocus
                  />
                  {searching && <div className={s.matchDialogEmpty}>Aranıyor…</div>}
                  {!searching && searchQuery.length > 0 && searchQuery.length < 2 && (
                    <div className={s.matchDialogEmpty}>Aramak için en az 2 karakter girin.</div>
                  )}
                  {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                    <div className={s.matchDialogEmpty}>Sonuç bulunamadı veya adaylar başka kayıtla eşleşmiş.</div>
                  )}
                  {searchResults.map(stu => {
                    const selected = selectedCandidateId === stu.id;
                    const pct = displayScorePct(stu.score);
                    return (
                      <button
                        key={stu.id}
                        type="button"
                        className={`${s.matchSuggestCard} ${selected ? s.matchSuggestCardOn : ''}`}
                        onClick={() => setSelectedCandidateId(stu.id)}
                      >
                        <div className={s.matchSuggestMain}>
                          <div className={s.matchSuggestTitle}>{stu.full_name}</div>
                          <div className={s.matchDatMeta}>
                            {stu.okul_no ? <>No: {stu.okul_no}</> : <>No: {stu.id}</>}
                            {stu.sinif ? <> · {stu.sinif}</> : null}
                            {stu.tc_kimlik_no ? <> · TC: {stu.tc_kimlik_no}</> : null}
                            {stu.reason ? <> · {stu.reason}</> : null}
                          </div>
                        </div>
                        {pct != null && (
                          <span className={s.matchConfChip}>%{pct}</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            <div className={s.matchDialogFooter}>
              <button
                type="button"
                className="btn-modern btn-secondary"
                style={{ fontSize: 13 }}
                onClick={() => {
                  setShowManualSearch(v => !v);
                  setSelectedCandidateId(null);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
              >
                <Icon name="search" size={13} />
                {showManualSearch ? 'Önerilere Dön' : 'Farklı Öğrenci Ara'}
              </button>
              <div className={s.matchDialogFooterRight}>
                {matchDialogRow.matched_student_id && (
                  <button
                    type="button"
                    className={`${s.matchActionBtn} ${s.matchActionDanger}`}
                    disabled={matchingBusy}
                    onClick={() => handleMatchStudent(matchDialogRow.id, null)}
                  >
                    Eşleşmeyi Kaldır
                  </button>
                )}
                <button
                  type="button"
                  className={s.matchActionPrimary}
                  disabled={!selectedCandidateId || matchingBusy}
                  onClick={() => selectedCandidateId && handleMatchStudent(matchDialogRow.id, selectedCandidateId)}
                >
                  {matchingBusy ? 'Kaydediliyor…' : 'Öğrenciyi Eşleştir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ CONTEXT MENU ═══════ */}
      {ctxMenu && (
        <div ref={ctxMenuRef} className={s.ctxMenu} style={{ left: ctxMenu.x, top: ctxMenu.y, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
          onClick={(e) => e.stopPropagation()}>
          <div className={s.ctxMenuTitle}>
            Alan Seçin [{selLo}–{selHi! + 1}) • {selCount} karakter
          </div>

          {/* ── Genel Alanlar ────────────────────────────────────────── */}
          <div className={s.ctxMenuGroupLabel}>Genel Alanlar</div>
          {BASE_FIELDS.map(opt => {
            const already = mappings.find(m => m.field === opt.field);
            const ci = opt.color % COLOR_PALETTE.length;
            return (
              <button
                key={opt.field}
                className={`${s.ctxMenuItem} ${already ? s.ctxMenuItemDisabled : ''}`}
                onClick={() => !already && assignField(opt.field)}
                disabled={!!already}
              >
                <span className={s.ctxMenuDot} style={{ background: already ? '#c0c8d0' : COLOR_PALETTE[ci] }} />
                {opt.label}
                {already && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Icon name="check" size={10} strokeWidth={3} />
                    [{already.start}–{already.end})
                  </span>
                )}
              </button>
            );
          })}

          {/* ── Ders Cevapları ────────────────────────────────────────── */}
          {sectionFieldOptions.length > 0 && (
            <>
              <div className={s.ctxMenuSep} />
              <div className={s.ctxMenuGroupLabel}>Ders Cevapları</div>
              {(() => {
                let lastParent: string | undefined;
                return sectionFieldOptions.map(opt => {
                  const already = mappings.find(m => m.field === opt.field);
                  const ci = opt.color % COLOR_PALETTE.length;
                  const sec = exam.sections?.find(sec => sec.id === parseInt(opt.field.replace('ders_', '')));
                  const qCount = sec ? sec.question_count : null;
                  const showParentHeader = opt.parentLabel && opt.parentLabel !== lastParent;
                  if (opt.parentLabel) lastParent = opt.parentLabel;
                  else lastParent = undefined;
                  return (
                    <span key={opt.field}>
                      {showParentHeader && (
                        <div className={s.ctxMenuGroupLabel} style={{ fontSize: 11, paddingTop: 6, paddingBottom: 2, opacity: 0.7, borderTop: '1px solid var(--border)' }}>
                          {opt.parentLabel}
                        </div>
                      )}
                      <button
                        className={`${s.ctxMenuItem} ${already ? s.ctxMenuItemDisabled : ''}`}
                        onClick={() => !already && assignField(opt.field)}
                        disabled={!!already}
                      >
                        <span className={s.ctxMenuDot} style={{ background: already ? '#c0c8d0' : COLOR_PALETTE[ci] }} />
                        <span style={{ flex: 1, paddingLeft: opt.isSubSection ? 12 : 0 }}>
                          {opt.label}
                          {qCount && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>({qCount} soru)</span>}
                        </span>
                        {already && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Icon name="check" size={10} strokeWidth={3} />
                            [{already.start}–{already.end})
                          </span>
                        )}
                      </button>
                    </span>
                  );
                });
              })()}
            </>
          )}

          <div className={s.ctxMenuSep} />
          <button className={s.ctxMenuItem} onClick={() => setCtxMenu(null)} style={{ color: 'var(--text-secondary)' }}>
            İptal
          </button>
        </div>
      )}
    </div>
  );
}
