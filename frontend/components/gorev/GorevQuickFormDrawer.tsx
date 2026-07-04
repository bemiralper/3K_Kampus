'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  createGorev,
  fetchGorevTipleri,
  seedGorevTipleri,
  ONCELIK_LABELS,
  type GorevTipi,
  type GorevOncelik,
} from '@/lib/gorev-api';
import { PERSONAL_GOREV_TIP_KODLARI } from '@/lib/gorev-actions';

type Props = {
  open: boolean;
  defaultDate?: string;
  onClose: () => void;
  onCreated: () => void;
};

export default function GorevQuickFormDrawer({ open, defaultDate, onClose, onCreated }: Props) {
  const [tipler, setTipler] = useState<GorevTipi[]>([]);
  const [baslik, setBaslik] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [gorevTipiId, setGorevTipiId] = useState('');
  const [oncelik, setOncelik] = useState<GorevOncelik>('NORMAL');
  const [sonTarih, setSonTarih] = useState('');
  const [tumGun, setTumGun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadTipler = useCallback(async () => {
    let res = await fetchGorevTipleri();
    if (res.success && res.data?.length === 0) {
      await seedGorevTipleri();
      res = await fetchGorevTipleri();
    }
    if (res.success && res.data) {
      const allowed = res.data.filter(t =>
        (PERSONAL_GOREV_TIP_KODLARI as readonly string[]).includes(t.kod),
      );
      setTipler(allowed);
      const hatirlatma = allowed.find(t => t.kod === 'HATIRLATMA') || allowed[0];
      if (hatirlatma) setGorevTipiId(hatirlatma.id);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadTipler();
      setBaslik('');
      setAciklama('');
      setError('');
      if (defaultDate) {
        const d = defaultDate.length <= 10 ? `${defaultDate}T09:00` : defaultDate.slice(0, 16);
        setSonTarih(d);
        setTumGun(defaultDate.length <= 10);
      }
    }
  }, [open, defaultDate, loadTipler]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baslik.trim() || !sonTarih) {
      setError('Başlık ve tarih zorunludur.');
      return;
    }
    setLoading(true);
    setError('');

    const res = await createGorev({
      baslik: baslik.trim(),
      aciklama: aciklama.trim(),
      gorev_tipi_id: gorevTipiId,
      oncelik,
      son_tarih: new Date(sonTarih).toISOString(),
      tum_gun: tumGun,
      hedef_tipi: 'KULLANICI',
      hedef_user_ids: [],
    } as Parameters<typeof createGorev>[0]);

    setLoading(false);
    if (res.success) {
      onCreated();
      onClose();
    } else {
      setError(res.error || 'Görev oluşturulamadı');
    }
  };

  return (
    <div className="gorev-drawer-backdrop" onClick={onClose}>
      <div className="gorev-drawer gorev-quick-form" onClick={e => e.stopPropagation()}>
        <h3>Yeni Hatırlatma / Görev</h3>
        <p className="gorev-drawer-meta">Kişisel görev — yalnızca size atanır.</p>

        <form onSubmit={handleSubmit}>
          <label className="gorev-field">
            <span>Başlık</span>
            <input value={baslik} onChange={e => setBaslik(e.target.value)} placeholder="Ne yapılacak?" required />
          </label>

          <label className="gorev-field">
            <span>Açıklama (opsiyonel)</span>
            <textarea value={aciklama} onChange={e => setAciklama(e.target.value)} rows={2} />
          </label>

          <div className="gorev-form-row">
            <label className="gorev-field">
              <span>Tip</span>
              <select value={gorevTipiId} onChange={e => setGorevTipiId(e.target.value)}>
                {tipler.map(t => (
                  <option key={t.id} value={t.id}>{t.ikon} {t.ad}</option>
                ))}
              </select>
            </label>
            <label className="gorev-field">
              <span>Öncelik</span>
              <select value={oncelik} onChange={e => setOncelik(e.target.value as GorevOncelik)}>
                {(Object.keys(ONCELIK_LABELS) as GorevOncelik[]).map(k => (
                  <option key={k} value={k}>{ONCELIK_LABELS[k]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="gorev-form-row">
            <label className="gorev-field">
              <span>Tarih / Saat</span>
              <input
                type={tumGun ? 'date' : 'datetime-local'}
                value={tumGun ? sonTarih.slice(0, 10) : sonTarih}
                onChange={e => setSonTarih(e.target.value)}
                required
              />
            </label>
            <label className="gorev-field gorev-field-check">
              <input type="checkbox" checked={tumGun} onChange={e => setTumGun(e.target.checked)} />
              <span>Tüm gün</span>
            </label>
          </div>

          {error && <p className="gorev-form-error">{error}</p>}

          <div className="gorev-drawer-actions">
            <button type="button" className="gorev-btn gorev-btn-ghost" onClick={onClose}>
              İptal
            </button>
            <button type="submit" className="gorev-btn gorev-btn-primary" disabled={loading}>
              {loading ? 'Kaydediliyor…' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
