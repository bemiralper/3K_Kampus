'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  websiteAdminApi,
  invalidateLandingCache,
  type YasalMetin,
} from '@/lib/website-api';
import { buildYasalDefaultsPayload } from '@/lib/yasal-content-registry';
import { isPlaceholderYasalContent } from '@/lib/yasal-sections-to-json';

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

const YASAL_TURLER: { tur: string; label: string; path: string }[] = [
  { tur: 'kvkk', label: 'KVKK Aydınlatma Metni', path: '/yasal/kvkk' },
  { tur: 'gizlilik', label: 'Gizlilik Politikası', path: '/yasal/gizlilik' },
  { tur: 'kullanim', label: 'Kullanım Koşulları', path: '/yasal/kullanim' },
  { tur: 'cerez', label: 'Çerez Politikası', path: '/yasal/cerez' },
];

type FormState = {
  baslik: string;
  icerik: string;
  aktif: boolean;
};

const emptyForm = (): FormState => ({ baslik: '', icerik: '', aktif: true });

export default function CmsYasalMetinler({ onMessage }: Props) {
  const [items, setItems] = useState<YasalMetin[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTur, setActiveTur] = useState('kvkk');
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [savingTur, setSavingTur] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const syncForms = useCallback((list: YasalMetin[]) => {
    const next: Record<string, FormState> = {};
    for (const spec of YASAL_TURLER) {
      const found = list.find((m) => m.tur === spec.tur);
      next[spec.tur] = found
        ? { baslik: found.baslik, icerik: found.icerik, aktif: found.aktif ?? true }
        : emptyForm();
    }
    setForms(next);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await websiteAdminApi.list<YasalMetin>('yasal-metinler');
    setLoading(false);
    if (res.success && res.data) {
      setItems(res.data);
      syncForms(res.data);
    } else {
      onMessage(res.error || 'Yasal metinler yüklenemedi', 'error');
    }
  }, [onMessage, syncForms]);

  useEffect(() => { void reload(); }, [reload]);

  const itemForTur = (tur: string) => items.find((m) => m.tur === tur);

  const patchForm = (tur: string, patch: Partial<FormState>) => {
    setForms((prev) => ({ ...prev, [tur]: { ...prev[tur], ...patch } }));
  };

  const saveTur = async (tur: string) => {
    const form = forms[tur];
    if (!form) return;
    if (!form.baslik.trim()) {
      onMessage('Başlık zorunludur', 'error');
      return;
    }
    setSavingTur(tur);
    const existing = itemForTur(tur);
    const payload = {
      tur,
      baslik: form.baslik.trim(),
      icerik: form.icerik,
      aktif: form.aktif,
    };
    const res = existing
      ? await websiteAdminApi.update<YasalMetin>('yasal-metinler', existing.id, payload)
      : await websiteAdminApi.create<YasalMetin>('yasal-metinler', payload);
    setSavingTur(null);
    if (res.success) {
      onMessage(`${YASAL_TURLER.find((t) => t.tur === tur)?.label ?? tur} kaydedildi`);
      await invalidateLandingCache();
      await reload();
    } else {
      onMessage(res.error || 'Kaydedilemedi', 'error');
    }
  };

  const seedMissing = async () => {
    if (!confirm('Eksik yasal metinler resmi içerikle oluşturulsun mu?\n\nMevcut kayıtlar değiştirilmez.')) {
      return;
    }
    setSeeding(true);
    const defaults = buildYasalDefaultsPayload();
    let created = 0;
    for (const spec of YASAL_TURLER) {
      if (itemForTur(spec.tur)) continue;
      const payload = defaults[spec.tur as keyof typeof defaults];
      const res = await websiteAdminApi.create<YasalMetin>('yasal-metinler', {
        tur: spec.tur,
        baslik: payload.baslik,
        icerik: payload.icerik,
        aktif: true,
      });
      if (res.success) created += 1;
    }
    setSeeding(false);
    if (created > 0) {
      onMessage(`${created} yasal metin oluşturuldu`);
      await invalidateLandingCache();
      await reload();
    } else {
      onMessage('Tüm yasal metinler zaten mevcut');
    }
  };

  const upgradePlaceholders = async () => {
    if (!confirm('Örnek / boş metinler resmi içerikle güncellensin mi?\n\nDaha önce düzenlediğiniz metinler korunur.')) {
      return;
    }
    setSeeding(true);
    const defaults = buildYasalDefaultsPayload();
    let upgraded = 0;
    for (const spec of YASAL_TURLER) {
      const existing = itemForTur(spec.tur);
      if (!existing || !isPlaceholderYasalContent(existing.icerik)) continue;
      const payload = defaults[spec.tur as keyof typeof defaults];
      const res = await websiteAdminApi.update<YasalMetin>('yasal-metinler', existing.id, {
        tur: spec.tur,
        baslik: payload.baslik,
        icerik: payload.icerik,
        aktif: true,
      });
      if (res.success) upgraded += 1;
    }
    setSeeding(false);
    if (upgraded > 0) {
      onMessage(`${upgraded} yasal metin resmi içerikle güncellendi`);
      await invalidateLandingCache();
      await reload();
    } else {
      onMessage('Güncellenecek örnek metin bulunamadı');
    }
  };

  const placeholderCount = YASAL_TURLER.filter((s) => {
    const item = itemForTur(s.tur);
    return item && isPlaceholderYasalContent(item.icerik);
  }).length;

  const missingCount = YASAL_TURLER.filter((s) => !itemForTur(s.tur)).length;
  const activeSpec = YASAL_TURLER.find((s) => s.tur === activeTur) ?? YASAL_TURLER[0];
  const activeForm = forms[activeTur] ?? emptyForm();
  const activeItem = itemForTur(activeTur);

  if (loading) {
    return (
      <div className="cms-loading">
        <div className="cms-spinner" />
        <span>Yasal metinler yükleniyor…</span>
      </div>
    );
  }

  return (
    <div className="cms-yasal">
      <header className="cms-dash-hero">
        <div>
          <p className="cms-eyebrow">Yasal</p>
          <h2 className="cms-dash-title">Yasal Metinler</h2>
          <p className="cms-dash-sub">
            Dört yasal sayfa aynı sistemden yayınlanır. İçerik yapılandırılmış JSON olarak saklanır;
            sitede bölümlü resmi şablonla gösterilir.
          </p>
        </div>
        <div className="cms-dash-actions">
          {missingCount > 0 && (
            <button type="button" className="cms-btn cms-btn-ghost" disabled={seeding} onClick={() => void seedMissing()}>
              {seeding ? 'Oluşturuluyor…' : `Eksikleri oluştur (${missingCount})`}
            </button>
          )}
          {placeholderCount > 0 && (
            <button type="button" className="cms-btn cms-btn-ghost" disabled={seeding} onClick={() => void upgradePlaceholders()}>
              {seeding ? 'Güncelleniyor…' : `Örnek metinleri doldur (${placeholderCount})`}
            </button>
          )}
          <Link href={activeSpec.path} target="_blank" rel="noopener noreferrer" className="cms-btn cms-btn-ghost">
            Önizle ↗
          </Link>
        </div>
      </header>

      <div className="cms-yasal-layout">
        <nav className="cms-yasal-tabs" aria-label="Yasal metin türleri">
          {YASAL_TURLER.map((spec) => {
            const exists = Boolean(itemForTur(spec.tur));
            return (
              <button
                key={spec.tur}
                type="button"
                className={`cms-yasal-tab ${activeTur === spec.tur ? 'active' : ''}`}
                onClick={() => setActiveTur(spec.tur)}
              >
                <span>{spec.label}</span>
                <span className={`cms-yasal-tab-badge ${exists ? 'ok' : 'missing'}`}>
                  {exists ? 'Kayıtlı' : 'Eksik'}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="cms-card cms-yasal-editor">
          <div className="cms-yasal-editor-head">
            <h3>{activeSpec.label}</h3>
            {activeItem?.updated_at && (
              <span className="cms-muted">
                Son güncelleme: {new Date(activeItem.updated_at).toLocaleString('tr-TR')}
              </span>
            )}
          </div>

          <label className="cms-field">
            <span>Başlık</span>
            <input
              type="text"
              value={activeForm.baslik}
              onChange={(e) => patchForm(activeTur, { baslik: e.target.value })}
              placeholder={activeSpec.label}
            />
          </label>

          <label className="cms-field">
            <span>İçerik (yapılandırılmış JSON)</span>
            <textarea
              rows={16}
              value={activeForm.icerik}
              onChange={(e) => patchForm(activeTur, { icerik: e.target.value })}
              placeholder='{"v":1,"meta":{...},"sections":[...]}'
              spellCheck={false}
            />
          </label>

          <label className="cms-check">
            <input
              type="checkbox"
              checked={activeForm.aktif}
              onChange={(e) => patchForm(activeTur, { aktif: e.target.checked })}
            />
            <span>Yayında (aktif)</span>
          </label>

          <div className="cms-yasal-actions">
            <button
              type="button"
              className="cms-btn cms-btn-primary"
              disabled={savingTur === activeTur}
              onClick={() => void saveTur(activeTur)}
            >
              {savingTur === activeTur ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
