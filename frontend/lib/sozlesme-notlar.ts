/** Sözleşme notları — yapılandırılmış görünürlük */

export type SozlesmeNotTip = "genel" | "odeme_gorusmesi";

export type SozlesmeNot = {
  id: string;
  text: string;
  veli_ile_paylas: boolean;
  created_at?: string;
  created_by_name?: string;
  soz_verilen_tarih?: string | null;
  tip?: SozlesmeNotTip;
};

export function createEmptyNote(opts?: {
  tip?: SozlesmeNotTip;
  created_by_name?: string;
}): SozlesmeNot {
  return {
    id: crypto.randomUUID?.() ?? `note-${Date.now()}`,
    text: "",
    veli_ile_paylas: false,
    created_at: new Date().toISOString(),
    created_by_name: opts?.created_by_name,
    soz_verilen_tarih: null,
    tip: opts?.tip ?? "odeme_gorusmesi",
  };
}

function parseVeliIlePaylas(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0" || normalized === "") return false;
  }
  return Boolean(value);
}

function parseTip(value: unknown): SozlesmeNotTip | undefined {
  if (value === "genel" || value === "odeme_gorusmesi") return value;
  return undefined;
}

function parseOptionalDate(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;
  // YYYY-MM-DD veya ISO
  return s.slice(0, 10);
}

export function parseNotlarJson(raw: unknown, legacyText?: string): SozlesmeNot[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item, idx) => {
        if (!item || typeof item !== "object") return null;
        const rec = item as Record<string, unknown>;
        const text = String(rec.text ?? "").trim();
        if (!text) return null;
        const tip = parseTip(rec.tip);
        const soz = parseOptionalDate(rec.soz_verilen_tarih);
        const createdAt = rec.created_at != null ? String(rec.created_at) : undefined;
        const byName = rec.created_by_name != null ? String(rec.created_by_name).trim() : undefined;
        return {
          id: String(rec.id ?? `note-${idx + 1}`),
          text,
          veli_ile_paylas: parseVeliIlePaylas(rec.veli_ile_paylas),
          ...(createdAt ? { created_at: createdAt } : {}),
          ...(byName ? { created_by_name: byName } : {}),
          ...(soz !== undefined ? { soz_verilen_tarih: soz } : {}),
          ...(tip ? { tip } : {}),
        };
      })
      .filter(Boolean) as SozlesmeNot[];
  }
  const text = (legacyText ?? "").trim();
  if (!text) return [];
  return [{ id: "legacy-1", text, veli_ile_paylas: true, tip: "genel" }];
}

export function notlarToLegacyText(notes: SozlesmeNot[]): string {
  return notes
    .filter((n) => n.veli_ile_paylas)
    .map((n) => n.text)
    .filter(Boolean)
    .join("\n\n");
}

export function notlarForPdf(notes: SozlesmeNot[]): string {
  return notes.filter((n) => n.veli_ile_paylas).map((n) => n.text).join("\n\n");
}

export function serializeNotlarForApi(
  notes: SozlesmeNot[],
  opts?: { forceKurumIci?: boolean },
) {
  const forceKurumIci = !!opts?.forceKurumIci;
  const normalized = notes
    .filter((n) => n.text.trim())
    .map((n) => ({
      ...n,
      text: n.text.trim(),
      veli_ile_paylas: forceKurumIci ? false : !!n.veli_ile_paylas,
    }));
  return {
    notlar_json: normalized.map((n) => ({
      id: n.id,
      text: n.text,
      veli_ile_paylas: n.veli_ile_paylas,
      ...(n.created_at ? { created_at: n.created_at } : {}),
      ...(n.created_by_name ? { created_by_name: n.created_by_name } : {}),
      ...(n.soz_verilen_tarih ? { soz_verilen_tarih: n.soz_verilen_tarih } : {}),
      ...(n.tip ? { tip: n.tip } : {}),
    })),
    // Tahsilat notları kurum içi: legacy/PDF metni boş kalır
    notlar: forceKurumIci ? "" : notlarToLegacyText(normalized),
  };
}

export function formatNoteDate(iso?: string | null): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

/** Durum değişikliği onay metinleri */
export const STATUS_CONFIRM_MESSAGES: Record<string, { title: string; body: string }> = {
  aktif: {
    title: "Sözleşmeyi Aktif Et",
    body: "Sözleşmeyi aktif duruma almak üzeresiniz. Bu işlem sözleşmenin yürürlüğe girdiğini ifade eder. Devam etmek istiyor musunuz?",
  },
  dondurulmus: {
    title: "Sözleşmeyi Pasif Et (Dondur)",
    body: "Sözleşmeyi dondurulmuş (pasif) duruma almak üzeresiniz. Bu işlem sözleşmenin geçici olarak askıya alındığını ifade eder. Devam etmek istiyor musunuz?",
  },
  tamamlandi: {
    title: "Sözleşmeyi Tamamlandı Olarak İşaretle",
    body: "Sözleşmeyi tamamlandı durumuna almak üzeresiniz. Bu işlem sözleşmenin tamamlandığını ifade eder. Ödeme planının tamamlanmış olması gerekir. Devam etmek istiyor musunuz?",
  },
  iptal: {
    title: "Sözleşmeyi İptal Et",
    body: "Sözleşmeyi iptal durumuna almak üzeresiniz. Bu işlem geri alınamaz bir iptal anlamına gelir. Devam etmek istiyor musunuz?",
  },
};
