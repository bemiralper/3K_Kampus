"use client";

/**
 * Tahsilat Makbuzu — Vektörel PDF Üretici
 *
 * html2canvas (raster) yerine jsPDF API kullanarak
 * tamamen vektörel PDF oluşturur.
 * Metin, çizgi, dikdörtgen ve renkler gerçek PDF nesneleridir —
 * büyütünce pikselleşme olmaz.
 */

import type { jsPDF } from "jspdf";
import { downloadJsPdf } from "@/lib/download-file";

/* ─────────────────── Tipler ─────────────────── */

interface MakbuzKurum {
  ad: string;
  adres: string;
  telefon: string;
  vergi_no: string;
  vergi_dairesi: string;
}

interface MakbuzDagitimDetay {
  taksit_no: number;
  tutar: number;
  vade_tarihi: string | null;
}

interface MakbuzTaksit {
  taksit_no: number;
  vade_tarihi: string | null;
  tutar: number;
  odenen_tutar: number;
  kalan_tutar: number;
  durum: string;
}

interface MakbuzGecmis {
  id: number;
  tahsilat_tarihi: string | null;
  tutar: number;
  taksit_no: number | null;
  odeme_yontemi: string;
  tahsilat_turu: string;
  referans_no: string;
}

export interface MakbuzPdfData {
  makbuz_no: string;
  tahsilat_id: number;
  tahsilat_tarihi: string | null;
  kayit_tarihi: string | null;
  tutar: number;
  tahsilat_turu: string;
  referans_no: string;
  aciklama: string;
  durum: string;
  odeme_yontemi: string;
  kurum: MakbuzKurum | null;
  sube: { ad: string } | null;
  ogrenci: { ad: string; soyad: string; ogrenci_no: string } | null;
  veli: { ad: string; soyad: string; tc_kimlik_no: string } | null;
  sozlesme: {
    sozlesme_no: string;
    paket_adi: string;
    net_tutar: number;
    toplam_odenen: number;
    kalan_borc: number;
  } | null;
  taksit: { taksit_no: number; vade_tarihi: string | null; tutar: number } | null;
  dagitim_detay: MakbuzDagitimDetay[];
  taksitler: MakbuzTaksit[];
  tahsilat_gecmisi: MakbuzGecmis[];
  islem_yapan: string;
}

/* ─────────────────── Sabitler ─────────────────── */

const KURUM_COLOR: [number, number, number] = [2, 98, 167]; // #0262a7
const KURUM_LIGHT: [number, number, number] = [3, 128, 212]; // #0380d4
const WHITE: [number, number, number] = [255, 255, 255];
const TEXT_DARK: [number, number, number] = [30, 41, 59]; // #1e293b
const TEXT_MED: [number, number, number] = [51, 65, 85]; // #334155
const TEXT_LIGHT: [number, number, number] = [100, 116, 139]; // #64748b
const TEXT_MUTED: [number, number, number] = [148, 163, 184]; // #94a3b8
const GREEN_DARK: [number, number, number] = [4, 120, 87]; // #047857
const GREEN_MED: [number, number, number] = [5, 150, 105]; // #059669
const RED: [number, number, number] = [220, 38, 38]; // #dc2626
const BG_LIGHT: [number, number, number] = [248, 250, 252]; // #f8fafc
const BG_TABLE_HEAD: [number, number, number] = [232, 237, 245]; // #e8edf5
const BG_GREEN_LIGHT: [number, number, number] = [236, 253, 245]; // #ecfdf5
const BG_GREEN_BADGE: [number, number, number] = [220, 252, 231]; // #dcfce7
const BG_YELLOW_BADGE: [number, number, number] = [254, 249, 195]; // #fef9c3
const BG_RED_BADGE: [number, number, number] = [254, 226, 226]; // #fee2e2
const BG_GRAY_BADGE: [number, number, number] = [241, 245, 249]; // #f1f5f9
const BORDER_LIGHT: [number, number, number] = [226, 232, 240]; // #e2e8f0
const BORDER_GREEN: [number, number, number] = [187, 247, 208]; // #bbf7d0
const BORDER_RED: [number, number, number] = [254, 202, 202]; // #fecaca

// Sayfa sabitleri
const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

/* ─────────────────── Yardımcılar ─────────────────── */

const tahsilatTuruLabel: Record<string, string> = {
  normal: "Normal Tahsilat",
  mahsup: "Mahsup",
  iade: "İade",
  emanet: "Emanet",
};

const taksitDurumLabel: Record<string, string> = {
  beklemede: "Beklemede",
  kismi_odendi: "Kısmi Ödendi",
  odendi: "Ödendi",
  gecikmi: "Gecikmiş",
  iptal: "İptal",
};

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function tutarYazi(tutar: number): string {
  const tam = Math.round(tutar);
  const birler = ["", "Bir", "İki", "Üç", "Dört", "Beş", "Altı", "Yedi", "Sekiz", "Dokuz"];
  const onlar = ["", "On", "Yirmi", "Otuz", "Kırk", "Elli", "Altmış", "Yetmiş", "Seksen", "Doksan"];
  const buyukler = ["", "Bin", "Milyon", "Milyar"];

  if (tam === 0) return "Sıfır TL";

  function ucBasamak(n: number): string {
    if (n === 0) return "";
    let s = "";
    const yuzlerV = Math.floor(n / 100);
    const kalanV = n % 100;
    const onlarV = Math.floor(kalanV / 10);
    const birlerV = kalanV % 10;
    if (yuzlerV > 0) s += (yuzlerV === 1 ? "" : birler[yuzlerV]) + "Yüz";
    if (onlarV > 0) s += onlar[onlarV];
    if (birlerV > 0) s += birler[birlerV];
    return s;
  }

  let sonuc = "";
  let kalan = tam;
  let seviye = 0;
  while (kalan > 0) {
    const uc = kalan % 1000;
    if (uc > 0) {
      const parcaStr = seviye === 1 && uc === 1 ? "" : ucBasamak(uc);
      sonuc = parcaStr + buyukler[seviye] + sonuc;
    }
    kalan = Math.floor(kalan / 1000);
    seviye++;
  }
  return sonuc + " TL";
}

/* ─────────────────── Çizim yardımcıları ─────────────────── */

/** Rounded rectangle path (vektörel) */
function roundedRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number, r: number,
  style: "F" | "S" | "FD" = "F",
) {
  // jsPDF'in roundedRect'i var (v2+)
  doc.roundedRect(x, y, w, h, r, r, style);
}

/** Metin yaz, maxWidth ile kırpma */
function txt(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  opts?: { maxWidth?: number; align?: "left" | "center" | "right"; baseline?: "top" | "middle" | "bottom" },
) {
  const align = opts?.align || "left";
  const maxW = opts?.maxWidth;
  let t = text;
  if (maxW) {
    // Metni kırp
    while (doc.getTextWidth(t) > maxW && t.length > 3) {
      t = t.slice(0, -1);
    }
    if (t !== text) t = t.slice(0, -1) + "…";
  }
  doc.text(t, x, y, { align, baseline: opts?.baseline });
}

/** setFont kısayolu */
function setFont(doc: jsPDF, style: "normal" | "bold" | "italic" | "bolditalic" = "normal", size = 10) {
  doc.setFontSize(size);
  doc.setFont(FONT_FAMILY, style);
}

/** Renk kısayolu */
function setColor(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function setFill(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

/** Sayfa sonu kontrolü — yetmezse yeni sayfa aç, yeni Y döndür */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

/* ─────────────────── Logo Yükleme ─────────────────── */

/** Logo görselini fetch edip data URL olarak döner */
async function loadLogo(): Promise<string | null> {
  try {
    const blob = await (await fetch("/img/beyaz-logo.png")).blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ─────────────────── Font Yükleme ─────────────────── */

/** TTF dosyasını fetch edip ArrayBuffer olarak döner */
async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font yüklenemedi: ${url}`);
  return res.arrayBuffer();
}

/** Roboto Regular + Bold fontlarını jsPDF'e embed eder (Türkçe karakter desteği) */
async function loadFonts(doc: jsPDF): Promise<void> {
  try {
    const [regularBuf, boldBuf, italicBuf] = await Promise.all([
      fetchFont("/fonts/Roboto-Regular.ttf"),
      fetchFont("/fonts/Roboto-Bold.ttf"),
      fetchFont("/fonts/Roboto-Italic.ttf"),
    ]);

    const toBase64 = (buf: ArrayBuffer) => {
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    };

    doc.addFileToVFS("Roboto-Regular.ttf", toBase64(regularBuf));
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");

    doc.addFileToVFS("Roboto-Bold.ttf", toBase64(boldBuf));
    doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");

    doc.addFileToVFS("Roboto-Italic.ttf", toBase64(italicBuf));
    doc.addFont("Roboto-Italic.ttf", "Roboto", "italic");

    FONT_FAMILY = "Roboto";
  } catch (e) {
    // Font yüklenemezse helvetica ile devam et
    console.warn("Roboto font yüklenemedi, helvetica kullanılacak:", e);
    FONT_FAMILY = "helvetica";
  }
}

/** Aktif font ailesi — Roboto yüklenirse güncellenir */
let FONT_FAMILY = "helvetica";

/* ─────────────────── ANA FONKSİYON ─────────────────── */

export async function generateMakbuzPdf(
  data: MakbuzPdfData,
  mode: "open" | "download" = "open",
): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Roboto fontunu yükle — Türkçe karakter desteği (ğ, ı, İ, ş, ç...)
  await loadFonts(doc);

  let y = MARGIN;
  const left = MARGIN;
  const right = PAGE_W - MARGIN;

  /* ═══════════════════════════════════════════════
     HEADER — Kurum rengi arka plan + Logo
     ═══════════════════════════════════════════════ */
  const headerH = 18;
  setFill(doc, KURUM_COLOR);
  roundedRect(doc, left, y, CONTENT_W, headerH, 3, "F");

  // Logo yükle ve ekle (546×407px → en-boy oranı korunacak)
  const logo = await loadLogo();
  const logoMaxH = 11; // mm max yükseklik
  const logoAspect = 546 / 407; // gerçek en-boy oranı
  const logoH = logoMaxH;
  const logoW = logoH * logoAspect; // ≈ 14.8mm — oran korunuyor
  const logoX = left + 3;
  const logoY = y + (headerH - logoH) / 2;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", logoX, logoY, logoW, logoH);
    } catch (e) {
      console.warn("Logo PDF'e eklenemedi:", e);
    }
  }

  // Kurum adı — logodan sonra
  const textStartX = logo ? left + logoW + 6 : left + 5;
  setFont(doc, "bold", 11);
  setColor(doc, WHITE);
  txt(doc, data.kurum?.ad || "Kurum", textStartX, y + 7, { maxWidth: CONTENT_W - 50 - (logo ? logoW + 4 : 0) });

  // Alt bilgiler (şube, adres, telefon)
  const subTexts: string[] = [];
  if (data.sube) subTexts.push(data.sube.ad);
  if (data.kurum?.adres) subTexts.push(data.kurum.adres);
  if (data.kurum?.telefon) subTexts.push("Tel: " + data.kurum.telefon);
  if (subTexts.length > 0) {
    setFont(doc, "normal", 6.5);
    setColor(doc, [200, 215, 235]);
    txt(doc, subTexts.join("  •  "), textStartX, y + 12, { maxWidth: CONTENT_W - 50 - (logo ? logoW + 4 : 0) });
  }

  // Makbuz No badge
  const badgeW = 34;
  const badgeX = right - badgeW - 3;
  setFill(doc, [40, 118, 185]);
  setDraw(doc, [64, 140, 200]);
  doc.setLineWidth(0.3);
  roundedRect(doc, badgeX, y + 2.5, badgeW, headerH - 5, 2, "FD");

  setFont(doc, "bold", 6);
  setColor(doc, [180, 210, 240]);
  txt(doc, "MAKBUZ NO", badgeX + badgeW / 2, y + 6.5, { align: "center" });
  setFont(doc, "bold", 9);
  setColor(doc, WHITE);
  txt(doc, data.makbuz_no, badgeX + badgeW / 2, y + 12.5, { align: "center" });

  y += headerH + 3;

  /* ═══════════════════════════════════════════════
     TITLE BAR — "Tahsilat Makbuzu" + Tarih
     ═══════════════════════════════════════════════ */
  setFont(doc, "bold", 9);
  setColor(doc, TEXT_DARK);
  txt(doc, "Tahsilat Makbuzu", left, y + 3.5);

  setFont(doc, "normal", 7.5);
  setColor(doc, TEXT_LIGHT);
  txt(doc, fmtDate(data.tahsilat_tarihi), right, y + 3.5, { align: "right" });

  y += 5;
  setDraw(doc, BORDER_LIGHT);
  doc.setLineWidth(0.4);
  doc.line(left, y, right, y);
  y += 3;

  /* ═══════════════════════════════════════════════
     BİLGİ KARTLARI — 2 Sütun
     ═══════════════════════════════════════════════ */
  const colW = (CONTENT_W - 3) / 2;

  // Sol kart — Öğrenci & Veli (dikey layout: label üstte, değer altta)
  y = ensureSpace(doc, y, 28);
  const cardY = y;
  const leftCardH = drawPersonCard(doc, left, cardY, colW, data);

  // Sağ kart — Ödeme detayları
  const rightItems: { label: string; value: string }[] = [];
  if (data.sozlesme) {
    rightItems.push({ label: "Sözleşme No", value: data.sozlesme.sozlesme_no });
    rightItems.push({ label: "Eğitim Paketi", value: data.sozlesme.paket_adi });
  }
  rightItems.push({ label: "Ödeme Yöntemi", value: data.odeme_yontemi });
  if (data.referans_no) rightItems.push({ label: "Referans No", value: data.referans_no });

  // Dağıtım bilgisi
  if (data.dagitim_detay && data.dagitim_detay.length > 0) {
    rightItems.push({ label: "Dağıtım", value: `${data.dagitim_detay.length} taksit` });
    for (const d of data.dagitim_detay) {
      const vadeTxt = d.vade_tarihi ? ` (${fmtDate(d.vade_tarihi)})` : "";
      rightItems.push({ label: `  Taksit ${d.taksit_no}${vadeTxt}`, value: fmtCurrency(d.tutar) });
    }
  } else if (data.taksit) {
    const vadeTxt = data.taksit.vade_tarihi ? ` (${fmtDate(data.taksit.vade_tarihi)})` : "";
    rightItems.push({ label: "Taksit", value: `${data.taksit.taksit_no}. Taksit${vadeTxt}` });
  }
  rightItems.push({ label: "Tahsilat Türü", value: tahsilatTuruLabel[data.tahsilat_turu] || data.tahsilat_turu });

  const rightCardH = drawInfoCard(doc, "Ödeme Detayları", left + colW + 3, cardY, colW, rightItems);

  y = cardY + Math.max(leftCardH, rightCardH) + 3;

  /* ═══════════════════════════════════════════════
     Açıklama (varsa)
     ═══════════════════════════════════════════════ */
  if (data.aciklama) {
    y = ensureSpace(doc, y, 8);
    setFill(doc, [255, 251, 235]); // #fffbeb
    setDraw(doc, [253, 230, 138]); // #fde68a
    doc.setLineWidth(0.3);
    roundedRect(doc, left, y, CONTENT_W, 6.5, 2, "FD");
    setFont(doc, "bold", 7);
    setColor(doc, [146, 64, 14]); // #92400e
    txt(doc, "Açıklama: ", left + 3, y + 4);
    const labelW = doc.getTextWidth("Açıklama: ");
    setFont(doc, "normal", 7);
    txt(doc, data.aciklama, left + 3 + labelW, y + 4, { maxWidth: CONTENT_W - 8 - labelW });
    y += 9;
  }

  /* ═══════════════════════════════════════════════
     TUTAR KUTUSU
     ═══════════════════════════════════════════════ */
  y = ensureSpace(doc, y, 17);
  const boxes = data.sozlesme ? 4 : 1;
  const boxW = (CONTENT_W - (boxes - 1) * 2) / boxes;

  // Tahsil edilen — yeşil
  drawAmountBox(doc, left, y, boxW, 15, {
    label: "TAHSİL EDİLEN",
    value: fmtCurrency(data.tutar),
    subText: `(${tutarYazi(data.tutar)})`,
    bgColor: BG_GREEN_LIGHT,
    borderColor: BORDER_GREEN,
    labelColor: GREEN_MED,
    valueColor: GREEN_DARK,
    valueFontSize: 11,
  });

  if (data.sozlesme) {
    // Sözleşme
    drawAmountBox(doc, left + boxW + 2, y, boxW, 15, {
      label: "SÖZLEŞME",
      value: fmtCurrency(data.sozlesme.net_tutar),
      bgColor: BG_LIGHT,
      borderColor: BORDER_LIGHT,
      labelColor: TEXT_MUTED,
      valueColor: TEXT_MED,
    });
    // Ödenen
    drawAmountBox(doc, left + (boxW + 2) * 2, y, boxW, 15, {
      label: "ÖDENEN",
      value: fmtCurrency(data.sozlesme.toplam_odenen),
      bgColor: BG_GREEN_LIGHT,
      borderColor: BORDER_GREEN,
      labelColor: GREEN_MED,
      valueColor: GREEN_MED,
    });
    // Kalan
    const kalanRed = data.sozlesme.kalan_borc > 0;
    drawAmountBox(doc, left + (boxW + 2) * 3, y, boxW, 15, {
      label: "KALAN",
      value: fmtCurrency(data.sozlesme.kalan_borc),
      bgColor: kalanRed ? [254, 242, 242] : BG_GREEN_LIGHT,
      borderColor: kalanRed ? BORDER_RED : BORDER_GREEN,
      labelColor: kalanRed ? [252, 165, 165] : GREEN_MED,
      valueColor: kalanRed ? RED : GREEN_MED,
    });
  }

  y += 18;

  /* ═══════════════════════════════════════════════
     TAKSİT PLANI TABLOSU
     ═══════════════════════════════════════════════ */
  if (data.taksitler && data.taksitler.length > 0) {
    y = ensureSpace(doc, y, 14);

    // Başlık
    setFont(doc, "bold", 8);
    setColor(doc, TEXT_MED);
    txt(doc, "Taksit Planı", left + 1, y + 2.5);
    y += 4.5;

    const cols = [
      { header: "No", w: 12, align: "center" as const },
      { header: "Vade Tarihi", w: 34, align: "left" as const },
      { header: "Tutar", w: 28, align: "right" as const },
      { header: "Ödenen", w: 28, align: "right" as const },
      { header: "Kalan", w: 28, align: "right" as const },
      { header: "Durum", w: CONTENT_W - 12 - 34 - 28 - 28 - 28, align: "center" as const },
    ];

    y = drawTable(doc, left, y, cols, data.taksitler.map(t => {
      const isDagitim = data.dagitim_detay?.some(d => d.taksit_no === t.taksit_no) ?? false;
      const isCurrentTaksit = !!(data.taksit && data.taksit.taksit_no === t.taksit_no);
      return {
        cells: [
          String(t.taksit_no),
          fmtDate(t.vade_tarihi),
          fmtCurrency(t.tutar),
          fmtCurrency(t.odenen_tutar),
          fmtCurrency(t.kalan_tutar),
          taksitDurumLabel[t.durum] || t.durum,
        ],
        highlight: isDagitim || isCurrentTaksit,
        durumBadge: {
          col: 5,
          durum: t.durum,
          kalanTutar: t.kalan_tutar,
        },
      };
    }));

    y += 2;
  }

  /* ═══════════════════════════════════════════════
     TAHSİLAT GEÇMİŞİ TABLOSU
     ═══════════════════════════════════════════════ */
  if (data.tahsilat_gecmisi && data.tahsilat_gecmisi.length > 0) {
    y = ensureSpace(doc, y, 14);

    setFont(doc, "bold", 8);
    setColor(doc, TEXT_MED);
    txt(doc, "Tahsilat Geçmişi", left + 1, y + 2.5);
    y += 4.5;

    const gecmisCols = [
      { header: "Tarih", w: 30, align: "left" as const },
      { header: "Taksit", w: 22, align: "left" as const },
      { header: "Tutar", w: 28, align: "right" as const },
      { header: "Ödeme Yöntemi", w: 30, align: "left" as const },
      { header: "Tür", w: 30, align: "left" as const },
      { header: "Referans", w: CONTENT_W - 30 - 22 - 28 - 30 - 30, align: "left" as const },
    ];

    y = drawTable(doc, left, y, gecmisCols, data.tahsilat_gecmisi.map(tg => ({
      cells: [
        fmtDate(tg.tahsilat_tarihi),
        tg.taksit_no ? `${tg.taksit_no}. Taksit` : "-",
        fmtCurrency(tg.tutar),
        tg.odeme_yontemi,
        tahsilatTuruLabel[tg.tahsilat_turu] || tg.tahsilat_turu,
        tg.referans_no || "-",
      ],
      highlight: tg.id === data.tahsilat_id,
    })), BG_GREEN_LIGHT);

    y += 2;
  }

  /* ═══════════════════════════════════════════════
     VERGİ BİLGİSİ
     ═══════════════════════════════════════════════ */
  if (data.kurum?.vergi_no) {
    y = ensureSpace(doc, y, 7);
    setFont(doc, "normal", 7);
    setColor(doc, TEXT_LIGHT);
    txt(doc, `V.D.: ${data.kurum.vergi_dairesi}  |  V.N.: ${data.kurum.vergi_no}`, left, y + 3);
    y += 6;
  }

  /* ═══════════════════════════════════════════════
     İMZA ALANLARI
     ═══════════════════════════════════════════════ */
  y = ensureSpace(doc, y, 20);
  y += 2;
  const sigW = CONTENT_W * 0.33;
  const sigLeftX = left + 10;
  const sigRightX = right - sigW - 10;

  // Sol imza — Tahsil Eden
  setDraw(doc, BORDER_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(sigLeftX, y + 10, sigLeftX + sigW, y + 10);

  setFont(doc, "bold", 7);
  setColor(doc, TEXT_MED);
  txt(doc, "Tahsil Eden", sigLeftX + sigW / 2, y + 14, { align: "center" });

  setFont(doc, "normal", 7);
  setColor(doc, TEXT_DARK);
  txt(doc, data.islem_yapan, sigLeftX + sigW / 2, y + 18, { align: "center" });

  // Sağ imza — Ödeme Yapan
  doc.line(sigRightX, y + 10, sigRightX + sigW, y + 10);

  setFont(doc, "bold", 7);
  setColor(doc, TEXT_MED);
  txt(doc, "Ödeme Yapan", sigRightX + sigW / 2, y + 14, { align: "center" });

  setFont(doc, "normal", 7);
  setColor(doc, TEXT_MUTED);
  txt(doc, "Veli / Öğrenci", sigRightX + sigW / 2, y + 18, { align: "center" });

  y += 22;

  /* ═══════════════════════════════════════════════
     FOOTER
     ═══════════════════════════════════════════════ */
  y = ensureSpace(doc, y, 7);
  setDraw(doc, [241, 245, 249]);
  doc.setLineWidth(0.2);
  doc.line(left, y, right, y);
  y += 3;
  setFont(doc, "normal", 6.5);
  setColor(doc, TEXT_MUTED);
  txt(doc, `Bu makbuz ${fmtDate(data.kayit_tarihi)} tarihinde elektronik ortamda oluşturulmuştur.`, PAGE_W / 2, y, { align: "center" });

  /* ═══════════════════════════════════════════════
     ÇIKTI
     ═══════════════════════════════════════════════ */
  const fileName = `makbuz-${data.makbuz_no || data.tahsilat_id}`;

  if (mode === "download") {
    await downloadJsPdf(doc, `${fileName}.pdf`);
  } else {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

/* ═══════════════════════════════════════════════════
   YARDIMCI ÇİZİM FONKSİYONLARI
   ═══════════════════════════════════════════════════ */

/**
 * Kişi kartı — Öğrenci / Veli bilgileri
 * Önizlemedeki dikey layout'u birebir uygular:
 * başlık (gri), ardından her kişi için label (küçük gri) + value (büyük bold) üst üste
 */
function drawPersonCard(
  doc: jsPDF,
  x: number, y: number, w: number,
  data: MakbuzPdfData,
): number {
  const padX = 4;
  const padY = 3;

  // İçerik yüksekliğini hesapla
  let contentH = 0;
  const titleH = 5;
  contentH += titleH; // başlık

  if (data.ogrenci) {
    contentH += 3.5; // "Öğrenci" label
    contentH += 4; // isim
    contentH += 1.5; // boşluk
  }
  if (data.veli) {
    contentH += 3.5; // "Veli" label
    contentH += 4; // isim
    if (data.veli.tc_kimlik_no) contentH += 3.5; // TC
  }

  const cardH = padY + contentH + padY;

  // Kart arka plan
  setFill(doc, BG_LIGHT);
  setDraw(doc, BORDER_LIGHT);
  doc.setLineWidth(0.3);
  roundedRect(doc, x, y, w, cardH, 2, "FD");

  // Başlık
  setFont(doc, "bold", 6.5);
  setColor(doc, TEXT_MUTED);
  txt(doc, "ÖĞRENCİ / VELİ BİLGİLERİ", x + padX, y + padY + 2.5);

  let lineY = y + padY + titleH + 0.5;

  // Öğrenci
  if (data.ogrenci) {
    setFont(doc, "normal", 6.5);
    setColor(doc, TEXT_MUTED);
    txt(doc, "Öğrenci", x + padX, lineY);
    lineY += 3.5;

    setFont(doc, "bold", 8);
    setColor(doc, TEXT_DARK);
    let ogrenciText = `${data.ogrenci.ad} ${data.ogrenci.soyad}`;
    txt(doc, ogrenciText, x + padX, lineY);

    if (data.ogrenci.ogrenci_no) {
      const nameW = doc.getTextWidth(ogrenciText);
      setFont(doc, "normal", 6.5);
      setColor(doc, TEXT_MUTED);
      txt(doc, ` (${data.ogrenci.ogrenci_no})`, x + padX + nameW + 1, lineY);
    }
    lineY += 5;
  }

  // Veli
  if (data.veli) {
    setFont(doc, "normal", 6.5);
    setColor(doc, TEXT_MUTED);
    txt(doc, "Veli", x + padX, lineY);
    lineY += 3.5;

    setFont(doc, "bold", 8);
    setColor(doc, TEXT_DARK);
    txt(doc, `${data.veli.ad} ${data.veli.soyad}`, x + padX, lineY);
    lineY += 4;

    if (data.veli.tc_kimlik_no) {
      setFont(doc, "normal", 7);
      setColor(doc, TEXT_LIGHT);
      txt(doc, `TC: ${data.veli.tc_kimlik_no}`, x + padX, lineY);
      lineY += 3.5;
    }
  }

  return cardH;
}

/** Bilgi kartı çizer (Ödeme Detayları gibi label:value yan yana kartlar), kart yüksekliğini döner */
function drawInfoCard(
  doc: jsPDF,
  title: string,
  x: number, y: number, w: number,
  items: { label: string; value: string }[],
): number {
  const padX = 4;
  const padY = 3;
  const lineH = 3.8;
  const titleH = 4.5;
  const cardH = padY + titleH + items.length * lineH + padY;

  // Kart arka plan
  setFill(doc, BG_LIGHT);
  setDraw(doc, BORDER_LIGHT);
  doc.setLineWidth(0.3);
  roundedRect(doc, x, y, w, cardH, 2, "FD");

  // Başlık
  setFont(doc, "bold", 6.5);
  setColor(doc, TEXT_MUTED);
  txt(doc, title.toUpperCase(), x + padX, y + padY + 2.5);

  // Satırlar
  let lineY = y + padY + titleH + 1.5;
  for (const item of items) {
    setFont(doc, "normal", 7);
    setColor(doc, TEXT_LIGHT);
    txt(doc, item.label, x + padX, lineY);

    setFont(doc, "bold", 7);
    setColor(doc, TEXT_DARK);
    txt(doc, item.value, x + w - padX, lineY, { align: "right", maxWidth: w - padX * 2 - doc.getTextWidth(item.label) - 4 });

    lineY += lineH;
  }

  return cardH;
}

/** Tutar kutusu çizer */
function drawAmountBox(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  opts: {
    label: string;
    value: string;
    subText?: string;
    bgColor: [number, number, number];
    borderColor: [number, number, number];
    labelColor: [number, number, number];
    valueColor: [number, number, number];
    valueFontSize?: number;
  },
) {
  setFill(doc, opts.bgColor);
  setDraw(doc, opts.borderColor);
  doc.setLineWidth(0.3);
  roundedRect(doc, x, y, w, h, 2, "FD");

  setFont(doc, "bold", 6);
  setColor(doc, opts.labelColor);
  txt(doc, opts.label, x + w / 2, y + 4, { align: "center" });

  setFont(doc, "bold", opts.valueFontSize || 9);
  setColor(doc, opts.valueColor);
  txt(doc, opts.value, x + w / 2, y + 9, { align: "center" });

  if (opts.subText) {
    setFont(doc, "italic", 6);
    setColor(doc, TEXT_LIGHT);
    txt(doc, opts.subText, x + w / 2, y + 13, { align: "center", maxWidth: w - 4 });
  }
}

interface TableCol {
  header: string;
  w: number;
  align: "left" | "center" | "right";
}

interface TableRow {
  cells: string[];
  highlight?: boolean;
  durumBadge?: { col: number; durum: string; kalanTutar: number };
}

/** Tablo çizer, biten Y döner */
function drawTable(
  doc: jsPDF,
  x: number, y: number,
  cols: TableCol[],
  rows: TableRow[],
  headColor?: [number, number, number],
): number {
  const rowH = 5;
  const headH = 5.5;
  const cellPad = 2.5;

  // Tablo çerçevesi
  setDraw(doc, BORDER_LIGHT);
  doc.setLineWidth(0.3);

  // Header
  setFill(doc, headColor || BG_TABLE_HEAD);
  roundedRect(doc, x, y, CONTENT_W, headH, 1.5, "F");

  let colX = x;
  for (const col of cols) {
    setFont(doc, "bold", 6.5);
    setColor(doc, [71, 85, 105]); // #475569
    const textX = col.align === "right" ? colX + col.w - cellPad : col.align === "center" ? colX + col.w / 2 : colX + cellPad;
    txt(doc, col.header, textX, y + 3.6, { align: col.align });
    colX += col.w;
  }

  // Header border
  y += headH;
  setDraw(doc, BORDER_LIGHT);
  doc.setLineWidth(0.4);
  doc.line(x, y, x + CONTENT_W, y);

  // Rows
  for (let ri = 0; ri < rows.length; ri++) {
    y = ensureSpace(doc, y, rowH);
    const row = rows[ri];

    // Row background
    if (row.highlight) {
      setFill(doc, [239, 246, 255]); // #eff6ff
      doc.rect(x, y, CONTENT_W, rowH, "F");
    } else if (ri % 2 === 1) {
      setFill(doc, [250, 251, 253]); // #fafbfd
      doc.rect(x, y, CONTENT_W, rowH, "F");
    }

    colX = x;
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const cell = row.cells[ci] || "";

      // Durum badge
      if (row.durumBadge && ci === row.durumBadge.col) {
        const d = row.durumBadge.durum;
        const badgeBg =
          d === "odendi" ? BG_GREEN_BADGE :
          d === "kismi_odendi" ? BG_YELLOW_BADGE :
          d === "gecikmi" ? BG_RED_BADGE : BG_GRAY_BADGE;
        const badgeText =
          d === "odendi" ? [22, 101, 52] as [number, number, number] :
          d === "kismi_odendi" ? [133, 77, 14] as [number, number, number] :
          d === "gecikmi" ? [153, 27, 27] as [number, number, number] : [71, 85, 105] as [number, number, number];

        const badgeTxt = cell;
        setFont(doc, "bold", 6.5);
        const tw = doc.getTextWidth(badgeTxt);
        const bw = tw + 5;
        const bx = colX + (col.w - bw) / 2;
        setFill(doc, badgeBg);
        roundedRect(doc, bx, y + 0.8, bw, rowH - 1.6, 1.5, "F");
        setColor(doc, badgeText);
        txt(doc, badgeTxt, colX + col.w / 2, y + rowH / 2 + 0.8, { align: "center" });
      } else {
        // Normal hücre
        setFont(doc, "normal", 7);

        // Tutar sütunları — renk
        if (col.header === "Ödenen" || (col.header === "Tutar" && cols.length <= 4)) {
          setColor(doc, GREEN_MED);
          setFont(doc, "bold", 7);
        } else if (col.header === "Kalan") {
          const kalanVal = row.durumBadge?.kalanTutar ?? 0;
          setColor(doc, kalanVal > 0 ? RED : GREEN_MED);
          setFont(doc, "bold", 7);
        } else if (col.header === "Tutar" && col.align === "right") {
          setColor(doc, TEXT_DARK);
          setFont(doc, "bold", 7);
        } else {
          setColor(doc, TEXT_MED);
        }

        const textX = col.align === "right" ? colX + col.w - cellPad : col.align === "center" ? colX + col.w / 2 : colX + cellPad;
        txt(doc, cell, textX, y + rowH / 2 + 0.8, { align: col.align, maxWidth: col.w - cellPad * 2 });
      }

      colX += col.w;
    }

    // Row alt çizgi
    setDraw(doc, [241, 245, 249]);
    doc.setLineWidth(0.15);
    doc.line(x, y + rowH, x + CONTENT_W, y + rowH);

    y += rowH;
  }

  return y;
}
