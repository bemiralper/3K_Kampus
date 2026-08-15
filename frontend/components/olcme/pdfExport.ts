/**
 * PDF Dışa Aktarma Modülü — Sınav Sonuçları
 *
 * jsPDF + jspdf-autotable ile profesyonel sıralama ve öğrenci listesi PDF'leri.
 * Türkçe karakter desteği (Roboto TTF font embed).
 * Kurum logosu, gelişmiş filtreleme, alan bazlı filtreleme.
 *
 * Referans: Ulti Yayınları PDF formatı (TEKPDF style)
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadJsPdf } from '@/lib/download-file';
import type { RankingItem, StudentAnalysis, RankingSectionInfo } from './types';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SABİTLER                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

export const ALAN_LABELS: Record<string, string> = {
  SAYISAL: 'Sayısal',
  SOZEL: 'Sözel',
  ESIT_AGIRLIK: 'Eşit Ağırlık',
};

/** AYT'de hangi alan hangi dersleri içerir */
export const AYT_ALAN_DERSLERI: Record<string, string[]> = {
  SAYISAL: ['Matematik', 'Fizik', 'Kimya', 'Biyoloji'],
  SOZEL: [
    'Türk Dili ve Edebiyatı', 'Edebiyat', 'TDE',
    'Tarih-1', 'Tarih 1', 'Coğrafya-1', 'Coğrafya 1',
    'Tarih-2', 'Tarih 2', 'Coğrafya-2', 'Coğrafya 2',
    'Felsefe Grubu', 'Felsefe', 'Din Kültürü', 'DKAB',
  ],
  ESIT_AGIRLIK: [
    'Matematik',
    'Türk Dili ve Edebiyatı', 'Edebiyat', 'TDE',
    'Tarih-1', 'Tarih 1', 'Coğrafya-1', 'Coğrafya 1',
  ],
};

export type SortField = 'net' | 'puan' | 'say' | 'ea' | 'soz' | 'kurum_sira';

export const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'puan', label: 'Puan (yüksek → düşük)' },
  { value: 'kurum_sira', label: 'Kurum Sırası' },
  { value: 'net', label: 'Toplam Net' },
  { value: 'say', label: 'SAY Puan' },
  { value: 'ea', label: 'EA Puan' },
  { value: 'soz', label: 'SÖZ Puan' },
];

export function sortOptionsForExam(examType?: string) {
  if (examType === 'YKS_AYT') return SORT_OPTIONS;
  return SORT_OPTIONS.filter(o => !['say', 'ea', 'soz'].includes(o.value));
}

const SORT_HEADER_LABELS: Record<SortField, string> = {
  puan: 'Puan',
  kurum_sira: 'Kurum sırası',
  net: 'Net',
  say: 'SAY puan',
  ea: 'EA puan',
  soz: 'SÖZ puan',
};

function sortHeaderLabel(field: SortField): string {
  return SORT_HEADER_LABELS[field] || field;
}

/* Renkler */
const PRIMARY = [2, 98, 167] as const;
const DARK = [15, 23, 42] as const;
const GRAY = [100, 116, 139] as const;
const LIGHT_BG = [241, 245, 249] as const;
const WHITE = [255, 255, 255] as const;
const AVG_ROW_BG = [220, 238, 255] as const;

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  FONT YÜKLEME (Roboto TTF → Türkçe karakter desteği)                       */
/* ═══════════════════════════════════════════════════════════════════════════ */

let fontLoadedPromise: Promise<{ regular: string; bold: string }> | null = null;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function loadFonts(): Promise<{ regular: string; bold: string }> {
  if (fontLoadedPromise) return fontLoadedPromise;
  fontLoadedPromise = (async () => {
    const [regularBuf, boldBuf] = await Promise.all([
      fetch('/fonts/Roboto-Regular.ttf').then(r => r.arrayBuffer()),
      fetch('/fonts/Roboto-Bold.ttf').then(r => r.arrayBuffer()),
    ]);
    return { regular: arrayBufferToBase64(regularBuf), bold: arrayBufferToBase64(boldBuf) };
  })();
  return fontLoadedPromise;
}

type LogoAsset = { dataUri: string; width: number; height: number };

function getImageDimensions(dataUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width || 1,
        height: img.naturalHeight || img.height || 1,
      });
    };
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUri;
  });
}

function fitLogoBox(naturalW: number, naturalH: number, maxW: number, maxH: number) {
  if (naturalW <= 0 || naturalH <= 0) return { width: maxW, height: maxH };
  const scale = Math.min(maxW / naturalW, maxH / naturalH);
  return { width: naturalW * scale, height: naturalH * scale };
}

async function loadLogoBase64(): Promise<LogoAsset | null> {
  try {
    const resp = await fetch('/img/beyaz-logo.png');
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const dataUri = 'data:image/png;base64,' + arrayBufferToBase64(buf);
    const dims = await getImageDimensions(dataUri);
    return { dataUri, ...dims };
  } catch { return null; }
}

function registerFonts(doc: jsPDF, fonts: { regular: string; bold: string }) {
  doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', fonts.bold);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SIRALAMA / FİLTRELEME YARDIMCILARI                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sortRankings(data: RankingItem[], field: SortField): RankingItem[] {
  const arr = [...data];
  switch (field) {
    case 'net':        arr.sort((a, b) => b.toplam_net - a.toplam_net); break;
    case 'puan':       arr.sort((a, b) => b.puan - a.puan); break;
    case 'say':        arr.sort((a, b) => (b.puan_turleri?.SAY?.puan ?? b.puan) - (a.puan_turleri?.SAY?.puan ?? a.puan)); break;
    case 'ea':         arr.sort((a, b) => (b.puan_turleri?.EA?.puan ?? b.puan) - (a.puan_turleri?.EA?.puan ?? a.puan)); break;
    case 'soz':        arr.sort((a, b) => (b.puan_turleri?.SOZ?.puan ?? b.puan) - (a.puan_turleri?.SOZ?.puan ?? a.puan)); break;
    case 'kurum_sira': arr.sort((a, b) => a.kurum_ici_sira - b.kurum_ici_sira); break;
  }
  return arr;
}

export function sortStudents(data: StudentAnalysis[], field: SortField): StudentAnalysis[] {
  const arr = [...data];
  switch (field) {
    case 'net':        arr.sort((a, b) => b.toplam_net - a.toplam_net); break;
    case 'puan':       arr.sort((a, b) => b.puan - a.puan); break;
    case 'say':        arr.sort((a, b) => (b.puan_turleri?.SAY?.puan ?? b.puan) - (a.puan_turleri?.SAY?.puan ?? a.puan)); break;
    case 'ea':         arr.sort((a, b) => (b.puan_turleri?.EA?.puan ?? b.puan) - (a.puan_turleri?.EA?.puan ?? a.puan)); break;
    case 'soz':        arr.sort((a, b) => (b.puan_turleri?.SOZ?.puan ?? b.puan) - (a.puan_turleri?.SOZ?.puan ?? a.puan)); break;
    case 'kurum_sira': arr.sort((a, b) => a.kurum_ici_sira - b.kurum_ici_sira); break;
  }
  return arr;
}

/** Bölüm adının belirli bir alan'a ait olup olmadığını kontrol eder */
export function isSectionForAlan(sectionName: string, alanKodu: string | null): boolean {
  if (!alanKodu) return true;
  const allowedNames = AYT_ALAN_DERSLERI[alanKodu];
  if (!allowedNames) return true;
  const lower = sectionName.toLowerCase();
  return allowedNames.some(n => lower.includes(n.toLowerCase()));
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PDF HEADER & FOOTER                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

function addPdfHeader(
  doc: jsPDF, logo: LogoAsset | null,
  examName: string, subtitle: string, filterInfo: string,
  katilim?: { kurs: number },
): number {
  const pw = doc.internal.pageSize.getWidth();
  const m = 10;
  const headerH = 22;

  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, headerH, 'F');

  let tx = m;
  if (logo) {
    try {
      const fitted = fitLogoBox(logo.width, logo.height, 28, 16);
      const logoY = (headerH - fitted.height) / 2;
      doc.addImage(logo.dataUri, 'PNG', m, logoY, fitted.width, fitted.height);
      tx = m + fitted.width + 4;
    } catch { /* */ }
  }

  doc.setFont('Roboto', 'bold');  doc.setFontSize(12); doc.setTextColor(...WHITE);
  doc.text(examName, tx, 10);
  doc.setFont('Roboto', 'normal'); doc.setFontSize(8);
  doc.text(subtitle, tx, 16);

  const now = new Date();
  doc.setFontSize(8);
  doc.text(now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }), pw - m, 10, { align: 'right' });
  doc.setFontSize(7);
  doc.text('3K Kampüs', pw - m, 16, { align: 'right' });

  let y = 26;
  if (katilim) {
    doc.setFont('Roboto', 'bold'); doc.setFontSize(7); doc.setTextColor(...PRIMARY);
    doc.text(`KATILIM — Kurs: ${katilim.kurs}`, pw - m, y, { align: 'right' });
  }
  if (filterInfo) {
    doc.setFont('Roboto', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(filterInfo, m, y);
    y += 5;
  } else if (katilim) { y += 5; }

  doc.setTextColor(...DARK);
  return y;
}

function addPdfFooter(doc: jsPDF) {
  const pc = doc.getNumberOfPages();
  for (let i = 1; i <= pc; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    const w = doc.internal.pageSize.getWidth();
    doc.setDrawColor(200, 200, 200); doc.line(10, h - 10, w - 10, h - 10);
    doc.setFont('Roboto', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text('3K Kampüs', 10, h - 6);
    doc.text(`Sayfa ${i} / ${pc}`, w / 2, h - 6, { align: 'center' });
    const now = new Date();
    doc.text(`${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`, w - 10, h - 6, { align: 'right' });
    doc.setTextColor(...DARK);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  FİLTRE SEÇENEKLERİ TİPLERİ                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

export interface PdfColumnConfig {
  visibleSections?: number[];
  showPuanTurleri: boolean;
  visiblePuanTurleri: ('SAY' | 'EA' | 'SOZ')[];
  showTahminiSiralama: boolean;
  showYuzdelikDilim: boolean;
  showKurumYuzdelik: boolean;
  showSubSections: boolean;
  showDYB: boolean;
  showSinif: boolean;
  /** Öğrenci No sütunu */
  showStudentId: boolean;
  /** Hangi alan: raw_student_id veya student_id */
  studentIdField: 'raw_student_id' | 'student_id';
  /** Kurs ortalaması satırı */
  showKursOrtalamasi: boolean;
  /** Grafik sayfası */
  showCharts: boolean;
}

export const DEFAULT_COLUMN_CONFIG: PdfColumnConfig = {
  visibleSections: undefined,
  showPuanTurleri: true,
  visiblePuanTurleri: ['SAY', 'EA', 'SOZ'],
  showTahminiSiralama: true,
  showYuzdelikDilim: true,
  showKurumYuzdelik: true,
  showSubSections: true,
  showDYB: true,
  showSinif: false,
  showStudentId: false,
  studentIdField: 'raw_student_id',
  showKursOrtalamasi: true,
  showCharts: true,
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Ortalama bilgileri tipi (backend'den gelir)                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

export interface SectionAvgInfo {
  avg_correct: number;
  avg_wrong: number;
  avg_net: number;
}

export interface SinifAvgInfo {
  student_count: number;
  avg_net: number;
  avg_puan: number;
  section_avgs: Record<string, SectionAvgInfo>;
  puan_turleri_avgs: Record<string, number>;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SIRALAMA TABLOSU PDF                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

export interface RankingsPdfOptions {
  examName: string;
  examType: string;
  rankings: RankingItem[];
  sections: RankingSectionInfo[];
  sortBy: SortField;
  alanFilter: string | null;
  sinifFilter: string | null;
  columns: PdfColumnConfig;
  referansYil: number;
  sectionAvgs?: Record<string, SectionAvgInfo>;
  avgScore?: number;
  avgNet?: number;
  puanTurleriAvgs?: Record<string, number>;
  sinifAvgs?: Record<string, SinifAvgInfo>;
}

export async function exportRankingsPdf(opts: RankingsPdfOptions) {
  const {
    examName, examType, rankings, sections,
    sortBy, alanFilter, sinifFilter, columns, referansYil,
    sectionAvgs, avgScore, avgNet, puanTurleriAvgs, sinifAvgs,
  } = opts;

  const hasPT = rankings.some(r => r.puan_turleri);
  const isAyt = examType === 'YKS_AYT';
  const [fonts, logo] = await Promise.all([loadFonts(), loadLogoBase64()]);

  // Filtre + Sıralama
  let filtered = [...rankings];
  if (alanFilter) filtered = filtered.filter(r => r.alan === alanFilter);
  if (sinifFilter) filtered = filtered.filter(r => r.sinif === sinifFilter);

  // Alan filtresi aktif + kurum_sira seçilmişse → alana uygun PT sıralaması uygula
  let effectiveSort = sortBy;
  if (alanFilter && sortBy === 'kurum_sira') {
    const alanSortMap: Record<string, SortField> = { SAYISAL: 'say', ESIT_AGIRLIK: 'ea', SOZEL: 'soz' };
    effectiveSort = alanSortMap[alanFilter] || sortBy;
  }
  filtered = sortRankings(filtered, effectiveSort);
  filtered.forEach((r, i) => { r.kurum_ici_sira = i + 1; });

  // ── Alan/ders düzeni (referans PDF gibi: alan → dersler) ──
  const mainSecs = sections.filter(s => !s.is_sub_section);
  const subMap: Record<number, RankingSectionInfo[]> = {};
  sections.filter(s => s.is_sub_section && s.parent_id).forEach(s => {
    if (!subMap[s.parent_id!]) subMap[s.parent_id!] = [];
    subMap[s.parent_id!].push(s);
  });

  /** Alanın soru sayısından derslerin soru sayısını çıkar */
  const getResidualQuestionCount = (main: RankingSectionInfo): number => {
    const subs = subMap[main.id];
    if (!subs || subs.length === 0) return main.question_count;
    const subTotal = subs.reduce((sum, sub) => sum + sub.question_count, 0);
    return main.question_count - subTotal;
  };

  /** Alanın D/Y/B/Net'inden derslerin verilerini çıkart (residual) */
  const getResidualData = (
    r: RankingItem, sec: RankingSectionInfo
  ): { net: number; correct: number; wrong: number; empty: number } | undefined => {
    const data = r.section_nets?.[String(sec.id)];
    if (!data) return undefined;
    if (sec.is_sub_section) return data;
    const subs = subMap[sec.id];
    if (!subs || subs.length === 0) return data;
    let subCorrect = 0, subWrong = 0, subEmpty = 0, subNet = 0;
    subs.forEach(sub => {
      const sd = r.section_nets?.[String(sub.id)];
      if (sd) { subCorrect += sd.correct; subWrong += sd.wrong; subEmpty += sd.empty; subNet += sd.net; }
    });
    return {
      correct: data.correct - subCorrect,
      wrong: data.wrong - subWrong,
      empty: data.empty - subEmpty,
      net: Math.round((data.net - subNet) * 100) / 100,
    };
  };

  const ordered: RankingSectionInfo[] = [];
  mainSecs.forEach(m => {
    const residual = getResidualQuestionCount(m);
    const subs = subMap[m.id] || [];
    // Dersler alanın tüm sorularını kaplıyorsa, alan sütunu atla
    const showMainCol = subs.length === 0 || residual > 0;
    if (showMainCol) ordered.push(m);
    subs.forEach(s => ordered.push(s));
  });

  let visible = columns.visibleSections
    ? ordered.filter(s => columns.visibleSections!.includes(s.id))
    : ordered;

  if (isAyt && alanFilter) {
    const matchedMain = new Set(
      visible.filter(s => !s.is_sub_section && isSectionForAlan(s.name, alanFilter)).map(s => s.id)
    );
    visible = visible.filter(s => s.is_sub_section ? matchedMain.has(s.parent_id!) : isSectionForAlan(s.name, alanFilter));
  }

  // ── Prefix sütunları ──
  const prefix: string[] = ['#'];
  if (columns.showStudentId) prefix.push('Ö.No');
  prefix.push('İsim');
  if (columns.showSinif) prefix.push('Sınıf');
  const PFX = prefix.length;

  // ── Puan Türleri — her biri Puan|Kurs|Genel  → 3 sütun  ──
  const showPT = isAyt && hasPT && columns.showPuanTurleri;
  const ptList = showPT ? columns.visiblePuanTurleri : [];

  // ── Suffix sütunları (toplamNet sonrası) ──
  // Suffix: [Toplam] [DYN|Net] ... [ptPuan ptKurs ptGenel]... [KurumPct] [TahSira] [TRPct]
  const suffixAfterPT: string[] = [];
  if (columns.showKurumYuzdelik) suffixAfterPT.push('K%');
  if (columns.showTahminiSiralama) suffixAfterPT.push(`Tah.Sıra (${referansYil})`);
  if (columns.showYuzdelikDilim) suffixAfterPT.push('TR%');

  // ═══ GROUP yapısı (DYB modunda) ═══
  type GI = { start: number; span: number; name: string; members: number };
  const groups: GI[] = [];
  const secStarts: number[] = [];
  const grpStarts: number[] = [];

  // DYB modunda flat visible sections listesi
  const flat: RankingSectionInfo[] = [];
  if (columns.showDYB) {
    const vMain = [...new Set(visible.map(s => s.is_sub_section ? s.parent_id! : s.id))];
    let ci = PFX;
    vMain.forEach(mid => {
      const ms = sections.find(s => s.id === mid);
      if (!ms) return;
      const kids = visible.filter(s => s.is_sub_section && s.parent_id === mid);
      const self = visible.some(s => s.id === mid);
      const mem: RankingSectionInfo[] = [];
      if (self) mem.push(ms);
      mem.push(...kids);
      if (!mem.length) return;
      groups.push({ start: ci, span: mem.length * 3, name: ms.name, members: mem.length });
      grpStarts.push(ci);
      mem.forEach(m => { secStarts.push(ci); flat.push(m); ci += 3; });
    });
  }
  const body_secs = columns.showDYB ? flat : visible;

  // Toplam sütun sayısı hesabı
  const secColCount = columns.showDYB ? body_secs.length * 3 : visible.length;
  const ptColCount = ptList.length * 3;
  const showTytPuan = !showPT;
  const tytPuanCols = showTytPuan ? 1 : 0;
  // Toplam col: PFX + secCols + 1(T.Net) + [Puan] + ptCols + suffixAfterPT
  const TOTAL = PFX + secColCount + 1 + tytPuanCols + ptColCount + suffixAfterPT.length;
  const TNET_COL = PFX + secColCount; // T.Net sütun indeksi
  const PUAN_COL = TNET_COL + 1;

  // ═══ HEADER satırları oluştur ═══
  let headRows: string[][];
  // Puan türü başlangıç sütunları
  const ptStarts: number[] = [];

  if (columns.showDYB) {
    // 3 satır: row0=alan grubu, row1=ders adı, row2=D/Y/Net
    const r0 = new Array(TOTAL).fill('');
    const r1 = new Array(TOTAL).fill('');
    const r2 = new Array(TOTAL).fill('');

    // Prefix
    for (let i = 0; i < PFX; i++) r2[i] = prefix[i];

    // Alan/Ders sütunları
    let ci = PFX;
    const vMain = [...new Set(visible.map(s => s.is_sub_section ? s.parent_id! : s.id))];
    vMain.forEach(mid => {
      const ms = sections.find(s => s.id === mid);
      if (!ms) return;
      const kids = visible.filter(s => s.is_sub_section && s.parent_id === mid);
      const self = visible.some(s => s.id === mid);
      const mem: RankingSectionInfo[] = [];
      if (self) mem.push(ms);
      mem.push(...kids);
      if (!mem.length) return;

      r0[ci] = ms.name; // alan adı (ilk sütuna, colSpan ile genişletilecek)
      mem.forEach(m => {
        // Soru sayısı: alan ise residual, ders ise kendi soru sayısı
        const qc = m.is_sub_section ? m.question_count : getResidualQuestionCount(m);
        const label = m.name.length > 10 ? m.name.substring(0, 9) + '.' : m.name;
        const sn = `${label} (${qc})`;
        r1[ci] = sn;
        r2[ci] = 'D'; r2[ci + 1] = 'Y'; r2[ci + 2] = 'Net';
        ci += 3;
      });
    });

    // T.Net + TYT Puan
    r2[TNET_COL] = 'T.Net';
    if (showTytPuan) r2[PUAN_COL] = 'Puan';

    // Puan Türleri
    let ptci = TNET_COL + 1 + tytPuanCols;
    ptList.forEach(pt => {
      ptStarts.push(ptci);
      r0[ptci] = pt;
      r1[ptci] = 'Puan'; r1[ptci + 1] = 'Kurs'; r1[ptci + 2] = 'Genel';
      ptci += 3;
    });

    // Son suffix
    suffixAfterPT.forEach((s, i) => { r2[ptci + i] = s; });

    headRows = [r0, r1, r2];
  } else {
    // Tek satır header
    const h: string[] = [...prefix];
    visible.forEach(s => {
      secStarts.push(h.length);
      if (!s.is_sub_section) grpStarts.push(h.length);
      const qc = s.is_sub_section ? s.question_count : getResidualQuestionCount(s);
      const label = s.name.length > 8 ? s.name.substring(0, 7) + '.' : s.name;
      h.push(`${label} (${qc})`);
    });
    h.push('T.Net');
    if (showTytPuan) h.push('Puan');
    ptList.forEach(pt => { ptStarts.push(h.length); h.push(pt, 'Kurs', 'Genel'); });
    suffixAfterPT.forEach(s => h.push(s));
    headRows = [h];
  }

  // ═══ PT Sıralama oluştur ═══
  const ptRank: Record<string, Map<number, number>> = {};
  ptList.forEach(pt => {
    const s = [...filtered].filter(r => r.puan_turleri?.[pt]?.puan != null)
      .sort((a, b) => (b.puan_turleri?.[pt]?.puan ?? 0) - (a.puan_turleri?.[pt]?.puan ?? 0));
    const m = new Map<number, number>();
    s.forEach((r, i) => m.set(r.answer_id, i + 1));
    ptRank[pt] = m;
  });

  // ═══ BODY satırları ═══
  const bodyData: string[][] = [];

  // — Kurs Ortalaması satırı —
  const showAvgRow = columns.showKursOrtalamasi && !!sectionAvgs;
  if (showAvgRow) {
    const row = new Array(TOTAL).fill('');
    const nameCol = columns.showStudentId ? 2 : 1;
    row[nameCol] = 'Kurs Ortalaması';

    let ci = PFX;
    body_secs.forEach(sec => {
      let a = sectionAvgs![String(sec.id)];
      // Alan ise derslerin ort'larını çıkar (residual)
      if (a && !sec.is_sub_section && subMap[sec.id]?.length) {
        let subC = 0, subW = 0, subN = 0;
        subMap[sec.id].forEach(sub => {
          const sa = sectionAvgs![String(sub.id)];
          if (sa) { subC += sa.avg_correct; subW += sa.avg_wrong; subN += sa.avg_net; }
        });
        a = {
          avg_correct: Math.round((a.avg_correct - subC) * 10) / 10,
          avg_wrong: Math.round((a.avg_wrong - subW) * 10) / 10,
          avg_net: Math.round((a.avg_net - subN) * 100) / 100,
        };
      }
      if (columns.showDYB) {
        if (a) { row[ci] = String(a.avg_correct); row[ci + 1] = String(a.avg_wrong); row[ci + 2] = a.avg_net.toFixed(2); }
        ci += 3;
      } else {
        if (a) row[ci] = a.avg_net.toFixed(2);
        ci++;
      }
    });

    row[TNET_COL] = avgNet ? avgNet.toFixed(2) : '';
    if (showTytPuan) row[PUAN_COL] = avgScore != null ? avgScore.toFixed(2) : '';

    let pci = TNET_COL + 1 + tytPuanCols;
    ptList.forEach(pt => {
      row[pci] = puanTurleriAvgs?.[pt] ? puanTurleriAvgs[pt].toFixed(2) : '';
      pci += 3;
    });

    bodyData.push(row);
  }

  const avgRowCnt = showAvgRow ? 1 : 0;

  // — Öğrenci satırları —
  filtered.forEach((r, idx) => {
    const row = new Array(TOTAL).fill('');
    let c = 0;
    // Sıralama seçimine göre sıra numarası: EA/SÖZ vb. seçiliyse 1'den başla
    row[c++] = String(effectiveSort === 'kurum_sira' ? r.kurum_ici_sira : idx + 1);
    if (columns.showStudentId) {
      row[c++] = columns.studentIdField === 'raw_student_id' ? (r.raw_student_id || '') : (r.student_id ? String(r.student_id) : '');
    }
    row[c++] = r.student_name;
    if (columns.showSinif) row[c++] = r.sinif || '';

    // Ders netleri (alan ise dersler çıkarılmış residual kullan)
    body_secs.forEach(sec => {
      const d = getResidualData(r, sec);
      if (columns.showDYB) {
        if (d && (d.correct > 0 || d.wrong > 0)) {
          row[c] = String(d.correct);
          row[c + 1] = String(d.wrong);
          row[c + 2] = d.net.toFixed(2);
        }
        // else boş bırak (girmediği alan/ders)
        c += 3;
      } else {
        if (d && (d.correct > 0 || d.wrong > 0)) row[c] = d.net.toFixed(2);
        c++;
      }
    });

    // T.Net + TYT Puan
    row[TNET_COL] = r.toplam_net.toFixed(2);
    if (showTytPuan) row[PUAN_COL] = r.puan != null ? String(r.puan) : '';

    // Puan türleri: Puan | Kurs Sıra | Genel Tahmini Sıra (alan-bazlı)
    let pci = TNET_COL + 1 + tytPuanCols;
    ptList.forEach(pt => {
      const ptInfo = r.puan_turleri?.[pt];
      row[pci] = ptInfo?.puan != null ? String(ptInfo.puan) : '';
      row[pci + 1] = ptRank[pt]?.get(r.answer_id) != null ? String(ptRank[pt].get(r.answer_id)) : '';
      // Genel sıralama: alan-bazlı tahmini_siralama
      const genelSira = ptInfo?.tahmini_siralama ?? r.tahmini_siralama;
      row[pci + 2] = genelSira ? genelSira.toLocaleString('tr-TR') : '';
      pci += 3;
    });

    // Son suffix
    let sci = TNET_COL + 1 + tytPuanCols + ptColCount;
    if (columns.showKurumYuzdelik) row[sci++] = `%${r.kurum_ici_yuzdelik}`;
    if (columns.showTahminiSiralama) row[sci++] = r.tahmini_siralama ? r.tahmini_siralama.toLocaleString('tr-TR') : '';
    if (columns.showYuzdelikDilim) row[sci++] = r.yuzdelik_dilim ? `%${r.yuzdelik_dilim}` : '';

    bodyData.push(row);
  });

  // ═══ PDF oluştur ═══
  const parts: string[] = [];
  if (alanFilter) parts.push(`Alan: ${ALAN_LABELS[alanFilter] || alanFilter}`);
  if (sinifFilter) parts.push(`Sınıf: ${sinifFilter}`);
  parts.push(`Tahmini sıralama yılı: ${referansYil}`);
  parts.push(`Sıralama: ${sortHeaderLabel(effectiveSort)}`);
  parts.push(`${filtered.length} öğrenci`);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  registerFonts(doc, fonts);

  const tl = examType === 'YKS_TYT' ? 'TYT' : examType === 'YKS_AYT' ? 'AYT' : examType;
  const startY = addPdfHeader(doc, logo, examName, `${tl} Sıralama (${sortHeaderLabel(effectiveSort)} sıralı)`, parts.join('  ·  '), { kurs: filtered.length });

  // Lookup setleri
  const grpSet = new Set(grpStarts);
  const secSet = new Set(secStarts);
  const grpMap = new Map(groups.map(g => [g.start, g]));
  const col2grp = new Map<number, GI>();
  groups.forEach(g => { for (let i = g.start; i < g.start + g.span; i++) col2grp.set(i, g); });
  const ptStartSet = new Set(ptStarts);
  const ptStartMap = new Map(ptStarts.map((s, i) => [s, ptList[i]]));

  // Alan/ders bölgesi sınırları
  const secEnd = TNET_COL; // alan/ders sütunları [PFX, secEnd)

  autoTable(doc, {
    startY,
    head: headRows,
    body: bodyData,
    styles: { font: 'Roboto', fontSize: 5.5, cellPadding: 1, overflow: 'linebreak' as const, textColor: [...DARK] },
    headStyles: { fillColor: [...PRIMARY], textColor: [...WHITE], fontSize: 5.5, fontStyle: 'bold', halign: 'center' as const, cellPadding: 1 },
    alternateRowStyles: { fillColor: [...LIGHT_BG] },
    columnStyles: { 0: { cellWidth: 7, halign: 'center' as const } },
    margin: { left: 3, right: 3, bottom: 15 },
    tableLineWidth: 0.1,
    tableLineColor: [200, 200, 200],

    didParseCell(data: any) {
      const ci = data.column.index;
      const ri = data.row.index;

      // ── Ortalama satırı stili ──
      if (data.section === 'body' && ri < avgRowCnt) {
        data.cell.styles.fillColor = [...AVG_ROW_BG];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 5;
        data.cell.styles.textColor = [...PRIMARY];
      }
      // İlk 3 öğrenci bold
      if (data.section === 'body' && ri >= avgRowCnt && ri < avgRowCnt + 3) {
        data.cell.styles.fontStyle = 'bold';
      }
      // İsim sütunu bold
      const nameC = columns.showStudentId ? 2 : 1;
      if (data.section === 'body' && ci === nameC) data.cell.styles.fontStyle = 'bold';

      // ═══ DYB 3-satır header logic ═══
      if (columns.showDYB && data.section === 'head') {
        if (ri === 0) {
          // Prefix → rowSpan=3
          if (ci < PFX) {
            data.cell.rowSpan = 3; data.cell.styles.valign = 'middle';
            data.cell.text = [headRows[2][ci]];
          }
          // Alan/ders bölgesi
          else if (ci >= PFX && ci < secEnd) {
            const g = grpMap.get(ci);
            if (g) {
              data.cell.colSpan = g.span;
              data.cell.styles.halign = 'center';
              if (g.members === 1) data.cell.rowSpan = 2;
            } else {
              data.cell.colSpan = 0;
            }
          }
          // T.Net / TYT Puan → rowSpan=3
          else if (ci === TNET_COL) {
            data.cell.rowSpan = 3; data.cell.styles.valign = 'middle';
            data.cell.text = ['T.Net'];
          }
          else if (showTytPuan && ci === PUAN_COL) {
            data.cell.rowSpan = 3; data.cell.styles.valign = 'middle';
            data.cell.text = ['Puan'];
          }
          // PT grup başlangıcı → colSpan=3
          else if (ptStartSet.has(ci)) {
            data.cell.colSpan = 3;
            data.cell.styles.halign = 'center';
          }
          // PT grubun geri kalan sütunları → gizle
          else if (ci >= TNET_COL + 1 + tytPuanCols && ci < TNET_COL + 1 + tytPuanCols + ptColCount) {
            // pt child mi?
            let isPtChild = false;
            for (const ps of ptStarts) { if (ci > ps && ci < ps + 3) { isPtChild = true; break; } }
            if (isPtChild) data.cell.colSpan = 0;
            else { data.cell.rowSpan = 3; data.cell.styles.valign = 'middle'; data.cell.text = [headRows[2][ci]]; }
          }
          // Son suffix → rowSpan=3
          else {
            data.cell.rowSpan = 3; data.cell.styles.valign = 'middle';
            data.cell.text = [headRows[2][ci]];
          }
        }

        if (ri === 1) {
          if (ci < PFX) { data.cell.colSpan = 0; }
          else if (ci >= PFX && ci < secEnd) {
            const g = col2grp.get(ci);
            if (g && g.members === 1) { data.cell.colSpan = 0; }
            else if (secSet.has(ci)) { data.cell.colSpan = 3; data.cell.styles.halign = 'center'; data.cell.styles.fontSize = 5; }
            else { data.cell.colSpan = 0; }
          }
          else if (ci === TNET_COL || (showTytPuan && ci === PUAN_COL)) { data.cell.colSpan = 0; }
          else if (ci >= TNET_COL + 1 + tytPuanCols && ci < TNET_COL + 1 + tytPuanCols + ptColCount) {
            // PT satır1: Puan|Kurs|Genel — her hücre kendi başına
          }
          else { data.cell.colSpan = 0; }
        }

        if (ri === 2) {
          if (ci < PFX) { data.cell.colSpan = 0; }
          else if (ci === TNET_COL || (showTytPuan && ci === PUAN_COL)) { data.cell.colSpan = 0; }
          // PT area satır2 → gizle (row0+row1'de dolu)
          else if (ci >= TNET_COL + 1 + tytPuanCols && ci < TNET_COL + 1 + tytPuanCols + ptColCount) { data.cell.colSpan = 0; }
          // Son suffix → gizle (row0'da rowSpan=3)
          else if (ci >= TNET_COL + 1 + tytPuanCols + ptColCount) { data.cell.colSpan = 0; }
        }
      }

      // ═══ Dikey çizgiler ═══
      if (grpSet.has(ci)) {
        data.cell.styles.lineWidth = { left: 0.4 };
        data.cell.styles.lineColor = { left: [120, 120, 120] };
      } else if (secSet.has(ci) && ci >= PFX && ci < secEnd) {
        data.cell.styles.lineWidth = { left: 0.15 };
        data.cell.styles.lineColor = { left: [200, 200, 200] };
      }
      if (ci === TNET_COL) {
        data.cell.styles.lineWidth = { left: 0.5 };
        data.cell.styles.lineColor = { left: [60, 60, 60] };
      }
      if (ptStartSet.has(ci)) {
        data.cell.styles.lineWidth = { left: 0.3 };
        data.cell.styles.lineColor = { left: [120, 120, 120] };
      }
    },
  });

  // ═══ GRAFİK SAYFASI ═══
  if (columns.showCharts && body_secs.length > 0 && sectionAvgs) {
    drawChartPage(doc, fonts, body_secs, sectionAvgs, sinifAvgs, avgScore, puanTurleriAvgs, isAyt, examName, tl, referansYil);
  }

  addPdfFooter(doc);
  const filename = `${examName}_Siralama_${alanFilter || 'Tumu'}_${new Date().toISOString().slice(0, 10)}.pdf`.replace(/\s+/g, '_');
  await downloadJsPdf(doc, filename);
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  GRAFİK SAYFASI                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

type ChartItem = { label: string; value: number };
type ChartKind = 'net' | 'puan' | 'sinif';
type ChartCard = { title: string; items: ChartItem[]; kind: ChartKind };

function drawChartPage(
  doc: jsPDF, _fonts: { regular: string; bold: string },
  secs: RankingSectionInfo[],
  secAvgs: Record<string, SectionAvgInfo>,
  sinifAvgs: Record<string, SinifAvgInfo> | undefined,
  _avgScore: number | undefined,
  ptAvgs: Record<string, number> | undefined,
  isAyt: boolean,
  examName: string, typeLabel: string,
  referansYil: number,
) {
  doc.addPage('a4', 'landscape');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 12;
  const headerH = 20;
  const footerH = 12;

  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, headerH, 'F');
  doc.setFillColor(14, 165, 233);
  doc.rect(0, headerH, pw, 1.2, 'F');
  doc.setFont('Roboto', 'bold'); doc.setFontSize(12); doc.setTextColor(...WHITE);
  const title = `${examName} — İstatistik Grafikleri`;
  doc.text(title.length > 72 ? title.slice(0, 70) + '…' : title, m, 9);
  doc.setFont('Roboto', 'normal'); doc.setFontSize(8);
  doc.setTextColor(186, 230, 253);
  doc.text(`${typeLabel}  ·  Tahmini sıralama yılı: ${referansYil}`, m, 16);

  const contentTop = headerH + 8;
  const contentH = ph - footerH - 4 - contentTop;
  const contentW = pw - 2 * m;
  const gap = 5;

  const cards: ChartCard[] = [{
    title: 'Test Bazlı Net Ortalamaları',
    kind: 'net',
    items: secs.map(s => ({
      label: s.name,
      value: secAvgs[String(s.id)]?.avg_net ?? 0,
    })),
  }];

  if (isAyt && ptAvgs && Object.keys(ptAvgs).length > 0) {
    cards.push({
      title: 'Puan Türü Ortalamaları',
      kind: 'puan',
      items: Object.keys(ptAvgs).map(k => ({ label: k, value: ptAvgs[k] ?? 0 })),
    });
  }

  if (sinifAvgs && Object.keys(sinifAvgs).length > 1) {
    cards.push({
      title: 'Şube Karşılaştırma (Ort. Net)',
      kind: 'sinif',
      items: Object.keys(sinifAvgs).sort().map(k => ({
        label: `${k} (${sinifAvgs[k].student_count})`,
        value: sinifAvgs[k].avg_net,
      })),
    });
  }

  type Rect = { x: number; y: number; w: number; h: number };
  let rects: Rect[] = [];
  if (cards.length === 1) {
    rects = [{ x: m, y: contentTop, w: contentW, h: contentH }];
  } else if (cards.length === 2) {
    const hw = (contentW - gap) / 2;
    rects = [
      { x: m, y: contentTop, w: hw, h: contentH },
      { x: m + hw + gap, y: contentTop, w: hw, h: contentH },
    ];
  } else {
    const topH = contentH * 0.48;
    const botH = contentH - topH - gap;
    const hw = (contentW - gap) / 2;
    rects = [
      { x: m, y: contentTop, w: contentW, h: topH },
      { x: m, y: contentTop + topH + gap, w: hw, h: botH },
      { x: m + hw + gap, y: contentTop + topH + gap, w: hw, h: botH },
    ];
  }

  cards.forEach((card, i) => drawStatCard(doc, rects[i], card));
}

function drawStatCard(doc: jsPDF, rect: { x: number; y: number; w: number; h: number }, card: ChartCard) {
  const { x, y, w, h } = rect;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(x + 0.5, y + 0.5, w, h, 2.4, 2.4, 'F');
  doc.setFillColor(...WHITE);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 2.4, 2.4, 'FD');
  doc.setFillColor(...PRIMARY);
  doc.rect(x, y, 2.2, h, 'F');

  doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(...DARK);
  doc.text(card.title, x + 8, y + 7);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(x + 8, y + 10, x + w - 5, y + 10);

  drawHBars(doc, x + 8, y + 13, w - 14, h - 18, card.items, card.kind);
}

function drawHBars(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  items: ChartItem[], kind: ChartKind,
) {
  if (!items.length || h < 8 || w < 40) return;
  const twoCol = items.length > 8 && w > 150;
  const colGap = 8;
  const colW = twoCol ? (w - colGap) / 2 : w;
  const colCount = twoCol ? 2 : 1;
  const perCol = Math.ceil(items.length / colCount);
  const rowH = Math.min(14, h / perCol);
  const fontSize = rowH >= 12 ? 7 : rowH >= 9 ? 6 : 5;
  const maxV = Math.max(...items.map(it => it.value), kind === 'puan' ? 100 : 1);
  const labelW = Math.min(40, colW * 0.30);
  const valW = 14;
  const barW = Math.max(20, colW - labelW - valW - 3);
  const trackH = Math.min(5.5, Math.max(3, rowH - 5));
  const ptColors: Record<string, number[]> = { SAY: [220, 38, 38], EA: [202, 138, 4], SOZ: [22, 163, 74] };
  const sinifColors = [[59, 130, 246], [249, 115, 22], [16, 185, 129], [139, 92, 246], [236, 72, 153]];

  items.forEach((it, i) => {
    const col = twoCol ? Math.floor(i / perCol) : 0;
    const row = twoCol ? i % perCol : i;
    const bx = x + col * (colW + colGap);
    const by = y + row * rowH;
    if (by + trackH > y + h) return;

    doc.setFont('Roboto', 'normal'); doc.setFontSize(fontSize); doc.setTextColor(...DARK);
    const lbl = it.label.length > 16 ? it.label.substring(0, 15) + '.' : it.label;
    doc.text(lbl, bx, by + rowH * 0.62);

    const trackY = by + (rowH - trackH) / 2;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(bx + labelW, trackY, barW, trackH, 1.1, 1.1, 'F');
    const fill = it.value > 0 ? Math.max((it.value / maxV) * barW, 1.4) : 0;
    if (fill > 0) {
      let c = [2, 132, 199];
      if (kind === 'puan') c = ptColors[it.label] || c;
      if (kind === 'sinif') c = sinifColors[i % sinifColors.length];
      doc.setFillColor(c[0], c[1], c[2]);
      doc.roundedRect(bx + labelW, trackY, fill, trackH, 1.1, 1.1, 'F');
    }

    doc.setFont('Roboto', 'bold'); doc.setFontSize(fontSize);
    doc.setTextColor(...PRIMARY);
    doc.text(it.value.toFixed(1), bx + labelW + barW + 2, by + rowH * 0.62);
  });
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ÖĞRENCİ LİSTESİ PDF                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

export interface StudentsPdfOptions {
  examName: string;
  examType: string;
  students: StudentAnalysis[];
  sortBy: SortField;
  alanFilter: string | null;
  sinifFilter: string | null;
  columns: PdfColumnConfig;
}

export async function exportStudentsPdf(opts: StudentsPdfOptions) {
  const { examName, examType, students, sortBy, alanFilter, sinifFilter, columns } = opts;
  const [fonts, logo] = await Promise.all([loadFonts(), loadLogoBase64()]);

  let filtered = [...students];
  if (alanFilter) filtered = filtered.filter(st => st.alan === alanFilter);
  if (sinifFilter) filtered = filtered.filter(st => st.sinif === sinifFilter);

  // Alan filtresi aktif + kurum_sira seçilmişse → alana uygun PT sıralaması uygula
  let effectiveSort = sortBy;
  if (alanFilter && sortBy === 'kurum_sira') {
    const alanSortMap: Record<string, SortField> = { SAYISAL: 'say', ESIT_AGIRLIK: 'ea', SOZEL: 'soz' };
    effectiveSort = alanSortMap[alanFilter] || sortBy;
  }
  filtered = sortStudents(filtered, effectiveSort);
  filtered.forEach((st, i) => { st.kurum_ici_sira = i + 1; });

  const hasPT = filtered.some(st => st.puan_turleri);
  const isAyt = examType === 'YKS_AYT';

  const heads: string[] = ['#'];
  if (columns.showStudentId) heads.push('Ö.No');
  heads.push('Öğrenci');
  if (columns.showSinif) heads.push('Sınıf');
  if (columns.showDYB) heads.push('D', 'Y', 'B');
  heads.push('Net', 'Puan');
  if (isAyt && hasPT && columns.showPuanTurleri) columns.visiblePuanTurleri.forEach(pt => heads.push(pt));
  if (columns.showKurumYuzdelik) heads.push('Kurum %');
  if (columns.showTahminiSiralama) heads.push('Tah. Sıra');
  if (columns.showYuzdelikDilim) heads.push('TR %');
  heads.push('Güçlü', 'Zayıf');

  const body = filtered.map(st => {
    const row: string[] = [String(st.kurum_ici_sira)];
    if (columns.showStudentId) row.push(st.raw_student_id || '—');
    row.push(st.student_name);
    if (columns.showSinif) row.push(st.sinif || '—');
    if (columns.showDYB) row.push(String(st.total_correct), String(st.total_wrong), String(st.total_empty));
    row.push(st.toplam_net.toFixed(2), String(st.puan));
    if (isAyt && hasPT && columns.showPuanTurleri) {
      columns.visiblePuanTurleri.forEach(pt => {
        const val = st.puan_turleri?.[pt as 'SAY' | 'EA' | 'SOZ']?.puan;
        row.push(val != null ? String(val) : '—');
      });
    }
    if (columns.showKurumYuzdelik) row.push(`%${st.kurum_ici_yuzdelik}`);
    if (columns.showTahminiSiralama) row.push(st.tahmini_siralama ? st.tahmini_siralama.toLocaleString('tr-TR') : '—');
    if (columns.showYuzdelikDilim) row.push(st.yuzdelik_dilim ? `%${st.yuzdelik_dilim}` : '—');
    row.push(st.strong_areas.map(a => a.name).join(', ') || '—', st.weak_areas.map(a => a.name).join(', ') || '—');
    return row;
  });

  const parts: string[] = [];
  if (alanFilter) parts.push(`Alan: ${ALAN_LABELS[alanFilter] || alanFilter}`);
  if (sinifFilter) parts.push(`Sınıf: ${sinifFilter}`);
  parts.push(`Sıralama: ${SORT_OPTIONS.find(o => o.value === sortBy)?.label || sortBy}`);
  parts.push(`${filtered.length} öğrenci`);

  const doc = new jsPDF({
    orientation: (isAyt && hasPT && columns.showPuanTurleri) ? 'landscape' : 'portrait',
    unit: 'mm', format: 'a4',
  });
  registerFonts(doc, fonts);

  const tl = examType === 'YKS_TYT' ? 'TYT' : examType === 'YKS_AYT' ? 'AYT' : examType;
  const startY = addPdfHeader(doc, logo, examName, `${tl} Öğrenci Listesi`, parts.join('  ·  '));

  autoTable(doc, {
    startY,
    head: [heads],
    body,
    styles: { font: 'Roboto', fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' as const, textColor: [...DARK] },
    headStyles: { fillColor: [...PRIMARY], textColor: [...WHITE], fontSize: 7, fontStyle: 'bold', halign: 'center' as const },
    alternateRowStyles: { fillColor: [...LIGHT_BG] },
    columnStyles: { 0: { cellWidth: 8, halign: 'center' as const }, 1: { fontStyle: 'bold' } },
    margin: { left: 5, right: 5, bottom: 15 },
  });

  addPdfFooter(doc);
  const filename = `${examName}_Ogrenciler_${alanFilter || 'Tumu'}_${new Date().toISOString().slice(0, 10)}.pdf`.replace(/\s+/g, '_');
  await downloadJsPdf(doc, filename);
}
