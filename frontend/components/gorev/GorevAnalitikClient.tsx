'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  fetchGorevAnalitik,
  DURUM_LABELS,
  type GorevAnalitik,
} from '@/lib/gorev-api';
import '@/components/gorev/gorev.css';

const ROLLER = [
  { code: '', label: 'Tüm Roller' },
  { code: 'koc', label: 'Koç' },
  { code: 'muhasebe', label: 'Muhasebe' },
  { code: 'kurum_yoneticisi', label: 'Yönetici' },
];

function defaultDateRange() {
  const bitis = new Date();
  const baslangic = new Date();
  baslangic.setDate(baslangic.getDate() - 30);
  return {
    baslangic: baslangic.toISOString().slice(0, 10),
    bitis: bitis.toISOString().slice(0, 10),
  };
}

export default function GorevAnalitikClient() {
  const [data, setData] = useState<GorevAnalitik | null>(null);
  const [loading, setLoading] = useState(true);
  const [rol, setRol] = useState('');
  const [range, setRange] = useState(defaultDateRange);

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (range.baslangic) params.baslangic = new Date(range.baslangic).toISOString();
    if (range.bitis) {
      const d = new Date(range.bitis);
      d.setHours(23, 59, 59, 999);
      params.bitis = d.toISOString();
    }
    if (rol) params.rol = rol;

    const res = await fetchGorevAnalitik(params);
    if (res.success && res.data) setData(res.data);
    setLoading(false);
  }, [range, rol]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <p className="gorev-loading">Analitik yükleniyor…</p>;
  }

  const ozet = data?.ozet;

  return (
    <div className="gorev-page gorev-analitik">
      <div className="gorev-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Görev Performans Analitiği</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Kim yaptı, kim geciktirdi, kim hiç açmadı
          </p>
        </div>
        <Link href="/admin/gorevler" className="gorev-btn gorev-btn-ghost">
          ← Görevlere Dön
        </Link>
      </div>

      <div className="gorev-analitik-filters">
        <label className="gorev-field" style={{ margin: 0 }}>
          <span>Başlangıç</span>
          <input
            type="date"
            value={range.baslangic}
            onChange={e => setRange(r => ({ ...r, baslangic: e.target.value }))}
          />
        </label>
        <label className="gorev-field" style={{ margin: 0 }}>
          <span>Bitiş</span>
          <input
            type="date"
            value={range.bitis}
            onChange={e => setRange(r => ({ ...r, bitis: e.target.value }))}
          />
        </label>
        <label className="gorev-field" style={{ margin: 0 }}>
          <span>Rol</span>
          <select value={rol} onChange={e => setRol(e.target.value)}>
            {ROLLER.map(r => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
        </label>
        <button type="button" className="gorev-btn gorev-btn-primary" onClick={load}>
          Uygula
        </button>
      </div>

      {ozet && (
        <div className="gorev-stats gorev-stats-wide">
          <div className="gorev-stat">
            <span className="gorev-stat-value">{ozet.toplam}</span>
            <span className="gorev-stat-label">Toplam Atama</span>
          </div>
          <div className="gorev-stat">
            <span className="gorev-stat-value" style={{ color: '#10b981' }}>{ozet.tamamlanan}</span>
            <span className="gorev-stat-label">Tamamlanan</span>
          </div>
          <div className="gorev-stat gorev-stat-danger">
            <span className="gorev-stat-value">{ozet.geciken}</span>
            <span className="gorev-stat-label">Geciken</span>
          </div>
          <div className="gorev-stat">
            <span className="gorev-stat-value" style={{ color: '#f59e0b' }}>{ozet.hic_acilmayan}</span>
            <span className="gorev-stat-label">Hiç Açılmayan</span>
          </div>
          <div className="gorev-stat">
            <span className="gorev-stat-value">{ozet.ortalama_tamamlama_saat}sa</span>
            <span className="gorev-stat-label">Ort. Tamamlama</span>
          </div>
          <div className="gorev-stat">
            <span className="gorev-stat-value">%{ozet.tamamlama_orani}</span>
            <span className="gorev-stat-label">Tamamlama Oranı</span>
          </div>
        </div>
      )}

      <div className="gorev-analitik-grid">
        <section className="gorev-analitik-panel">
          <h3>En Çok Geciken Personel</h3>
          {data?.en_cok_geciken?.length ? (
            <table className="gorev-table">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Rol</th>
                  <th>Geciken</th>
                  <th>Toplam</th>
                  <th>Oran</th>
                </tr>
              </thead>
              <tbody>
                {data.en_cok_geciken.filter(p => p.geciken > 0).map(p => (
                  <tr key={p.user_id}>
                    <td>{p.ad}</td>
                    <td>{p.rol || '—'}</td>
                    <td><strong style={{ color: '#dc2626' }}>{p.geciken}</strong></td>
                    <td>{p.toplam}</td>
                    <td>%{p.tamamlama_orani}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="gorev-empty">Geciken görev yok.</p>
          )}
        </section>

        <section className="gorev-analitik-panel">
          <h3>Rol Kırılımı</h3>
          {data?.rol_kirilimi?.length ? (
            <ul className="gorev-rol-list">
              {data.rol_kirilimi.map(r => (
                <li key={r.rol}>
                  <strong>{r.rol}</strong>
                  <span>{r.tamamlanan}/{r.toplam} tamamlandı</span>
                  {r.geciken > 0 && <span className="gorev-badge gorev-badge-kritik">{r.geciken} geciken</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="gorev-empty">Veri yok.</p>
          )}
        </section>
      </div>

      <section className="gorev-analitik-panel" style={{ marginTop: 20 }}>
        <h3>Tüm Personel Performansı</h3>
        {data?.personel_performans?.length ? (
          <div className="gorev-table-wrap">
            <table className="gorev-table">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Rol</th>
                  <th>Toplam</th>
                  <th>Tamamlanan</th>
                  <th>Geciken</th>
                  <th>Hiç Açılmayan</th>
                  <th>Ort. Süre</th>
                  <th>Oran</th>
                </tr>
              </thead>
              <tbody>
                {data.personel_performans.map(p => (
                  <tr key={p.user_id}>
                    <td>{p.ad}</td>
                    <td>{p.rol || '—'}</td>
                    <td>{p.toplam}</td>
                    <td style={{ color: '#10b981' }}>{p.tamamlanan}</td>
                    <td style={{ color: p.geciken ? '#dc2626' : undefined }}>{p.geciken}</td>
                    <td style={{ color: p.hic_acilmayan ? '#f59e0b' : undefined }}>{p.hic_acilmayan}</td>
                    <td>{p.ortalama_tamamlama_saat > 0 ? `${p.ortalama_tamamlama_saat}sa` : '—'}</td>
                    <td>%{p.tamamlama_orani}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="gorev-empty">Bu dönemde atama bulunamadı.</p>
        )}
      </section>

      <section className="gorev-analitik-panel" style={{ marginTop: 20 }}>
        <h3>Son Görev Hareketleri</h3>
        {data?.son_gorevler?.length ? (
          <ul className="gorev-list">
            {data.son_gorevler.map(g => (
              <li key={g.atama_id}>
                <div className="gorev-card" style={{ cursor: 'default' }}>
                  <div className="gorev-card-body">
                    <strong>{g.baslik}</strong>
                    <span className="gorev-card-meta">
                      {g.atanan} · {g.gorev_tipi} · {DURUM_LABELS[g.durum as keyof typeof DURUM_LABELS] || g.durum}
                      {g.gecikti_mi && ' · Gecikmiş'}
                      {!g.ilk_acilma_at && ' · Açılmadı'}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gorev-empty">Kayıt yok.</p>
        )}
      </section>
    </div>
  );
}
