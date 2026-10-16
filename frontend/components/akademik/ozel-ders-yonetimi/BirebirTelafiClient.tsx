'use client';

import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import {
  createTelafi,
  fetchOturumlar,
  resolveDersLabel,
  vazgecTelafi,
  vazgecTelafiToplu,
  type BirebirOturum,
} from '@/lib/ozel-ders-api';
import { useOzelDersMeta } from './useOzelDersMeta';
import { useOzelDersToast } from './OzelDersToast';
import { useDersDisplayPref } from './useDersDisplayPref';
import { Badge, Drawer, EmptyState, PageHeader, SkeletonRows, oturumDurumTone } from './ozelDersUi';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheckCircle,
  IconRefresh,
  IconRotateCcw,
} from './icons';
import './ozel-ders.css';
import './telafi.css';

dayjs.locale('tr');

/** Güncel kuyruk. Daha eski bekleyenler ayrı, kapalı bölümde durur. */
const TELAFI_AKTIF_GUN = 21;

function splitQueue(rows: BirebirOturum[]) {
  const cutoff = dayjs().subtract(TELAFI_AKTIF_GUN, 'day').startOf('day');
  const aktif: BirebirOturum[] = [];
  const eski: BirebirOturum[] = [];
  for (const row of rows) {
    if (dayjs(row.session_date).isBefore(cutoff, 'day')) eski.push(row);
    else aktif.push(row);
  }
  return { aktif, eski };
}

function TelafiRow({
  row,
  useKisaAd,
  asking,
  busy,
  onPlan,
  onAsk,
  onCancelAsk,
  onConfirm,
}: {
  row: BirebirOturum;
  useKisaAd: boolean;
  asking: boolean;
  busy: boolean;
  onPlan: () => void;
  onAsk: () => void;
  onCancelAsk: () => void;
  onConfirm: () => void;
}) {
  const reason = (row.sebep_display || row.sebep_aciklama || '').trim();
  const sameAsStatus =
    reason.toLocaleLowerCase('tr-TR') === (row.durum_display || '').trim().toLocaleLowerCase('tr-TR');
  const note = !sameAsStatus && reason.length > 42 ? reason : '';
  const shortReason = !sameAsStatus && !note ? reason : '';
  const missed = row.durum === 'OGRENCI_GELMEDI' || row.durum === 'OGRETMEN_GELMEDI';
  return (
    <article className="tf-row">
      <div className="tf-when">
        <strong>{dayjs(row.session_date).format('D MMM')}</strong>
        <span>{row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}</span>
      </div>
      <div className="tf-main">
        <div className="tf-name">{row.ogrenci_ad}</div>
        <div className="tf-meta">
          {resolveDersLabel(row, useKisaAd)}
          {row.ogretmen_ad ? ` · ${row.ogretmen_ad}` : ''}
        </div>
        <div className="tf-why">
          <span className={`tf-status${missed ? ' is-miss' : ''}`}>{row.durum_display}</span>
          {shortReason && <span>{shortReason}</span>}
        </div>
        {note && <p className="tf-note">{note}</p>}
        {asking && <p className="tf-ask">Telafi kapanacak. Yoklama kaydı durur.</p>}
      </div>
      <div className="tf-actions">
        {asking ? (
          <>
            <button type="button" className="od-btn od-btn-secondary od-btn-sm" disabled={busy} onClick={onCancelAsk}>
              Geri
            </button>
            <button type="button" className="od-btn od-btn-danger od-btn-sm" disabled={busy} onClick={onConfirm}>
              Vazgeç
            </button>
          </>
        ) : (
          <>
            <button type="button" className="od-btn od-btn-secondary od-btn-sm" disabled={busy} onClick={onAsk}>
              Vazgeç
            </button>
            <button type="button" className="od-btn od-btn-primary od-btn-sm" disabled={busy} onClick={onPlan}>
              <IconRotateCcw size={13} /> Telafi Planla
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export default function BirebirTelafiClient() {
  const { ready, error: metaError } = useOzelDersMeta();
  const { show, node: toastNode } = useOzelDersToast();
  const { useKisaAd, setUseKisaAd } = useDersDisplayPref();

  const [candidates, setCandidates] = useState<BirebirOturum[]>([]);
  const [telafis, setTelafis] = useState<BirebirOturum[]>([]);
  const [loading, setLoading] = useState(false);

  const [sourceId, setSourceId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [askId, setAskId] = useState<number | null>(null);
  const [askBulk, setAskBulk] = useState(false);
  const [eskiOpen, setEskiOpen] = useState(false);
  const [waiving, setWaiving] = useState(false);
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
          telafi_durumu: 'BEKLENIYOR',
          start_date: dayjs().subtract(400, 'day').format('YYYY-MM-DD'),
          end_date: dayjs().add(30, 'day').format('YYYY-MM-DD'),
          skip_materialize: 1,
        }),
        fetchOturumlar({
          oturum_turu: 'TELAFI',
          start_date: dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
          end_date: dayjs().add(60, 'day').format('YYYY-MM-DD'),
          skip_materialize: 1,
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
  const { aktif, eski } = splitQueue(candidates);

  async function waiveOne(id: number) {
    setWaiving(true);
    try {
      await vazgecTelafi(id);
      show('Telafiden vazgeçildi. Kaynak ders kaydı duruyor.');
      setAskId(null);
      await load();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Vazgeçilemedi', 'error');
    } finally {
      setWaiving(false);
    }
  }

  async function waiveStale() {
    if (eski.length === 0) return;
    setWaiving(true);
    try {
      const result = await vazgecTelafiToplu(eski.map((r) => r.id));
      show(`${result.count} eski telafi kapatıldı. Ders kayıtları duruyor.`);
      setAskBulk(false);
      setEskiOpen(false);
      await load();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Eski kayıtlar kapatılamadı', 'error');
    } finally {
      setWaiving(false);
    }
  }

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
        description="Telafi bekleyen birebir dersler için yeni tarih/saat planlayın; planlanan telafiler kaynak dersine bağlı olarak burada takip edilir."
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

      <div className="tf-summary" aria-label="Telafi özeti">
        <span><strong>{aktif.length}</strong> bekleyen</span>
        {eski.length > 0 && <span><strong>{eski.length}</strong> eski</span>}
        <span><strong>{telafis.length}</strong> planlandı</span>
        <span>
          <strong>{telafis.filter((t) => ['ISLENDI', 'ONLINE'].includes(t.durum)).length}</strong> tamamlandı
        </span>
      </div>

      <div className="od-card">
        <div className="od-card-header">
          <h3>
            <IconAlertTriangle size={17} /> Telafi Bekleyenler
          </h3>
          <span className="od-cell-muted">Son {TELAFI_AKTIF_GUN} gün · {aktif.length} kayıt</span>
        </div>
        <div className="od-card-body">
          {loading ? (
            <SkeletonRows rows={4} />
          ) : aktif.length === 0 ? (
            <EmptyState
              icon={<IconCheckCircle size={24} />}
              title="Güncel bekleyen yok"
              description={
                eski.length
                  ? `Son ${TELAFI_AKTIF_GUN} günde telafi borcu yok. Daha eskiler aşağıda.`
                  : 'Tüm telafi gerektiren dersler kapanmış.'
              }
            />
          ) : (
            <div className="tf-list">
              {aktif.map((r) => (
                <TelafiRow
                  key={r.id}
                  row={r}
                  useKisaAd={useKisaAd}
                  asking={askId === r.id}
                  busy={waiving}
                  onPlan={() => {
                    setAskId(null);
                    setSourceId(r.id);
                    setForm({
                      session_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
                      start_time: r.start_time.slice(0, 5),
                      end_time: r.end_time.slice(0, 5),
                    });
                  }}
                  onAsk={() => setAskId(r.id)}
                  onCancelAsk={() => setAskId(null)}
                  onConfirm={() => void waiveOne(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {eski.length > 0 && (
        <div className="od-card tf-stale">
          <div className="od-card-header">
            <h3>Eski bekleyenler</h3>
            <span className="od-cell-muted">{TELAFI_AKTIF_GUN} günden eski · {eski.length} kayıt</span>
          </div>
          <div className="od-card-body">
            <p className="tf-stale-copy">
              Bu dersler hâlâ telafi bekliyor. Ana listeye karışmasın diye ayrı duruyor. Planlayabilir
              veya borcu kapatabilirsiniz; yoklama kaydı silinmez.
            </p>
            <div className="tf-stale-actions">
              <button type="button" className="od-btn od-btn-secondary od-btn-sm" onClick={() => setEskiOpen((v) => !v)}>
                {eskiOpen ? 'Listeyi gizle' : 'Listeyi aç'}
              </button>
              {askBulk ? (
                <>
                  <span className="tf-ask">{eski.length} kaydın telafisi kapanacak.</span>
                  <button type="button" className="od-btn od-btn-secondary od-btn-sm" disabled={waiving} onClick={() => setAskBulk(false)}>
                    Geri
                  </button>
                  <button type="button" className="od-btn od-btn-danger od-btn-sm" disabled={waiving} onClick={() => void waiveStale()}>
                    {waiving ? 'Kapatılıyor…' : 'Tümünden vazgeç'}
                  </button>
                </>
              ) : (
                <button type="button" className="od-btn od-btn-danger od-btn-sm" disabled={waiving} onClick={() => setAskBulk(true)}>
                  Tümünden vazgeç
                </button>
              )}
            </div>
            {eskiOpen && (
              <div className="tf-list">
                {eski.map((r) => (
                  <TelafiRow
                    key={r.id}
                    row={r}
                    useKisaAd={useKisaAd}
                    asking={askId === r.id}
                    busy={waiving}
                    onPlan={() => {
                      setAskId(null);
                      setSourceId(r.id);
                      setForm({
                        session_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
                        start_time: r.start_time.slice(0, 5),
                        end_time: r.end_time.slice(0, 5),
                      });
                    }}
                    onAsk={() => setAskId(r.id)}
                    onCancelAsk={() => setAskId(null)}
                    onConfirm={() => void waiveOne(r.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
                      <td>
                        {r.kaynak_oturum ? (
                          <span className="od-cell-muted" title={`Kaynak #${r.kaynak_oturum.id}`}>
                            Bu ders, {dayjs(r.kaynak_oturum.session_date).format('DD.MM.YYYY')} tarihli
                            dersin telafisidir
                          </span>
                        ) : (
                          <span className="od-cell-muted">#{r.replaces_oturum || '—'}</span>
                        )}
                      </td>
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
