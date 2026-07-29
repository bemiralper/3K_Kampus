'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import {
  changeOturumOgretmen,
  createOturum,
  fetchOturumlar,
  fetchTatiller,
  resolveDersLabel,
  setOturumDurum,
  type BirebirOturum,
  type OzelDersTatil,
} from '@/lib/ozel-ders-api';
import { fetchEtkilenenDersler } from '@/lib/takvim-api';
import { searchKutuphaneStudents, type KutuphaneStudentOption } from '@/lib/kutuphane-student-search';
import { akademikTabHref } from '@/lib/akademik-routes';
import { useOzelDersMeta } from './useOzelDersMeta';
import { useOzelDersToast } from './OzelDersToast';
import { useDersDisplayPref } from './useDersDisplayPref';
import { allowedNextDurumlar, OTURUM_DURUM_LABELS, PRIMARY_YOKLAMA_ACTIONS } from './oturumDurum';
import EtkilenenDerslerDrawer from './EtkilenenDerslerDrawer';
import {
  Badge,
  Drawer,
  EmptyState,
  PageHeader,
  Segmented,
  SkeletonRows,
  StatCard,
  StatGrid,
  feeStatus,
  oturumDurumTone,
} from './ozelDersUi';
import {
  IconAlertTriangle,
  IconBookOpen,
  IconCalendar,
  IconCheckCircle,
  IconClock,
  IconPlus,
  IconRefresh,
  IconRotateCcw,
  IconSearch,
  IconUser,
  IconUsers,
  IconWallet,
  IconWifi,
  IconXCircle,
} from './icons';
import './ozel-ders.css';

dayjs.locale('tr');

const ACTION_META: Record<
  string,
  { label: string; icon: (s: number) => React.ReactNode; tone: string }
> = {
  ISLENDI: { label: 'İşlendi', icon: (s) => <IconCheckCircle size={s} />, tone: 'tone-success' },
  ONLINE: { label: 'Online', icon: (s) => <IconWifi size={s} />, tone: 'tone-blue' },
  TELAFI_EDILECEK: { label: 'Telafi', icon: (s) => <IconRotateCcw size={s} />, tone: 'tone-warning' },
  OGRENCI_GELMEDI: { label: 'Öğrenci Gelmedi', icon: (s) => <IconUser size={s} />, tone: 'tone-pink' },
  OGRETMEN_GELMEDI: { label: 'Öğretmen Gelmedi', icon: (s) => <IconUsers size={s} />, tone: 'tone-orange' },
  IPTAL: { label: 'İptal', icon: (s) => <IconXCircle size={s} />, tone: 'tone-danger' },
  PLANLANDI: { label: 'Geri Al', icon: (s) => <IconClock size={s} />, tone: 'tone-slate' },
};

const DATE_PRESETS: { key: string; label: string; start: () => string; end: () => string }[] = [
  { key: 'today', label: 'Bugün', start: () => dayjs().format('YYYY-MM-DD'), end: () => dayjs().format('YYYY-MM-DD') },
  {
    key: 'week',
    label: 'Bu Hafta',
    start: () => dayjs().startOf('week').format('YYYY-MM-DD'),
    end: () => dayjs().endOf('week').format('YYYY-MM-DD'),
  },
  {
    key: 'month',
    label: 'Bu Ay',
    start: () => dayjs().startOf('month').format('YYYY-MM-DD'),
    end: () => dayjs().endOf('month').format('YYYY-MM-DD'),
  },
];

export default function BirebirOturumlarClient() {
  const searchParams = useSearchParams();
  const { meta, ready, egitimYiliId, error: metaError } = useOzelDersMeta();
  const { show, node: toastNode } = useOzelDersToast();
  const { useKisaAd, setUseKisaAd } = useDersDisplayPref();

  const urlDate = searchParams.get('date') || '';
  const urlOturumId = Number(searchParams.get('oturum_id') || 0) || null;
  const urlProgramId = Number(searchParams.get('program_id') || 0) || null;
  const urlOgrenciId = Number(searchParams.get('ogrenci_id') || 0) || null;

  const [rows, setRows] = useState<BirebirOturum[]>([]);
  const [holidays, setHolidays] = useState<OzelDersTatil[]>([]);
  const [holidayCounts, setHolidayCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState(() =>
    urlDate || dayjs().startOf('week').format('YYYY-MM-DD'),
  );
  const [end, setEnd] = useState(() =>
    urlDate || dayjs().endOf('week').format('YYYY-MM-DD'),
  );
  const [activePreset, setActivePreset] = useState(urlDate ? 'custom' : 'week');
  const [durumFilter, setDurumFilter] = useState('');
  const [search, setSearch] = useState('');
  const [createHoliday, setCreateHoliday] = useState<OzelDersTatil | null>(null);
  const [etkilenenDay, setEtkilenenDay] = useState<OzelDersTatil | null>(null);
  const [deeplinkApplied, setDeeplinkApplied] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [studentQ, setStudentQ] = useState('');
  const [students, setStudents] = useState<KutuphaneStudentOption[]>([]);
  const [form, setForm] = useState({
    session_date: dayjs().format('YYYY-MM-DD'),
    start_time: '18:00',
    end_time: '19:00',
    ogrenci_id: '',
    ogrenci_ad: '',
    ders_id: '',
    ogretmen_id: '',
    oturum_turu: 'OZEL',
    notes: '',
  });

  const [detail, setDetail] = useState<BirebirOturum | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailTeacher, setDetailTeacher] = useState('');
  const [detailNotes, setDetailNotes] = useState('');
  const [detailShowMore, setDetailShowMore] = useState(false);

  useEffect(() => {
    if (!urlDate) return;
    setStart(urlDate);
    setEnd(urlDate);
    setActivePreset('custom');
  }, [urlDate]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [oturumlar, tatiller] = await Promise.all([
        fetchOturumlar({
          start_date: start,
          end_date: end,
          durum: durumFilter || undefined,
          program_id: urlProgramId || undefined,
          ogrenci_id: urlOgrenciId || undefined,
        }),
        fetchTatiller(start, end).catch(() => [] as OzelDersTatil[]),
      ]);
      setRows(oturumlar);
      setHolidays(tatiller);
      if (tatiller.length) {
        const entries = await Promise.all(
          tatiller.map(async (h) => {
            try {
              const res = await fetchEtkilenenDersler(h.date);
              return [h.date, res.success && res.data ? res.data.count : 0] as const;
            } catch {
              return [h.date, 0] as const;
            }
          }),
        );
        setHolidayCounts(Object.fromEntries(entries));
      } else {
        setHolidayCounts({});
      }
    } catch (e) {
      show(e instanceof Error ? e.message : 'Yüklenemedi', 'error');
    } finally {
      setLoading(false);
    }
  }, [ready, start, end, durumFilter, urlProgramId, urlOgrenciId, show]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (studentQ.trim().length < 2) {
      setStudents([]);
      return;
    }
    const t = setTimeout(() => {
      searchKutuphaneStudents(studentQ).then(setStudents).catch(() => setStudents([]));
    }, 250);
    return () => clearTimeout(t);
  }, [studentQ]);

  useEffect(() => {
    if (!createOpen || !ready || !form.session_date) {
      setCreateHoliday(null);
      return;
    }
    let cancelled = false;
    fetchTatiller(form.session_date, form.session_date)
      .then((list) => {
        if (!cancelled) setCreateHoliday(list[0] || null);
      })
      .catch(() => {
        if (!cancelled) setCreateHoliday(null);
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen, ready, form.session_date]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.ogrenci_ad, resolveDersLabel(r, useKisaAd), r.ders_ad, r.ogretmen_ad]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [rows, search, useKisaAd]);

  const summary = useMemo(() => {
    const islendi = rows.filter((r) => ['ISLENDI', 'ONLINE'].includes(r.durum)).length;
    const planlandi = rows.filter((r) => r.durum === 'PLANLANDI').length;
    const hakedisli = rows.filter((r) => r.has_hakedis).length;
    return { total: rows.length, islendi, planlandi, hakedisli };
  }, [rows]);

  /** Yalnızca görsel gruplama: sıralama/filtre mantığı değişmez, art arda aynı tarihli satırlar tek gün başlığı altında toplanır. */
  const dayGroups = useMemo(() => {
    const groups: { date: string; rows: BirebirOturum[] }[] = [];
    for (const r of filteredRows) {
      const last = groups[groups.length - 1];
      if (last && last.date === r.session_date) {
        last.rows.push(r);
      } else {
        groups.push({ date: r.session_date, rows: [r] });
      }
    }
    return groups;
  }, [filteredRows]);

  function applyPreset(preset: (typeof DATE_PRESETS)[number]) {
    setActivePreset(preset.key);
    setStart(preset.start());
    setEnd(preset.end());
  }

  function openDetail(r: BirebirOturum) {
    setDetail(r);
    setDetailTeacher(String(r.ogretmen));
    setDetailNotes(r.notes || '');
    setDetailShowMore(false);
  }

  useEffect(() => {
    if (!ready || deeplinkApplied || !urlOturumId || loading) return;
    const hit = rows.find((r) => r.id === urlOturumId);
    if (hit) {
      openDetail(hit);
      setDeeplinkApplied(true);
      return;
    }
    // Liste yüklendi, oturum bulunamadı
    setDeeplinkApplied(true);
  }, [ready, deeplinkApplied, urlOturumId, rows, loading]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (createHoliday && !createHoliday.ozel_ders_aktif) {
      show(
        `Seçilen tarih tatil günü (${createHoliday.title}). Devam için Resmi Tatiller’den karar verin veya başka tarih seçin.`,
        'error',
      );
      return;
    }
    setSaving(true);
    try {
      await createOturum({
        session_date: form.session_date,
        start_time: form.start_time,
        end_time: form.end_time,
        ogrenci_id: Number(form.ogrenci_id),
        ders_id: Number(form.ders_id),
        ogretmen_id: Number(form.ogretmen_id),
        oturum_turu: form.oturum_turu,
        notes: form.notes || undefined,
        egitim_yili_id: egitimYiliId,
      });
      setCreateOpen(false);
      setStudentQ('');
      show('Tek seferlik ders oluşturuldu.');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kayıt başarısız';
      show(msg.includes('tatil') ? msg : msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function onSetDurum(durum: string) {
    if (!detail) return;
    setDetailBusy(true);
    try {
      const updated = await setOturumDurum(detail.id, durum, detailNotes || undefined);
      setDetail(updated);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      show(`Durum: ${OTURUM_DURUM_LABELS[durum] || durum}`);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Durum güncellenemedi', 'error');
    } finally {
      setDetailBusy(false);
    }
  }

  async function onChangeTeacher() {
    if (!detail || !detailTeacher) return;
    setDetailBusy(true);
    try {
      const updated = await changeOturumOgretmen(detail.id, Number(detailTeacher));
      setDetail(updated);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      show('Öğretmen güncellendi.');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Öğretmen değiştirilemedi', 'error');
    } finally {
      setDetailBusy(false);
    }
  }

  const yoklamaHref = akademikTabHref('ozel-ders-yonetimi', 'birebir-yoklamalar');
  const nextDurumlar = detail ? allowedNextDurumlar(detail.durum) : [];
  const canChangeTeacher = detail
    ? ['PLANLANDI', 'TELAFI_EDILECEK'].includes(detail.durum)
    : false;

  return (
    <div className="od-scope">
      {toastNode}

      <PageHeader
        icon={<IconBookOpen size={19} />}
        title="Ders Oturumları"
        description="Şablondan üretilen ve tek seferlik birebir dersler. Satıra tıklayarak durum değiştirin veya öğretmeni güncelleyin; yoklama için Yoklamalar sekmesini kullanın."
        actions={
          <>
            <a className="od-btn od-btn-secondary" href={yoklamaHref}>
              Yoklamalar
            </a>
            <button type="button" className="od-btn od-btn-primary" onClick={() => setCreateOpen(true)}>
              <IconPlus size={15} /> Tek Seferlik Ders
            </button>
          </>
        }
      />

      {metaError && <div className="od-banner-error">{metaError}</div>}

      <StatGrid>
        <StatCard icon={<IconCalendar size={19} />} tone="blue" value={summary.total} label="Aralıktaki Oturum" />
        <StatCard icon={<IconCheckCircle size={19} />} tone="green" value={summary.islendi} label="İşlenen" />
        <StatCard icon={<IconClock size={19} />} tone="orange" value={summary.planlandi} label="Planlanan" />
        <StatCard icon={<IconWallet size={19} />} tone="purple" value={summary.hakedisli} label="Hakediş Oluşan" />
      </StatGrid>

      <div className="od-filters">
        <Segmented
          value={activePreset}
          onChange={(k) => {
            const preset = DATE_PRESETS.find((p) => p.key === k);
            if (preset) applyPreset(preset);
          }}
          options={DATE_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
        />
        <div className="od-filter-field">
          <label>Başlangıç</label>
          <input
            type="date"
            className="od-input"
            value={start}
            onChange={(e) => {
              setActivePreset('');
              setStart(e.target.value);
            }}
          />
        </div>
        <div className="od-filter-field">
          <label>Bitiş</label>
          <input
            type="date"
            className="od-input"
            value={end}
            onChange={(e) => {
              setActivePreset('');
              setEnd(e.target.value);
            }}
          />
        </div>
        <div className="od-filter-field">
          <label>Durum</label>
          <select className="od-select" value={durumFilter} onChange={(e) => setDurumFilter(e.target.value)}>
            <option value="">Tümü</option>
            {Object.entries(OTURUM_DURUM_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="od-toolbar-spacer" />
        <div className="od-search">
          <IconSearch size={16} />
          <input placeholder="Öğrenci, ders, öğretmen…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button
          type="button"
          className={`od-btn od-btn-secondary od-btn-sm${useKisaAd ? ' is-active-pref' : ''}`}
          onClick={() => setUseKisaAd(!useKisaAd)}
          aria-pressed={useKisaAd}
          title="Kısa ad göster (Fizik-1 → Fizik)"
        >
          {useKisaAd ? 'Kısa ad' : 'Uzun ad'}
        </button>
        <button type="button" className="od-btn od-btn-secondary od-btn-icon" onClick={load} disabled={loading} title="Yenile">
          <IconRefresh size={15} />
        </button>
      </div>

      {holidays.length > 0 && (
        <div className="od-holiday-strip" role="status">
          <span className="od-holiday-strip-label">
            <IconCalendar size={14} /> Tatiller
          </span>
          <div className="od-holiday-chips">
            {holidays.map((h) => {
              const count = holidayCounts[h.date] ?? 0;
              return (
                <button
                  key={h.date}
                  type="button"
                  className="od-holiday-chip"
                  title={`${h.title} — ${count} etkilenen ders`}
                  onClick={() => {
                    setStart(h.date);
                    setEnd(h.date);
                    setActivePreset('custom');
                    setEtkilenenDay(h);
                  }}
                >
                  <Badge tone={h.ozel_ders_aktif ? 'success' : 'secondary'}>
                    {h.ozel_ders_aktif ? 'Devam' : 'Tatil'}
                  </Badge>
                  <strong>{dayjs(h.date).format('DD.MM')}</strong>
                  <span>{h.title}</span>
                  <Badge tone={count > 0 && !h.ozel_ders_aktif ? 'warning' : 'secondary'}>
                    {count} ders
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="od-card">
        <div className="od-card-body no-pad">
          {loading ? (
            <SkeletonRows rows={6} />
          ) : filteredRows.length === 0 ? (
            <EmptyState
              icon={<IconCalendar size={24} />}
              title="Bu aralıkta oturum yok"
              description={
                holidays.length
                  ? `Aralıkta ${holidays.length} tatil günü var. Öğrenci Programları’ndan oturum üretin veya tek seferlik ders ekleyin.`
                  : 'Öğrenci Programları’ndan oturum üretin veya tek seferlik ders ekleyin.'
              }
            />
          ) : (
            <div className="od-agenda">
              {dayGroups.map(({ date, rows: dayRows }) => {
                const dayHoliday = holidays.find((h) => h.date === date);
                return (
                  <div className="od-agenda-day" key={date}>
                    <div className="od-agenda-day-head">
                      <span className="od-agenda-day-title">{dayjs(date).format('DD MMMM YYYY, dddd')}</span>
                      <span className="od-agenda-day-count">{dayRows.length} ders</span>
                      {dayHoliday && (
                        <Badge tone={dayHoliday.ozel_ders_aktif ? 'success' : 'warning'}>
                          {dayHoliday.title}
                        </Badge>
                      )}
                    </div>
                    <div className="od-table-scroll">
                      <table className="od-table">
                        <thead>
                          <tr>
                            <th>Saat</th>
                            <th>Öğrenci</th>
                            <th>Ders</th>
                            <th>Öğretmen</th>
                            <th>Tür</th>
                            <th>Durum</th>
                            <th>Hakediş</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dayRows.map((r) => {
                            const fee = feeStatus(r);
                            return (
                              <tr key={r.id} onClick={() => openDetail(r)} style={{ cursor: 'pointer' }}>
                                <td className="od-cell-time">
                                  {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}
                                </td>
                                <td className="od-cell-primary">{r.ogrenci_ad}</td>
                                <td>{resolveDersLabel(r, useKisaAd)}</td>
                                <td>{r.ogretmen_ad}</td>
                                <td>
                                  <Badge tone={r.oturum_turu === 'TELAFI' ? 'warning' : 'secondary'}>
                                    {r.durum === 'ONLINE' && <IconWifi size={11} />}
                                    {r.oturum_turu_display}
                                  </Badge>
                                </td>
                                <td>
                                  <Badge tone={oturumDurumTone(r.durum)}>
                                    {r.durum === 'IPTAL' && <IconXCircle size={11} />}
                                    {r.durum_display}
                                  </Badge>
                                </td>
                                <td>
                                  <Badge tone={fee.tone}>{fee.label}</Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tek Seferlik Ders"
        description="Haftalık şablona bağlı olmayan tek seferlik birebir ders oluşturun."
        footer={
          <>
            <button type="button" className="od-btn od-btn-secondary" onClick={() => setCreateOpen(false)}>
              Vazgeç
            </button>
            <button
              type="submit"
              form="od-oturum-create-form"
              className="od-btn od-btn-primary"
              disabled={
                saving ||
                Boolean(createHoliday && !createHoliday.ozel_ders_aktif) ||
                !form.ogrenci_id ||
                !form.ders_id ||
                !form.ogretmen_id
              }
            >
              {saving ? 'Kaydediliyor…' : 'Dersi Oluştur'}
            </button>
          </>
        }
      >
        <form id="od-oturum-create-form" className="od-form" onSubmit={onCreate}>
          <div className="od-form-row">
            <div className="od-form-group">
              <label>
                Tarih <span className="req">*</span>
              </label>
              <input
                type="date"
                required
                value={form.session_date}
                onChange={(e) => setForm((f) => ({ ...f, session_date: e.target.value }))}
              />
            </div>
            <div className="od-form-group">
              <label>Tür</label>
              <select
                value={form.oturum_turu}
                onChange={(e) => setForm((f) => ({ ...f, oturum_turu: e.target.value }))}
              >
                <option value="OZEL">Özel Ders</option>
                <option value="EK">Ek Ders</option>
                <option value="ETUT">Etüt</option>
              </select>
            </div>
          </div>
          {createHoliday && !createHoliday.ozel_ders_aktif && (
            <div className="od-banner-warning">
              <IconAlertTriangle size={15} />
              Bu gün tatil: <strong>{createHoliday.title}</strong>. Tatil gününe tek seferlik ders
              eklenemez — Resmi Tatiller’den “Devam” seçin veya başka tarih kullanın.
            </div>
          )}
          {createHoliday?.ozel_ders_aktif && (
            <div className="od-banner-success">
              <IconCheckCircle size={15} />
              Resmi tatil ({createHoliday.title}) — kurum kararıyla özel ders devam ediyor.
            </div>
          )}

          <div className="od-form-row">
            <div className="od-form-group">
              <label>
                Başlangıç <span className="req">*</span>
              </label>
              <input
                type="time"
                required
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              />
            </div>
            <div className="od-form-group">
              <label>
                Bitiş <span className="req">*</span>
              </label>
              <input
                type="time"
                required
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              />
            </div>
          </div>

          <div className="od-form-group">
            <label>
              Öğrenci <span className="req">*</span>
            </label>
            <input placeholder="Ad soyad ile arayın" value={studentQ} onChange={(e) => setStudentQ(e.target.value)} />
          </div>
          {students.length > 0 && (
            <div className="od-panel-list">
              {students.map((s) => (
                <div
                  key={s.id}
                  className="od-panel-list-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      ogrenci_id: String(s.id),
                      ogrenci_ad: s.tam_ad || `${s.ad} ${s.soyad}`,
                    }));
                    setStudentQ(s.tam_ad || `${s.ad} ${s.soyad}`);
                    setStudents([]);
                  }}
                >
                  <span>{s.tam_ad || `${s.ad} ${s.soyad}`}</span>
                </div>
              ))}
            </div>
          )}
          {form.ogrenci_id && (
            <div className="od-banner-success">
              <IconCheckCircle size={15} /> Seçildi: {form.ogrenci_ad}
            </div>
          )}

          <div className="od-form-group">
            <label>
              Ders <span className="req">*</span>
            </label>
            <select
              required
              value={form.ders_id}
              onChange={(e) => setForm((f) => ({ ...f, ders_id: e.target.value }))}
            >
              <option value="">Seçin</option>
              {(meta?.dersler || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {resolveDersLabel({ ders_ad: d.ad, ders_kisa_ad: d.kisa_ad }, useKisaAd)}
                </option>
              ))}
            </select>
          </div>
          <div className="od-form-group">
            <label>
              Öğretmen <span className="req">*</span>
            </label>
            <select
              required
              value={form.ogretmen_id}
              onChange={(e) => setForm((f) => ({ ...f, ogretmen_id: e.target.value }))}
            >
              <option value="">Seçin</option>
              {(meta?.teachers || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="od-form-group">
            <label>Not</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Opsiyonel"
            />
          </div>
        </form>
      </Drawer>

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.ogrenci_ad} · ${resolveDersLabel(detail, useKisaAd)}` : ''}
        description={
          detail
            ? `${dayjs(detail.session_date).format('DD.MM.YYYY')} ${detail.start_time.slice(0, 5)}–${detail.end_time.slice(0, 5)}`
            : ''
        }
        footer={
          <>
            <a
              className="od-btn od-btn-secondary"
              href={yoklamaHref}
              onClick={() => setDetail(null)}
            >
              Yoklamaya Git
            </a>
            <div style={{ flex: 1 }} />
            <button type="button" className="od-btn od-btn-primary" onClick={() => setDetail(null)}>
              Kapat
            </button>
          </>
        }
      >
        {detail && (
          <div className="od-form">
            <div className="od-entity-card-meta">
              <Badge tone={oturumDurumTone(detail.durum)}>{detail.durum_display}</Badge>
              <Badge tone={detail.oturum_turu === 'TELAFI' ? 'warning' : 'secondary'}>
                {detail.oturum_turu_display}
              </Badge>
              <Badge tone={feeStatus(detail).tone}>{feeStatus(detail).label}</Badge>
            </div>

            <div className="od-panel-section">
              <div className="od-panel-section-title">Durum değiştir</div>
              {nextDurumlar.length === 0 ? (
                <span className="od-cell-muted">Bu durumdan geçiş yok.</span>
              ) : (
                <div className="od-attend-actions" style={{ marginLeft: 0, flexWrap: 'wrap' }}>
                  {(PRIMARY_YOKLAMA_ACTIONS.filter((d) => nextDurumlar.includes(d)) as string[]).map((d) => {
                    const meta = ACTION_META[d];
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`od-attend-btn ${meta?.tone || 'tone-slate'}`}
                        disabled={detailBusy}
                        onClick={() => onSetDurum(d)}
                      >
                        {meta?.icon(15)} {meta?.label || OTURUM_DURUM_LABELS[d] || d}
                      </button>
                    );
                  })}
                  {nextDurumlar.filter((d) => !(PRIMARY_YOKLAMA_ACTIONS as readonly string[]).includes(d)).length > 0 && (
                    <button
                      type="button"
                      className="od-attend-btn tone-slate"
                      disabled={detailBusy}
                      onClick={() => setDetailShowMore((v) => !v)}
                    >
                      {detailShowMore ? 'Gizle' : 'Diğer'}
                    </button>
                  )}
                  {detailShowMore &&
                    nextDurumlar
                      .filter((d) => !(PRIMARY_YOKLAMA_ACTIONS as readonly string[]).includes(d))
                      .map((d) => {
                        const meta = ACTION_META[d];
                        return (
                          <button
                            key={d}
                            type="button"
                            className={`od-attend-btn ${meta?.tone || 'tone-slate'}`}
                            disabled={detailBusy}
                            onClick={() => onSetDurum(d)}
                          >
                            {meta?.icon(15)} {meta?.label || OTURUM_DURUM_LABELS[d] || d}
                          </button>
                        );
                      })}
                </div>
              )}
            </div>

            {canChangeTeacher && (
              <div className="od-panel-section">
                <div className="od-panel-section-title">Öğretmen</div>
                <div className="od-form-row">
                  <div className="od-form-group" style={{ flex: 1 }}>
                    <select value={detailTeacher} onChange={(e) => setDetailTeacher(e.target.value)}>
                      {(meta?.teachers || []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="od-btn od-btn-primary od-btn-sm"
                    disabled={detailBusy || detailTeacher === String(detail.ogretmen)}
                    onClick={onChangeTeacher}
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            )}

            <div className="od-form-group">
              <label>Not</label>
              <textarea
                rows={2}
                value={detailNotes}
                onChange={(e) => setDetailNotes(e.target.value)}
                placeholder="Durum değişiminde kaydedilir"
              />
            </div>
            {detail.oda_ad && (
              <dl className="od-panel-kv">
                <dt>Derslik</dt>
                <dd>{detail.oda_ad}</dd>
              </dl>
            )}
          </div>
        )}
      </Drawer>

      <EtkilenenDerslerDrawer
        open={Boolean(etkilenenDay)}
        date={etkilenenDay?.date || null}
        title={etkilenenDay?.title}
        ozelDersAktif={etkilenenDay?.ozel_ders_aktif}
        onClose={() => setEtkilenenDay(null)}
      />
    </div>
  );
}
