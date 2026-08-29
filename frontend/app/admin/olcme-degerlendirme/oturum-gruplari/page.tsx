'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { oturumAyarlariApi } from '../../../../components/olcme/api';
import type { OturumOgrenciAyar, OturumSeviyeAyar } from '../../../../components/olcme/api';
import Icon from '../../../../components/olcme/ui/Icon';
import s from './oturumGruplari.module.css';

type Pref = 'HAFTA_ICI' | 'HAFTA_SONU';

function fold(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function matchesStudent(row: OturumOgrenciAyar, query: string) {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = fold([row.full_name, row.tc_kimlik_no, row.sinif, row.sinif_seviyesi].filter(Boolean).join(' '));
  return tokens.every(tok => hay.includes(tok));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function Seg({ value, onChange }: { value: Pref; onChange: (v: Pref) => void }) {
  return (
    <div className={s.seg} role="group">
      <button type="button" className={`${s.segBtn} ${value === 'HAFTA_ICI' ? s.segOn : ''}`} onClick={() => onChange('HAFTA_ICI')}>
        Hafta içi
      </button>
      <button type="button" className={`${s.segBtn} ${value === 'HAFTA_SONU' ? s.segOn : ''}`} onClick={() => onChange('HAFTA_SONU')}>
        Hafta sonu
      </button>
    </div>
  );
}

export default function OturumGruplariPage() {
  const [seviyeler, setSeviyeler] = useState<OturumSeviyeAyar[]>([]);
  const [savedSeviyeler, setSavedSeviyeler] = useState<OturumSeviyeAyar[]>([]);
  const [students, setStudents] = useState<OturumOgrenciAyar[]>([]);
  const [paketler, setPaketler] = useState<{ id: number; ad: string }[]>([]);
  const [paketId, setPaketId] = useState<number | ''>('');
  const [seviyeId, setSeviyeId] = useState<number | ''>('');
  const [group, setGroup] = useState('');
  const [q, setQ] = useState('');
  const [booting, setBooting] = useState(true);
  const [listBusy, setListBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const dirty = useMemo(
    () => seviyeler.some((row, i) => row.preference !== savedSeviyeler[i]?.preference),
    [seviyeler, savedSeviyeler],
  );

  const stats = useMemo(() => {
    const weekday = students.filter(x => x.preference === 'HAFTA_ICI').length;
    const weekend = students.filter(x => x.preference === 'HAFTA_SONU').length;
    const special = students.filter(x => x.is_override).length;
    return { weekday, weekend, special, total: students.length };
  }, [students]);

  const visible = useMemo(
    () => (q.trim() ? students.filter(row => matchesStudent(row, q)) : students),
    [students, q],
  );

  const hasFilter = Boolean(q.trim() || paketId || seviyeId || group);

  const loadSeviye = useCallback(async () => {
    const data = await oturumAyarlariApi.seviyeler();
    setSeviyeler(data.items);
    setSavedSeviyeler(data.items);
  }, []);

  const loadStudents = useCallback(async () => {
    setListBusy(true);
    try {
      const data = await oturumAyarlariApi.ogrenciler({
        paket_id: paketId,
        seviye_id: seviyeId,
        group,
      });
      setStudents(data.items);
      setPaketler(data.paketler);
    } finally {
      setListBusy(false);
    }
  }, [paketId, seviyeId, group]);

  useEffect(() => {
    setError('');
    Promise.all([
      loadSeviye(),
    ])
      .catch(e => setError(e instanceof Error ? e.message : 'Yüklenemedi.'))
      .finally(() => setBooting(false));
  }, [loadSeviye]);

  useEffect(() => {
    if (booting) return;
    loadStudents().catch(e => setError(e instanceof Error ? e.message : 'Liste alınamadı.'));
  }, [booting, loadStudents]);

  const setSeviyePref = (id: number, preference: Pref) => {
    setSeviyeler(p => p.map(x => (x.sinif_seviyesi_id === id ? { ...x, preference } : x)));
  };

  const saveSeviyeler = async () => {
    setSaving(true);
    setError('');
    try {
      const data = await oturumAyarlariApi.saveSeviyeler(
        seviyeler.map(x => ({ sinif_seviyesi_id: x.sinif_seviyesi_id, preference: x.preference })),
      );
      setSeviyeler(data.items);
      setSavedSeviyeler(data.items);
      setToast('Sınıf seviyeleri kaydedildi');
      setTimeout(() => setToast(''), 2800);
      await loadStudents();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setQ('');
    setPaketId('');
    setSeviyeId('');
    setGroup('');
  };

  const patchStudent = async (id: number, preference: Pref | 'default') => {
    setError('');
    const prev = students;
    setStudents(p => p.map(row => {
      if (row.ogrenci_id !== id) return row;
      if (preference === 'default') return { ...row, is_override: false };
      return { ...row, preference, is_override: true };
    }));
    try {
      await oturumAyarlariApi.patchOgrenci(id, preference);
      await loadStudents();
    } catch (e: unknown) {
      setStudents(prev);
      setError(e instanceof Error ? e.message : 'Öğrenci güncellenemedi.');
    }
  };

  return (
    <div className={s.page}>
      {toast && <div className={s.toast}>{toast}</div>}

      <header className={s.header}>
        <div className={s.headerTop}>
          <div className={s.titleBlock}>
            <span className={s.titleIcon}><Icon name="calendar" size={22} /></span>
            <div>
              <h1 className={s.title}>Hafta içi ve hafta sonu</h1>
              <p className={s.subtitle}>
                Sınıf seviyesi hangi güne girer, buradan belirlenir. İsteyen öğrenci listeden ayrı güne alınır.
              </p>
            </div>
          </div>
          <button type="button" className={s.action} disabled={saving || !dirty} onClick={saveSeviyeler}>
            <Icon name="save" size={14} />
            {saving ? 'Kaydediliyor…' : 'Seviyeleri kaydet'}
          </button>
        </div>
        <div className={s.metrics}>
          <div className={s.metric}>
            <span className={s.metricValue}>{booting ? '—' : stats.weekday}</span>
            <span className={s.metricLabel}>Hafta içi öğrenci</span>
          </div>
          <div className={s.metric}>
            <span className={s.metricValue}>{booting ? '—' : stats.weekend}</span>
            <span className={s.metricLabel}>Hafta sonu öğrenci</span>
          </div>
          <div className={s.metric}>
            <span className={s.metricValue}>{booting ? '—' : stats.special}</span>
            <span className={s.metricLabel}>Seviyesinden farklı</span>
          </div>
        </div>
      </header>

      {error && <div className={s.error}>{error}</div>}

      {booting ? (
        <div className={s.card}><div className={s.loading}>Yükleniyor…</div></div>
      ) : (
        <>
          <section className={s.card}>
            <div className={s.cardHead}>
              <div>
                <h2>Sınıf seviyeleri</h2>
                <p>Eğitim Tanımları’ndaki sınıf seviyeleri. Mezun genelde hafta sonu, diğerleri hafta içi.</p>
              </div>
              {dirty && <span className={s.dirty}>Kaydedilmedi</span>}
            </div>
            <div className={s.seviyeGrid}>
              {seviyeler.map(row => (
                <div key={row.sinif_seviyesi_id} className={`${s.seviyeCard}${row.aktif_mi === false ? ` ${s.seviyePasif}` : ''}`}>
                  <div>
                    <div className={s.seviyeName}>{row.sinif_seviyesi}</div>
                    <div className={s.seviyeKod}>{row.kod || '—'}{row.aktif_mi === false ? ' · pasif' : ''}</div>
                  </div>
                  <Seg value={row.preference} onChange={pref => setSeviyePref(row.sinif_seviyesi_id, pref)} />
                </div>
              ))}
            </div>
          </section>

          <section className={s.card}>
            <div className={s.cardHead}>
              <div>
                <h2>Öğrenciler</h2>
                <p>Deneme paketindeki öğrenciler. Seviyesinden farklı güne almak için satırdaki seçimi değiştirin.</p>
              </div>
              <span className={s.meta}>
                {q.trim() && visible.length !== stats.total
                  ? `${visible.length} / ${stats.total} kişi`
                  : `${stats.total} kişi`}
              </span>
            </div>

            <div className={s.toolbar}>
              <div className={s.searchBox}>
                <Icon name="search" size={14} className={s.searchIcon} />
                <input
                  className={s.searchInput}
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Ad, soyad, sınıf veya TC"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape' && q) setQ(''); }}
                  aria-label="Öğrenci ara"
                />
                {q && (
                  <button type="button" className={s.searchClear} onClick={() => setQ('')} aria-label="Aramayı temizle">
                    <Icon name="close" size={13} />
                  </button>
                )}
              </div>
              <select className={s.select} value={paketId} onChange={e => setPaketId(e.target.value ? Number(e.target.value) : '')} aria-label="Paket filtresi">
                <option value="">Tüm paketler</option>
                {paketler.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
              </select>
              <select className={s.select} value={seviyeId} onChange={e => setSeviyeId(e.target.value ? Number(e.target.value) : '')} aria-label="Seviye filtresi">
                <option value="">Tüm seviyeler</option>
                {seviyeler.map(sv => (
                  <option key={sv.sinif_seviyesi_id} value={sv.sinif_seviyesi_id}>{sv.sinif_seviyesi}</option>
                ))}
              </select>
              <div className={s.chips}>
                <button type="button" className={`${s.chip} ${group === '' ? s.chipOn : ''}`} onClick={() => setGroup('')}>Hepsi</button>
                <button type="button" className={`${s.chip} ${group === 'HAFTA_ICI' ? s.chipOn : ''}`} onClick={() => setGroup('HAFTA_ICI')}>Hafta içi</button>
                <button type="button" className={`${s.chip} ${group === 'HAFTA_SONU' ? s.chipOn : ''}`} onClick={() => setGroup('HAFTA_SONU')}>Hafta sonu</button>
              </div>
              {hasFilter && (
                <button type="button" className={s.clearFilters} onClick={clearFilters}>
                  <Icon name="close" size={13} />
                  Filtreleri temizle
                </button>
              )}
            </div>

            {listBusy && students.length === 0 ? (
              <div className={s.loading}>Liste yükleniyor…</div>
            ) : students.length === 0 ? (
              <div className={s.empty}>Bu filtrede deneme paketinde öğrenci yok.</div>
            ) : visible.length === 0 ? (
              <div className={s.empty}>
                Aramaya uyan öğrenci yok.
                <button type="button" className={s.emptyClear} onClick={() => setQ('')}>Aramayı temizle</button>
              </div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Öğrenci</th>
                      <th>Sınıf</th>
                      <th>Gün</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(row => (
                      <tr key={row.ogrenci_id}>
                        <td>
                          <div className={s.person}>
                            <span className={s.avatar}>{initials(row.full_name)}</span>
                            <div>
                              <div className={s.name}>
                                {row.full_name}
                                {row.is_override && <span className={s.ozel}>Özel</span>}
                              </div>
                              {row.tc_kimlik_no && <div className={s.meta}>{row.tc_kimlik_no}</div>}
                            </div>
                          </div>
                        </td>
                        <td className={s.meta}>{row.sinif || row.sinif_seviyesi || '—'}</td>
                        <td style={{ width: 220 }}>
                          <Seg value={row.preference} onChange={pref => patchStudent(row.ogrenci_id, pref)} />
                        </td>
                        <td style={{ width: 88 }}>
                          {row.is_override && (
                            <button type="button" className={s.reset} onClick={() => patchStudent(row.ogrenci_id, 'default')}>
                              Sıfırla
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
