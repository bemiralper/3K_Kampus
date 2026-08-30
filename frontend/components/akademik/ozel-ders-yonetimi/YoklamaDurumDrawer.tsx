'use client';

import { useEffect, useMemo, useState } from 'react';
import { WhatsAppPreviewBubble } from '@/components/communication';
import '@/components/communication/communication.css';
import type { SetOturumDurumPayload } from '@/lib/ozel-ders-api';
import {
  OZEL_DERS_WHATSAPP_TEMPLATES,
  ozelDersEventKey,
  resolveOzelDersTemplate,
  type OzelDersPreviewContext,
} from '@/lib/ozel-ders-whatsapp-templates';
import { Drawer } from './ozelDersUi';
import {
  defaultSendWhatsapp,
  needsSebep,
  needsTelafiChoice,
  OTURUM_DURUM_LABEL,
  SEBEP_OPTIONS,
  TELAFI_DURUM_LABEL,
} from './oturumDurum';

type Props = {
  open: boolean;
  onClose: () => void;
  durum: string;
  description?: string;
  notes?: string;
  preview?: OzelDersPreviewContext;
  busy?: boolean;
  onConfirm: (payload: SetOturumDurumPayload) => void | Promise<void>;
};

function sebepLabel(kod: string, aciklama: string): string {
  const opt = SEBEP_OPTIONS.find((o) => o.value === kod);
  if (kod === 'DIGER' && aciklama.trim()) return aciklama.trim();
  if (opt && aciklama.trim()) return `${opt.label} — ${aciklama.trim()}`;
  return aciklama.trim() || opt?.label || '';
}

export default function YoklamaDurumDrawer({
  open,
  onClose,
  durum,
  description,
  notes,
  preview,
  busy,
  onConfirm,
}: Props) {
  const [sebepKodu, setSebepKodu] = useState('');
  const [sebepAciklama, setSebepAciklama] = useState('');
  const [telafiDurumu, setTelafiDurumu] = useState<'GEREKMIYOR' | 'BEKLENIYOR'>('BEKLENIYOR');
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [localNotes, setLocalNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setSebepKodu('');
    setSebepAciklama('');
    setTelafiDurumu('BEKLENIYOR');
    setSendWhatsapp(defaultSendWhatsapp(durum));
    setLocalNotes(notes || '');
  }, [open, durum, notes]);

  const sebepRequired = needsSebep(durum);
  const telafiRequired = needsTelafiChoice(durum);
  const showWhatsapp = ['ISLENDI', 'ONLINE', 'OGRETMEN_GELMEDI', 'OGRENCI_GELMEDI', 'IPTAL'].includes(
    durum,
  );
  const sebepInvalid =
    sebepRequired && (!sebepKodu || (sebepKodu === 'DIGER' && !sebepAciklama.trim()));

  const eventKey = ozelDersEventKey(durum, telafiDurumu);
  const template = eventKey ? OZEL_DERS_WHATSAPP_TEMPLATES[eventKey] : undefined;
  const usesEkBilgi = eventKey === 'ozel_ders.iptal';

  const previewText = useMemo(() => {
    if (!template) return '';
    return resolveOzelDersTemplate(template.body, {
      ogrenci_ad: preview?.ogrenci_ad || '…',
      ders_tarihi: preview?.ders_tarihi || '…',
      ders_saati: preview?.ders_saati || '…',
      ders_adi: preview?.ders_adi || '…',
      ogretmen_ad: preview?.ogretmen_ad || '',
      sebep: sebepLabel(sebepKodu, sebepAciklama) || '…',
      ek_bilgi: localNotes.trim(),
      telafi_tarihi: preview?.telafi_tarihi || '',
      telafi_saati: preview?.telafi_saati || '',
    });
  }, [template, preview, sebepKodu, sebepAciklama, localNotes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sebepInvalid) return;
    const payload: SetOturumDurumPayload = {
      durum,
      notes: localNotes.trim() || undefined,
      send_whatsapp: sendWhatsapp,
    };
    if (sebepRequired) {
      payload.sebep_kodu = sebepKodu;
      if (sebepAciklama.trim()) payload.sebep_aciklama = sebepAciklama.trim();
    }
    if (telafiRequired) payload.telafi_durumu = telafiDurumu;
    await onConfirm(payload);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Yoklama: ${OTURUM_DURUM_LABEL[durum] || durum}`}
      description={description}
      footer={
        <>
          <button type="button" className="od-btn od-btn-secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="submit"
            form="od-yoklama-durum-form"
            className="od-btn od-btn-primary"
            disabled={busy || sebepInvalid}
          >
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      <form id="od-yoklama-durum-form" className="od-form" onSubmit={handleSubmit}>
        {sebepRequired && (
          <>
            <div className="od-form-group">
              <label>
                Sebep <span className="req">*</span>
              </label>
              <select required value={sebepKodu} onChange={(e) => setSebepKodu(e.target.value)}>
                <option value="">Seçin</option>
                {SEBEP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {sebepKodu === 'DIGER' && (
              <div className="od-form-group">
                <label>
                  Açıklama <span className="req">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={sebepAciklama}
                  onChange={(e) => setSebepAciklama(e.target.value)}
                  placeholder="Kısa açıklama"
                />
              </div>
            )}
          </>
        )}

        {telafiRequired && (
          <div className="od-form-group">
            <label>
              Telafi <span className="req">*</span>
            </label>
            <select
              required
              value={telafiDurumu}
              onChange={(e) => setTelafiDurumu(e.target.value as 'GEREKMIYOR' | 'BEKLENIYOR')}
            >
              <option value="BEKLENIYOR">{TELAFI_DURUM_LABEL.BEKLENIYOR}</option>
              <option value="GEREKMIYOR">{TELAFI_DURUM_LABEL.GEREKMIYOR}</option>
            </select>
          </div>
        )}

        {showWhatsapp && (
          <label className="od-checkbox-row">
            <input
              type="checkbox"
              checked={sendWhatsapp}
              onChange={(e) => setSendWhatsapp(e.target.checked)}
            />
            Veliye WhatsApp bildirimi gönder
            {template ? ` — ${template.title}` : ''}
          </label>
        )}

        <div className="od-form-group">
          <label>{usesEkBilgi && sendWhatsapp ? 'Ek bilgi (velilere gider)' : 'Not'}</label>
          <textarea
            rows={2}
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            placeholder={usesEkBilgi && sendWhatsapp ? 'İsteğe bağlı ek cümle' : 'Opsiyonel'}
          />
        </div>

        {showWhatsapp && sendWhatsapp && template && (
          <div className="od-wa-preview-wrap">
            <span className="od-form-hint">
              Şablon: {template.title}
              {preview?.ogrenci_ad ? ` · ${preview.ogrenci_ad}` : ''}
            </span>
            <WhatsAppPreviewBubble text={previewText} className="od-wa-preview" />
          </div>
        )}
      </form>
    </Drawer>
  );
}
