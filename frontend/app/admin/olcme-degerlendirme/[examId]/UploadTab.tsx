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
} from '../../../../components/olcme/types';
import s from '../olcme.module.css';

/* ── Renkler ──────────────────────────────────────────────────────────────── */

const COLOR_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#14b8a6', '#e11d48',
];

type Step = 'upload' | 'mapping' | 'results';

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
  const [isDragging, setIsDragging]     = useState(false);

  // Context menu
  const [ctxMenu, setCtxMenu]           = useState<{ x: number; y: number } | null>(null);

  // Results
  const [results, setResults]           = useState<DATParseResultRow[]>([]);
  const [totalRows, setTotalRows]       = useState(0);

  // Previous sessions
  const [sessions, setSessions]         = useState<DATSessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingSessionResults, setLoadingSessionResults] = useState(false);

  // Manuel eşleştirme dialog
  const [matchDialogRow, setMatchDialogRow] = useState<DATParseResultRow | null>(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching]       = useState(false);

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
      const children = subSections.filter(s => s.parent_section === main.id);

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

  // Click dışına tıklayınca context menu kapat
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
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
      setResults(resp.results);
      setTotalRows(resp.total_rows);
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
      setResults(resp.results);
      setTotalRows(resp.total_rows);
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
      if (resp.newly_matched > 0) {
        // Eşleşen kayıtları results state'inde güncelle
        setResults(prev => prev.map(r => {
          const matched = resp.matched.find(m => m.answer_id === r.id);
          if (!matched) return r;
          return {
            ...r,
            matched_student_id: matched.matched_student_id,
            matched_student_name: matched.matched_student_name,
            match_score: matched.match_score,
            match_method: matched.match_method,
          };
        }));
      }
      // 5 saniye sonra bildirim mesajını kaldır
      setTimeout(() => setRematchResult(null), 8000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Yeniden eşleştirme başarısız.';
      setError(msg);
    }
    setRematching(false);
  }, [exam.id]);

  /* ── Manuel Eşleştirme ─────────────────────────────────────────────────── */
  const handleSearchStudents = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await uploadApi.searchStudents(exam.id, q);
      setSearchResults(data);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, [exam.id]);

  const handleMatchStudent = async (answerId: number, studentId: number | null) => {
    try {
      const resp = await uploadApi.updateStudentMatch(exam.id, answerId, studentId);
      setResults(prev => prev.map(r => {
        if (r.id !== answerId) return r;
        return {
          ...r,
          matched_student_id: resp.matched_student_id,
          matched_student_name: resp.matched_student_name,
          match_score: resp.match_score ?? (resp.matched_student_id ? 1.0 : 0),
          match_method: resp.match_method ?? (resp.matched_student_id ? 'manual' : ''),
        };
      }));
      setMatchDialogRow(null);
      setSearchQuery('');
      setSearchResults([]);
      setError('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Eşleştirme başarısız.';
      setError(msg);
      // Dialog'u açık bırak ki kullanıcı sorunu görsün — 3 sn sonra sil
      setTimeout(() => setError(''), 5000);
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
    setMatchDialogRow(null);
    setRematchResult(null);
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

  const handleSort = useCallback((key: string) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return key;
      }
      setSortDir(key === 'student_name' ? 'asc' : 'desc');
      return key;
    });
  }, []);

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

  /** Sort ikonu */
  const sortIcon = (key: string) => {
    if (sortKey !== key) return <span style={{ opacity: 0.25, fontSize: 10 }}>⇅</span>;
    return sortDir === 'asc'
      ? <span style={{ fontSize: 10 }}>▲</span>
      : <span style={{ fontSize: 10 }}>▼</span>;
  };

  /* ── Eşleşme istatistikleri ─────────────────────────────────────────────── */
  const matchedCount = results.filter(r => r.matched_student_id).length;

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

  return (
    <div>
      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', marginBottom: 16, fontSize: 13 }}>
          <strong>Hata:</strong> {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 600 }}>✕</button>
        </div>
      )}

      {/* ═══════ STEP 1: UPLOAD ═══════ */}
      {step === 'upload' && (
        <div className="card-modern">
          <div className="card-modern-header">
            <h3 className="card-modern-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              DAT Dosyası Yükle
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
              {uploading ? (
                <>
                  <div className={s.uploadDropZoneIcon}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
                  </div>
                  <div className={s.uploadDropZoneTitle}>Yükleniyor…</div>
                </>
              ) : (
                <>
                  <div className={s.uploadDropZoneIcon}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                  </div>
                  <div className={s.uploadDropZoneTitle}>Dosyayı sürükleyin veya tıklayın</div>
                  <div className={s.uploadDropZoneHint}>.dat, .txt veya .csv dosyaları desteklenir</div>
                </>
              )}
            </div>

            {/* Önceki Yüklemeler */}
            {sessions.length > 0 && (
              <div className={s.prevSessionsWrap}>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                  Önceki Yüklemeler
                </h4>
                {loadingSessionResults && (
                  <div style={{ textAlign: 'center', padding: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
                    Sonuçlar yükleniyor…
                  </div>
                )}
                {sessions.map(ses => (
                  <div
                    key={ses.id}
                    className={s.prevSessionItem}
                    style={{ cursor: ses.status === 'COMPLETED' ? 'pointer' : 'default' }}
                    onClick={() => ses.status === 'COMPLETED' && handleLoadSessionResults(ses.id)}
                    title={ses.status === 'COMPLETED' ? 'Sonuçları görüntüle' : ''}
                  >
                    <div style={{ flex: 1 }}>
                      <div className={s.prevSessionName}>{ses.original_filename}</div>
                      <div className={s.prevSessionMeta}>
                        {ses.total_rows} satır
                        {ses.matched_count > 0 && <> • <span style={{ color: '#16a34a' }}>{ses.matched_count} eşleşen</span></>}
                        {ses.unmatched_count > 0 && <> • <span style={{ color: '#ef4444' }}>{ses.unmatched_count} eşleşmeyen</span></>}
                        {' • '}{new Date(ses.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className={`${s.prevSessionBadge} ${
                      ses.status === 'COMPLETED' ? s.prevSessionBadgeCompleted
                        : ses.status === 'ERROR' ? s.prevSessionBadgeError
                        : s.prevSessionBadgePending
                    }`}>
                      {ses.status_display || ses.status}
                    </span>
                    <button className={s.prevSessionDelete} onClick={(e) => { e.stopPropagation(); handleDeleteSession(ses.id); }} title="Sil">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                ))}
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/></svg>
              Alan Eşleştirme
            </h3>
            <button className="btn-modern btn-secondary" onClick={resetAll} style={{ fontSize: 13 }}>
              ← Geri
            </button>
          </div>

          <div className={s.cardBody}>
            {/* File info */}
            <div className={s.uploadFileInfo}>
              <div className={s.uploadFileIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div>
                <div className={s.uploadFileName}>{uploadResp.filename}</div>
                <div className={s.uploadFileSize}>{uploadResp.total_lines} satır</div>
              </div>
              <button className={s.uploadFileRemove} onClick={resetAll}>Değiştir</button>
            </div>

            {/* Instructions */}
            <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#1e40af' }}>
              <strong>Nasıl kullanılır:</strong> Aşağıdaki veri önizlemesinde <strong>sol tık ile sütun aralığını seçin</strong>, ardından <strong>sağ tıklayarak</strong> hangi alan olduğunu belirleyin (Öğrenci No, Ad Soyad, veya ders cevapları)
            </div>

            {/* ── Şablon Yönetimi ─────────────────────────────────────────── */}
            <div className={s.templateSection}>
              <div className={s.templateHeader}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        {tpl.name}
                      </button>
                      <button
                        className={s.templateChipDel}
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        title="Şablonu sil"
                      >
                        ✕
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
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
                  >
                    {savingTemplate ? '…' : '✓'}
                  </button>
                  <button
                    className={s.templateSaveCancel}
                    onClick={() => { setShowSaveDialog(false); setTemplateName(''); }}
                  >
                    ✕
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
                  <span className={s.selectionCounter}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                    {selCount} karakter seçili
                    <span className={s.selectionCounterRange}>[{selLo}–{selHi! + 1})</span>
                  </span>
                )}
              </div>
              <div className={s.datToolbarRight}>
                <button
                  className="btn-modern btn-primary"
                  disabled={parsing || !hasAnswerMapping}
                  onClick={handleParse}
                  style={{ fontSize: 13, padding: '7px 20px' }}
                >
                  {parsing ? 'Okunuyor…' : '📖 Oku ve Skorla'}
                </button>
              </div>
            </div>

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
                      <button className={s.mappedFieldBadgeRemove} onClick={() => removeMapping(m.field)}>✕</button>
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              Sonuçlar
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {uploadResp && (
                <button className="btn-modern btn-secondary" onClick={() => setStep('mapping')} style={{ fontSize: 13 }}>
                  ← Eşleştirmeye Dön
                </button>
              )}
              <button className="btn-modern btn-secondary" onClick={resetAll} style={{ fontSize: 13 }}>
                ← Yüklemelere Dön
              </button>
            </div>
          </div>

          <div className={s.cardBody}>
            {/* Stats */}
            <div className={s.uploadStatsRow}>
              <div className={s.uploadStatCard}>
                <div className={s.uploadStatValue}>{totalRows}</div>
                <div className={s.uploadStatLabel}>Toplam Öğrenci</div>
              </div>
              <div className={s.uploadStatCard}>
                <div className={s.uploadStatValue} style={{ color: '#16a34a' }}>{matchedCount}</div>
                <div className={s.uploadStatLabel}>Eşleşen</div>
              </div>
              <div className={s.uploadStatCard}>
                <div className={s.uploadStatValue} style={{ color: '#ef4444' }}>{totalRows - matchedCount}</div>
                <div className={s.uploadStatLabel}>Eşleşmeyen</div>
              </div>
              {(totalRows - matchedCount) > 0 && (
                <div className={s.uploadStatCard} style={{ justifyContent: 'center' }}>
                  <button
                    className="btn-modern btn-primary"
                    style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}
                    onClick={handleRematch}
                    disabled={rematching}
                    title="Sonradan kayıt olan öğrencileri eşleştirmek için tıklayın"
                  >
                    {rematching ? (
                      <><span className="spinner-xs" style={{ marginRight: 6 }} />Eşleştiriliyor…</>
                    ) : (
                      <>🔄 Yeniden Eşleştir</>
                    )}
                  </button>
                </div>
              )}
              <div className={s.uploadStatCard}>
                <div className={s.uploadStatValue} style={{ color: '#16a34a' }}>{avgNet.toFixed(1)}</div>
                <div className={s.uploadStatLabel}>Ortalama Net</div>
              </div>
              <div className={s.uploadStatCard}>
                <div className={s.uploadStatValue} style={{ color: '#0262a7' }}>{maxNet.toFixed(1)}</div>
                <div className={s.uploadStatLabel}>En Yüksek Net</div>
              </div>
              <div className={s.uploadStatCard}>
                <div className={s.uploadStatValue} style={{ color: '#ef4444' }}>{minNet.toFixed(1)}</div>
                <div className={s.uploadStatLabel}>En Düşük Net</div>
              </div>
            </div>

            {/* Yeniden eşleştirme sonuç bildirimi */}
            {rematchResult && (
              <div style={{
                padding: '10px 16px',
                marginBottom: 12,
                borderRadius: 8,
                fontSize: 13,
                background: rematchResult.newly_matched > 0 ? '#f0fdf4' : '#fffbeb',
                border: `1px solid ${rematchResult.newly_matched > 0 ? '#bbf7d0' : '#fed7aa'}`,
                color: rematchResult.newly_matched > 0 ? '#166534' : '#92400e',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                {rematchResult.newly_matched > 0 ? (
                  <>✅ <strong>{rematchResult.newly_matched}</strong> öğrenci yeni eşleştirildi.{rematchResult.still_unmatched > 0 && <> Hâlâ <strong>{rematchResult.still_unmatched}</strong> eşleşmeyen kayıt var.</>}</>
                ) : (
                  <>⚠️ Yeni eşleşme bulunamadı. {rematchResult.still_unmatched} kayıt hâlâ eşleşmemiş durumda.</>
                )}
              </div>
            )}

            {/* Results Table */}
            <div className={s.resultsTableWrap} style={{ maxHeight: 520, overflow: 'auto' }}>
              <table className={s.resultsTable}>
                <thead>
                  <tr>
                    <th className={s.sortableTh} onClick={() => handleSort('row')}># {sortIcon('row')}</th>
                    <th className={s.sortableTh} onClick={() => handleSort('student_id')}>
                      {studentIdField === 'tc_kimlik' ? 'TC Kimlik' : 'Öğrenci No'} {sortIcon('student_id')}
                    </th>
                    <th className={s.sortableTh} onClick={() => handleSort('student_name')}>Ad Soyad {sortIcon('student_name')}</th>
                    <th style={{ textAlign: 'center' }}>Eşleşme</th>
                    <th style={{ textAlign: 'center' }}>Kitapçık</th>
                    <th className={s.sortableTh} style={{ textAlign: 'center' }} onClick={() => handleSort('total_correct')}>Doğru {sortIcon('total_correct')}</th>
                    <th className={s.sortableTh} style={{ textAlign: 'center' }} onClick={() => handleSort('total_wrong')}>Yanlış {sortIcon('total_wrong')}</th>
                    <th className={s.sortableTh} style={{ textAlign: 'center' }} onClick={() => handleSort('total_empty')}>Boş {sortIcon('total_empty')}</th>
                    <th className={s.sortableTh} style={{ textAlign: 'center' }} onClick={() => handleSort('total_net')}>Toplam Net {sortIcon('total_net')}</th>
                    {sectionNames.map(sn => (
                      <th key={sn} className={s.sortableTh} style={{ textAlign: 'center' }} onClick={() => handleSort('sec:' + sn)}>{sn} {sortIcon('sec:' + sn)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((r) => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.row}</td>
                      <td style={{ fontWeight: 600 }}>{r.student_id}</td>
                      <td>{r.student_name || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {r.matched_student_id ? (
                          <span
                            className={s.matchBadgeOk}
                            style={{ cursor: 'pointer' }}
                            onClick={() => { setMatchDialogRow(r); setSearchQuery(''); setSearchResults([]); setError(''); }}
                            title={`${r.matched_student_name} — tıklayarak değiştir`}
                          >
                            ✓ {r.matched_student_name}
                            <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.65, fontWeight: 400 }}>
                              {r.match_method === 'tc' ? '🆔TC' :
                               r.match_method === 'name_exact' ? '📝TAM' :
                               r.match_method === 'id' ? '🔢NO' :
                               r.match_method === 'name' ? `📝%${Math.round(r.match_score * 100)}` :
                               r.match_method === 'manual' ? '✋' : ''}
                            </span>
                          </span>
                        ) : (
                          <span
                            className={s.matchBadgeFail}
                            style={{ cursor: 'pointer' }}
                            onClick={() => { setMatchDialogRow(r); setSearchQuery(''); setSearchResults([]); setError(''); }}
                            title="Tıklayarak eşleştir"
                          >✗ Eşleşmedi</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <select
                          className={`${s.bookletSelect} ${r.booklet_auto_detected ? s.bookletSelectAuto : ''}`}
                          value={r.booklet || ''}
                          onChange={e => handleBookletChange(r.id, e.target.value)}
                          title={r.booklet_auto_detected ? 'Otomatik tespit edildi — değiştirmek için seçin' : 'Kitapçık türünü değiştir'}
                        >
                          <option value="">—</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                        </select>
                        {r.booklet_auto_detected && <span className={s.bookletAutoIcon} title="Otomatik tespit">⟳</span>}
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ EŞLEŞTİRME DİALOG ═══════ */}
      {matchDialogRow && (
        <div className={s.matchDialogOverlay} onClick={() => setMatchDialogRow(null)}>
          <div className={s.matchDialog} onClick={e => e.stopPropagation()}>
            <div className={s.matchDialogHeader}>
              <h4 style={{ margin: 0, fontSize: 15 }}>Öğrenci Eşleştir</h4>
              <button onClick={() => setMatchDialogRow(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
              <strong>Satır {matchDialogRow.row}:</strong> {matchDialogRow.student_name || matchDialogRow.student_id}
              {matchDialogRow.matched_student_id && (
                <span style={{ marginLeft: 8, color: '#16a34a' }}>→ {matchDialogRow.matched_student_name}</span>
              )}
            </div>
            <div style={{ padding: '12px 16px' }}>
              <input
                type="text"
                placeholder="Öğrenci adı, TC veya numara ile arayın…"
                value={searchQuery}
                onChange={e => handleSearchStudents(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }}
                autoFocus
              />
              {error && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>
                  ⚠️ {error}
                </div>
              )}
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto', padding: '0 16px 12px' }}>
              {searching && <div style={{ textAlign: 'center', padding: 8, color: 'var(--text-secondary)', fontSize: 13 }}>Aranıyor…</div>}
              {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: 12, color: 'var(--text-secondary)', fontSize: 13 }}>Sonuç bulunamadı</div>
              )}
              {searchResults.map(stu => (
                <div
                  key={stu.id}
                  className={s.matchSearchItem}
                  onClick={() => handleMatchStudent(matchDialogRow.id, stu.id)}
                >
                  <div style={{ fontWeight: 500 }}>{stu.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    No: {stu.id} {stu.tc_kimlik_no && `• TC: ${stu.tc_kimlik_no}`}
                  </div>
                </div>
              ))}
            </div>
            {matchDialogRow.matched_student_id && (
              <div style={{ padding: '8px 16px 12px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  className="btn-modern btn-secondary"
                  style={{ fontSize: 12, color: '#ef4444', width: '100%' }}
                  onClick={() => handleMatchStudent(matchDialogRow.id, null)}
                >
                  Eşleştirmeyi Kaldır
                </button>
              </div>
            )}
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
                {already && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>✓ [{already.start}–{already.end})</span>}
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
                        <span style={{ flex: 1, paddingLeft: opt.isSubSection ? 8 : 0 }}>
                          {opt.isSubSection ? `↳ ${opt.label}` : opt.label}
                          {qCount && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>({qCount} soru)</span>}
                        </span>
                        {already && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>✓ [{already.start}–{already.end})</span>}
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
