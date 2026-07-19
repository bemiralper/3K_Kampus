'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/api';
import type { KalemFilter, OgrenciListFilters } from '../lib/ogrenci-list-utils';
import { KALEM_GRUP_LABELS, kalemKey } from '../lib/ogrenci-list-utils';
import FilterSearchableList, { type FilterListItem } from './FilterSearchableList';

type FilterOption = { value: string; label: string };
type SinifSeviyesiOption = { id: number; ad: string; kod: string };
type SinifOption = { id: number; ad: string; sinif_seviyesi_id: number | null };
type OkulOption = { id: number; ad: string; okul_turu?: string };
type AlanOption = { id: number; ad: string; kod?: string };
type KalemGrup = {
  tur: string;
  label: string;
  count: number;
  kalemler: { kalem_id: number; kalem_adi: string }[];
};

type FilterSection = 'paketler' | 'sinif' | 'okul' | 'alan' | 'rehber' | 'kayit';
type RehberOption = { id: number; ad: string };

interface OgrenciFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: OgrenciListFilters;
  onApply: (filters: OgrenciListFilters) => void;
  onClear: () => void;
}

const SECTIONS: { id: FilterSection; label: string; hint: string }[] = [
  { id: 'paketler', label: 'Eğitim Paketleri', hint: 'Grup, özel ders, yayın…' },
  { id: 'sinif', label: 'Sınıf', hint: 'Seviye ve şube sınıfları' },
  { id: 'alan', label: 'Alan', hint: 'Sayısal, sözel, eşit ağırlık…' },
  { id: 'okul', label: 'Okul', hint: 'Geldiği / mezun olduğu okul' },
  { id: 'rehber', label: 'Rehber Öğretmen', hint: 'Koç / rehber ataması' },
  { id: 'kayit', label: 'Kayıt & Demografi', hint: 'Tür, cinsiyet, tarih' },
];

const KALEM_TUR_CLASS: Record<string, string> = {
  grup_dersi: 'ogrenci-filter-cat--grup',
  ozel_ders: 'ogrenci-filter-cat--ozel',
  premium: 'ogrenci-filter-cat--premium',
  yayin: 'ogrenci-filter-cat--yayin',
  deneme: 'ogrenci-filter-cat--deneme',
  ek_hizmet: 'ogrenci-filter-cat--ek',
};

function categoriesFromKalemler(kalemler: KalemFilter[]): Set<string> {
  return new Set(kalemler.map((k) => k.tur));
}

function countActiveFilters(local: OgrenciListFilters): number {
  let n = 0;
  n += local.kalemler?.length || 0;
  n += local.sinif_seviyesi_ids?.length || 0;
  n += local.sinif_ids?.length || 0;
  n += local.school_ids?.length || 0;
  n += local.alan_ids?.length || 0;
  n += local.coach_ids?.length || 0;
  if (local.kayit_turu) n += 1;
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
  const [section, setSection] = useState<FilterSection>('paketler');
  const [sinifSeviyeleri, setSinifSeviyeleri] = useState<SinifSeviyesiOption[]>([]);
  const [girisTuru, setGirisTuru] = useState<FilterOption[]>([]);
  const [kayitTurleri, setKayitTurleri] = useState<FilterOption[]>([]);
  const [cinsiyetOpts, setCinsiyetOpts] = useState<FilterOption[]>([]);
  const [kalemGruplari, setKalemGruplari] = useState<KalemGrup[]>([]);
  const [siniflar, setSiniflar] = useState<SinifOption[]>([]);
  const [okullar, setOkullar] = useState<OkulOption[]>([]);
  const [alanlar, setAlanlar] = useState<AlanOption[]>([]);
  const [rehberler, setRehberler] = useState<RehberOption[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [optionsLoading, setOptionsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLocal(filters);
      setSelectedCategories(categoriesFromKalemler(filters.kalemler || []));
      setSection('paketler');
    }
  }, [open, filters]);

  useEffect(() => {
    if (!open) return;
    setOptionsLoading(true);
    apiGet<{
      sinif_seviyeleri?: SinifSeviyesiOption[];
      giris_turu?: FilterOption[];
      kayit_turleri?: FilterOption[];
      cinsiyet?: FilterOption[];
      kalem_gruplari?: KalemGrup[];
      siniflar?: SinifOption[];
      okullar?: OkulOption[];
      alanlar?: AlanOption[];
      rehberler?: RehberOption[];
    }>('/ogrenciler/api/filter-options/')
      .then((res) => {
        const data = (res.data || res) as {
          sinif_seviyeleri?: SinifSeviyesiOption[];
          giris_turu?: FilterOption[];
          kayit_turleri?: FilterOption[];
          cinsiyet?: FilterOption[];
          kalem_gruplari?: KalemGrup[];
          siniflar?: SinifOption[];
          okullar?: OkulOption[];
          alanlar?: AlanOption[];
          rehberler?: RehberOption[];
        };
        setSinifSeviyeleri(data.sinif_seviyeleri || []);
        setGirisTuru(data.giris_turu || []);
        setKayitTurleri(data.kayit_turleri || []);
        setCinsiyetOpts(data.cinsiyet || []);
        setKalemGruplari(data.kalem_gruplari || []);
        setSiniflar(data.siniflar || []);
        setOkullar(data.okullar || []);
        setAlanlar(data.alanlar || []);
        setRehberler(data.rehberler || []);
      })
      .finally(() => setOptionsLoading(false));
  }, [open]);

  const selectedSeviyeIds = useMemo(
    () => new Set(local.sinif_seviyesi_ids || []),
    [local.sinif_seviyesi_ids],
  );
  const selectedSinifIds = useMemo(
    () => new Set(local.sinif_ids || []),
    [local.sinif_ids],
  );
  const selectedSchoolIds = useMemo(
    () => new Set(local.school_ids || []),
    [local.school_ids],
  );
  const selectedAlanIds = useMemo(
    () => new Set(local.alan_ids || []),
    [local.alan_ids],
  );
  const selectedCoachIds = useMemo(
    () => new Set(local.coach_ids || []),
    [local.coach_ids],
  );
  const selectedKalemKeys = useMemo(
    () => new Set((local.kalemler || []).map(kalemKey)),
    [local.kalemler],
  );

  const activeFilterCount = useMemo(() => countActiveFilters(local), [local]);

  const sectionCounts = useMemo(
    () => ({
      paketler: local.kalemler?.length || 0,
      sinif: (local.sinif_seviyesi_ids?.length || 0) + (local.sinif_ids?.length || 0),
      okul: local.school_ids?.length || 0,
      alan: local.alan_ids?.length || 0,
      rehber: local.coach_ids?.length || 0,
      kayit:
        (local.kayit_turu ? 1 : 0) +
        (local.giris_turu ? 1 : 0) +
        (local.cinsiyet ? 1 : 0) +
        (local.kayit_tarihi_bas ? 1 : 0) +
        (local.kayit_tarihi_bit ? 1 : 0) +
        (local.all_years ? 1 : 0),
    }),
    [local],
  );

  const paketItems: FilterListItem[] = useMemo(() => {
    const groups =
      selectedCategories.size > 0
        ? kalemGruplari.filter((g) => selectedCategories.has(g.tur))
        : kalemGruplari;
    return groups.flatMap((grup) =>
      grup.kalemler.map((kalem) => ({
        id: kalemKey({ tur: grup.tur, id: kalem.kalem_id }),
        label: kalem.kalem_adi,
        group: grup.label,
      })),
    );
  }, [kalemGruplari, selectedCategories]);

  const seviyeItems: FilterListItem[] = useMemo(
    () => sinifSeviyeleri.map((s) => ({ id: s.id, label: s.ad, meta: s.kod || undefined })),
    [sinifSeviyeleri],
  );

  const sinifItems: FilterListItem[] = useMemo(() => {
    const ids = local.sinif_seviyesi_ids || [];
    const idSet = new Set(ids);
    const list =
      ids.length === 0
        ? siniflar
        : siniflar.filter((s) => s.sinif_seviyesi_id != null && idSet.has(s.sinif_seviyesi_id));
    return list.map((s) => {
      const seviyeAd =
        sinifSeviyeleri.find((sv) => sv.id === s.sinif_seviyesi_id)?.ad || 'Diğer';
      return { id: s.id, label: s.ad, group: seviyeAd };
    });
  }, [siniflar, local.sinif_seviyesi_ids, sinifSeviyeleri]);

  const okulItems: FilterListItem[] = useMemo(
    () =>
      okullar.map((o) => ({
        id: o.id,
        label: o.ad,
        meta: o.okul_turu || undefined,
      })),
    [okullar],
  );

  const alanItems: FilterListItem[] = useMemo(
    () =>
      alanlar.map((a) => ({
        id: a.id,
        label: a.ad,
        meta: a.kod || undefined,
      })),
    [alanlar],
  );

  const rehberItems: FilterListItem[] = useMemo(
    () => rehberler.map((r) => ({ id: r.id, label: r.ad })),
    [rehberler],
  );

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; section: FilterSection }[] = [];

    for (const spec of local.kalemler || []) {
      const turLabel = KALEM_GRUP_LABELS[spec.tur] || spec.tur;
      const kalemAdi =
        kalemGruplari
          .flatMap((g) =>
            g.kalemler.map((k) => ({ tur: g.tur, id: k.kalem_id, ad: k.kalem_adi })),
          )
          .find((k) => k.tur === spec.tur && k.id === spec.id)?.ad || String(spec.id);
      chips.push({
        key: `kalem:${kalemKey(spec)}`,
        label: `${turLabel}: ${kalemAdi}`,
        section: 'paketler',
      });
    }

    for (const seviyeId of local.sinif_seviyesi_ids || []) {
      const ad = sinifSeviyeleri.find((s) => s.id === seviyeId)?.ad || String(seviyeId);
      chips.push({ key: `seviye:${seviyeId}`, label: `Seviye: ${ad}`, section: 'sinif' });
    }

    for (const sinifId of local.sinif_ids || []) {
      const ad = siniflar.find((s) => s.id === sinifId)?.ad || String(sinifId);
      chips.push({ key: `sinif:${sinifId}`, label: `Sınıf: ${ad}`, section: 'sinif' });
    }

    for (const schoolId of local.school_ids || []) {
      const ad = okullar.find((o) => o.id === schoolId)?.ad || String(schoolId);
      chips.push({ key: `school:${schoolId}`, label: `Okul: ${ad}`, section: 'okul' });
    }

    for (const alanId of local.alan_ids || []) {
      const ad = alanlar.find((a) => a.id === alanId)?.ad || String(alanId);
      chips.push({ key: `alan:${alanId}`, label: `Alan: ${ad}`, section: 'alan' });
    }

    for (const coachId of local.coach_ids || []) {
      const ad = rehberler.find((r) => r.id === coachId)?.ad || String(coachId);
      chips.push({ key: `coach:${coachId}`, label: `Rehber: ${ad}`, section: 'rehber' });
    }

    if (local.kayit_turu) {
      const label =
        kayitTurleri.find((k) => k.value === local.kayit_turu)?.label || local.kayit_turu;
      chips.push({ key: 'kayit_turu', label: `Kayıt: ${label}`, section: 'kayit' });
    }
    if (local.giris_turu) {
      const label =
        girisTuru.find((g) => g.value === local.giris_turu)?.label || local.giris_turu;
      chips.push({ key: 'giris_turu', label: `Giriş: ${label}`, section: 'kayit' });
    }
    if (local.cinsiyet) {
      const label =
        cinsiyetOpts.find((c) => c.value === local.cinsiyet)?.label || local.cinsiyet;
      chips.push({ key: 'cinsiyet', label: `Cinsiyet: ${label}`, section: 'kayit' });
    }
    if (local.kayit_tarihi_bas || local.kayit_tarihi_bit) {
      chips.push({
        key: 'kayit_tarihi',
        label: `Tarih: ${local.kayit_tarihi_bas || '…'} – ${local.kayit_tarihi_bit || '…'}`,
        section: 'kayit',
      });
    }
    if (local.all_years) {
      chips.push({ key: 'all_years', label: 'Tüm yıllar', section: 'kayit' });
    }

    return chips;
  }, [
    local,
    kalemGruplari,
    sinifSeviyeleri,
    siniflar,
    okullar,
    alanlar,
    rehberler,
    kayitTurleri,
    girisTuru,
    cinsiyetOpts,
  ]);

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

  const toggleKalemKey = (key: string | number) => {
    const token = String(key);
    const [tur, idRaw] = token.split(':');
    const id = parseInt(idRaw, 10);
    if (!tur || !Number.isFinite(id)) return;
    const current = local.kalemler || [];
    const exists = selectedKalemKeys.has(token);
    const kalemler = exists
      ? current.filter((k) => kalemKey(k) !== token)
      : [...current, { tur, id }];
    update({ kalemler });
    if (!exists) {
      setSelectedCategories((prev) => new Set(prev).add(tur));
    }
  };

  const selectKalemKeys = (keys: Array<string | number>) => {
    const current = [...(local.kalemler || [])];
    const seen = new Set(current.map(kalemKey));
    const cats = new Set(selectedCategories);
    for (const key of keys) {
      const token = String(key);
      if (seen.has(token)) continue;
      const [tur, idRaw] = token.split(':');
      const id = parseInt(idRaw, 10);
      if (!tur || !Number.isFinite(id)) continue;
      current.push({ tur, id });
      seen.add(token);
      cats.add(tur);
    }
    setSelectedCategories(cats);
    update({ kalemler: current });
  };

  const clearKalemKeys = (keys: Array<string | number>) => {
    const remove = new Set(keys.map(String));
    update({
      kalemler: (local.kalemler || []).filter((k) => !remove.has(kalemKey(k))),
    });
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
        (sid) => siniflar.find((s) => s.id === sid)?.sinif_seviyesi_id !== id,
      );
    }
    update({ sinif_seviyesi_ids: sinifSeviyesiIds, sinif_ids: sinifIds });
  };

  const toggleSinif = (id: number) => {
    const current = local.sinif_ids || [];
    const exists = selectedSinifIds.has(id);
    update({
      sinif_ids: exists ? current.filter((x) => x !== id) : [...current, id],
    });
  };

  const toggleSchool = (id: number) => {
    const current = local.school_ids || [];
    const exists = selectedSchoolIds.has(id);
    update({
      school_ids: exists ? current.filter((x) => x !== id) : [...current, id],
    });
  };

  const toggleAlan = (id: number) => {
    const current = local.alan_ids || [];
    const exists = selectedAlanIds.has(id);
    update({
      alan_ids: exists ? current.filter((x) => x !== id) : [...current, id],
    });
  };

  const toggleCoach = (id: number) => {
    const current = local.coach_ids || [];
    const exists = selectedCoachIds.has(id);
    update({
      coach_ids: exists ? current.filter((x) => x !== id) : [...current, id],
    });
  };

  const removeChip = (key: string) => {
    if (key.startsWith('kalem:')) {
      const token = key.slice('kalem:'.length);
      update({
        kalemler: (local.kalemler || []).filter((k) => kalemKey(k) !== token),
      });
      return;
    }
    if (key.startsWith('seviye:')) {
      const id = parseInt(key.slice('seviye:'.length), 10);
      toggleSeviye(id);
      return;
    }
    if (key.startsWith('sinif:')) {
      const id = parseInt(key.slice('sinif:'.length), 10);
      toggleSinif(id);
      return;
    }
    if (key.startsWith('school:')) {
      const id = parseInt(key.slice('school:'.length), 10);
      toggleSchool(id);
      return;
    }
    if (key.startsWith('alan:')) {
      const id = parseInt(key.slice('alan:'.length), 10);
      toggleAlan(id);
      return;
    }
    if (key.startsWith('coach:')) {
      const id = parseInt(key.slice('coach:'.length), 10);
      toggleCoach(id);
      return;
    }
    if (key === 'kayit_turu') update({ kayit_turu: '' });
    else if (key === 'giris_turu') update({ giris_turu: '' });
    else if (key === 'cinsiyet') update({ cinsiyet: '' });
    else if (key === 'kayit_tarihi') update({ kayit_tarihi_bas: '', kayit_tarihi_bit: '' });
    else if (key === 'all_years') update({ all_years: false });
  };

  const selectIdsAsNumbers = (
    ids: Array<string | number>,
    current: number[],
    setter: (next: number[]) => void,
  ) => {
    const next = new Set(current);
    ids.forEach((id) => next.add(Number(id)));
    setter(Array.from(next));
  };

  const clearIdsAsNumbers = (
    ids: Array<string | number>,
    current: number[],
    setter: (next: number[]) => void,
  ) => {
    const remove = new Set(ids.map(Number));
    setter(current.filter((id) => !remove.has(id)));
  };

  return (
    <div className="ogrenci-drawer-overlay" onClick={onClose}>
      <div
        className="ogrenci-filter-drawer ogrenci-filter-drawer--modern"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="filter-drawer-title"
      >
        <div className="ogrenci-filter-drawer-header">
          <div>
            <h3 id="filter-drawer-title">Gelişmiş Filtreler</h3>
            <p className="ogrenci-filter-drawer-subtitle">
              Bölüm seçin, arayın ve birden fazla kriteri birlikte uygulayın
            </p>
          </div>
          <button type="button" className="ogrenci-drawer-close" onClick={onClose} aria-label="Kapat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ogrenci-filter-chip-strip">
          {activeChips.length === 0 ? (
            <span className="ogrenci-filter-chip-strip-empty">Henüz filtre seçilmedi</span>
          ) : (
            activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="ogrenci-filter-active-chip"
                onClick={() => {
                  setSection(chip.section);
                  removeChip(chip.key);
                }}
                title="Kaldır"
              >
                <span>{chip.label}</span>
                <span className="ogrenci-filter-active-chip-x" aria-hidden>
                  ×
                </span>
              </button>
            ))
          )}
        </div>

        <div className="ogrenci-filter-shell">
          <nav className="ogrenci-filter-nav" aria-label="Filtre bölümleri">
            {SECTIONS.map((s) => {
              const count = sectionCounts[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`ogrenci-filter-nav-item${section === s.id ? ' active' : ''}`}
                  onClick={() => setSection(s.id)}
                >
                  <span className="ogrenci-filter-nav-text">
                    <strong>{s.label}</strong>
                    <span>{s.hint}</span>
                  </span>
                  {count > 0 ? <span className="ogrenci-filter-nav-badge">{count}</span> : null}
                </button>
              );
            })}
          </nav>

          <div className="ogrenci-filter-pane">
            {optionsLoading ? (
              <div className="ogrenci-filter-loading">Filtre seçenekleri yükleniyor…</div>
            ) : null}

            {section === 'paketler' && (
              <div className="ogrenci-filter-pane-inner">
                <div className="ogrenci-filter-pane-head">
                  <h4>Eğitim Paketleri</h4>
                  <p>Önce kategori seçin (isteğe bağlı), sonra paketleri işaretleyin.</p>
                </div>

                <div className="ogrenci-filter-cat-row">
                  {kalemGruplari.map((grup) => (
                    <button
                      key={grup.tur}
                      type="button"
                      className={`ogrenci-filter-cat-pill ${KALEM_TUR_CLASS[grup.tur] || ''}${selectedCategories.has(grup.tur) ? ' active' : ''}${grup.count === 0 ? ' disabled' : ''}`}
                      disabled={grup.count === 0}
                      onClick={() => toggleCategory(grup.tur)}
                    >
                      {grup.label}
                      <em>{grup.count}</em>
                    </button>
                  ))}
                </div>

                {selectedCategories.size === 0 ? (
                  <p className="ogrenci-filter-soft-hint">
                    Tüm kategoriler listeleniyor. Daraltmak için yukarıdan kategori seçin.
                  </p>
                ) : null}

                <FilterSearchableList
                  items={paketItems}
                  selectedIds={selectedKalemKeys}
                  onToggle={toggleKalemKey}
                  searchPlaceholder="Paket adı ile ara…"
                  emptyLabel="Tanımlı eğitim paketi yok."
                  maxHeight={360}
                  onSelectVisible={selectKalemKeys}
                  onClearVisible={clearKalemKeys}
                />
              </div>
            )}

            {section === 'sinif' && (
              <div className="ogrenci-filter-pane-inner">
                <div className="ogrenci-filter-pane-head">
                  <h4>Sınıf Seviyesi &amp; Sınıf</h4>
                  <p>Seviye seçerseniz sınıf listesi o seviyelere daralır.</p>
                </div>

                <div className="ogrenci-filter-split">
                  <div>
                    <div className="ogrenci-filter-block-title">Sınıf Seviyesi</div>
                    <FilterSearchableList
                      items={seviyeItems}
                      selectedIds={selectedSeviyeIds}
                      onToggle={(id) => toggleSeviye(Number(id))}
                      searchPlaceholder="Seviye ara…"
                      emptyLabel="Sınıf seviyesi tanımlı değil."
                      maxHeight={280}
                      onSelectVisible={(ids) =>
                        selectIdsAsNumbers(ids, local.sinif_seviyesi_ids || [], (next) =>
                          update({ sinif_seviyesi_ids: next }),
                        )
                      }
                      onClearVisible={(ids) => {
                        const remove = new Set(ids.map(Number));
                        const nextSeviye = (local.sinif_seviyesi_ids || []).filter(
                          (id) => !remove.has(id),
                        );
                        const nextSinif = (local.sinif_ids || []).filter((sid) => {
                          const seviyeId = siniflar.find((s) => s.id === sid)?.sinif_seviyesi_id;
                          return seviyeId == null || !remove.has(seviyeId);
                        });
                        update({
                          sinif_seviyesi_ids: nextSeviye,
                          sinif_ids: nextSinif,
                        });
                      }}
                    />
                  </div>
                  <div>
                    <div className="ogrenci-filter-block-title">Sınıf</div>
                    <FilterSearchableList
                      items={sinifItems}
                      selectedIds={selectedSinifIds}
                      onToggle={(id) => toggleSinif(Number(id))}
                      searchPlaceholder="Sınıf ara…"
                      emptyLabel="Bu kriterlere uygun sınıf yok."
                      maxHeight={280}
                      onSelectVisible={(ids) =>
                        selectIdsAsNumbers(ids, local.sinif_ids || [], (next) =>
                          update({ sinif_ids: next }),
                        )
                      }
                      onClearVisible={(ids) =>
                        clearIdsAsNumbers(ids, local.sinif_ids || [], (next) =>
                          update({ sinif_ids: next }),
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {section === 'alan' && (
              <div className="ogrenci-filter-pane-inner">
                <div className="ogrenci-filter-pane-head">
                  <h4>Alan</h4>
                  <p>11–12 ve mezun kayıtlarındaki alan (sayısal, sözel…). Birden fazla seçebilirsiniz.</p>
                </div>
                <FilterSearchableList
                  items={alanItems}
                  selectedIds={selectedAlanIds}
                  onToggle={(id) => toggleAlan(Number(id))}
                  searchPlaceholder="Alan ara…"
                  emptyLabel="Bu şubede tanımlı alan yok."
                  maxHeight={420}
                  onSelectVisible={(ids) =>
                    selectIdsAsNumbers(ids, local.alan_ids || [], (next) =>
                      update({ alan_ids: next }),
                    )
                  }
                  onClearVisible={(ids) =>
                    clearIdsAsNumbers(ids, local.alan_ids || [], (next) =>
                      update({ alan_ids: next }),
                    )
                  }
                />
              </div>
            )}

            {section === 'okul' && (
              <div className="ogrenci-filter-pane-inner">
                <div className="ogrenci-filter-pane-head">
                  <h4>Geldiği / Mezun Olduğu Okul</h4>
                  <p>Okul adı veya türüne göre arayın; birden fazla seçebilirsiniz.</p>
                </div>
                <FilterSearchableList
                  items={okulItems}
                  selectedIds={selectedSchoolIds}
                  onToggle={(id) => toggleSchool(Number(id))}
                  searchPlaceholder="Okul adı veya türü ile ara…"
                  emptyLabel="Bu şubede tanımlı okul yok. Kurum modülünden okul ekleyebilirsiniz."
                  maxHeight={420}
                  onSelectVisible={(ids) =>
                    selectIdsAsNumbers(ids, local.school_ids || [], (next) =>
                      update({ school_ids: next }),
                    )
                  }
                  onClearVisible={(ids) =>
                    clearIdsAsNumbers(ids, local.school_ids || [], (next) =>
                      update({ school_ids: next }),
                    )
                  }
                />
              </div>
            )}

            {section === 'rehber' && (
              <div className="ogrenci-filter-pane-inner">
                <div className="ogrenci-filter-pane-head">
                  <h4>Rehber Öğretmen</h4>
                  <p>Seçilen rehber / koça atanmış öğrencileri listeleyin.</p>
                </div>
                <FilterSearchableList
                  items={rehberItems}
                  selectedIds={selectedCoachIds}
                  onToggle={(id) => toggleCoach(Number(id))}
                  searchPlaceholder="Rehber öğretmen adı ile ara…"
                  emptyLabel="Bu şubede aktif rehber öğretmen bulunamadı."
                  maxHeight={420}
                  onSelectVisible={(ids) =>
                    selectIdsAsNumbers(ids, local.coach_ids || [], (next) =>
                      update({ coach_ids: next }),
                    )
                  }
                  onClearVisible={(ids) =>
                    clearIdsAsNumbers(ids, local.coach_ids || [], (next) =>
                      update({ coach_ids: next }),
                    )
                  }
                />
              </div>
            )}

            {section === 'kayit' && (
              <div className="ogrenci-filter-pane-inner">
                <div className="ogrenci-filter-pane-head">
                  <h4>Kayıt &amp; Demografi</h4>
                  <p>Kayıt türü, giriş, cinsiyet ve tarih aralığı.</p>
                </div>

                <div className="ogrenci-filter-demo-grid">
                  <div className="ogrenci-filter-block">
                    <div className="ogrenci-filter-block-title">Kayıt Türü</div>
                    <div className="ogrenci-filter-option-row">
                      <button
                        type="button"
                        className={`ogrenci-filter-option-btn${!local.kayit_turu ? ' active' : ''}`}
                        onClick={() => update({ kayit_turu: '' })}
                      >
                        Tümü
                      </button>
                      {kayitTurleri.map((k) => (
                        <button
                          key={k.value}
                          type="button"
                          className={`ogrenci-filter-option-btn${local.kayit_turu === k.value ? ' active' : ''}`}
                          onClick={() => update({ kayit_turu: k.value })}
                        >
                          {k.label}
                        </button>
                      ))}
                    </div>
                  </div>

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
              </div>
            )}
          </div>
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
