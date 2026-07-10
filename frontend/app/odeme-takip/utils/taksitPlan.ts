export interface ManuelTaksitRow {
  tutar: string;
  vade_tarihi: string;
  odeme_yontemi_id?: number | "";
}

export function taksitRowsEqual(a: ManuelTaksitRow[], b: ManuelTaksitRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) =>
      row.tutar === b[i].tutar
      && row.vade_tarihi === b[i].vade_tarihi
      && (row.odeme_yontemi_id ?? "") === (b[i].odeme_yontemi_id ?? ""),
  );
}

export function clampTaksitSayisi(count: number, max = 48): number {
  return Math.max(1, Math.min(max, count));
}

export function addMonths(dateStr: string, months: number): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;

  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const anchorDay = Number(parts[2]);
  if (!y || !m || !anchorDay) return dateStr;

  const total = (m - 1) + months;
  const targetYear = y + Math.floor(total / 12);
  const targetMonth = ((total % 12) + 12) % 12 + 1;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  let day = anchorDay;
  if (anchorDay > lastDay) {
    day = Math.min(anchorDay - 1, lastDay);
  }

  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function periodMonths(periyot: string): number {
  if (periyot === "iki_aylik") return 2;
  if (periyot === "uc_aylik") return 3;
  return 1;
}

export type BuildEqualTaksitOptions = {
  /** Eşit plan yenilenirken satır bazlı ödeme yöntemi korunur. */
  preserveFrom?: ManuelTaksitRow[];
  /** Çek/senet modunda tek yöntem varsa boş satırlara uygulanır. */
  defaultOdemeYontemiId?: number | "";
};

function resolveRowOdemeYontemi(
  rowIndex: number,
  options?: BuildEqualTaksitOptions,
): number | "" | undefined {
  const preserved = options?.preserveFrom?.[rowIndex]?.odeme_yontemi_id;
  if (preserved) return preserved;
  if (options?.defaultOdemeYontemiId) return options.defaultOdemeYontemiId;
  return "";
}

/** Peşinatı düşüp kalan tutarı eşit taksitlere böler. Toplam her zaman hedefTutar'a eşittir. */
export function buildEqualTaksitRows(
  hedefTutar: number,
  pesinat: number,
  taksitSayisi: number,
  ilkOdemeTarihi: string,
  periyot: string,
  options?: BuildEqualTaksitOptions,
): ManuelTaksitRow[] {
  if (!ilkOdemeTarihi || hedefTutar <= 0) return [{ tutar: "", vade_tarihi: "" }];

  const pm = periodMonths(periyot);
  const rows: ManuelTaksitRow[] = [];
  const safeCount = clampTaksitSayisi(taksitSayisi);
  const kalan = Math.max(0, hedefTutar - pesinat);
  let installmentCount = pesinat > 0 ? Math.max(0, safeCount - 1) : Math.max(1, safeCount);

  // Peşinat varken tek satır seçildiyse kalan borcu ayrı taksit satırına yaz
  if (pesinat > 0 && safeCount <= 1 && kalan > 0) {
    installmentCount = 1;
  }

  if (pesinat > 0) {
    rows.push({
      tutar: String(pesinat),
      vade_tarihi: ilkOdemeTarihi,
      odeme_yontemi_id: resolveRowOdemeYontemi(rows.length, options),
    });
  }

  if (kalan <= 0) {
    return rows.length ? rows : [{ tutar: "", vade_tarihi: ilkOdemeTarihi }];
  }

  if (installmentCount <= 0) {
    return rows.length ? rows : [{ tutar: String(hedefTutar), vade_tarihi: ilkOdemeTarihi }];
  }

  const base = Math.floor(kalan / installmentCount / 100) * 100;
  const lastAmount = kalan - base * (installmentCount - 1);
  const startDate = pesinat > 0 ? addMonths(ilkOdemeTarihi, pm) : ilkOdemeTarihi;

  for (let i = 0; i < installmentCount; i++) {
    rows.push({
      tutar: String(i === installmentCount - 1 ? lastAmount : base),
      vade_tarihi: addMonths(startDate, i * pm),
      odeme_yontemi_id: resolveRowOdemeYontemi(rows.length, options),
    });
  }

  return rows;
}

/** Satır silindikten veya taksit sayısı değişince kalan satırlara tutarı eşit dağıtır (vade korunur). */
export function redistributeTaksitAmounts(
  rows: ManuelTaksitRow[],
  hedefTutar: number,
  pesinat: number,
  options?: BuildEqualTaksitOptions,
): ManuelTaksitRow[] {
  if (rows.length === 0) return rows;

  const pesinatRowCount = pesinat > 0 ? 1 : 0;
  const installmentRows = rows.slice(pesinatRowCount);
  if (installmentRows.length === 0) {
    return buildEqualTaksitRows(
      hedefTutar,
      pesinat,
      pesinat > 0 ? 2 : 1,
      rows[0]?.vade_tarihi || "",
      "aylik",
      options,
    );
  }

  const kalan = Math.max(0, hedefTutar - pesinat);
  const base = Math.floor(kalan / installmentRows.length / 100) * 100;
  const lastAmount = kalan - base * (installmentRows.length - 1);

  const redistributed = installmentRows.map((row, i) => ({
    ...row,
    tutar: String(i === installmentRows.length - 1 ? lastAmount : base),
  }));

  if (pesinatRowCount > 0) {
    return [{
      tutar: String(pesinat),
      vade_tarihi: rows[0].vade_tarihi,
      odeme_yontemi_id: rows[0].odeme_yontemi_id ?? resolveRowOdemeYontemi(0, options),
    }, ...redistributed];
  }
  return redistributed;
}

export function rowsMatchEqualPlan(
  rows: ManuelTaksitRow[],
  hedefTutar: number,
  pesinat: number,
  taksitSayisi: number,
  ilkOdemeTarihi: string,
  periyot: string,
): boolean {
  const expected = buildEqualTaksitRows(hedefTutar, pesinat, taksitSayisi, ilkOdemeTarihi, periyot);
  if (rows.length !== expected.length) return false;
  return rows.every((row, i) => {
    const exp = expected[i];
    return (
      Math.abs((parseFloat(row.tutar) || 0) - (parseFloat(exp.tutar) || 0)) < 1
      && row.vade_tarihi === exp.vade_tarihi
    );
  });
}

export function defaultEgitimYiliBitis(bitisYil?: number | null): string {
  const year = bitisYil || new Date().getFullYear();
  return `${year}-06-30`;
}

/** API / datetime → `<input type="date">` (YYYY-MM-DD) */
export function normalizeDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export type GiderTaksitPlanRow = {
  taksit_no: number;
  vade_tarihi: string;
  tutar: number;
};

/** Gider: net tutarı eşit kuruş paylarına böler; son taksit kalanı alır. */
export function splitGiderAmountEqually(netTutar: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.round(netTutar * 100) / 100];
  const birim = Math.floor((netTutar / count) * 100) / 100;
  const amounts = Array.from({ length: count }, () => birim);
  amounts[count - 1] = Math.round((netTutar - birim * (count - 1)) * 100) / 100;
  return amounts;
}

/** Düzenlenen taksit tutarı sonrakilere yansır; son taksit kalan bakiyeyi alır. */
export function spreadGiderAmountFromIndex(
  amounts: number[],
  editIndex: number,
  editedAmount: number,
  netTutar: number,
): number[] {
  if (amounts.length === 0) return [];
  const result = [...amounts];
  result[editIndex] = Math.max(0, Math.round(editedAmount * 100) / 100);

  const trailing = result.length - editIndex - 1;
  if (trailing <= 0) {
    result[editIndex] = Math.round(netTutar * 100) / 100;
    return result;
  }
  if (trailing === 1) {
    const sumBefore = result.slice(0, -1).reduce((s, v) => s + v, 0);
    result[result.length - 1] = Math.round(Math.max(0, netTutar - sumBefore) * 100) / 100;
    return result;
  }
  for (let i = editIndex + 1; i < result.length - 1; i++) {
    result[i] = result[editIndex];
  }
  const sumBeforeLast = result.slice(0, -1).reduce((s, v) => s + v, 0);
  result[result.length - 1] = Math.round(Math.max(0, netTutar - sumBeforeLast) * 100) / 100;
  return result;
}

/** Gider taksit satırları: takvim ayı vadeleri + eşit tutar bölüşümü. */
export function buildGiderTaksitPlanRows(
  netTutar: number,
  taksitSayisi: number,
  ilkVadeYyyyMmDd: string,
  periyot = "aylik",
): GiderTaksitPlanRow[] {
  if (!ilkVadeYyyyMmDd || netTutar <= 0 || taksitSayisi <= 1) return [];

  const ilkVade = normalizeDateInput(ilkVadeYyyyMmDd);
  if (!ilkVade) return [];

  const pm = periodMonths(periyot);
  const amounts = splitGiderAmountEqually(netTutar, taksitSayisi);
  return amounts.map((tutar, i) => ({
    taksit_no: i + 1,
    vade_tarihi: addMonths(ilkVade, i * pm),
    tutar,
  }));
}

/** @deprecated buildGiderTaksitPlanRows kullanın */
export function buildGiderEqualTaksitPlan(
  netTutar: number,
  taksitSayisi: number,
  ilkVadeYyyyMmDd: string,
  periyot = "aylik",
): GiderTaksitPlanRow[] {
  return buildGiderTaksitPlanRows(netTutar, taksitSayisi, ilkVadeYyyyMmDd, periyot);
}

/** Düzenlenen taksit tutarı sonraki taksitlere yansır; son taksit kalan bakiyeyi alır. */
export function spreadTaksitAmountsFromIndex(
  rows: ManuelTaksitRow[],
  editIndex: number,
  hedefTutar: number,
): ManuelTaksitRow[] {
  const result = rows.map((row) => ({ ...row }));
  const trailingCount = result.length - editIndex - 1;
  if (trailingCount <= 0) return result;

  const editedAmount = Math.max(0, parseFloat(result[editIndex].tutar) || 0);

  if (trailingCount === 1) {
    let ustToplam = 0;
    for (let i = 0; i < result.length - 1; i++) {
      ustToplam += parseFloat(result[i].tutar) || 0;
    }
    result[result.length - 1].tutar = String(Math.max(0, Math.round(hedefTutar - ustToplam)));
    return result;
  }

  for (let i = editIndex + 1; i < result.length - 1; i++) {
    result[i].tutar = String(editedAmount);
  }

  let totalBeforeLast = 0;
  for (let i = 0; i < result.length - 1; i++) {
    totalBeforeLast += parseFloat(result[i].tutar) || 0;
  }
  result[result.length - 1].tutar = String(Math.max(0, Math.round(hedefTutar - totalBeforeLast)));
  return result;
}
