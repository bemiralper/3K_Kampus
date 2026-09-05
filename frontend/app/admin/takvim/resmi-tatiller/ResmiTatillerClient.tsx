'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import {
  fetchResmiTatiller,
  setCevreTatil,
  setResmiTatilKarar,
  syncResmiTatiller,
  type ResmiTatilGun,
} from '@/lib/takvim-api';
import { useKurum } from '@/lib/contexts/KurumContext';
import { Badge, EmptyState, SkeletonRows } from '@/components/akademik/ozel-ders-yonetimi/ozelDersUi';
import { useOzelDersToast } from '@/components/akademik/ozel-ders-yonetimi/OzelDersToast';
import EtkilenenDerslerDrawer from '@/components/akademik/ozel-ders-yonetimi/EtkilenenDerslerDrawer';
import { IconCalendar, IconRefresh } from '@/components/akademik/ozel-ders-yonetimi/icons';
import '@/components/akademik/ozel-ders-yonetimi/ozel-ders.css';

dayjs.locale('tr');

export default function ResmiTatillerClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const ready = Boolean(initialized && activeKurum && activeSube);
  const { show, node: toastNode } = useOzelDersToast();

  const [year, setYear] = useState<number | 'all'>('all');
  const [availableYears, setAvailableYears] = useState<number[]>([2025, 2026, 2027]);
  const [days, setDays] = useState<ResmiTatilGun[]>([]);
  const [syncedCount, setSyncedCount] = useState(0);
  const [source, setSource] = useState<string>('google');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drawerDay, setDrawerDay] = useState<ResmiTatilGun | null>(null);

  const load = useCallback(async () => {
    if (!ready) return null;
    setLoading(true);
    try {
      const res = await fetchResmiTatiller(year);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Yüklenemedi');
      }
      const data = res.data;
      setDays(data.days || []);
      setSyncedCount(data.synced_count || 0);
      setSource(data.source || 'google');
      if (data.available_years?.length) setAvailableYears(data.available_years);
      return data;
    } catch (e) {
      show(e instanceof Error ? e.message : 'Yüklenemedi', 'error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [ready, year, show]);

  useEffect(() => {
    void load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const set = new Set([...availableYears, dayjs().year(), dayjs().year() + 1]);
    return Array.from(set).sort((a, b) => a - b);
  }, [availableYears]);

  const summary = useMemo(() => {
    const resmi = days.filter((d) => d.source !== 'cevre');
    const devam = resmi.filter((d) => d.ozel_ders_aktif).length;
    const affected = days.reduce((sum, d) => sum + (d.affected_count || 0), 0);
    return { total: resmi.length, devam, tatil: resmi.length - devam, affected };
  }, [days]);

  async function onSync() {
    setSyncing(true);
    try {
      const res = await syncResmiTatiller(year === 'all' ? undefined : year);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Senkron başarısız');
      }
      const r = res.data;
      const src = r.source === 'google' ? 'Google Takvim' : 'yedek katalog';
      show(
        `Senkron (${src}): ${r.created} yeni · ${r.updated} güncellendi · ${r.restored} geri yüklendi`,
      );
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Senkron başarısız', 'error');
    } finally {
      setSyncing(false);
    }
  }

  async function toggleDay(d: ResmiTatilGun, aktif: boolean) {
    if (d.source === 'cevre') return;
    const key = `${d.holiday_key}:${d.date}`;
    setBusyKey(key);
    try {
      const res = await setResmiTatilKarar({
        holiday_key: d.holiday_key,
        date: d.date,
        ozel_ders_aktif: aktif,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Karar kaydedilemedi');
      }
      const updated = res.data;
      setDays((prev) =>
        prev.map((row) =>
          row.date === d.date && row.holiday_key === d.holiday_key
            ? {
                ...row,
                ozel_ders_aktif: updated.ozel_ders_aktif,
                mode: updated.mode || (updated.ozel_ders_aktif ? 'devam' : 'tatil'),
              }
            : row,
        ),
      );
      show(
        aktif
          ? `${dayjs(d.date).format('DD.MM.YYYY')} — özel ders devam`
          : `${dayjs(d.date).format('DD.MM.YYYY')} — özel ders tatil`,
      );
    } catch (e) {
      show(e instanceof Error ? e.message : 'Karar kaydedilemedi', 'error');
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleCevre(d: ResmiTatilGun, side: 'prev' | 'next', aktif: boolean) {
    const key = `cevre:${d.date}:${side}`;
    setBusyKey(key);
    try {
      const res = await setCevreTatil({ date: d.date, side, aktif });
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Çevre tatil kaydedilemedi');
      }
      const label = side === 'prev' ? 'Önceki gün' : 'Sonraki gün';
      show(
        aktif
          ? `${label} özel ders tatili yapıldı (${res.data.date})`
          : `${label} çevre tatili kaldırıldı`,
      );
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Çevre tatil kaydedilemedi', 'error');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="od-scope">
      {toastNode}

      <div className="od-head">
        <div>
          <h2 className="od-head-title">
            <span className="od-head-icon">
              <IconCalendar size={19} />
            </span>
            Resmi Tatiller
          </h2>
          <p className="od-head-desc">
            Google tatillerini senkronize edin; özel ders Tatil/Devam kararını verin. Etkilenen ders
            sayısına tıklayarak kimin hangi dersinin tatile denk geldiğini görün. Gerekirse önceki /
            sonraki günü de özel ders tatili yapın.
          </p>
        </div>
        <div className="od-head-actions">
          <select
            className="od-select"
            value={year === 'all' ? 'all' : String(year)}
            onChange={(e) => {
              const v = e.target.value;
              setYear(v === 'all' ? 'all' : Number(v));
            }}
            aria-label="Yıl"
          >
            <option value="all">Tümü</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="od-btn od-btn-secondary"
            onClick={() => void load()}
            disabled={loading || !ready}
          >
            <IconRefresh size={15} /> Yenile
          </button>
          <button
            type="button"
            className="od-btn od-btn-primary"
            onClick={() => void onSync()}
            disabled={syncing || !ready}
          >
            {syncing ? 'Senkronize ediliyor…' : 'Senkronize et'}
          </button>
        </div>
      </div>

      {!ready && initialized && (
        <div className="od-banner-error">Kurum ve şube seçimi gerekli.</div>
      )}

      <div className="od-toolbar">
        <span className="od-cell-muted">
          Kaynak: {source === 'google' ? 'Google Takvim' : 'Yedek katalog'} · {summary.total} gün ·
          Takvimde senkron: {syncedCount} kayıt · Etkilenen: {summary.affected}
        </span>
        <div className="od-toolbar-spacer" />
        <Badge tone="secondary">Tatil {summary.tatil}</Badge>
        <Badge tone="success">Devam {summary.devam}</Badge>
      </div>

      {syncedCount === 0 ? (
        <div className="od-banner-warning">
          Bu tatiller henüz kurum takvimine yazılmadı. <strong>Senkronize et</strong> ile Genel
          Takvim’de görünür hale gelir. Varsayılan: özel ders tatil günlerinde üretilmez.
        </div>
      ) : (
        <div className="od-banner-success">
          {syncedCount} tatil kaydı takvimde. Genel Takvim → Tatil / İzin türünü açık tutun.
          Varsayılan: özel ders tatilde kapalı; “Devam” ile açabilirsiniz.
        </div>
      )}

      <div className="od-card">
        <div className="od-card-body no-pad">
          {loading ? (
            <SkeletonRows rows={8} />
          ) : days.length === 0 ? (
            <EmptyState
              icon={<IconCalendar size={24} />}
              title="Tatil yok"
              description="Önce Senkronize et ile resmi tatilleri takvime alın."
            />
          ) : (
            <div className="od-table-scroll">
              <table className="od-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Tatil</th>
                    <th>Takvim</th>
                    <th>Özel ders</th>
                    <th>Etkilenen</th>
                    <th>Çevre</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const key = `${d.holiday_key}:${d.date}`;
                    const busy = busyKey === key;
                    const isCevre = d.source === 'cevre';
                    const count = d.affected_count || 0;
                    return (
                      <tr key={key}>
                        <td className="od-cell-primary">
                          {dayjs(d.date).format('DD.MM.YYYY dddd')}
                        </td>
                        <td>
                          {d.title}
                          {isCevre && (
                            <>
                              {' '}
                              <Badge tone="secondary">Çevre</Badge>
                            </>
                          )}
                        </td>
                        <td>
                          <Badge tone={d.synced ? 'success' : 'secondary'}>
                            {d.synced ? 'Senkron' : 'Bekliyor'}
                          </Badge>
                        </td>
                        <td>
                          <Badge tone={d.ozel_ders_aktif ? 'success' : 'secondary'}>
                            {d.ozel_ders_aktif ? 'Devam' : 'Tatil'}
                          </Badge>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="od-btn od-btn-sm od-btn-secondary"
                            onClick={() => setDrawerDay(d)}
                            title="Etkilenen dersleri gör"
                          >
                            <Badge tone={d.ozel_ders_aktif ? 'success' : count > 0 ? 'warning' : 'secondary'}>
                              {count} ders
                            </Badge>
                          </button>
                        </td>
                        <td>
                          {!isCevre ? (
                            <div className="od-row-actions always-visible">
                              <button
                                type="button"
                                className={`od-btn od-btn-sm ${
                                  d.cevre_prev ? 'od-btn-primary' : 'od-btn-secondary'
                                }`}
                                disabled={busyKey === `cevre:${d.date}:prev`}
                                onClick={() => void toggleCevre(d, 'prev', !d.cevre_prev)}
                                title="Önceki günü özel ders tatili yap"
                              >
                                {d.cevre_prev ? '−1 gün ✓' : '−1 gün'}
                              </button>
                              <button
                                type="button"
                                className={`od-btn od-btn-sm ${
                                  d.cevre_next ? 'od-btn-primary' : 'od-btn-secondary'
                                }`}
                                disabled={busyKey === `cevre:${d.date}:next`}
                                onClick={() => void toggleCevre(d, 'next', !d.cevre_next)}
                                title="Sonraki günü özel ders tatili yap"
                              >
                                {d.cevre_next ? '+1 gün ✓' : '+1 gün'}
                              </button>
                            </div>
                          ) : (
                            <span className="od-cell-muted">—</span>
                          )}
                        </td>
                        <td>
                          {!isCevre ? (
                            <div className="od-row-actions always-visible">
                              <button
                                type="button"
                                className={`od-btn od-btn-sm ${
                                  d.ozel_ders_aktif ? 'od-btn-secondary' : 'od-btn-primary'
                                }`}
                                disabled={busy}
                                onClick={() => void toggleDay(d, !d.ozel_ders_aktif)}
                              >
                                {busy
                                  ? '…'
                                  : d.ozel_ders_aktif
                                    ? 'Tatile çevir'
                                    : 'Devam etsin'}
                              </button>
                            </div>
                          ) : (
                            <span className="od-cell-muted">Manuel çevre</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <EtkilenenDerslerDrawer
        open={Boolean(drawerDay)}
        date={drawerDay?.date || null}
        title={drawerDay?.title}
        ozelDersAktif={drawerDay?.ozel_ders_aktif}
        onClose={() => setDrawerDay(null)}
      />
    </div>
  );
}
