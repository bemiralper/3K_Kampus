'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/api';
import type { KalemFilter, OgrenciListFilters } from '../lib/ogrenci-list-utils';
import { kalemKey } from '../lib/ogrenci-list-utils';

type FilterOption = { value: string; label: string };
type SinifSeviyesiOption = { id: number; ad: string; kod: string };
type SinifOption = { id: number; ad: string; sinif_seviyesi_id: number | null };
type SubeOption = { id: number; ad: string };
type KalemGrup = {
  tur: string;
  label: string;
  count: number;
  kalemler: { kalem_id: number; kalem_adi: string }[];
};

interface OgrenciFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: OgrenciListFilters;
  onApply: (filters: OgrenciListFilters) => void;
  onClear: () => void;
}

const KALEM_TUR_CLASS: Record<string, string> = {
  grup_dersi: 'ogrenci-filter-category-card--grup',
  ozel_ders: 'ogrenci-filter-category-card--ozel',
  deneme: 'ogrenci-filter-category-card--deneme',
  ek_hizmet: 'ogrenci-filter-category-card--ek',
};

function categoriesFromKalemler(kalemler: KalemFilter[]): Set<string> {
  return new Set(kalemler.map((k) => k.tur));
}

function countActiveFilters(local: OgrenciListFilters): number {
  let n = 0;
  n += local.kalemler?.length || 0;
  n += local.sinif_seviyesi_ids?.length || 0;
  n += local.sinif_ids?.length || 0;
  if (local.sube_id) n += 1;
  if (local.giris_turu) n += 1;
  if (local.cinsiyet) n += 1;
  if (local.kayit_tarihi_bas) n += 1;
  if (local.kayit_tarihi_bit) n += 1;
  if (local.all_years) n += 1;
  return n;
}

export default function OgrenciFilterDrawer({
  open,
  onClose,
  filters,
  onApply,
  onClear,
}: OgrenciFilterDrawerProps) {
  const [local, setLocal] = useState<OgrenciListFilters>(filters);
  const [sinifSeviyeleri, setSinifSeviyeleri] = useState<SinifSeviyesiOption[]>([]);
  const [girisTuru, setGirisTuru] = useState<FilterOption[]>([]);
  const [cinsiyetOpts, setCinsiyetOpts] = useState<FilterOption[]>([]);
  const [kalemGruplari, setKalemGruplari] = useState<KalemGrup[]>([]);
  const [siniflar, setSiniflar] = useState<SinifOption[]>([]);
  const [subeler, setSubeler] = useState<SubeOption[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setLocal(filters);
      setSelectedCategories(categoriesFromKalemler(filters.kalemler || []));
    }
  }, [open, filters]);

  useEffect(() => {
    if (!open) return;
    apiGet<{
      sinif_seviyeleri?: SinifSeviyesiOption[];
      giris_turu?: FilterOption[];
      cinsiyet?: FilterOption[];
      kalem_gruplari?: KalemGrup[];
      siniflar?: SinifOption[];
      subeler?: SubeOption[];
    }>('/ogrenciler/api/filter-options/').then((res) => {
      const data = res.data || res;
      const d = data as {
        sinif_seviyeleri?: SinifSeviyesiOption[];
        giris_turu?: FilterOption[];
        cinsiyet?: FilterOption[];
        kalem_gruplari?: KalemGrup[];
        siniflar?: SinifOption[];
        subeler?: SubeOption[];
      };
      setSinifSeviyeleri(d.sinif_seviyeleri || []);
      setGirisTuru(d.giris_turu || []);
      setCinsiyetOpts(d.cinsiyet || []);
      setKalemGruplari(d.kalem_gruplari || []);
      setSiniflar(d.siniflar || []);
      setSubeler(d.subeler || []);
    });
  }, [open]);

  const selectedSeviyeIds = useMemo(
    () => new Set(local.sinif_seviyesi_ids || []),
    [local.sinif_seviyesi_ids]
  );

  const selectedSinifIds = useMemo(
    () => new Set(local.sinif_ids || []),
    [local.sinif_ids]
  );

  const filteredSiniflar = useMemo(() => {
    const ids = local.sinif_seviyesi_ids || [];
    if (ids.length === 0) return siniflar;
    const idSet = new Set(ids);
    return siniflar.filter((s) => s.sinif_seviyesi_id != null && idSet.has(s.sinif_seviyesi_id));
  }, [siniflar, local.sinif_seviyesi_ids]);

  const siniflarBySeviye = useMemo(() => {
    const map = new Map<number, SinifOption[]>();
    for (const sinif of filteredSiniflar) {
      if (sinif.sinif_seviyesi_id == null) continue;
      const list = map.get(sinif.sinif_seviyesi_id) || [];
      list.push(sinif);
      map.set(sinif.sinif_seviyesi_id, list);
    }
    return map;
  }, [filteredSiniflar]);

  const selectedKalemKeys = useMemo(
    () => new Set((local.kalemler || []).map(kalemKey)),
    [local.kalemler]
  );

  const activeFilterCount = useMemo(() => countActiveFilters(local), [local]);

  if (!open) return null;

  const update = (patch: Partial<OgrenciListFilters>) => {
    setLocal((prev) => ({ ...prev, ...patch }));
  };

  const toggleCategory = (tur: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(tur)) {
        next.delete(tur);
        update({
          kalemler: (local.kalemler || []).filter((k) => k.tur !== tur),
        });
      } else {
        next.add(tur);
      }
      return next;
    });
  };

  const toggleKalem = (tur: string, id: number) => {
    const current = local.kalemler || [];
    const key = kalemKey({ tur, id });
    const exists = selectedKalemKeys.has(key);
    const kalemler = exists
      ? current.filter((k) => kalemKey(k) !== key)
      : [...current, { tur, id }];
    update({ kalemler });
    if (!exists) {
      setSelectedCategories((prev) => new Set(prev).add(tur));
    }
  };

  const toggleSeviye = (id: number) => {
    const current = local.sinif_seviyesi_ids || [];
    const exists = selectedSeviyeIds.has(id);
    const sinifSeviyesiIds = exists
      ? current.filter((x) => x !== id)
      : [...current, id];

    let sinifIds = local.sinif_ids || [];
    if (exists) {
      sinifIds = sinifIds.filter(
        (sid) => siniflar.find((s) => s.id === sid)?.sinif_seviyesi_id !== id
      );
    }

    update({ sinif_seviyesi_ids: sinifSeviyesiIds, sinif_ids: sinifIds });
  };

  const toggleSinif = (id: number) => {
    const current = local.sinif_ids || [];
    const exists = selectedSinifIds.has(id);
    const sinifIds = exists ? current.filter((x) => x !== id) : [...current, id];
    update({ sinif_ids: sinifIds });
  };

  const visibleGroups = kalemGruplari.filter((g) => selectedCategories.has(g.tur));

  const seviyelerForSinifList =
    (local.sinif_seviyesi_ids || []).length > 0
      ? sinifSeviyeleri.filter((s) => selectedSeviyeIds.has(s.id))
      : sinifSeviyeleri;

  return (
    <div className="ogrenci-drawer-overlay" onClick={onClose}>
      <div
        className="ogrenci-filter-drawer ogrenci-filter-drawer--wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="filter-drawer-title"
      >
        <div className="ogrenci-filter-drawer-header">
          <div>
            <h3 id="filter-drawer-title">Gelişmiş Filtreler</h3>
            <p className="ogrenci-filter-drawer-subtitle">
              Eğitim kalemleri, sınıf ve kayıt kriterlerini birlikte daraltın
            </p>
          </div>
          <button type="button" className="ogrenci-drawer-close" onClick={onClose} aria-label="Kapat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ogrenci-filter-drawer-body">
          <div className="ogrenci-filter-summary-bar">
            <div className="ogrenci-filter-summary-stat">
              <span className="ogrenci-filter-summary-label">Aktif kriter</span>
              <strong>{activeFilterCount}</strong>
            </div>
            <div className="ogrenci-filter-summary-stat">
              <span className="ogrenci-filter-summary-label">Paket</span>
              <strong>{local.kalemler?.length || 0}</strong>
            </div>
            <div className="ogrenci-filter-summary-stat">
              <span className="ogrenci-filter-summary-label">Sınıf</span>
              <strong>{local.sinif_ids?.length || 0}</strong>
            </div>
            <div className="ogrenci-filter-summary-stat">
              <span className="ogrenci-filter-summary-label">Seviye</span>
              <strong>{local.sinif_seviyesi_ids?.length || 0}</strong>
            </div>
          </div>

          <div className="ogrenci-filter-layout">
            <section className="ogrenci-filter-panel">
              <div className="ogrenci-filter-panel-header">
                <h4 className="ogrenci-filter-subsection-title">Eğitim Kalemleri</h4>
                <p className="ogrenci-filter-hint">Kategori seçin, ardından paketleri işaretleyin.</p>
              </div>

              <div className="ogrenci-filter-category-grid">
                {kalemGruplari.map((grup) => (
                  <button
                    key={grup.tur}
                    type="button"
                    className={`ogrenci-filter-category-card ${KALEM_TUR_CLASS[grup.tur] || ''}${selectedCategories.has(grup.tur) ? ' active' : ''}${grup.count === 0 ? ' disabled' : ''}`}
                    disabled={grup.count === 0}
                    onClick={() => toggleCategory(grup.tur)}
                  >
                    <span className="ogrenci-filter-category-label">{grup.label}</span>
                    <span className="ogrenci-filter-category-count">{grup.count} paket</span>
                  </button>
                ))}
              </div>

              {visibleGroups.length > 0 ? (
                <div className="ogrenci-filter-kalem-groups">
                  {visibleGroups.map((grup) => (
                    <div key={grup.tur} className="ogrenci-filter-kalem-group">
                      <div className="ogrenci-filter-kalem-group-title">{grup.label}</div>
                      <div className="ogrenci-filter-select-chip-grid ogrenci-filter-select-chip-grid--scroll">
                        {grup.kalemler.map((kalem) => {
                          const key = kalemKey({ tur: grup.tur, id: kalem.kalem_id });
                          const selected = selectedKalemKeys.has(key);
                          return (
                            <label
                              key={key}
                              className={`ogrenci-filter-select-chip${selected ? ' selected' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleKalem(grup.tur, kalem.kalem_id)}
                              />
                              <span>{kalem.kalem_adi}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ogrenci-filter-empty-hint">
                  Paket filtrelemek için yukarıdan bir kategori seçin.
                </p>
              )}
            </section>

            <section className="ogrenci-filter-panel">
              <div className="ogrenci-filter-panel-header">
                <h4 className="ogrenci-filter-subsection-title">Sınıf &amp; Kayıt</h4>
                <p className="ogrenci-filter-hint">Birden fazla sınıf seviyesi ve sınıf seçebilirsiniz.</p>
              </div>

              <div className="ogrenci-filter-block">
                <div className="ogrenci-filter-block-title">Sınıf Seviyesi</div>
                <div className="ogrenci-filter-select-chip-grid">
                  {sinifSeviyeleri.map((seviye) => (
                    <label
                      key={seviye.id}
                      className={`ogrenci-filter-select-chip${selectedSeviyeIds.has(seviye.id) ? ' selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSeviyeIds.has(seviye.id)}
                        onChange={() => toggleSeviye(seviye.id)}
                      />
                      <span>{seviye.ad}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="ogrenci-filter-block">
                <div className="ogrenci-filter-block-title">Sınıf</div>
                {filteredSiniflar.length === 0 ? (
                  <p className="ogrenci-filter-empty-hint">Bu kriterlere uygun sınıf yok.</p>
                ) : (
                  seviyelerForSinifList.map((seviye) => {
                    const list = siniflarBySeviye.get(seviye.id) || [];
                    if (list.length === 0) return null;
                    return (
                      <div key={seviye.id} className="ogrenci-filter-sinif-group">
                        <div className="ogrenci-filter-sinif-group-label">{seviye.ad}</div>
                        <div className="ogrenci-filter-select-chip-grid">
                          {list.map((sinif) => (
                            <label
                              key={sinif.id}
                              className={`ogrenci-filter-select-chip${selectedSinifIds.has(sinif.id) ? ' selected' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedSinifIds.has(sinif.id)}
                                onChange={() => toggleSinif(sinif.id)}
                              />
                              <span>{sinif.ad}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="ogrenci-filter-block">
                <div className="ogrenci-filter-block-title">Şube</div>
                <div className="ogrenci-filter-select-wrap">
                  <select
                    className="ogrenci-filter-select"
                    value={local.sube_id || ''}
                    onChange={(e) =>
                      update({
                        sube_id: e.target.value ? parseInt(e.target.value, 10) : '',
                      })
                    }
                  >
                    <option value="">Varsayılan (üst bar)</option>
                    {subeler.map((s) => (
                      <option key={s.id} value={s.id}>{s.ad}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          </div>

          <section className="ogrenci-filter-panel ogrenci-filter-panel--full">
            <div className="ogrenci-filter-panel-header">
              <h4 className="ogrenci-filter-subsection-title">Demografik &amp; Tarih</h4>
            </div>

            <div className="ogrenci-filter-demographic-layout">
              <div className="ogrenci-filter-block">
                <div className="ogrenci-filter-block-title">Giriş Türü</div>
                <div className="ogrenci-filter-option-row">
                  <button
                    type="button"
                    className={`ogrenci-filter-option-btn${!local.giris_turu ? ' active' : ''}`}
                    onClick={() => update({ giris_turu: '' })}
                  >
                    Tümü
                  </button>
                  {girisTuru.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      className={`ogrenci-filter-option-btn${local.giris_turu === g.value ? ' active' : ''}`}
                      onClick={() => update({ giris_turu: g.value })}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ogrenci-filter-block">
                <div className="ogrenci-filter-block-title">Cinsiyet</div>
                <div className="ogrenci-filter-option-row">
                  <button
                    type="button"
                    className={`ogrenci-filter-option-btn${!local.cinsiyet ? ' active' : ''}`}
                    onClick={() => update({ cinsiyet: '' })}
                  >
                    Tümü
                  </button>
                  {cinsiyetOpts.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`ogrenci-filter-option-btn${local.cinsiyet === c.value ? ' active' : ''}`}
                      onClick={() => update({ cinsiyet: c.value })}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ogrenci-filter-date-grid">
                <div className="ogrenci-filter-block">
                  <div className="ogrenci-filter-block-title">Kayıt Başlangıç</div>
                  <input
                    type="date"
                    className="ogrenci-filter-date-input"
                    value={local.kayit_tarihi_bas || ''}
                    onChange={(e) => update({ kayit_tarihi_bas: e.target.value })}
                  />
                </div>
                <div className="ogrenci-filter-block">
                  <div className="ogrenci-filter-block-title">Kayıt Bitiş</div>
                  <input
                    type="date"
                    className="ogrenci-filter-date-input"
                    value={local.kayit_tarihi_bit || ''}
                    onChange={(e) => update({ kayit_tarihi_bit: e.target.value })}
                  />
                </div>
              </div>

              <label className="ogrenci-filter-toggle-card">
                <input
                  type="checkbox"
                  checked={local.all_years || false}
                  onChange={(e) => update({ all_years: e.target.checked })}
                />
                <span className="ogrenci-filter-toggle-content">
                  <strong>Tüm eğitim yıllarında ara</strong>
                  <span>Aktif yıl dışındaki kayıtları da listeye dahil eder</span>
                </span>
              </label>
            </div>
          </section>
        </div>

        <div className="ogrenci-filter-drawer-footer">
          <button type="button" className="btn-modern btn-secondary" onClick={onClear}>
            Temizle
          </button>
          <button
            type="button"
            className="btn-modern btn-primary ogrenci-filter-apply-btn"
            onClick={() => {
              onApply({ ...local, page: 1 });
              onClose();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filtreleri Uygula
            {activeFilterCount > 0 && (
              <span className="ogrenci-filter-apply-badge">{activeFilterCount}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
