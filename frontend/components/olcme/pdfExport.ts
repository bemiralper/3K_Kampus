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
  { value: 'kurum_sira', label: 'Kurum Sırası' },
  { value: 'net', label: 'Toplam Net' },
  { value: 'puan', label: 'TYT / SAY Puan' },
  { value: 'say', label: 'SAY Puan' },
  { value: 'ea', label: 'EA Puan' },
  { value: 'soz', label: 'SÖZ Puan' },
];

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

async function loadLogoBase64(): Promise<string | null> {
  try {
    const resp = await fetch('/img/3k-logo.png');
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    return 'data:image/png;base64,' + arrayBufferToBase64(buf);
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

function sortStudents(data: StudentAnalysis[], field: SortField): StudentAnalysis[] {
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
  doc: jsPDF, logo: string | null,
  examName: string, subtitle: string, filterInfo: string,
  katilim?: { kurs: number },
): number {
  const pw = doc.internal.pageSize.getWidth();
  const m = 10;

  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, 22, 'F');

  let tx = m;
  if (logo) { try { doc.addImage(logo, 'PNG', m, 2.5, 17, 17); tx = m + 20; } catch { /* */ } }

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
  if (columns.showTahminiSiralama) suffixAfterPT.push('Tah.Sıra');
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
  // Toplam col: PFX + secCols + 1(T.Net) + ptCols + suffixAfterPT
  const TOTAL = PFX + secColCount + 1 + ptColCount + suffixAfterPT.length;
  const TNET_COL = PFX + secColCount; // T.Net sütun indeksi

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

    // T.Net
    r2[TNET_COL] = 'T.Net';

    // Puan Türleri
    let ptci = TNET_COL + 1;
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

    let pci = TNET_COL + 1;
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

    // T.Net
    row[TNET_COL] = r.toplam_net.toFixed(2);

    // Puan türleri: Puan | Kurs Sıra | Genel Tahmini Sıra (alan-bazlı)
    let pci = TNET_COL + 1;
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
    let sci = TNET_COL + 1 + ptColCount;
    if (columns.showKurumYuzdelik) row[sci++] = `%${r.kurum_ici_yuzdelik}`;
    if (columns.showTahminiSiralama) row[sci++] = r.tahmini_siralama ? r.tahmini_siralama.toLocaleString('tr-TR') : '';
    if (columns.showYuzdelikDilim) row[sci++] = r.yuzdelik_dilim ? `%${r.yuzdelik_dilim}` : '';

    bodyData.push(row);
  });

  // ═══ PDF oluştur ═══
  const parts: string[] = [];
  if (alanFilter) parts.push(`Alan: ${ALAN_LABELS[alanFilter] || alanFilter}`);
  if (sinifFilter) parts.push(`Sınıf: ${sinifFilter}`);
  parts.push(`Sıralama: ${SORT_OPTIONS.find(o => o.value === effectiveSort)?.label || effectiveSort}`);
  parts.push(`${filtered.length} öğrenci`);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  registerFonts(doc, fonts);

  const tl = examType === 'YKS_TYT' ? 'TYT' : examType === 'YKS_AYT' ? 'AYT' : examType;
  const sl = SORT_OPTIONS.find(o => o.value === effectiveSort)?.label || '';
  const startY = addPdfHeader(doc, logo, examName, `${tl} Sıralama (${sl} sıralı)`, parts.join('  ·  '), { kurs: filtered.length });

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
          // T.Net → rowSpan=3
          else if (ci === TNET_COL) {
            data.cell.rowSpan = 3; data.cell.styles.valign = 'middle';
            data.cell.text = ['T.Net'];
          }
          // PT grup başlangıcı → colSpan=3
          else if (ptStartSet.has(ci)) {
            data.cell.colSpan = 3;
            data.cell.styles.halign = 'center';
          }
          // PT grubun geri kalan sütunları → gizle
          else if (ci > TNET_COL && ci < TNET_COL + 1 + ptColCount) {
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
          else if (ci === TNET_COL) { data.cell.colSpan = 0; }
          else if (ci > TNET_COL && ci < TNET_COL + 1 + ptColCount) {
            // PT satır1: Puan|Kurs|Genel — her hücre kendi başına
          }
          else { data.cell.colSpan = 0; }
        }

        if (ri === 2) {
          if (ci < PFX) { data.cell.colSpan = 0; }
          else if (ci === TNET_COL) { data.cell.colSpan = 0; }
          // PT area satır2 → gizle (row0+row1'de dolu)
          else if (ci > TNET_COL && ci < TNET_COL + 1 + ptColCount) { data.cell.colSpan = 0; }
          // Son suffix → gizle (row0'da rowSpan=3)
          else if (ci >= TNET_COL + 1 + ptColCount) { data.cell.colSpan = 0; }
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
    drawChartPage(doc, fonts, body_secs, sectionAvgs, sinifAvgs, avgScore, puanTurleriAvgs, isAyt, examName, tl);
  }

  addPdfFooter(doc);
  doc.save(`${examName}_Siralama_${alanFilter || 'Tumu'}_${new Date().toISOString().slice(0, 10)}.pdf`.replace(/\s+/g, '_'));
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  GRAFİK SAYFASI                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

function drawChartPage(
  doc: jsPDF, _fonts: { regular: string; bold: string },
  secs: RankingSectionInfo[],
  secAvgs: Record<string, SectionAvgInfo>,
  sinifAvgs: Record<string, SinifAvgInfo> | undefined,
  avgScore: number | undefined,
  ptAvgs: Record<string, number> | undefined,
  isAyt: boolean,
  examName: string, typeLabel: string,
) {
  doc.addPage('a4', 'landscape');
  const pw = doc.internal.pageSize.getWidth();
  const m = 10;

  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, 14, 'F');
  doc.setFont('Roboto', 'bold'); doc.setFontSize(10); doc.setTextColor(...WHITE);
  doc.text(`${examName} — İstatistik Grafikleri`, m, 9);

  let y = 22;
  const cw = pw - 2 * m;

  // ── 1. ALAN/DERS NET ORTALAMALARI ──
  doc.setFont('Roboto', 'bold'); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text('TEST BAZLI NET ORTALAMALARI', m, y);
  y += 4;

  const names = secs.map(s => s.name);
  const vals = names.map(n => secAvgs[n]?.avg_net ?? 0);
  const mx = Math.max(...vals, 1);
  const bh = 35;
  const bw = Math.min(cw / (names.length * 1.4 + 0.5), 16);
  const gap = bw * 0.4;
  const tw = names.length * bw + (names.length - 1) * gap;
  const sx = m + (cw - tw) / 2;

  // Grid
  doc.setDrawColor(230, 230, 230);
  for (let i = 0; i <= 4; i++) {
    const gy = y + bh - (bh / 4) * i;
    doc.line(m, gy, m + cw, gy);
    doc.setFont('Roboto', 'normal'); doc.setFontSize(4.5); doc.setTextColor(...GRAY);
    doc.text(((mx / 4) * i).toFixed(0), m - 1, gy + 1, { align: 'right' });
  }

  names.forEach((nm, i) => {
    const v = vals[i];
    const h = (v / mx) * bh;
    const x = sx + i * (bw + gap);
    doc.setFillColor(2, 132, 199);
    doc.rect(x, y + bh - h, bw, h, 'F');
    doc.setFont('Roboto', 'bold'); doc.setFontSize(4); doc.setTextColor(...DARK);
    doc.text(v.toFixed(1), x + bw / 2, y + bh - h - 1, { align: 'center' });
    doc.setFont('Roboto', 'normal'); doc.setFontSize(3.5); doc.setTextColor(...GRAY);
    const sn = nm.length > 10 ? nm.substring(0, 9) + '.' : nm;
    doc.text(sn, x + bw / 2, y + bh + 3, { align: 'center' });
  });

  y += bh + 12;

  // ── 2. PUAN ORT. ──
  if (isAyt && ptAvgs && Object.keys(ptAvgs).length > 0) {
    doc.setFont('Roboto', 'bold'); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text('PUAN TÜRÜ ORTALAMALARI', m, y);
    y += 4;

    const pn = Object.keys(ptAvgs);
    const pv = pn.map(k => ptAvgs[k] ?? 0);
    const pm = Math.max(...pv, 100);
    const pbw = 20; const pg = 15; const pbh = 28;
    const ptw = pn.length * pbw + (pn.length - 1) * pg;
    const psx = m + (cw - ptw) / 2;

    doc.setDrawColor(230, 230, 230);
    for (let i = 0; i <= 4; i++) {
      const gy = y + pbh - (pbh / 4) * i;
      doc.line(m, gy, m + cw, gy);
      doc.setFont('Roboto', 'normal'); doc.setFontSize(4.5); doc.setTextColor(...GRAY);
      doc.text(((pm / 4) * i).toFixed(0), m - 1, gy + 1, { align: 'right' });
    }

    const ptColors: Record<string, number[]> = { SAY: [220, 38, 38], EA: [234, 179, 8], SOZ: [34, 197, 94] };
    pn.forEach((k, i) => {
      const v = pv[i];
      const h = (v / pm) * pbh;
      const x = psx + i * (pbw + pg);
      const c = ptColors[k] || [2, 132, 199];
      doc.setFillColor(c[0], c[1], c[2]);
      doc.rect(x, y + pbh - h, pbw, h, 'F');
      doc.setFont('Roboto', 'bold'); doc.setFontSize(5); doc.setTextColor(...DARK);
      doc.text(v.toFixed(1), x + pbw / 2, y + pbh - h - 1.5, { align: 'center' });
      doc.setFont('Roboto', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...GRAY);
      doc.text(k, x + pbw / 2, y + pbh + 4, { align: 'center' });
    });

    y += pbh + 14;
  }

  // ── 3. ŞUBE KARŞILAŞTIRMA ──
  if (sinifAvgs && Object.keys(sinifAvgs).length > 1) {
    doc.setFont('Roboto', 'bold'); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text('ŞUBE KARŞILAŞTIRMA (Ortalama Net)', m, y);
    y += 4;

    const sn2 = Object.keys(sinifAvgs).sort();
    const sv = sn2.map(k => sinifAvgs[k].avg_net);
    const sm = Math.max(...sv, 1);
    const sbw2 = Math.min(cw / (sn2.length * 1.5 + 0.5), 22);
    const sg = sbw2 * 0.4; const sbh = 25;
    const stw = sn2.length * sbw2 + (sn2.length - 1) * sg;
    const ssx = m + (cw - stw) / 2;

    doc.setDrawColor(230, 230, 230);
    for (let i = 0; i <= 4; i++) { const gy = y + sbh - (sbh / 4) * i; doc.line(m, gy, m + cw, gy); }

    const sc = [[59, 130, 246], [249, 115, 22], [16, 185, 129], [139, 92, 246], [236, 72, 153]];
    sn2.forEach((k, i) => {
      const v = sv[i]; const h = (v / sm) * sbh;
      const x = ssx + i * (sbw2 + sg); const clr = sc[i % sc.length];
      doc.setFillColor(clr[0], clr[1], clr[2]);
      doc.rect(x, y + sbh - h, sbw2, h, 'F');
      doc.setFont('Roboto', 'bold'); doc.setFontSize(4.5); doc.setTextColor(...DARK);
      doc.text(v.toFixed(1), x + sbw2 / 2, y + sbh - h - 1, { align: 'center' });
      doc.setFont('Roboto', 'normal'); doc.setFontSize(4); doc.setTextColor(...GRAY);
      doc.text(k.length > 8 ? k.substring(0, 7) + '.' : k, x + sbw2 / 2, y + sbh + 3, { align: 'center' });
      doc.setFontSize(3);
      doc.text(`(${sinifAvgs[k].student_count} öğr.)`, x + sbw2 / 2, y + sbh + 6, { align: 'center' });
    });

    y += sbh + 10;
    let lx = m;
    doc.setFont('Roboto', 'normal'); doc.setFontSize(5);
    sn2.forEach((k, i) => {
      const clr = sc[i % sc.length];
      doc.setFillColor(clr[0], clr[1], clr[2]);
      doc.rect(lx, y - 2, 3, 3, 'F');
      doc.setTextColor(...DARK);
      doc.text(`${k} (Ort: ${sinifAvgs[k].avg_net.toFixed(1)}, Puan: ${sinifAvgs[k].avg_puan.toFixed(1)})`, lx + 4, y);
      lx += 55;
    });
  }
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
  doc.save(`${examName}_Ogrenciler_${alanFilter || 'Tumu'}_${new Date().toISOString().slice(0, 10)}.pdf`.replace(/\s+/g, '_'));
}
