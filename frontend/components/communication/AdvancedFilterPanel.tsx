"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import {
  AudienceFilter,
  CONTACT_KIND_LABELS,
  ContactKind,
  MALI_DURUM_LABELS,
  MaliDurumFilter,
} from "@/lib/communication-api";

type SinifSeviyesiOption = { id: number; ad: string };
type SinifOption = { id: number; ad: string; sinif_seviyesi_id: number | null };
type AlanOption = { id: number; ad: string };
type RehberOption = { id: number; ad: string };
type KalemGrup = {
  tur: string;
  label: string;
  kalemler: { kalem_id: number; kalem_adi: string }[];
};

interface FilterOptionsResponse {
  sinif_seviyeleri?: SinifSeviyesiOption[];
  siniflar?: SinifOption[];
  alanlar?: AlanOption[];
  rehberler?: RehberOption[];
  kalem_gruplari?: KalemGrup[];
}

const CONTACT_KIND_OPTIONS: ContactKind[] = ["ogrenci", "anne", "baba", "vasi"];
const MALI_DURUM_OPTIONS: MaliDurumFilter[] = ["borclu", "borcu_yok", "geciken"];

interface AdvancedFilterPanelProps {
  value: AudienceFilter;
  onChange: (patch: Partial<AudienceFilter>) => void;
  defaultOpen?: boolean;
}

export default function AdvancedFilterPanel({ value, onChange, defaultOpen = true }: AdvancedFilterPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [options, setOptions] = useState<FilterOptionsResponse>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiGet<FilterOptionsResponse>("/ogrenciler/api/filter-options/")
      .then((res) => setOptions((res.data as FilterOptionsResponse) || (res as unknown as FilterOptionsResponse) || {}))
      .catch(() => setOptions({}))
      .finally(() => setLoading(false));
  }, []);

  const seviyeIds = useMemo(() => new Set(value.sinif_seviyesi_ids || []), [value.sinif_seviyesi_ids]);
  const sinifIds = useMemo(() => new Set(value.sinif_ids || []), [value.sinif_ids]);
  const alanIds = useMemo(() => new Set(value.alan_ids || []), [value.alan_ids]);
  const coachIds = useMemo(() => new Set(value.coach_ids || []), [value.coach_ids]);
  const kalemKeys = useMemo(
    () => new Set((value.kalemler || []).map((k) => `${k.turu}:${k.id}`)),
    [value.kalemler],
  );
  const contactKinds = useMemo(
    () => new Set(value.contact_kinds || ["ogrenci", "anne", "baba", "vasi"]),
    [value.contact_kinds],
  );

  const visibleSiniflar = useMemo(() => {
    const list = options.siniflar || [];
    if (seviyeIds.size === 0) return list;
    return list.filter((s) => s.sinif_seviyesi_id != null && seviyeIds.has(s.sinif_seviyesi_id));
  }, [options.siniflar, seviyeIds]);

  const toggleId = (ids: number[], id: number): number[] =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

  const toggleSeviye = (id: number) => {
    const nextSeviye = toggleId(value.sinif_seviyesi_ids || [], id);
    const nextSinif = nextSeviye.includes(id)
      ? value.sinif_ids || []
      : (value.sinif_ids || []).filter((sid) => {
          const seviyeId = (options.siniflar || []).find((s) => s.id === sid)?.sinif_seviyesi_id;
          return seviyeId !== id;
        });
    onChange({ sinif_seviyesi_ids: nextSeviye, sinif_ids: nextSinif });
  };

  const toggleKalem = (turu: string, id: number) => {
    const key = `${turu}:${id}`;
    const current = value.kalemler || [];
    const next = kalemKeys.has(key)
      ? current.filter((k) => `${k.turu}:${k.id}` !== key)
      : [...current, { turu, id }];
    onChange({ kalemler: next });
  };

  const toggleContactKind = (kind: ContactKind) => {
    const current = new Set(value.contact_kinds || ["ogrenci", "anne", "baba", "vasi"]);
    if (current.has(kind)) {
      if (current.size === 1) return;
      current.delete(kind);
    } else {
      current.add(kind);
    }
    onChange({ contact_kinds: Array.from(current) as ContactKind[] });
  };

  const activeCount =
    (value.sinif_seviyesi_ids?.length || 0) +
    (value.sinif_ids?.length || 0) +
    (value.alan_ids?.length || 0) +
    (value.coach_ids?.length || 0) +
    (value.kalemler?.length || 0) +
    (value.mali_durum ? 1 : 0) +
    (value.has_phone != null ? 1 : 0);

  return (
    <div className="comm-filter-panel">
      <button type="button" className="comm-filter-panel-toggle" onClick={() => setOpen((v) => !v)}>
        <span>
          Gelişmiş filtreler
          {activeCount > 0 ? ` (${activeCount})` : ""}
        </span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="comm-filter-panel-body">
          {loading && <p className="comm-studio-muted">Filtre seçenekleri yükleniyor…</p>}

          <div className="comm-filter-row">
            <div>
              <div className="comm-filter-block-title">Sınıf seviyesi</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {(options.sinif_seviyeleri || []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`comm-filter-chip-toggle${seviyeIds.has(s.id) ? " active" : ""}`}
                    onClick={() => toggleSeviye(s.id)}
                  >
                    {s.ad}
                  </button>
                ))}
                {!loading && (options.sinif_seviyeleri || []).length === 0 && (
                  <span className="comm-studio-muted">Tanımlı sınıf seviyesi yok.</span>
                )}
              </div>
            </div>

            <div>
              <div className="comm-filter-block-title">Sınıf</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", maxHeight: 140, overflowY: "auto" }}>
                {visibleSiniflar.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`comm-filter-chip-toggle${sinifIds.has(s.id) ? " active" : ""}`}
                    onClick={() => onChange({ sinif_ids: toggleId(value.sinif_ids || [], s.id) })}
                  >
                    {s.ad}
                  </button>
                ))}
                {!loading && visibleSiniflar.length === 0 && (
                  <span className="comm-studio-muted">Sınıf bulunamadı.</span>
                )}
              </div>
            </div>
          </div>

          <div className="comm-filter-row">
            <div>
              <div className="comm-filter-block-title">Alan</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {(options.alanlar || []).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`comm-filter-chip-toggle${alanIds.has(a.id) ? " active" : ""}`}
                    onClick={() => onChange({ alan_ids: toggleId(value.alan_ids || [], a.id) })}
                  >
                    {a.ad}
                  </button>
                ))}
                {!loading && (options.alanlar || []).length === 0 && (
                  <span className="comm-studio-muted">Tanımlı alan yok.</span>
                )}
              </div>
            </div>

            <div>
              <div className="comm-filter-block-title">Koç / Rehber</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", maxHeight: 140, overflowY: "auto" }}>
                {(options.rehberler || []).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`comm-filter-chip-toggle${coachIds.has(r.id) ? " active" : ""}`}
                    onClick={() => onChange({ coach_ids: toggleId(value.coach_ids || [], r.id) })}
                  >
                    {r.ad}
                  </button>
                ))}
                {!loading && (options.rehberler || []).length === 0 && (
                  <span className="comm-studio-muted">Koç/rehber bulunamadı.</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="comm-filter-block-title">Eğitim paketi (kalem)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", maxHeight: 140, overflowY: "auto" }}>
              {(options.kalem_gruplari || []).flatMap((grup) =>
                grup.kalemler.map((k) => (
                  <button
                    key={`${grup.tur}:${k.kalem_id}`}
                    type="button"
                    className={`comm-filter-chip-toggle${kalemKeys.has(`${grup.tur}:${k.kalem_id}`) ? " active" : ""}`}
                    onClick={() => toggleKalem(grup.tur, k.kalem_id)}
                    title={grup.label}
                  >
                    {k.kalem_adi}
                  </button>
                )),
              )}
              {!loading && (options.kalem_gruplari || []).every((g) => g.kalemler.length === 0) && (
                <span className="comm-studio-muted">Tanımlı eğitim paketi yok.</span>
              )}
            </div>
          </div>

          <div className="comm-filter-row">
            <div className="comm-form-field" style={{ marginBottom: 0 }}>
              <label htmlFor="adv-durum">Kayıt durumu</label>
              <select
                id="adv-durum"
                value={value.durum || "aktif"}
                onChange={(e) => onChange({ durum: e.target.value })}
              >
                <option value="aktif">Aktif</option>
                <option value="pasif">Pasif</option>
                <option value="all">Tümü</option>
              </select>
            </div>

            <div className="comm-form-field" style={{ marginBottom: 0 }}>
              <label htmlFor="adv-mali">Mali durum</label>
              <select
                id="adv-mali"
                value={value.mali_durum || ""}
                onChange={(e) => onChange({ mali_durum: (e.target.value || "") as MaliDurumFilter | "" })}
              >
                <option value="">Tümü</option>
                {MALI_DURUM_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {MALI_DURUM_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>

            <div className="comm-form-field" style={{ marginBottom: 0 }}>
              <label htmlFor="adv-has-phone">Telefon</label>
              <select
                id="adv-has-phone"
                value={value.has_phone == null ? "" : value.has_phone ? "1" : "0"}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange({ has_phone: v === "" ? null : v === "1" });
                }}
              >
                <option value="">Farketmez</option>
                <option value="1">Telefonu var</option>
                <option value="0">Telefonu yok</option>
              </select>
            </div>
          </div>

          <div>
            <div className="comm-filter-block-title">Alıcı türü</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              {CONTACT_KIND_OPTIONS.map((kind) => (
                <label key={kind} className="comm-checkbox-item" style={{ padding: 0 }}>
                  <input
                    type="checkbox"
                    checked={contactKinds.has(kind)}
                    onChange={() => toggleContactKind(kind)}
                  />
                  <span>{CONTACT_KIND_LABELS[kind]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
