'use client';

import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import { createTelafi, fetchOturumlar, resolveDersLabel, type BirebirOturum } from '@/lib/ozel-ders-api';
import { useOzelDersMeta } from './useOzelDersMeta';
import { useOzelDersToast } from './OzelDersToast';
import { useDersDisplayPref } from './useDersDisplayPref';
import { Badge, Drawer, EmptyState, PageHeader, SkeletonCards, SkeletonRows, StatCard, StatGrid, oturumDurumTone } from './ozelDersUi';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheckCircle,
  IconRefresh,
  IconRotateCcw,
} from './icons';
import './ozel-ders.css';

dayjs.locale('tr');

export default function BirebirTelafiClient() {
  const { ready, error: metaError } = useOzelDersMeta();
  const { show, node: toastNode } = useOzelDersToast();
  const { useKisaAd, setUseKisaAd } = useDersDisplayPref();

  const [candidates, setCandidates] = useState<BirebirOturum[]>([]);
  const [telafis, setTelafis] = useState<BirebirOturum[]>([]);
  const [loading, setLoading] = useState(false);

  const [sourceId, setSourceId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    session_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    start_time: '18:00',
    end_time: '19:00',
  });

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [c, t] = await Promise.all([
        fetchOturumlar({
          durum: 'TELAFI_EDILECEK',
          start_date: dayjs().subtract(60, 'day').format('YYYY-MM-DD'),
          end_date: dayjs().add(30, 'day').format('YYYY-MM-DD'),
        }),
        fetchOturumlar({
          oturum_turu: 'TELAFI',
          start_date: dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
          end_date: dayjs().add(60, 'day').format('YYYY-MM-DD'),
        }),
      ]);
      setCandidates(c);
      setTelafis(t.sort((a, b) => (a.session_date < b.session_date ? 1 : -1)));
    } catch (e) {
      show(e instanceof Error ? e.message : 'Yüklenemedi', 'error');
    } finally {
      setLoading(false);
    }
  }, [ready, show]);

  useEffect(() => {
    load();
  }, [load]);

  const sourceRow = candidates.find((c) => c.id === sourceId) || null;

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceId) return;
    setSaving(true);
    try {
      await createTelafi(sourceId, form);
      show('Telafi dersi planlandı.');
      setSourceId(null);
      await load();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Telafi oluşturulamadı', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="od-scope">
      {toastNode}

      <PageHeader
        icon={<IconRotateCcw size={19} />}
        title="Birebir Telafi Dersleri"
        description="Telafi edilecek işaretlenen birebir dersler için yeni tarih/saat planlayın; planlanan telafiler kaynak dersine bağlı olarak burada takip edilir."
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
        <StatCard icon={<IconAlertTriangle size={19} />} tone="orange" value={candidates.length} label="Telafi Bekleyen" />
        <StatCard icon={<IconCalendar size={19} />} tone="blue" value={telafis.length} label="Planlanan Telafi" />
        <StatCard
          icon={<IconCheckCircle size={19} />}
          tone="green"
          value={telafis.filter((t) => ['ISLENDI', 'ONLINE'].includes(t.durum)).length}
          label="Tamamlanan Telafi"
        />
      </StatGrid>

      <div className="od-card">
        <div className="od-card-header">
          <h3>
            <IconAlertTriangle size={17} /> Telafi Bekleyenler
          </h3>
          <span className="od-cell-muted">{candidates.length} kayıt</span>
        </div>
        <div className="od-card-body">
          {loading ? (
            <SkeletonCards count={3} />
          ) : candidates.length === 0 ? (
            <EmptyState
              icon={<IconCheckCircle size={24} />}
              title="Bekleyen telafi yok"
              description="Tüm telafi gerektiren dersler zaten planlanmış."
            />
          ) : (
            <div className="od-grid-cards">
              {candidates.map((r) => (
                <div className="od-entity-card" key={r.id} style={{ cursor: 'default' }}>
                  <div className="od-entity-card-top">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="od-entity-card-name">{r.ogrenci_ad}</div>
                      <div className="od-entity-card-sub">
                        {dayjs(r.session_date).format('DD MMM YYYY')} · {r.start_time.slice(0, 5)}
                      </div>
                    </div>
                  </div>
                  <div className="od-entity-card-meta">
                    <Badge tone="secondary">{resolveDersLabel(r, useKisaAd)}</Badge>
                    <Badge tone="info">{r.ogretmen_ad}</Badge>
                  </div>
                  <div className="od-entity-card-footer">
                    <span className="od-cell-muted">Kaynak ders #{r.id}</span>
                    <button
                      type="button"
                      className="od-btn od-btn-primary od-btn-sm"
                      onClick={() => {
                        setSourceId(r.id);
                        setForm({
                          session_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
                          start_time: r.start_time.slice(0, 5),
                          end_time: r.end_time.slice(0, 5),
                        });
                      }}
                    >
                      <IconRotateCcw size={13} /> Telafi Planla
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="od-card">
        <div className="od-card-header">
          <h3>
            <IconCalendar size={17} /> Planlanan Telafiler
          </h3>
          <span className="od-cell-muted">{telafis.length} kayıt</span>
        </div>
        <div className="od-card-body no-pad">
          {loading && telafis.length === 0 ? (
            <SkeletonRows rows={3} />
          ) : telafis.length === 0 ? (
            <EmptyState icon={<IconCalendar size={24} />} title="Telafi oturumu yok" />
          ) : (
            <div className="od-table-scroll">
              <table className="od-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Öğrenci</th>
                    <th>Ders</th>
                    <th>Kaynak</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {telafis.map((r) => (
                    <tr key={r.id}>
                      <td className="od-cell-time">
                        {dayjs(r.session_date).format('DD.MM.YYYY')} {r.start_time.slice(0, 5)}
                      </td>
                      <td className="od-cell-primary">{r.ogrenci_ad}</td>
                      <td>{resolveDersLabel(r, useKisaAd)}</td>
                      <td className="od-cell-muted">#{r.replaces_oturum || '—'}</td>
                      <td>
                        <Badge tone={oturumDurumTone(r.durum)}>{r.durum_display}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Drawer
        open={Boolean(sourceId)}
        onClose={() => setSourceId(null)}
        title="Telafi Oluştur"
        description={
          sourceRow
            ? `${sourceRow.ogrenci_ad} · ${resolveDersLabel(sourceRow, useKisaAd)} dersinin telafisi`
            : ''
        }
        footer={
          <>
            <button type="button" className="od-btn od-btn-secondary" onClick={() => setSourceId(null)}>
              Vazgeç
            </button>
            <button type="submit" form="od-telafi-form" className="od-btn od-btn-primary" disabled={saving}>
              {saving ? 'Oluşturuluyor…' : 'Telafiyi Oluştur'}
            </button>
          </>
        }
      >
        <form id="od-telafi-form" className="od-form" onSubmit={onCreate}>
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
          <div className="od-form-row">
            <div className="od-form-group">
              <label>Başlangıç</label>
              <input
                type="time"
                required
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              />
            </div>
            <div className="od-form-group">
              <label>Bitiş</label>
              <input
                type="time"
                required
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              />
            </div>
          </div>
          <span className="od-form-hint">
            Ders, öğrenci ve öğretmen kaynak oturumdan otomatik devralınır.
          </span>
        </form>
      </Drawer>
    </div>
  );
}
