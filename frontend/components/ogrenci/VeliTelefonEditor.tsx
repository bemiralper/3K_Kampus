'use client';

import { formatPhone } from '@/app/ogrenciler/yeni-kayit/utils';
import './veli-telefon-editor.css';

export type VeliTelefonItem = {
  numara: string;
  etiket: string;
  whatsapp_varsayilan: boolean;
};

export function emptyTelefonItem(whatsapp = false): VeliTelefonItem {
  return { numara: '', etiket: 'Cep', whatsapp_varsayilan: whatsapp };
}

export function telefonlarFromLegacy(telefon?: string): VeliTelefonItem[] {
  const t = (telefon || '').trim();
  if (!t) return [emptyTelefonItem(true)];
  return [{ numara: t, etiket: 'Cep', whatsapp_varsayilan: true }];
}

export function ensureTelefonlar(list?: VeliTelefonItem[] | null, fallbackTelefon?: string): VeliTelefonItem[] {
  if (list && list.length > 0) {
    const cleaned = list.map((x) => ({
      numara: x.numara || '',
      etiket: x.etiket || 'Cep',
      whatsapp_varsayilan: !!x.whatsapp_varsayilan,
    }));
    if (!cleaned.some((x) => x.whatsapp_varsayilan)) cleaned[0].whatsapp_varsayilan = true;
    return cleaned;
  }
  return telefonlarFromLegacy(fallbackTelefon);
}

export function whatsappDefaultPhone(list: VeliTelefonItem[]): string {
  const wa = list.find((x) => x.whatsapp_varsayilan && x.numara.trim());
  if (wa) return wa.numara.trim();
  return list.find((x) => x.numara.trim())?.numara.trim() || '';
}

type Props = {
  value: VeliTelefonItem[];
  onChange: (next: VeliTelefonItem[]) => void;
  error?: string;
  idPrefix?: string;
};

export default function VeliTelefonEditor({ value, onChange, error, idPrefix = 'vt' }: Props) {
  const items = value.length ? value : [emptyTelefonItem(true)];

  const update = (index: number, patch: Partial<VeliTelefonItem>) => {
    const next = items.map((row, i) => (i === index ? { ...row, ...patch } : { ...row }));
    if (patch.whatsapp_varsayilan) {
      next.forEach((row, i) => {
        row.whatsapp_varsayilan = i === index;
      });
    }
    onChange(next);
  };

  const add = () => onChange([...items, emptyTelefonItem(false)]);
  const remove = (index: number) => {
    if (items.length <= 1) return;
    const next = items.filter((_, i) => i !== index);
    if (!next.some((x) => x.whatsapp_varsayilan) && next[0]) next[0].whatsapp_varsayilan = true;
    onChange(next);
  };

  return (
    <div className="vte">
      <div className="vte__head">
        <span className="vte__title">Telefon numaraları</span>
        <button type="button" className="vte__add" onClick={add}>
          + Numara ekle
        </button>
      </div>
      <p className="vte__hint">
        WhatsApp bildirimleri varsayılan seçili numaraya gider. Diğer GSM’ye manuel yazabilirsiniz.
      </p>
      <div className="vte__list">
        {items.map((row, index) => (
          <div key={`${idPrefix}-${index}`} className="vte__card">
            <div className="vte__fields">
              <label className="vte__field">
                <span>Numara</span>
                <input
                  type="text"
                  value={row.numara}
                  onChange={(e) => update(index, { numara: formatPhone(e.target.value) })}
                  placeholder="05XX XXX XX XX"
                />
              </label>
              <label className="vte__field vte__field--etiket">
                <span>Etiket</span>
                <input
                  type="text"
                  value={row.etiket}
                  onChange={(e) => update(index, { etiket: e.target.value })}
                  placeholder="Cep / İş"
                />
              </label>
            </div>
            <div className="vte__meta">
              <label className="vte__wa">
                <input
                  type="radio"
                  name={`${idPrefix}-wa`}
                  checked={!!row.whatsapp_varsayilan}
                  onChange={() => update(index, { whatsapp_varsayilan: true })}
                />
                <span>WhatsApp varsayılan</span>
              </label>
              {items.length > 1 && (
                <button type="button" className="vte__remove" onClick={() => remove(index)}>
                  Sil
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && <span className="vte__error">{error}</span>}
    </div>
  );
}
