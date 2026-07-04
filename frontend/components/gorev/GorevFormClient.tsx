'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchGorevTipleri, seedGorevTipleri, createGorev, fetchGorevDetail, updateGorev,
  ONCELIK_LABELS, HEDEF_LABELS,
  type GorevTipi, type GorevOncelik, type HedefTipi,
} from '@/lib/gorev-api';
import PersonelUserPicker, { type SelectedPersonel } from '@/components/gorev/PersonelUserPicker';

const ROLLER = [
  { code: 'koc', label: 'Koçlar' },
  { code: 'muhasebe', label: 'Muhasebe' },
  { code: 'ogretmen', label: 'Öğretmenler' },
  { code: 'kurum_yoneticisi', label: 'Yöneticiler' },
];

function toLocalInput(iso: string, tumGun: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (tumGun) return d.toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  gorevId?: string;
};

export default function GorevFormClient({ gorevId }: Props) {
  const router = useRouter();
  const isEdit = Boolean(gorevId);
  const [tipler, setTipler] = useState<GorevTipi[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingGorev, setLoadingGorev] = useState(isEdit);
  const [error, setError] = useState('');

  const [baslik, setBaslik] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [gorevTipiId, setGorevTipiId] = useState('');
  const [oncelik, setOncelik] = useState<GorevOncelik>('NORMAL');
  const [sonTarih, setSonTarih] = useState('');
  const [tumGun, setTumGun] = useState(false);
  const [hedefTipi, setHedefTipi] = useState<HedefTipi>('ROL');
  const [hedefRol, setHedefRol] = useState('koc');
  const [selectedPersonel, setSelectedPersonel] = useState<SelectedPersonel[]>([]);
  const [ekranMesaji, setEkranMesaji] = useState(false);

  const loadTipler = useCallback(async () => {
    let res = await fetchGorevTipleri();
    if (res.success && res.data && res.data.length === 0) {
      await seedGorevTipleri();
      res = await fetchGorevTipleri();
    }
    if (res.success && res.data) {
      setTipler(res.data);
      if (res.data.length && !gorevTipiId && !isEdit) {
        const yapilacak = res.data.find(t => t.kod === 'YAPILACAK') || res.data[0];
        setGorevTipiId(yapilacak.id);
      }
    }
  }, [gorevTipiId, isEdit]);

  useEffect(() => { loadTipler(); }, [loadTipler]);

  useEffect(() => {
    if (oncelik === 'KRITIK' || oncelik === 'YUKSEK') {
      setEkranMesaji(true);
    }
  }, [oncelik]);

  useEffect(() => {
    if (!gorevId) return;
    setLoadingGorev(true);
    fetchGorevDetail(gorevId).then(res => {
      if (res.success && res.data) {
        const g = res.data;
        setBaslik(g.baslik);
        setAciklama(g.aciklama || '');
        setGorevTipiId(g.gorev_tipi_id || '');
        setOncelik(g.oncelik);
        setEkranMesaji(Boolean(g.ekran_mesaji));
        setTumGun(g.tum_gun);
        setSonTarih(toLocalInput(g.son_tarih, g.tum_gun));
        setHedefTipi(g.hedef_tipi);
        setHedefRol(g.hedef_rol_kodu || 'koc');
        if (g.atamalar?.length) {
          setSelectedPersonel(
            g.atamalar.map(a => ({
              userId: a.atanan_user_id,
              tamAd: a.atanan_ad || `Kullanıcı #${a.atanan_user_id}`,
            })),
          );
        }
      } else {
        setError(res.error || 'Görev yüklenemedi');
      }
      setLoadingGorev(false);
    });
  }, [gorevId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baslik || !sonTarih) {
      setError('Başlık ve son tarih zorunludur.');
      return;
    }
    setLoading(true);
    setError('');

    const data: Record<string, unknown> = {
      baslik,
      aciklama,
      gorev_tipi_id: gorevTipiId,
      oncelik,
      son_tarih: new Date(sonTarih).toISOString(),
      tum_gun: tumGun,
      ekran_mesaji: ekranMesaji,
    };

    if (!isEdit) {
      data.hedef_tipi = hedefTipi;
      if (hedefTipi === 'ROL') data.hedef_rol_kodu = hedefRol;
      if (hedefTipi === 'KULLANICI') {
        if (selectedPersonel.length === 0) {
          setError('En az bir kişi seçmelisiniz.');
          setLoading(false);
          return;
        }
        data.hedef_user_ids = selectedPersonel.map(p => p.userId);
      }
    }

    const res = isEdit && gorevId
      ? await updateGorev(gorevId, data as Parameters<typeof updateGorev>[1])
      : await createGorev(data as Parameters<typeof createGorev>[0]);

    setLoading(false);
    if (res.success) {
      router.push('/admin/gorevler');
    } else {
      setError(res.error || (isEdit ? 'Görev güncellenemedi' : 'Görev oluşturulamadı'));
    }
  };

  if (loadingGorev) {
    return <p className="gorev-loading">Görev yükleniyor…</p>;
  }

  return (
    <form className="gorev-form" onSubmit={handleSubmit}>
      <h2>{isEdit ? 'Görevi Düzenle' : 'Yeni Görev Oluştur'}</h2>
      {error && <p className="gorev-form-error">{error}</p>}

      <label className="gorev-field">
        <span>Başlık *</span>
        <input value={baslik} onChange={e => setBaslik(e.target.value)} required />
      </label>

      <label className="gorev-field">
        <span>Açıklama</span>
        <textarea value={aciklama} onChange={e => setAciklama(e.target.value)} rows={3} />
      </label>

      <div className="gorev-form-row">
        <label className="gorev-field">
          <span>Görev Tipi</span>
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
          <span>Son Tarih *</span>
          <input
            type={tumGun ? 'date' : 'datetime-local'}
            value={sonTarih}
            onChange={e => setSonTarih(e.target.value)}
            required
          />
        </label>
        <label className="gorev-field gorev-field-check">
          <input type="checkbox" checked={tumGun} onChange={e => setTumGun(e.target.checked)} />
          <span>Tüm gün</span>
        </label>
      </div>

      <label className="gorev-field gorev-field-check gorev-field-screen">
        <input
          type="checkbox"
          checked={ekranMesaji}
          onChange={e => setEkranMesaji(e.target.checked)}
        />
        <span>
          <strong>Ekran mesajı gönder</strong>
          <small>Giriş yapıldığında bildirim sesi ile tam ekran uyarı gösterilir. Kritik/Yüksek öncelikte otomatik açılır.</small>
        </span>
      </label>

      {!isEdit && (
        <fieldset className="gorev-fieldset">
          <legend>Atama</legend>
          <div className="gorev-radio-group">
            {(Object.keys(HEDEF_LABELS) as HedefTipi[]).filter(h => h !== 'GRUP').map(h => (
              <label key={h} className="gorev-radio">
                <input type="radio" name="hedef" value={h} checked={hedefTipi === h} onChange={() => setHedefTipi(h)} />
                {HEDEF_LABELS[h]}
              </label>
            ))}
          </div>

          {hedefTipi === 'ROL' && (
            <select value={hedefRol} onChange={e => setHedefRol(e.target.value)} className="gorev-select-block">
              {ROLLER.map(r => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
          )}

          {hedefTipi === 'KULLANICI' && (
            <PersonelUserPicker
              value={selectedPersonel}
              onChange={setSelectedPersonel}
              placeholder="Ad veya soyad yazın…"
            />
          )}
        </fieldset>
      )}

      {isEdit && selectedPersonel.length > 0 && (
        <p className="gorev-form-hint">
          Atanan kişiler: {selectedPersonel.map(p => p.tamAd).join(', ')}
          {' '}(atama düzenlemesi ayrı yapılır)
        </p>
      )}

      <div className="gorev-form-actions">
        <button type="button" className="gorev-btn gorev-btn-ghost" onClick={() => router.back()}>
          İptal
        </button>
        <button type="submit" className="gorev-btn gorev-btn-primary" disabled={loading}>
          {loading ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Görev Oluştur'}
        </button>
      </div>
    </form>
  );
}
