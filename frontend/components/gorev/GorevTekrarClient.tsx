'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchTekrarSablonlari, createTekrarSablonu, deleteTekrarSablonu,
  fetchGorevTipleri, seedGorevTipleri,
  TEKRAR_LABELS, HEDEF_LABELS,
  type GorevTekrarSablonu, type GorevTipi, type TekrarTipi, type HedefTipi,
} from '@/lib/gorev-api';
import '@/components/gorev/gorev.css';

const ROLLER = [
  { code: 'koc', label: 'Koçlar' },
  { code: 'muhasebe', label: 'Muhasebe' },
  { code: 'kurum_yoneticisi', label: 'Yöneticiler' },
];

export default function GorevTekrarClient() {
  const [sablonlar, setSablonlar] = useState<GorevTekrarSablonu[]>([]);
  const [tipler, setTipler] = useState<GorevTipi[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [baslik, setBaslik] = useState('');
  const [tekrarTipi, setTekrarTipi] = useState<TekrarTipi>('HAFTALIK_PAZARTESI');
  const [hedefRol, setHedefRol] = useState('koc');
  const [gorevTipiId, setGorevTipiId] = useState('');
  const [sonrakiTarih, setSonrakiTarih] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let tipRes = await fetchGorevTipleri();
    if (tipRes.success && tipRes.data?.length === 0) {
      await seedGorevTipleri();
      tipRes = await fetchGorevTipleri();
    }
    if (tipRes.success && tipRes.data) {
      setTipler(tipRes.data);
      if (!gorevTipiId && tipRes.data.length) {
        setGorevTipiId(tipRes.data.find(t => t.kod === 'YAPILACAK')?.id || tipRes.data[0].id);
      }
    }
    const res = await fetchTekrarSablonlari();
    if (res.success && res.data) setSablonlar(res.data);
    setLoading(false);
  }, [gorevTipiId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createTekrarSablonu({
      baslik,
      gorev_tipi_id: gorevTipiId,
      tekrar_tipi: tekrarTipi,
      hedef_tipi: 'ROL' as HedefTipi,
      hedef_rol_kodu: hedefRol,
      sonraki_uretim_tarihi: sonrakiTarih,
      tum_gun: true,
    });
    if (res.success) {
      setShowForm(false);
      setBaslik('');
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu tekrar şablonunu silmek istediğinizden emin misiniz?')) return;
    await deleteTekrarSablonu(id);
    load();
  };

  return (
    <div className="gorev-page">
      <div className="gorev-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>Tekrarlayan Görev Şablonları</h2>
        <button type="button" className="gorev-btn gorev-btn-primary" onClick={() => setShowForm(true)}>
          + Yeni Şablon
        </button>
      </div>

      {showForm && (
        <form className="gorev-form" style={{ marginBottom: 20 }} onSubmit={handleCreate}>
          <label className="gorev-field">
            <span>Başlık</span>
            <input value={baslik} onChange={e => setBaslik(e.target.value)} required />
          </label>
          <div className="gorev-form-row">
            <label className="gorev-field">
              <span>Tekrar</span>
              <select value={tekrarTipi} onChange={e => setTekrarTipi(e.target.value as TekrarTipi)}>
                {(Object.keys(TEKRAR_LABELS) as TekrarTipi[]).map(k => (
                  <option key={k} value={k}>{TEKRAR_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <label className="gorev-field">
              <span>Hedef Rol</span>
              <select value={hedefRol} onChange={e => setHedefRol(e.target.value)}>
                {ROLLER.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            </label>
          </div>
          <div className="gorev-form-row">
            <label className="gorev-field">
              <span>Görev Tipi</span>
              <select value={gorevTipiId} onChange={e => setGorevTipiId(e.target.value)}>
                {tipler.map(t => <option key={t.id} value={t.id}>{t.ad}</option>)}
              </select>
            </label>
            <label className="gorev-field">
              <span>İlk Üretim Tarihi</span>
              <input type="date" value={sonrakiTarih} onChange={e => setSonrakiTarih(e.target.value)} required />
            </label>
          </div>
          <div className="gorev-form-actions">
            <button type="button" className="gorev-btn gorev-btn-ghost" onClick={() => setShowForm(false)}>İptal</button>
            <button type="submit" className="gorev-btn gorev-btn-primary">Kaydet</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="gorev-loading">Yükleniyor…</p>
      ) : sablonlar.length === 0 ? (
        <p className="gorev-empty">Henüz tekrarlayan görev şablonu yok.</p>
      ) : (
        <ul className="gorev-list">
          {sablonlar.map(s => (
            <li key={s.id}>
              <div className="gorev-card" style={{ cursor: 'default' }}>
                <span className="gorev-card-icon" style={{ background: s.gorev_tipi?.renk || '#3B82F6' }}>
                  {s.gorev_tipi?.ikon || '🔁'}
                </span>
                <div className="gorev-card-body">
                  <strong>{s.baslik}</strong>
                  <span className="gorev-card-meta">
                    {TEKRAR_LABELS[s.tekrar_tipi]} · {HEDEF_LABELS[s.hedef_tipi]} {s.hedef_rol_kodu}
                    · Sonraki: {s.sonraki_uretim_tarihi}
                  </span>
                </div>
                <button type="button" className="gorev-btn gorev-btn-ghost" onClick={() => handleDelete(s.id)}>
                  Sil
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
