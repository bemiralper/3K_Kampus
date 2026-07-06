/** Sözleşme notları — yapılandırılmış görünürlük */

export type SozlesmeNot = {
  id: string;
  text: string;
  veli_ile_paylas: boolean;
};

export function createEmptyNote(): SozlesmeNot {
  return {
    id: crypto.randomUUID?.() ?? `note-${Date.now()}`,
    text: '',
    veli_ile_paylas: false,
  };
}

export function parseNotlarJson(raw: unknown, legacyText?: string): SozlesmeNot[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((item, idx) => {
        if (!item || typeof item !== 'object') return null;
        const rec = item as Record<string, unknown>;
        const text = String(rec.text ?? '').trim();
        if (!text) return null;
        return {
          id: String(rec.id ?? `note-${idx + 1}`),
          text,
          veli_ile_paylas: Boolean(rec.veli_ile_paylas),
        };
      })
      .filter(Boolean) as SozlesmeNot[];
  }
  const text = (legacyText ?? '').trim();
  if (!text) return [];
  return [{ id: 'legacy-1', text, veli_ile_paylas: true }];
}

export function notlarToLegacyText(notes: SozlesmeNot[]): string {
  return notes.map((n) => n.text).filter(Boolean).join('\n\n');
}

export function notlarForPdf(notes: SozlesmeNot[]): string {
  return notes.filter((n) => n.veli_ile_paylas).map((n) => n.text).join('\n\n');
}

export function serializeNotlarForApi(notes: SozlesmeNot[]) {
  return {
    notlar_json: notes.filter((n) => n.text.trim()),
    notlar: notlarToLegacyText(notes),
  };
}

/** Durum değişikliği onay metinleri */
export const STATUS_CONFIRM_MESSAGES: Record<string, { title: string; body: string }> = {
  aktif: {
    title: 'Sözleşmeyi Aktif Et',
    body: 'Sözleşmeyi aktif duruma almak üzeresiniz. Bu işlem sözleşmenin yürürlüğe girdiğini ifade eder. Devam etmek istiyor musunuz?',
  },
  dondurulmus: {
    title: 'Sözleşmeyi Pasif Et (Dondur)',
    body: 'Sözleşmeyi dondurulmuş (pasif) duruma almak üzeresiniz. Bu işlem sözleşmenin geçici olarak askıya alındığını ifade eder. Devam etmek istiyor musunuz?',
  },
  tamamlandi: {
    title: 'Sözleşmeyi Tamamlandı Olarak İşaretle',
    body: 'Sözleşmeyi tamamlandı durumuna almak üzeresiniz. Bu işlem sözleşmenin tamamlandığını ifade eder. Ödeme planının tamamlanmış olması gerekir. Devam etmek istiyor musunuz?',
  },
  iptal: {
    title: 'Sözleşmeyi İptal Et',
    body: 'Sözleşmeyi iptal durumuna almak üzeresiniz. Bu işlem geri alınamaz bir iptal anlamına gelir. Devam etmek istiyor musunuz?',
  },
};
