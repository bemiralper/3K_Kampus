'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import {
  approveHakedis,
  bordroAktar,
  cancelHakedis,
  fetchHakedis,
  resolveDersLabel,
  seedUcretKurallari,
  type BirebirHakedis,
} from '@/lib/ozel-ders-api';
import { useOzelDersMeta } from './useOzelDersMeta';
import { useOzelDersToast } from './OzelDersToast';
import { useDersDisplayPref } from './useDersDisplayPref';
import {
  Badge,
  EmptyState,
  PageHeader,
  SkeletonRows,
  StatCard,
  StatGrid,
  formatCurrency,
  hakedisDurumTone,
} from './ozelDersUi';
import {
  IconCalendar,
  IconCheckCircle,
  IconRefresh,
  IconSend,
  IconWallet,
  IconWand,
  IconXCircle,
} from './icons';
import './ozel-ders.css';

dayjs.locale('tr');

const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export default function HakedisTakibiClient() {
  const { ready, error: metaError } = useOzelDersMeta();
  const { show, node: toastNode } = useOzelDersToast();
  const { useKisaAd, setUseKisaAd } = useDersDisplayPref();

  const [yil, setYil] = useState(dayjs().year());
  const [ay, setAy] = useState(dayjs().month() + 1);
  const [durum, setDurum] = useState('TASLAK');
  const [rows, setRows] = useState<BirebirHakedis[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      setRows(await fetchHakedis({ yil, ay, durum: durum || undefined }));
      setSelected(new Set());
    } catch (e) {
      show(e instanceof Error ? e.message : 'Yüklenemedi', 'error');
    } finally {
      setLoading(false);
    }
  }, [ready, yil, ay, durum, show]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const total = rows.reduce((s, r) => s + (r.tutar || 0), 0);
    return {
      total,
      taslak: rows.filter((r) => r.durum === 'TASLAK').length,
      onayli: rows.filter((r) => r.durum === 'ONAYLANDI').length,
      bordroya: rows.filter((r) => r.durum === 'BORDOYA_ISLENDI').length,
    };
  }, [rows]);

  const selectableIds = rows.filter((r) => r.durum === 'TASLAK').map((r) => r.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onApprove(id: number) {
    setBusy(true);
    try {
      await approveHakedis(id);
      show(`Hakediş #${id} onaylandı.`);
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Onay başarısız', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onCancel(id: number) {
    setBusy(true);
    try {
      await cancelHakedis(id);
      show(`Hakediş #${id} iptal edildi.`);
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : 'İptal başarısız', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onBulkApprove() {
    setBusy(true);
    try {
      const ids = Array.from(selected);
      const results = await Promise.allSettled(ids.map((id) => approveHakedis(id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      show(`${ok}/${ids.length} hakediş onaylandı.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function onBordro() {
    setBusy(true);
    try {
      const result = await bordroAktar(yil, ay);
      show(`Bordroya aktarıldı: ${result.hakedis_linked} hakediş, ${result.bordro_updated} bordro satırı.`);
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Aktarım başarısız', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onSeed() {
    setBusy(true);
    try {
      const r = await seedUcretKurallari('global');
      show(`${r.created} ücret kuralı seed edildi.`);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Seed başarısız', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="od-scope">
      {toastNode}

      <PageHeader
        icon={<IconWallet size={19} />}
        title="Hakediş Takibi"
        description="İşlenen özel ders / premium dersten oluşan hakedişleri onaylayın; onaylı kayıtlar seçilen ay için toplu şekilde bordroya aktarılır."
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
            <button type="button" className="od-btn od-btn-ghost od-btn-sm" onClick={onSeed} disabled={busy}>
              <IconWand size={14} /> Ücret Kurallarını Seed Et
            </button>
            <button type="button" className="od-btn od-btn-success" onClick={onBordro} disabled={busy}>
              <IconSend size={15} /> Bordroya Aktar
            </button>
          </>
        }
      />

      {metaError && <div className="od-banner-error">{metaError}</div>}

      <StatGrid>
        <StatCard icon={<IconWallet size={19} />} tone="green" value={formatCurrency(summary.total)} label="Liste Toplamı" />
        <StatCard icon={<IconCalendar size={19} />} tone="blue" value={summary.taslak} label="Taslak" />
        <StatCard icon={<IconCheckCircle size={19} />} tone="purple" value={summary.onayli} label="Onaylı" />
        <StatCard icon={<IconSend size={19} />} tone="teal" value={summary.bordroya} label="Bordroya İşlendi" />
      </StatGrid>

      <div className="od-filters">
        <div className="od-filter-field">
          <label>Yıl</label>
          <input type="number" className="od-input" style={{ width: 90 }} value={yil} onChange={(e) => setYil(Number(e.target.value))} />
        </div>
        <div className="od-filter-field">
          <label>Ay</label>
          <select className="od-select" value={ay} onChange={(e) => setAy(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="od-filter-field">
          <label>Durum</label>
          <select className="od-select" value={durum} onChange={(e) => setDurum(e.target.value)}>
            <option value="">Tümü</option>
            <option value="TASLAK">Taslak</option>
            <option value="ONAYLANDI">Onaylandı</option>
            <option value="BORDOYA_ISLENDI">Bordroya İşlendi</option>
            <option value="IPTAL">İptal</option>
          </select>
        </div>
        <div className="od-toolbar-spacer" />
        <button type="button" className="od-btn od-btn-secondary od-btn-icon" onClick={load} disabled={loading || busy} title="Yenile">
          <IconRefresh size={15} />
        </button>
      </div>

      {selected.size > 0 && (
        <div className="od-bulk-bar">
          <IconCheckCircle size={15} />
          <strong>{selected.size}</strong> hakediş seçildi
          <div style={{ flex: 1 }} />
          <button type="button" className="od-btn od-btn-secondary od-btn-sm" onClick={() => setSelected(new Set())}>
            Seçimi Kaldır
          </button>
          <button type="button" className="od-btn od-btn-success od-btn-sm" onClick={onBulkApprove} disabled={busy}>
            <IconCheckCircle size={13} /> Seçilenleri Onayla
          </button>
        </div>
      )}

      <div className="od-card">
        <div className="od-card-body no-pad">
          {loading ? (
            <SkeletonRows rows={6} />
          ) : rows.length === 0 ? (
            <EmptyState icon={<IconWallet size={24} />} title="Kayıt yok" description="Seçili dönem ve durum için hakediş kaydı bulunamadı." />
          ) : (
            <div className="od-table-scroll">
              <table className="od-table">
                <thead>
                  <tr>
                    <th className="od-th-check">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectableIds.length === 0} />
                    </th>
                    <th>Tarih</th>
                    <th>Öğretmen</th>
                    <th>Ders</th>
                    <th>Süre</th>
                    <th>Birim</th>
                    <th>Tutar</th>
                    <th>Durum</th>
                    <th>Açıklama</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={selected.has(r.id) ? 'is-selected' : ''}>
                      <td>
                        {r.durum === 'TASLAK' && (
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
                        )}
                      </td>
                      <td className="od-cell-time">
                        {r.tarih} {r.start_time ? r.start_time.slice(0, 5) : ''}
                      </td>
                      <td className="od-cell-primary">{r.ogretmen_ad}</td>
                      <td>{resolveDersLabel(r, useKisaAd)}</td>
                      <td className="od-cell-muted">{r.sure_dk} dk</td>
                      <td className="od-cell-muted">{r.birim_ucret.toLocaleString('tr-TR')} ₺</td>
                      <td className="od-price">{formatCurrency(r.tutar)}</td>
                      <td>
                        <Badge tone={hakedisDurumTone(r.durum)}>{r.durum_display}</Badge>
                      </td>
                      <td style={{ whiteSpace: 'normal', maxWidth: 220, fontSize: '0.78rem', color: 'var(--od-muted)' }}>
                        {r.aciklama}
                      </td>
                      <td>
                        <div className="od-row-actions always-visible">
                          {r.durum === 'TASLAK' && (
                            <button
                              type="button"
                              className="od-btn od-btn-success od-btn-sm od-btn-icon"
                              title="Onayla"
                              onClick={() => onApprove(r.id)}
                              disabled={busy}
                            >
                              <IconCheckCircle size={14} />
                            </button>
                          )}
                          {(r.durum === 'TASLAK' || r.durum === 'ONAYLANDI') && (
                            <button
                              type="button"
                              className="od-btn od-btn-danger od-btn-sm od-btn-icon"
                              title="İptal"
                              onClick={() => onCancel(r.id)}
                              disabled={busy}
                            >
                              <IconXCircle size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
