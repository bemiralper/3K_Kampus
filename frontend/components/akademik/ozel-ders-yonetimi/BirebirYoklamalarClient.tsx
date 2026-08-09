'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import {
  fetchOturumlar,
  fetchTatiller,
  resolveDersLabel,
  setOturumDurum,
  type BirebirOturum,
  type OzelDersTatil,
} from '@/lib/ozel-ders-api';
import { akademikTabHref } from '@/lib/akademik-routes';
import { useOzelDersMeta } from './useOzelDersMeta';
import { useOzelDersToast } from './OzelDersToast';
import { useDersDisplayPref } from './useDersDisplayPref';
import { allowedNextDurumlar, OTURUM_DURUM_LABELS, PRIMARY_YOKLAMA_ACTIONS } from './oturumDurum';
import { Badge, EmptyState, PageHeader, SkeletonRows, StatCard, StatGrid, feeStatus } from './ozelDersUi';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheckCircle,
  IconChevronLeft,
  IconChevronRight,
  IconClipboard,
  IconClock,
  IconRefresh,
  IconRotateCcw,
  IconUser,
  IconUsers,
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

export default function BirebirYoklamalarClient() {
  const { ready, error: metaError } = useOzelDersMeta();
  const { show, node: toastNode } = useOzelDersToast();
  const { useKisaAd, setUseKisaAd } = useDersDisplayPref();

  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [rows, setRows] = useState<BirebirOturum[]>([]);
  const [dayHoliday, setDayHoliday] = useState<OzelDersTatil | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [data, tatiller] = await Promise.all([
        fetchOturumlar({ start_date: date, end_date: date }),
        fetchTatiller(date, date).catch(() => [] as OzelDersTatil[]),
      ]);
      setRows(data.sort((a, b) => a.start_time.localeCompare(b.start_time)));
      setDayHoliday(tatiller[0] || null);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Yüklenemedi', 'error');
    } finally {
      setLoading(false);
    }
  }, [ready, date, show]);

  useEffect(() => {
    load();
  }, [load]);

  async function mark(id: number, durum: string) {
    setBusyId(id);
    try {
      const updated = await setOturumDurum(id, durum);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
      show(`Yoklama: ${OTURUM_DURUM_LABELS[durum] || durum}`);
      setExpandedId(null);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Durum güncellenemedi', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const { pending, done } = useMemo(() => {
    const pending = rows.filter((r) => r.durum === 'PLANLANDI');
    const done = rows.filter((r) => r.durum !== 'PLANLANDI');
    return { pending, done };
  }, [rows]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      pending: pending.length,
      done: rows.filter((r) => ['ISLENDI', 'ONLINE'].includes(r.durum)).length,
      issue: rows.filter((r) => ['IPTAL', 'OGRENCI_GELMEDI', 'OGRETMEN_GELMEDI'].includes(r.durum)).length,
    }),
    [rows, pending],
  );

  function shiftDay(delta: number) {
    setDate(dayjs(date).add(delta, 'day').format('YYYY-MM-DD'));
  }

  function renderActions(r: BirebirOturum) {
    const next = allowedNextDurumlar(r.durum);
    const primary = PRIMARY_YOKLAMA_ACTIONS.filter((d) => next.includes(d));
    const secondary = next.filter((d) => !(PRIMARY_YOKLAMA_ACTIONS as readonly string[]).includes(d));
    const showMore = expandedId === r.id;

    return (
      <div className="od-attend-actions">
        {primary.map((durum) => {
          const meta = ACTION_META[durum];
          if (!meta) return null;
          return (
            <button
              key={durum}
              type="button"
              className={`od-attend-btn ${meta.tone}${r.durum === durum ? ' is-current' : ''}`}
              disabled={busyId === r.id}
              onClick={() => mark(r.id, durum)}
            >
              {meta.icon(15)} {meta.label}
            </button>
          );
        })}
        {secondary.length > 0 && (
          <button
            type="button"
            className="od-attend-btn tone-slate"
            disabled={busyId === r.id}
            onClick={() => setExpandedId(showMore ? null : r.id)}
          >
            {showMore ? 'Gizle' : 'Diğer'}
          </button>
        )}
        {showMore &&
          secondary.map((durum) => {
            const meta = ACTION_META[durum];
            if (!meta) return null;
            return (
              <button
                key={durum}
                type="button"
                className={`od-attend-btn ${meta.tone}`}
                disabled={busyId === r.id}
                onClick={() => mark(r.id, durum)}
              >
                {meta.icon(15)} {meta.label}
              </button>
            );
          })}
      </div>
    );
  }

  function renderCard(r: BirebirOturum) {
    const fee = feeStatus(r);
    return (
      <div className="od-attend-card" key={r.id}>
        <div className="od-attend-time">
          {r.start_time.slice(0, 5)}
          <span>{r.end_time.slice(0, 5)}</span>
        </div>
        <div className="od-attend-info">
          <strong>{r.ogrenci_ad}</strong>
          <span>
            {resolveDersLabel(r, useKisaAd)} · {r.ogretmen_ad}
            {r.oda_ad ? ` · ${r.oda_ad}` : ''}
          </span>
          <div className="od-attend-tags">
            <Badge tone={fee.tone}>{fee.label}</Badge>
            {r.durum !== 'PLANLANDI' && <Badge tone="secondary">{r.durum_display}</Badge>}
            {r.oturum_turu === 'TELAFI' && <Badge tone="warning">Telafi</Badge>}
          </div>
        </div>
        {renderActions(r)}
      </div>
    );
  }

  const oturumlarHref = akademikTabHref('ozel-ders-yonetimi', 'birebir-ders-oturumlari');

  return (
    <div className="od-scope">
      {toastNode}

      <PageHeader
        icon={<IconClipboard size={19} />}
        title="Birebir Yoklamalar"
        description="Tek tıkla yoklama alın. Ücret yalnızca İşlendi / Online durumları için hesaplanır; hakediş etiketi anında güncellenir."
        actions={
          <>
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
          </>
        }
      />

      {metaError && <div className="od-banner-error">{metaError}</div>}

      <StatGrid>
        <StatCard icon={<IconCalendar size={19} />} tone="blue" value={summary.total} label="Günün Dersi" />
        <StatCard icon={<IconClock size={19} />} tone="orange" value={summary.pending} label="Bekleyen Yoklama" />
        <StatCard icon={<IconCheckCircle size={19} />} tone="green" value={summary.done} label="İşlenen" />
        <StatCard icon={<IconAlertTriangle size={19} />} tone="red" value={summary.issue} label="Sorunlu / İptal" />
      </StatGrid>

      <div className="od-toolbar">
        <button type="button" className="od-btn od-btn-secondary od-btn-icon" onClick={() => shiftDay(-1)} title="Önceki gün">
          <IconChevronLeft size={16} />
        </button>
        <input
          type="date"
          className="od-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ fontWeight: 650 }}
        />
        <button type="button" className="od-btn od-btn-secondary od-btn-icon" onClick={() => shiftDay(1)} title="Sonraki gün">
          <IconChevronRight size={16} />
        </button>
        <button type="button" className="od-btn od-btn-secondary od-btn-sm" onClick={() => setDate(dayjs().format('YYYY-MM-DD'))}>
          Bugün
        </button>
        <div className="od-toolbar-spacer" />
        <span className="od-cell-muted" style={{ textTransform: 'capitalize' }}>{dayjs(date).format('D MMMM YYYY, dddd')}</span>
      </div>

      {dayHoliday && !dayHoliday.ozel_ders_aktif && (
        <div className="od-banner-warning" role="status">
          <IconAlertTriangle size={15} />
          Bu gün tatil: <strong>{dayHoliday.title}</strong>. Yoklama beklenmeyebilir; oturum üretimi
          bu günü atlar.
        </div>
      )}
      {dayHoliday?.ozel_ders_aktif && (
        <div className="od-banner-success" role="status">
          Resmi tatil ({dayHoliday.title}) — kurum kararıyla özel ders devam ediyor.
        </div>
      )}

      {loading ? (
        <div className="od-card">
          <SkeletonRows rows={4} />
        </div>
      ) : rows.length === 0 ? (
        <div className="od-card">
          <EmptyState
            icon={<IconCalendar size={24} />}
            title="Bu tarihte oturum yok"
            description="Önce şablondan oturum üretin veya tek seferlik ders oluşturun."
            action={
              <a className="od-btn od-btn-primary" href={oturumlarHref}>
                Birebir Ders Oturumlarına Git
              </a>
            }
          />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="od-attend-group">
              <span className="od-attend-group-label">Bekleyen Yoklama ({pending.length})</span>
              {pending.map(renderCard)}
            </div>
          )}
          {done.length > 0 && (
            <div className="od-attend-group">
              <span className="od-attend-group-label">İşlenmiş ({done.length})</span>
              {done.map(renderCard)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
