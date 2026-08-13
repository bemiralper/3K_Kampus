'use client';

import { useEffect, useState } from 'react';
import type { SetOturumDurumPayload } from '@/lib/ozel-ders-api';
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
  busy?: boolean;
  onConfirm: (payload: SetOturumDurumPayload) => void | Promise<void>;
};

export default function YoklamaDurumDrawer({
  open,
  onClose,
  durum,
  description,
  notes,
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
          </label>
        )}

        <div className="od-form-group">
          <label>Not</label>
          <textarea
            rows={2}
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            placeholder="Opsiyonel"
          />
        </div>
      </form>
    </Drawer>
  );
}
