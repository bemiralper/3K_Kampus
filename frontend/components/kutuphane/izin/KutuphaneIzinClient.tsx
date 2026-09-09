'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createBulkIzinler,
  createIzin,
  deleteIzin,
  fetchIzinler,
  updateIzin,
  type ExemptionType,
  type IzinSebepKodu,
  type IzinTekrarModu,
  type OgrenciIzin,
  type SessionCode,
} from '@/lib/kutuphane-api';
import { searchKutuphaneStudentsForIzin } from '@/lib/kutuphane-student-search';
import { useKutuphanePath } from '@/components/kutuphane/KutuphanePathProvider';
import {
  DAYS,
  PERIODS,
  SEBEP_OPTIONS,
  addDays,
  avatarGradient,
  formatWeekRangeTr,
  impactSummary,
  initials,
  isSingleDayRange,
  izinCoversCell,
  izinDurum,
  sebepShort,
  startOfIsoWeek,
  todayIso,
  toIsoDate,
} from './izinUtils';
import './kutuphane-izin.css';

type OgrenciOpt = { id: number; ad_soyad: string; sinif?: string };
type DurumFilter = 'aktif' | 'gecmis' | 'suresiz' | 'hepsi';
type DrawerMode = 'create' | 'edit' | 'bulk';

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function KutuphaneIzinClient() {
  const { href, isCoachMode } = useKutuphanePath();
  const router = useRouter();
  const params = useSearchParams();
  const ogrenciParam = params.get('ogrenci_id');

  const [izinler, setIzinler] = useState<OgrenciIzin[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [pickerQ, setPickerQ] = useState('');
  const [pickerOpts, setPickerOpts] = useState<OgrenciOpt[]>([]);
  const [selected, setSelected] = useState<OgrenciOpt | null>(null);

  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek(new Date()));
  const [durumFilter, setDurumFilter] = useState<DurumFilter>('aktif');
  const [busy, setBusy] = useState(false);

  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [editIzin, setEditIzin] = useState<OgrenciIzin | null>(null);
  const [formTekrar, setFormTekrar] = useState<IzinTekrarModu>('RANGE');
  const [formStart, setFormStart] = useState(todayIso());
  const [formEnd, setFormEnd] = useState(todayIso());
  const [formSuresiz, setFormSuresiz] = useState(false);
  const [formFullDay, setFormFullDay] = useState(false);
  const [formPeriods, setFormPeriods] = useState<SessionCode[]>(['MORNING']);
  const [formGunler, setFormGunler] = useState<number[]>([0]);
  const [formSebepKodu, setFormSebepKodu] = useState<IzinSebepKodu | ''>('');
  const [formSebep, setFormSebep] = useState('');
  const [bulkStudents, setBulkStudents] = useState<OgrenciOpt[]>([]);
  const [bulkQ, setBulkQ] = useState('');
  const [bulkOpts, setBulkOpts] = useState<OgrenciOpt[]>([]);

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3800);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchIzinler(selected ? { ogrenci_id: selected.id, include_inactive: true } : undefined);
      setIzinler((res.data as OgrenciIzin[]) || []);
    } catch {
      setIzinler([]);
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!ogrenciParam) return;
    const id = Number(ogrenciParam);
    if (!id) return;
    const fromList = izinler.find((i) => i.ogrenci_id === id);
    setSelected((prev) => {
      if (fromList) return { id, ad_soyad: fromList.ogrenci_adi || prev?.ad_soyad || `#${id}` };
      if (prev?.id === id) return prev;
      return { id, ad_soyad: prev?.ad_soyad || `#${id}` };
    });
  }, [ogrenciParam, izinler]);

  useEffect(() => {
    if (pickerQ.trim().length < 2) { setPickerOpts([]); return; }
    const t = setTimeout(async () => {
      const list = await searchKutuphaneStudentsForIzin(pickerQ, isCoachMode);
      setPickerOpts(list.map((o) => ({
        id: o.id,
        ad_soyad: o.tam_ad || `${o.ad} ${o.soyad}`.trim(),
        sinif: o.sinif_ad,
      })));
    }, 220);
    return () => clearTimeout(t);
  }, [pickerQ, isCoachMode]);

  useEffect(() => {
    if (bulkQ.trim().length < 2) { setBulkOpts([]); return; }
    const t = setTimeout(async () => {
      const list = await searchKutuphaneStudentsForIzin(bulkQ, isCoachMode);
      setBulkOpts(list.map((o) => ({
        id: o.id,
        ad_soyad: o.tam_ad || `${o.ad} ${o.soyad}`.trim(),
        sinif: o.sinif_ad,
      })));
    }, 220);
    return () => clearTimeout(t);
  }, [bulkQ, isCoachMode]);

  const openStudent = (o: OgrenciOpt) => {
    setSelected(o);
    router.replace(`${href('izinler')}?ogrenci_id=${o.id}`);
  };

  const clearStudent = () => {
    setSelected(null);
    router.replace(href('izinler'));
  };

  const groupedCards = useMemo(() => {
    const map = new Map<number, { adi: string; izinler: OgrenciIzin[] }>();
    izinler.forEach((iz) => {
      if (!map.has(iz.ogrenci_id)) map.set(iz.ogrenci_id, { adi: iz.ogrenci_adi || `#${iz.ogrenci_id}`, izinler: [] });
      map.get(iz.ogrenci_id)!.izinler.push(iz);
    });
    return [...map.entries()].map(([id, v]) => ({ id, ...v }));
  }, [izinler]);

  const studentIzinler = useMemo(
    () => (selected ? izinler.filter((i) => i.ogrenci_id === selected.id) : []),
    [izinler, selected],
  );

  const filteredTimeline = useMemo(() => {
    if (durumFilter === 'hepsi') return studentIzinler;
    return studentIzinler.filter((iz) => izinDurum(iz) === durumFilter);
  }, [studentIzinler, durumFilter]);

  const today = todayIso();
  const thisWeek = toIsoDate(weekStart) === toIsoDate(startOfIsoWeek(new Date()));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const kpis = useMemo(() => {
    const aktif = studentIzinler.filter((i) => izinDurum(i) === 'aktif').length;
    const suresiz = studentIzinler.filter((i) => izinDurum(i) === 'suresiz').length;
    let hafta = 0;
    weekDays.forEach((d) => {
      PERIODS.forEach((p) => {
        if (studentIzinler.some((iz) => izinCoversCell(iz, d, p.code))) hafta += 1;
      });
    });
    return { aktif, suresiz, hafta };
  }, [studentIzinler, weekDays]);

  const resetForm = (patch?: Partial<{
    tekrar: IzinTekrarModu;
    start: string;
    end: string;
    suresiz: boolean;
    fullDay: boolean;
    periods: SessionCode[];
    gunler: number[];
  }>) => {
    setFormTekrar(patch?.tekrar ?? 'RANGE');
    setFormStart(patch?.start ?? today);
    setFormEnd(patch?.end ?? today);
    setFormSuresiz(patch?.suresiz ?? false);
    setFormFullDay(patch?.fullDay ?? false);
    setFormPeriods(patch?.periods ?? ['MORNING']);
    setFormGunler(patch?.gunler ?? [0]);
    setFormSebepKodu('');
    setFormSebep('');
    setEditIzin(null);
  };

  const openCreate = (preset?: 'today' | 'week' | 'range' | 'weekly', cell?: { date: Date; period?: SessionCode; fullDay?: boolean }) => {
    if (preset === 'today') resetForm({ start: today, end: today, fullDay: true, periods: PERIODS.map((p) => p.code) });
    else if (preset === 'week') resetForm({ start: toIsoDate(weekStart), end: toIsoDate(addDays(weekStart, 6)), fullDay: true });
    else if (preset === 'weekly') resetForm({ tekrar: 'WEEKLY', start: today, end: '', suresiz: true, gunler: [0] });
    else if (cell) {
      const iso = toIsoDate(cell.date);
      resetForm({
        start: iso,
        end: iso,
        fullDay: !!cell.fullDay,
        periods: cell.period ? [cell.period] : ['MORNING'],
      });
    } else resetForm();
    setDrawer(selected && !bulkStudents.length ? 'create' : 'create');
  };

  const openEdit = (iz: OgrenciIzin) => {
    setEditIzin(iz);
    setFormTekrar(iz.tekrar_modu || 'RANGE');
    setFormStart(iz.baslangic_tarihi);
    setFormEnd(iz.bitis_tarihi || '');
    setFormSuresiz(!iz.bitis_tarihi);
    setFormFullDay(iz.izin_tipi === 'FULL_DAY');
    setFormPeriods(iz.periyot_kodu ? [iz.periyot_kodu] : ['MORNING']);
    setFormGunler(iz.gun != null ? [iz.gun] : [0]);
    setFormSebepKodu((iz.sebep_kodu || '') as IzinSebepKodu | '');
    setFormSebep(iz.sebep || '');
    setDrawer('edit');
  };

  const buildPayloads = (ogrenciId: number) => {
    const periods = formFullDay ? [null] : formPeriods;
    const gunler = formTekrar === 'WEEKLY' ? formGunler : [null];
    const payloads: Parameters<typeof createIzin>[0][] = [];
    for (const gun of gunler) {
      for (const per of periods) {
        payloads.push({
          ogrenci_id: ogrenciId,
          izin_tipi: (formFullDay ? 'FULL_DAY' : 'PERIOD') as ExemptionType,
          tekrar_modu: formTekrar,
          gun: formTekrar === 'WEEKLY' ? gun : null,
          periyot_kodu: formFullDay ? undefined : (per as SessionCode),
          baslangic_tarihi: formStart,
          bitis_tarihi: formSuresiz ? null : formEnd,
          suresiz: formSuresiz,
          sebep_kodu: (formSebepKodu || undefined) as IzinSebepKodu | undefined,
          sebep: formSebep,
        });
      }
    }
    return payloads;
  };

  const saveDrawer = async () => {
    if (!formSuresiz && !formEnd) { showToast('err', 'Bitiş tarihi gerekli veya süresiz işaretleyin'); return; }
    if (formTekrar === 'WEEKLY' && formGunler.length === 0) { showToast('err', 'En az bir gün seçin'); return; }
    if (!formFullDay && formPeriods.length === 0) { showToast('err', 'En az bir periyot seçin'); return; }
    setBusy(true);
    try {
      if (drawer === 'edit' && editIzin) {
        const r = await updateIzin(editIzin.id, {
          izin_tipi: formFullDay ? 'FULL_DAY' : 'PERIOD',
          tekrar_modu: formTekrar,
          gun: formTekrar === 'WEEKLY' ? formGunler[0] : null,
          periyot_kodu: formFullDay ? null : formPeriods[0],
          baslangic_tarihi: formStart,
          bitis_tarihi: formSuresiz ? null : formEnd,
          suresiz: formSuresiz,
          sebep_kodu: formSebepKodu || '',
          sebep: formSebep,
        });
        if (!r.success) throw new Error((r as { error?: string }).error || 'Güncellenemedi');
        showToast('ok', 'İzin güncellendi');
      } else if (drawer === 'bulk') {
        if (!bulkStudents.length) { showToast('err', 'Öğrenci seçin'); setBusy(false); return; }
        const all = bulkStudents.flatMap((o) => buildPayloads(o.id));
        const r = await createBulkIzinler(all);
        if (!r.success) throw new Error((r as { error?: string }).error || 'Toplu izin oluşturulamadı');
        showToast('ok', `${all.length} izin kaydedildi`);
      } else {
        if (!selected) { showToast('err', 'Öğrenci seçin'); setBusy(false); return; }
        const payloads = buildPayloads(selected.id);
        if (payloads.length === 1) {
          const r = await createIzin(payloads[0]);
          if (!r.success) throw new Error((r as { error?: string }).error || 'Oluşturulamadı');
        } else {
          const r = await createBulkIzinler(payloads);
          if (!r.success) throw new Error((r as { error?: string }).error || 'Oluşturulamadı');
        }
        showToast('ok', 'İzin kaydedildi');
      }
      setDrawer(null);
      await loadAll();
    } catch (e: unknown) {
      showToast('err', e instanceof Error ? e.message : 'Hata');
    }
    setBusy(false);
  };

  const removeIzin = async (id: string) => {
    setBusy(true);
    try {
      const r = await deleteIzin(id);
      if (!r.success) throw new Error((r as { error?: string }).error || 'Silinemedi');
      showToast('ok', 'İzin silindi');
      setDrawer(null);
      await loadAll();
    } catch (e: unknown) {
      showToast('err', e instanceof Error ? e.message : 'Hata');
    }
    setBusy(false);
  };

  const onCellClick = async (date: Date, period: SessionCode) => {
    if (!selected) return;
    const covering = studentIzinler.filter((iz) => izinCoversCell(iz, date, period));
    if (covering.length === 0) {
      openCreate(undefined, { date, period });
      return;
    }
    const single = covering.find((iz) => isSingleDayRange(iz) && iz.izin_tipi === 'PERIOD');
    if (covering.length === 1 && single) {
      await removeIzin(single.id);
      return;
    }
    openEdit(covering[0]);
  };

  const impact = impactSummary({
    tekrar: formTekrar,
    start: formStart,
    end: formSuresiz ? null : formEnd,
    suresiz: formSuresiz,
    fullDay: formFullDay,
    periods: formPeriods,
    gun: formTekrar === 'WEEKLY' ? formGunler[0] : null,
  });

  return (
    <div className="ki-scope">
      {!selected ? (
        <>
          <div className="ki-head">
            <div>
              <h2 className="ki-head-title">Öğrenci izinleri</h2>
              <p className="ki-head-desc">
                Bugün, bu hafta veya belirli tarih aralığında sabah / öğle / akşam izin tanımlayın.
                Sınıf yoklamasında da otomatik izinli görünür.
              </p>
            </div>
            <button type="button" className="ki-btn ki-btn-primary" onClick={() => { resetForm(); setBulkStudents([]); setDrawer('bulk'); }}>
              Toplu izin
            </button>
          </div>
          <div className="ki-search">
            <IconSearch />
            <input
              value={pickerQ}
              onChange={(e) => setPickerQ(e.target.value)}
              placeholder="Öğrenci ara (en az 2 karakter)"
            />
          </div>
          {pickerOpts.length > 0 && (
            <div className="ki-grid-cards">
              {pickerOpts.map((o) => (
                <button key={o.id} type="button" className="ki-entity-card" onClick={() => openStudent(o)}>
                  <div className="ki-entity-card-top">
                    <div className="ki-avatar" style={{ background: avatarGradient(o.id) }}>{initials(o.ad_soyad)}</div>
                    <div>
                      <div className="ki-entity-name">{o.ad_soyad}</div>
                      <div className="ki-entity-meta">{o.sinif || 'Sınıf yok'}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {loading ? (
            <div className="ki-empty"><p>Yükleniyor…</p></div>
          ) : groupedCards.length === 0 && pickerOpts.length === 0 ? (
            <div className="ki-empty">
              <h3>Aktif izin yok</h3>
              <p>Öğrenci arayıp tarih aralığı ve oturum seçerek izin ekleyin.</p>
            </div>
          ) : pickerQ.length < 2 ? (
            <div className="ki-grid-cards">
              {groupedCards.map((g) => {
                const aktif = g.izinler.filter((i) => izinDurum(i) === 'aktif' || izinDurum(i) === 'suresiz').length;
                return (
                  <button key={g.id} type="button" className="ki-entity-card" onClick={() => openStudent({ id: g.id, ad_soyad: g.adi })}>
                    <div className="ki-entity-card-top">
                      <div className="ki-avatar" style={{ background: avatarGradient(g.id) }}>{initials(g.adi)}</div>
                      <div>
                        <div className="ki-entity-name">{g.adi}</div>
                        <div className="ki-entity-meta">{aktif} aktif izin</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="ki-ops-top">
            <button type="button" className="ki-ops-back" onClick={clearStudent}>← Öğrenci listesi</button>
            <div className="ki-ops-header">
              <div className="ki-ops-id">
                <div className="ki-avatar lg" style={{ background: avatarGradient(selected.id) }}>{initials(selected.ad_soyad)}</div>
                <div>
                  <div className="ki-ops-name">{selected.ad_soyad}</div>
                  <div className="ki-ops-sub">{selected.sinif || 'İzin takvimi'}</div>
                </div>
              </div>
              <button type="button" className="ki-btn ki-btn-primary" onClick={() => openCreate()}>İzin ekle</button>
            </div>
            <div className="ki-summary">
              <div className="ki-stat ki-stat--blue"><span className="ki-stat-label">Aktif izin</span><span className="ki-stat-value">{kpis.aktif}</span></div>
              <div className="ki-stat ki-stat--green"><span className="ki-stat-label">Bu hafta oturum</span><span className="ki-stat-value">{kpis.hafta}</span></div>
              <div className="ki-stat ki-stat--amber"><span className="ki-stat-label">Süresiz</span><span className="ki-stat-value">{kpis.suresiz}</span></div>
            </div>
            <div className="ki-presets">
              <button type="button" className="ki-btn ki-btn-sm" onClick={() => openCreate('today')}>Bugün</button>
              <button type="button" className="ki-btn ki-btn-sm" onClick={() => openCreate('week')}>Bu hafta</button>
              <button type="button" className="ki-btn ki-btn-sm" onClick={() => openCreate('range')}>Özel aralık</button>
              <button type="button" className="ki-btn ki-btn-sm" onClick={() => openCreate('weekly')}>Haftalık tekrar</button>
            </div>
          </div>

          <div className="ki-week">
            <div className="ki-week-bar">
              <div className="ki-week-nav">
                <button type="button" className="ki-week-arrow" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Önceki hafta">‹</button>
                <div className="ki-week-title">
                  <strong>{formatWeekRangeTr(weekStart)}</strong>
                  {thisWeek ? <span className="ki-week-now">Bu hafta</span> : (
                    <button type="button" className="ki-week-now" onClick={() => setWeekStart(startOfIsoWeek(new Date()))}>Bugüne dön</button>
                  )}
                </div>
                <button type="button" className="ki-week-arrow" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Sonraki hafta">›</button>
              </div>
            </div>
            <div className="ki-week-table-wrap">
              <table className="ki-week-table">
                <thead>
                  <tr>
                    <th className="ki-time-col">Oturum</th>
                    {weekDays.map((d) => {
                      const iso = toIsoDate(d);
                      return (
                        <th key={iso} className={`${iso === today ? 'is-today' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'is-weekend' : ''}`}>
                          <span className="ki-week-head-day">{DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1].short}</span>
                          <span className="ki-week-head-date">{d.getDate()}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((p) => (
                    <tr key={p.code}>
                      <td className="ki-time-col">{p.label}</td>
                      {weekDays.map((d) => {
                        const iso = toIsoDate(d);
                        const hit = studentIzinler.filter((iz) => izinCoversCell(iz, d, p.code));
                        const iz = hit[0];
                        return (
                          <td
                            key={`${iso}-${p.code}`}
                            className={`ki-cell${iso === today ? ' is-today' : ''}${d.getDay() === 0 || d.getDay() === 6 ? ' is-weekend' : ''}${iso < today ? ' is-past' : ''}`}
                          >
                            {iz ? (
                              <button
                                type="button"
                                className={`ki-chip${iz.izin_tipi === 'FULL_DAY' ? ' is-fullday' : ''}${iz.tekrar_modu === 'WEEKLY' ? ' is-weekly' : ''}${izinDurum(iz) === 'gecmis' ? ' is-expired' : ''}`}
                                onClick={() => onCellClick(d, p.code)}
                              >
                                <span className="ki-chip-title">{iz.izin_tipi === 'FULL_DAY' ? 'Tam gün' : 'İzinli'}</span>
                                <span className="ki-chip-sub">{sebepShort(iz)}</span>
                              </button>
                            ) : (
                              <button type="button" className="ki-cell-btn" onClick={() => onCellClick(d, p.code)}>+</button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ki-legend">
              <span><i className="ki-dot" style={{ background: '#7c3aed' }} /> Periyot izni</span>
              <span><i className="ki-dot" style={{ background: '#dc2626' }} /> Tam gün</span>
              <span><i className="ki-dot" style={{ background: '#2563eb' }} /> Haftalık tekrar</span>
            </div>
          </div>

          <div className="ki-filters">
            {(['aktif', 'suresiz', 'gecmis', 'hepsi'] as DurumFilter[]).map((k) => (
              <button key={k} type="button" className={`ki-filter${durumFilter === k ? ' is-on' : ''}`} onClick={() => setDurumFilter(k)}>
                {k === 'aktif' ? 'Aktif' : k === 'suresiz' ? 'Süresiz' : k === 'gecmis' ? 'Süresi dolmuş' : 'Tümü'}
              </button>
            ))}
          </div>
          <div className="ki-table-wrap">
            <table className="ki-table">
              <thead>
                <tr>
                  <th>Aralık</th>
                  <th>Tür</th>
                  <th>Periyot</th>
                  <th>Sebep</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredTimeline.length === 0 ? (
                  <tr><td colSpan={5} style={{ color: '#64748b' }}>Kayıt yok</td></tr>
                ) : filteredTimeline.map((iz) => (
                  <tr key={iz.id}>
                    <td>
                      {iz.baslangic_tarihi}{iz.bitis_tarihi ? ` – ${iz.bitis_tarihi}` : ' · süresiz'}
                      {iz.tekrar_modu === 'WEEKLY' && iz.gun_adi ? ` · her ${iz.gun_adi}` : ''}
                    </td>
                    <td>{iz.tekrar_modu === 'WEEKLY' ? 'Haftalık' : 'Aralık'}</td>
                    <td>{iz.izin_tipi === 'FULL_DAY' ? 'Tam gün' : iz.periyot_adi || iz.periyot_kodu}</td>
                    <td>{sebepShort(iz)}</td>
                    <td>
                      <button type="button" className="ki-btn ki-btn-sm" onClick={() => openEdit(iz)}>Düzenle</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {drawer && (
        <>
          <button type="button" className="ki-drawer-bg" aria-label="Kapat" onClick={() => setDrawer(null)} />
          <aside className="ki-drawer">
            <div className="ki-drawer-head">
              <div>
                <h3>{drawer === 'edit' ? 'İzni düzenle' : drawer === 'bulk' ? 'Toplu izin' : 'Yeni izin'}</h3>
                <p>{impact}</p>
              </div>
              <button type="button" className="ki-btn ki-btn-ghost ki-btn-sm" onClick={() => setDrawer(null)}>Kapat</button>
            </div>
            <div className="ki-drawer-body">
              {drawer === 'bulk' && (
                <div className="ki-field">
                  <label>Öğrenciler</label>
                  <div className="ki-search">
                    <IconSearch />
                    <input value={bulkQ} onChange={(e) => setBulkQ(e.target.value)} placeholder="Öğrenci ekle" />
                  </div>
                  {bulkOpts.length > 0 && (
                    <div className="ki-suggest">
                      {bulkOpts.map((o) => (
                        <button key={o.id} type="button" onClick={() => { setBulkStudents((p) => p.some((x) => x.id === o.id) ? p : [...p, o]); setBulkQ(''); setBulkOpts([]); }}>
                          {o.ad_soyad}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="ki-bulk-pills">
                    {bulkStudents.map((o) => (
                      <span key={o.id} className="ki-pill">
                        {o.ad_soyad}
                        <button type="button" className="ki-btn ki-btn-ghost ki-btn-sm" onClick={() => setBulkStudents((p) => p.filter((x) => x.id !== o.id))}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="ki-field">
                <label>Tekrar</label>
                <div className="ki-chips">
                  <button type="button" className={`ki-choice${formTekrar === 'RANGE' ? ' is-on' : ''}`} onClick={() => setFormTekrar('RANGE')}>Tarih aralığı</button>
                  <button type="button" className={`ki-choice${formTekrar === 'WEEKLY' ? ' is-on' : ''}`} onClick={() => setFormTekrar('WEEKLY')}>Haftalık</button>
                </div>
              </div>

              {formTekrar === 'WEEKLY' && (
                <div className="ki-field">
                  <label>Günler</label>
                  <div className="ki-chips">
                    {DAYS.map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        className={`ki-choice${formGunler.includes(d.key) ? ' is-on' : ''}`}
                        onClick={() => setFormGunler((g) => g.includes(d.key) ? g.filter((x) => x !== d.key) : [...g, d.key])}
                      >
                        {d.short}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="ki-field">
                <label>Başlangıç</label>
                <input className="ki-input" type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
              </div>
              <div className="ki-field">
                <label>Bitiş</label>
                <input className="ki-input" type="date" value={formEnd} disabled={formSuresiz} onChange={(e) => setFormEnd(e.target.value)} />
                <label className="ki-check">
                  <input type="checkbox" checked={formSuresiz} onChange={(e) => setFormSuresiz(e.target.checked)} />
                  Bitiş yok (dönem boyu) — açıkça onaylıyorum
                </label>
              </div>

              <div className="ki-field">
                <label>Oturumlar</label>
                <div className="ki-chips">
                  <button type="button" className={`ki-choice${formFullDay ? ' is-on' : ''}`} onClick={() => setFormFullDay((v) => !v)}>Tam gün</button>
                  {PERIODS.map((p) => (
                    <button
                      key={p.code}
                      type="button"
                      disabled={formFullDay}
                      className={`ki-choice${!formFullDay && formPeriods.includes(p.code) ? ' is-on' : ''}`}
                      onClick={() => setFormPeriods((cur) => cur.includes(p.code) ? cur.filter((x) => x !== p.code) : [...cur, p.code])}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ki-field">
                <label>Sebep</label>
                <select value={formSebepKodu} onChange={(e) => setFormSebepKodu(e.target.value as IzinSebepKodu | '')}>
                  <option value="">Seçiniz (opsiyonel)</option>
                  {SEBEP_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <textarea className="ki-input" rows={2} placeholder="Not" value={formSebep} onChange={(e) => setFormSebep(e.target.value)} />
              </div>

              <div className="ki-impact">{impact}</div>
            </div>
            <div className="ki-drawer-foot">
              {drawer === 'edit' && editIzin && (
                <button type="button" className="ki-btn ki-btn-danger" disabled={busy} onClick={() => removeIzin(editIzin.id)}>Sil</button>
              )}
              <button type="button" className="ki-btn" onClick={() => setDrawer(null)}>Vazgeç</button>
              <button type="button" className="ki-btn ki-btn-primary" disabled={busy} onClick={saveDrawer}>
                {busy ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </aside>
        </>
      )}

      {toast && <div className={`ki-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
