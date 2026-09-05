import dayjs from 'dayjs';

export type SlotSureForm = {
  baslangic_tarihi: string;
  bitis_tarihi: string;
  hedef_saat: string;
};

export const EMPTY_SLOT_SURE: SlotSureForm = {
  baslangic_tarihi: '',
  bitis_tarihi: '',
  hedef_saat: '',
};

export function slotSureFromLesson(lesson: {
  baslangic_tarihi?: string | null;
  bitis_tarihi?: string | null;
  hedef_dakika?: number | null;
}): SlotSureForm {
  const dk = lesson.hedef_dakika;
  return {
    baslangic_tarihi: lesson.baslangic_tarihi || '',
    bitis_tarihi: lesson.bitis_tarihi || '',
    hedef_saat: dk ? String(Math.round((dk / 60) * 10) / 10) : '',
  };
}

export function slotSurePayload(form: SlotSureForm) {
  const raw = form.hedef_saat.trim().replace(',', '.');
  const saat = raw === '' ? null : Number(raw);
  return {
    baslangic_tarihi: form.baslangic_tarihi || null,
    bitis_tarihi: form.bitis_tarihi || null,
    hedef_dakika: saat == null || Number.isNaN(saat) || saat <= 0 ? null : Math.round(saat * 60),
  };
}

export function addWeeksToDate(start: string, weeks: number): string {
  const base = start && dayjs(start).isValid() ? dayjs(start) : dayjs();
  return base.add(weeks, 'week').format('YYYY-MM-DD');
}

export function formatSaatFromDakika(dk: number | null | undefined): string {
  if (!dk) return '';
  const saat = dk / 60;
  return Number.isInteger(saat) ? String(saat) : saat.toFixed(1).replace('.', ',');
}

export function slotSureHint(form: SlotSureForm, opts: { gunLabel?: string; saat?: string }): string {
  const parts: string[] = [];
  if (form.baslangic_tarihi && form.bitis_tarihi) {
    const weeks = dayjs(form.bitis_tarihi).diff(dayjs(form.baslangic_tarihi), 'week', true);
    if (weeks > 0) {
      const rounded = Math.round(weeks * 10) / 10;
      parts.push(Number.isInteger(rounded) ? `${rounded} hafta` : `${rounded} hafta`);
    } else {
      parts.push(`${dayjs(form.baslangic_tarihi).format('DD.MM')}–${dayjs(form.bitis_tarihi).format('DD.MM')}`);
    }
  } else if (form.bitis_tarihi) {
    parts.push(`${dayjs(form.bitis_tarihi).format('DD.MM.YYYY')} tarihine kadar`);
  } else if (form.baslangic_tarihi) {
    parts.push(`${dayjs(form.baslangic_tarihi).format('DD.MM.YYYY')} itibarıyla`);
  }
  if (form.hedef_saat.trim()) {
    const n = Number(form.hedef_saat.replace(',', '.'));
    if (!Number.isNaN(n) && n > 0) {
      parts.push(`${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')} saat`);
    }
  }
  if (opts.gunLabel && opts.saat) {
    parts.push(`${opts.gunLabel} ${opts.saat}`);
  }
  return parts.join(' · ');
}
