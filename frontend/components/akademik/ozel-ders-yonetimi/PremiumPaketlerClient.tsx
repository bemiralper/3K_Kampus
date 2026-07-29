'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import {
  fetchPremiumKota,
  setPremiumKota,
  suggestPremiumSlots,
  type PremiumKota,
} from '@/lib/ozel-ders-api';
import { useOzelDersMeta } from './useOzelDersMeta';
import { useOzelDersToast } from './OzelDersToast';
import { Badge, EmptyState, PageHeader } from './ozelDersUi';
import { IconClock, IconPlus, IconStar, IconTrash, IconWand } from './icons';
import './ozel-ders.css';

type PremiumPaketBrief = { id: number; ad: string; kod: string };

export default function PremiumPaketlerClient() {
  const { meta, ready, error: metaError } = useOzelDersMeta();
  const { show, node: toastNode } = useOzelDersToast();

  const [paketler, setPaketler] = useState<PremiumPaketBrief[]>([]);
  const [paketId, setPaketId] = useState<number | null>(null);
  const [kotalar, setKotalar] = useState<PremiumKota[]>([]);
  const [rows, setRows] = useState<
    { ders_id: string; haftalik_adet: string; varsayilan_sure_dk: string }[]
  >([{ ders_id: '', haftalik_adet: '1', varsayilan_sure_dk: '60' }]);
  const [suggestions, setSuggestions] = useState<Record<string, unknown>[]>([]);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const loadPaketler = useCallback(async () => {
    if (!ready) return;
    const res = await apiFetch<{
      success?: boolean;
      data?: PremiumPaketBrief[] | { results?: PremiumPaketBrief[] };
      results?: PremiumPaketBrief[];
    }>('/egitim-paketleri/api/premium-paketler/');
    const raw = (res as { data?: unknown }).data ?? (res as { results?: unknown }).results ?? res;
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { results?: PremiumPaketBrief[] })?.results)
        ? (raw as { results: PremiumPaketBrief[] }).results
        : [];
    setPaketler(list as PremiumPaketBrief[]);
    setPaketId((prev) => prev ?? (list[0] as PremiumPaketBrief)?.id ?? null);
  }, [ready]);

  const loadKota = useCallback(async () => {
    if (!paketId) return;
    try {
      const data = await fetchPremiumKota(paketId);
      setKotalar(data);
      setSuggestions([]);
      setRows(
        data.length
          ? data.map((k) => ({
              ders_id: String(k.ders),
              haftalik_adet: String(k.haftalik_adet),
              varsayilan_sure_dk: String(k.varsayilan_sure_dk),
            }))
          : [{ ders_id: '', haftalik_adet: '1', varsayilan_sure_dk: '60' }],
      );
    } catch (e) {
      show(e instanceof Error ? e.message : 'Kota yüklenemedi', 'error');
    }
  }, [paketId, show]);

  useEffect(() => {
    loadPaketler().catch((e) => show(e.message, 'error'));
  }, [loadPaketler, show]);

  useEffect(() => {
    loadKota();
  }, [loadKota]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!paketId) return;
    setSaving(true);
    try {
      const payload = rows
        .filter((r) => r.ders_id)
        .map((r) => ({
          ders_id: Number(r.ders_id),
          haftalik_adet: Number(r.haftalik_adet || 1),
          varsayilan_sure_dk: Number(r.varsayilan_sure_dk || 60),
        }));
      const data = await setPremiumKota(paketId, payload);
      setKotalar(data);
      show('Kota kaydedildi.');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Kayıt başarısız', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function onSuggest() {
    if (!paketId) return;
    setSuggesting(true);
    try {
      setSuggestions(await suggestPremiumSlots(paketId));
    } catch (err) {
      show(err instanceof Error ? err.message : 'Öneri alınamadı', 'error');
    } finally {
      setSuggesting(false);
    }
  }

  const activePaket = paketler.find((p) => p.id === paketId) || null;
  const totalWeekly = kotalar.reduce((s, k) => s + (k.haftalik_adet || 0), 0);
  const totalMinutes = kotalar.reduce((s, k) => s + (k.haftalik_adet || 0) * (k.varsayilan_sure_dk || 0), 0);

  return (
    <div className="od-scope">
      {toastNode}

      <PageHeader
        icon={<IconStar size={19} />}
        title="Premium Paketler"
        description="Premium paketlerin haftalık ders kotalarını tanımlayın (örn. 2 Matematik, 1 Fizik). Satış fiyatı Eğitim Paketleri ekranından yönetilir."
        actions={
          <button type="button" className="od-btn od-btn-secondary" onClick={onSuggest} disabled={!paketId || suggesting}>
            <IconWand size={15} /> {suggesting ? 'Öneri hazırlanıyor…' : 'Şablon Öner'}
          </button>
        }
      />

      {metaError && <div className="od-banner-error">{metaError}</div>}

      <div className="od-toolbar">
        <div className="od-filter-field" style={{ minWidth: 260 }}>
          <label>Premium Paket</label>
          <select
            className="od-select"
            value={paketId ?? ''}
            onChange={(e) => setPaketId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Paket seçin</option>
            {paketler.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ad}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activePaket && (
        <div className="od-card">
          <div className="od-card-body" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div className="od-avatar" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
              <IconStar size={17} />
            </div>
            <div style={{ minWidth: 140 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--od-text)' }}>{activePaket.ad}</div>
              <div className="od-cell-muted">{activePaket.kod}</div>
            </div>
            <div className="od-insight-bar" style={{ padding: 0, background: 'transparent', flex: 1 }}>
              <span className="od-insight-item">
                <IconClock size={14} /> <strong>{totalWeekly}</strong> ders/hafta
              </span>
              <span className="od-insight-item">
                <IconClock size={14} /> <strong>{totalMinutes}</strong> dk/hafta
              </span>
              <span className="od-insight-item">
                <strong>{kotalar.length}</strong> tanımlı ders
              </span>
            </div>
            {kotalar.length > 0 && (
              <div className="od-entity-card-meta" style={{ width: '100%', marginTop: 2 }}>
                {kotalar.map((k) => (
                  <Badge key={k.id} tone="secondary">
                    {k.ders_ad} ×{k.haftalik_adet}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="od-card">
        <div className="od-card-header">
          <h3>
            <IconClock size={17} /> Haftalık Ders Kotası
          </h3>
        </div>
        <div className="od-card-body">
          <form className="od-form" onSubmit={onSave}>
            <div className="od-form-section-title">Ders satırları</div>
            {rows.map((row, idx) => (
              <div className="od-form-row" key={idx} style={{ gridTemplateColumns: '2fr 1fr 1fr auto', alignItems: 'end' }}>
                <div className="od-form-group">
                  <label>Ders</label>
                  <select
                    required
                    value={row.ders_id}
                    onChange={(e) =>
                      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ders_id: e.target.value } : r)))
                    }
                  >
                    <option value="">Seçin</option>
                    {(meta?.dersler || []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.ad}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="od-form-group">
                  <label>Haftalık Adet</label>
                  <input
                    type="number"
                    min={1}
                    value={row.haftalik_adet}
                    onChange={(e) =>
                      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, haftalik_adet: e.target.value } : r)))
                    }
                  />
                </div>
                <div className="od-form-group">
                  <label>Süre (dk)</label>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={row.varsayilan_sure_dk}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, varsayilan_sure_dk: e.target.value } : r)),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  className="od-btn od-btn-ghost od-btn-icon"
                  disabled={rows.length === 1}
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Satırı kaldır"
                >
                  <IconTrash size={15} />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="od-btn od-btn-secondary od-btn-sm"
                onClick={() => setRows((prev) => [...prev, { ders_id: '', haftalik_adet: '1', varsayilan_sure_dk: '60' }])}
              >
                <IconPlus size={13} /> Satır Ekle
              </button>
              <div style={{ flex: 1 }} />
              <button type="submit" className="od-btn od-btn-primary" disabled={!paketId || saving}>
                {saving ? 'Kaydediliyor…' : 'Kotayı Kaydet'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="od-card">
          <div className="od-card-header">
            <h3>
              <IconWand size={17} /> Şablon İskeleti
            </h3>
          </div>
          <div className="od-card-body no-pad">
            <p style={{ padding: '0 18px', margin: '2px 0 10px', fontSize: '0.8rem', color: 'var(--od-muted)' }}>
              Öğretmen ve saatler Haftalık Program Şablonları ekranından doldurulur.
            </p>
            <div className="od-table-scroll">
              <table className="od-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Ders</th>
                    <th>Süre</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s, i) => (
                    <tr key={i}>
                      <td>{String(s.sira ?? i + 1)}</td>
                      <td className="od-cell-primary">{String(s.ders_ad ?? s.ders)}</td>
                      <td className="od-cell-muted">{String(s.sure_dk)} dk</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!paketId && (
        <div className="od-card">
          <EmptyState icon={<IconStar size={24} />} title="Bir premium paket seçin" description="Kota tanımlamak için yukarıdan bir premium paket seçin." />
        </div>
      )}
    </div>
  );
}
