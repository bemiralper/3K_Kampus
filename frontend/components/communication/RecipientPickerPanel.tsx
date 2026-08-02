"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";

type SearchStudent = {
  id: number;
  ad: string;
  soyad: string;
  tam_ad?: string;
  telefon?: string;
  sinif?: string;
};

type VeliRow = {
  id: number;
  ad: string;
  soyad: string;
  tam_ad?: string;
  veli_turu?: string;
  veli_turu_display?: string;
  telefon?: string;
};

export type PickedRecipientChip = {
  key: string;
  kind: "ogrenci" | "veli";
  id: number;
  label: string;
  meta?: string;
};

interface RecipientPickerPanelProps {
  ogrenciIds: number[];
  veliIds: number[];
  onChange: (next: { ogrenci_ids: number[]; veli_ids: number[] }) => void;
}

export default function RecipientPickerPanel({
  ogrenciIds,
  veliIds,
  onChange,
}: RecipientPickerPanelProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchStudent[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [velilerByStudent, setVelilerByStudent] = useState<Record<number, VeliRow[]>>({});
  const [loadingVeliler, setLoadingVeliler] = useState<number | null>(null);
  const [chipLabels, setChipLabels] = useState<Record<string, PickedRecipientChip>>({});

  const ogrenciSet = useMemo(() => new Set(ogrenciIds), [ogrenciIds]);
  const veliSet = useMemo(() => new Set(veliIds), [veliIds]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      apiGet<{ ogrenciler?: SearchStudent[] } | SearchStudent[]>(
        `/ogrenciler/api/search/?q=${encodeURIComponent(q)}`,
      )
        .then((res) => {
          if (cancelled) return;
          if (!res.success || !res.data) {
            setResults([]);
            return;
          }
          const list = Array.isArray(res.data)
            ? res.data
            : res.data.ogrenciler || [];
          setResults(Array.isArray(list) ? list.slice(0, 20) : []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const rememberChip = (chip: PickedRecipientChip) => {
    setChipLabels((prev) => ({ ...prev, [chip.key]: chip }));
  };

  const toggleOgrenci = (student: SearchStudent, checked: boolean) => {
    const nextO = new Set(ogrenciIds);
    if (checked) {
      nextO.add(student.id);
      rememberChip({
        key: `o-${student.id}`,
        kind: "ogrenci",
        id: student.id,
        label: student.tam_ad || `${student.ad} ${student.soyad}`.trim(),
        meta: student.sinif || "Öğrenci",
      });
    } else {
      nextO.delete(student.id);
    }
    onChange({ ogrenci_ids: Array.from(nextO), veli_ids: veliIds });
  };

  const toggleVeli = (student: SearchStudent, veli: VeliRow, checked: boolean) => {
    const nextV = new Set(veliIds);
    if (checked) {
      nextV.add(veli.id);
      rememberChip({
        key: `v-${veli.id}`,
        kind: "veli",
        id: veli.id,
        label: veli.tam_ad || `${veli.ad} ${veli.soyad}`.trim(),
        meta: `${veli.veli_turu_display || "Veli"} · ${student.tam_ad || student.ad}`,
      });
    } else {
      nextV.delete(veli.id);
    }
    onChange({ ogrenci_ids: ogrenciIds, veli_ids: Array.from(nextV) });
  };

  const expandStudent = async (student: SearchStudent) => {
    if (expandedId === student.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(student.id);
    if (velilerByStudent[student.id]) return;
    setLoadingVeliler(student.id);
    try {
      const res = await apiGet<{ veliler?: VeliRow[] } | VeliRow[]>(
        `/ogrenciler/api/${student.id}/veliler/`,
      );
      const list = !res.success || !res.data
        ? []
        : Array.isArray(res.data)
          ? res.data
          : res.data.veliler || [];
      setVelilerByStudent((prev) => ({
        ...prev,
        [student.id]: Array.isArray(list) ? list : [],
      }));
    } catch {
      setVelilerByStudent((prev) => ({ ...prev, [student.id]: [] }));
    } finally {
      setLoadingVeliler(null);
    }
  };

  const selectAllForStudent = async (student: SearchStudent) => {
    let veliler = velilerByStudent[student.id];
    if (!veliler) {
      setLoadingVeliler(student.id);
      try {
        const res = await apiGet<{ veliler?: VeliRow[] } | VeliRow[]>(
          `/ogrenciler/api/${student.id}/veliler/`,
        );
        veliler = !res.success || !res.data
          ? []
          : Array.isArray(res.data)
            ? res.data
            : res.data.veliler || [];
        setVelilerByStudent((prev) => ({ ...prev, [student.id]: veliler || [] }));
        setExpandedId(student.id);
      } catch {
        veliler = [];
      } finally {
        setLoadingVeliler(null);
      }
    }
    const nextO = new Set(ogrenciIds);
    const nextV = new Set(veliIds);
    nextO.add(student.id);
    rememberChip({
      key: `o-${student.id}`,
      kind: "ogrenci",
      id: student.id,
      label: student.tam_ad || `${student.ad} ${student.soyad}`.trim(),
      meta: student.sinif || "Öğrenci",
    });
    for (const v of veliler || []) {
      nextV.add(v.id);
      rememberChip({
        key: `v-${v.id}`,
        kind: "veli",
        id: v.id,
        label: v.tam_ad || `${v.ad} ${v.soyad}`.trim(),
        meta: `${v.veli_turu_display || "Veli"} · ${student.tam_ad || student.ad}`,
      });
    }
    onChange({ ogrenci_ids: Array.from(nextO), veli_ids: Array.from(nextV) });
  };

  const removeChip = (chip: PickedRecipientChip) => {
    if (chip.kind === "ogrenci") {
      onChange({
        ogrenci_ids: ogrenciIds.filter((id) => id !== chip.id),
        veli_ids: veliIds,
      });
    } else {
      onChange({
        ogrenci_ids: ogrenciIds,
        veli_ids: veliIds.filter((id) => id !== chip.id),
      });
    }
  };

  const chips: PickedRecipientChip[] = [
    ...ogrenciIds.map((id) => chipLabels[`o-${id}`] || {
      key: `o-${id}`,
      kind: "ogrenci" as const,
      id,
      label: `Öğrenci #${id}`,
      meta: "Öğrenci",
    }),
    ...veliIds.map((id) => chipLabels[`v-${id}`] || {
      key: `v-${id}`,
      kind: "veli" as const,
      id,
      label: `Veli #${id}`,
      meta: "Veli",
    }),
  ];

  return (
    <div className="comm-recipient-picker">
      <label className="comm-form-field" htmlFor="recipient-search">
        Öğrenci ara
        <input
          id="recipient-search"
          type="search"
          className="form-control"
          placeholder="Ad, soyad veya öğrenci no…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="comm-studio-muted" style={{ margin: "0.35rem 0 0.75rem" }}>
        Öğrenci seçince kendisi ve velileri listelenir; istediğinizi işaretleyin.
      </p>

      {searching && <p className="comm-studio-muted">Aranıyor…</p>}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="comm-studio-muted">Sonuç bulunamadı.</p>
      )}

      <ul className="comm-recipient-search-list">
        {results.map((student) => {
          const name = student.tam_ad || `${student.ad} ${student.soyad}`.trim();
          const expanded = expandedId === student.id;
          const veliler = velilerByStudent[student.id] || [];
          return (
            <li key={student.id} className={`comm-recipient-search-item${expanded ? " is-open" : ""}`}>
              <div className="comm-recipient-search-row">
                <button
                  type="button"
                  className="comm-recipient-search-main"
                  onClick={() => expandStudent(student)}
                >
                  <strong>{name}</strong>
                  <span>
                    {[student.sinif, student.telefon].filter(Boolean).join(" · ") || "Öğrenci"}
                  </span>
                </button>
                <button
                  type="button"
                  className="comm-btn-secondary comm-recipient-pick-all"
                  onClick={() => selectAllForStudent(student)}
                >
                  Tümünü seç
                </button>
              </div>

              {expanded && (
                <div className="comm-recipient-expand">
                  <label className="comm-recipient-check">
                    <input
                      type="checkbox"
                      checked={ogrenciSet.has(student.id)}
                      onChange={(e) => toggleOgrenci(student, e.target.checked)}
                    />
                    <span>
                      <strong>{name}</strong>
                      <small>Öğrenci{student.telefon ? ` · ${student.telefon}` : " · telefon yok"}</small>
                    </span>
                  </label>

                  {loadingVeliler === student.id && (
                    <p className="comm-studio-muted">Veliler yükleniyor…</p>
                  )}

                  {loadingVeliler !== student.id && veliler.length === 0 && (
                    <p className="comm-studio-muted">Kayıtlı veli yok.</p>
                  )}

                  {veliler.map((veli) => {
                    const veliName = veli.tam_ad || `${veli.ad} ${veli.soyad}`.trim();
                    return (
                      <label key={veli.id} className="comm-recipient-check">
                        <input
                          type="checkbox"
                          checked={veliSet.has(veli.id)}
                          onChange={(e) => toggleVeli(student, veli, e.target.checked)}
                        />
                        <span>
                          <strong>{veliName}</strong>
                          <small>
                            {veli.veli_turu_display || "Veli"}
                            {veli.telefon ? ` · ${veli.telefon}` : " · telefon yok"}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {chips.length > 0 && (
        <div className="comm-recipient-selected">
          <div className="comm-filter-block-title">
            Seçilenler ({chips.length})
          </div>
          <div className="comm-recipient-chips">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="comm-recipient-chip"
                onClick={() => removeChip(chip)}
                title="Kaldır"
              >
                <span>
                  {chip.label}
                  {chip.meta ? <small> · {chip.meta}</small> : null}
                </span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
