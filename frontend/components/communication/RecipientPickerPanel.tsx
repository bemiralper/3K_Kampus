"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { searchBulkRecipients, type BulkRecipientHit } from "@/lib/communication-api";

export type PickedRecipientChip = {
  key: string;
  kind: "ogrenci" | "veli" | "personel";
  id: number;
  label: string;
  meta?: string;
};

interface RecipientPickerPanelProps {
  ogrenciIds: number[];
  veliIds: number[];
  personelIds?: number[];
  allowOgrenci?: boolean;
  allowVeli?: boolean;
  allowPersonel?: boolean;
  /** Arama kutusu üstündeki kısa yardım metni */
  hint?: string;
  onChange: (next: {
    ogrenci_ids: number[];
    veli_ids: number[];
    personel_ids: number[];
  }) => void;
}

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

const KIND_LABEL: Record<BulkRecipientHit["kind"], string> = {
  ogrenci: "Öğrenci",
  veli: "Veli",
  personel: "Personel",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

export default function RecipientPickerPanel({
  ogrenciIds,
  veliIds,
  personelIds = [],
  allowOgrenci = true,
  allowVeli = true,
  allowPersonel = true,
  hint,
  onChange,
}: RecipientPickerPanelProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BulkRecipientHit[]>([]);
  const [expandedOgrenciId, setExpandedOgrenciId] = useState<number | null>(null);
  const [velilerByStudent, setVelilerByStudent] = useState<Record<number, VeliRow[]>>({});
  const [loadingVeliler, setLoadingVeliler] = useState<number | null>(null);
  const [chipLabels, setChipLabels] = useState<Record<string, PickedRecipientChip>>({});

  const ogrenciSet = useMemo(() => new Set(ogrenciIds), [ogrenciIds]);
  const veliSet = useMemo(() => new Set(veliIds), [veliIds]);
  const personelSet = useMemo(() => new Set(personelIds), [personelIds]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      searchBulkRecipients(q, { includePersonel: allowPersonel })
        .then((res) => {
          if (cancelled) return;
          const filtered = (res.results || []).filter((hit) => {
            if (hit.kind === "ogrenci") return allowOgrenci;
            if (hit.kind === "veli") return allowVeli;
            if (hit.kind === "personel") return allowPersonel;
            return false;
          });
          setResults(filtered);
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
  }, [query, allowPersonel, allowOgrenci, allowVeli]);

  const rememberChip = (chip: PickedRecipientChip) => {
    setChipLabels((prev) => ({ ...prev, [chip.key]: chip }));
  };

  const emit = (next: {
    ogrenci_ids?: number[];
    veli_ids?: number[];
    personel_ids?: number[];
  }) => {
    onChange({
      ogrenci_ids: next.ogrenci_ids ?? ogrenciIds,
      veli_ids: next.veli_ids ?? veliIds,
      personel_ids: next.personel_ids ?? personelIds,
    });
  };

  const toggleHit = (hit: BulkRecipientHit, checked: boolean) => {
    if (hit.kind === "ogrenci") {
      if (!allowOgrenci) return;
      const next = new Set(ogrenciIds);
      if (checked) {
        next.add(hit.id);
        rememberChip({
          key: `o-${hit.id}`,
          kind: "ogrenci",
          id: hit.id,
          label: hit.label,
          meta: hit.meta || "Öğrenci",
        });
      } else next.delete(hit.id);
      emit({ ogrenci_ids: Array.from(next) });
      return;
    }
    if (hit.kind === "veli") {
      if (!allowVeli) return;
      const next = new Set(veliIds);
      if (checked) {
        next.add(hit.id);
        rememberChip({
          key: `v-${hit.id}`,
          kind: "veli",
          id: hit.id,
          label: hit.label,
          meta: hit.meta || "Veli",
        });
      } else next.delete(hit.id);
      emit({ veli_ids: Array.from(next) });
      return;
    }
    if (!allowPersonel) return;
    const next = new Set(personelIds);
    if (checked) {
      next.add(hit.id);
      rememberChip({
        key: `p-${hit.id}`,
        kind: "personel",
        id: hit.id,
        label: hit.label,
        meta: hit.meta || "Personel",
      });
    } else next.delete(hit.id);
    emit({ personel_ids: Array.from(next) });
  };

  const isChecked = (hit: BulkRecipientHit) => {
    if (hit.kind === "ogrenci") return ogrenciSet.has(hit.id);
    if (hit.kind === "veli") return veliSet.has(hit.id);
    return personelSet.has(hit.id);
  };

  const loadVeliler = async (studentId: number): Promise<VeliRow[]> => {
    if (velilerByStudent[studentId]) return velilerByStudent[studentId];
    setLoadingVeliler(studentId);
    try {
      const res = await apiGet<{ veliler?: VeliRow[] } | VeliRow[]>(
        `/ogrenciler/api/${studentId}/veliler/`,
      );
      const list = !res.success || !res.data
        ? []
        : Array.isArray(res.data)
          ? res.data
          : res.data.veliler || [];
      const rows = Array.isArray(list) ? list : [];
      setVelilerByStudent((prev) => ({ ...prev, [studentId]: rows }));
      return rows;
    } catch {
      setVelilerByStudent((prev) => ({ ...prev, [studentId]: [] }));
      return [];
    } finally {
      setLoadingVeliler(null);
    }
  };

  const expandOgrenci = async (hit: BulkRecipientHit) => {
    if (hit.kind !== "ogrenci") return;
    if (expandedOgrenciId === hit.id) {
      setExpandedOgrenciId(null);
      return;
    }
    setExpandedOgrenciId(hit.id);
    await loadVeliler(hit.id);
  };

  const selectStudentFamily = async (hit: BulkRecipientHit) => {
    if (hit.kind !== "ogrenci") return;
    const student: SearchStudent = {
      id: hit.id,
      ad: hit.ad || hit.label,
      soyad: hit.soyad || "",
      tam_ad: hit.label,
      telefon: hit.phone,
      sinif: hit.sinif,
    };
    const veliler = await loadVeliler(hit.id);
    setExpandedOgrenciId(hit.id);
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
    for (const v of veliler) {
      nextV.add(v.id);
      rememberChip({
        key: `v-${v.id}`,
        kind: "veli",
        id: v.id,
        label: v.tam_ad || `${v.ad} ${v.soyad}`.trim(),
        meta: `${v.veli_turu_display || "Veli"} · ${student.tam_ad || student.ad}`,
      });
    }
    emit({ ogrenci_ids: Array.from(nextO), veli_ids: Array.from(nextV) });
  };

  /** Veli satırından bağlı öğrenciyi de seçime ekle. */
  const selectParentWithStudent = (hit: BulkRecipientHit) => {
    if (hit.kind !== "veli" || !hit.ogrenci_id) return;
    const nextO = new Set(ogrenciIds);
    const nextV = new Set(veliIds);
    nextV.add(hit.id);
    nextO.add(hit.ogrenci_id);
    rememberChip({
      key: `v-${hit.id}`,
      kind: "veli",
      id: hit.id,
      label: hit.label,
      meta: hit.meta || "Veli",
    });
    rememberChip({
      key: `o-${hit.ogrenci_id}`,
      kind: "ogrenci",
      id: hit.ogrenci_id,
      label: hit.ogrenci_name || `Öğrenci #${hit.ogrenci_id}`,
      meta: "Öğrenci",
    });
    emit({ ogrenci_ids: Array.from(nextO), veli_ids: Array.from(nextV) });
  };

  const toggleVeliRow = (studentLabel: string, veli: VeliRow, checked: boolean) => {
    const nextV = new Set(veliIds);
    if (checked) {
      nextV.add(veli.id);
      rememberChip({
        key: `v-${veli.id}`,
        kind: "veli",
        id: veli.id,
        label: veli.tam_ad || `${veli.ad} ${veli.soyad}`.trim(),
        meta: `${veli.veli_turu_display || "Veli"} · ${studentLabel}`,
      });
    } else nextV.delete(veli.id);
    emit({ veli_ids: Array.from(nextV) });
  };

  const removeChip = (chip: PickedRecipientChip) => {
    if (chip.kind === "ogrenci") {
      emit({ ogrenci_ids: ogrenciIds.filter((id) => id !== chip.id) });
    } else if (chip.kind === "veli") {
      emit({ veli_ids: veliIds.filter((id) => id !== chip.id) });
    } else {
      emit({ personel_ids: personelIds.filter((id) => id !== chip.id) });
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
    ...personelIds.map((id) => chipLabels[`p-${id}`] || {
      key: `p-${id}`,
      kind: "personel" as const,
      id,
      label: `Personel #${id}`,
      meta: "Personel",
    }),
  ];

  const qLen = query.trim().length;
  const showEmpty = !searching && qLen >= 2 && results.length === 0;
  const showHint = qLen > 0 && qLen < 2;

  const grouped = useMemo(() => {
    const g: Record<BulkRecipientHit["kind"], BulkRecipientHit[]> = {
      ogrenci: [],
      veli: [],
      personel: [],
    };
    for (const r of results) g[r.kind].push(r);
    return g;
  }, [results]);

  return (
    <div className="comm-recipient-picker">
      <div className="comm-recipient-picker-head">
        <div>
          <h3 className="comm-recipient-picker-title">
            {allowOgrenci || allowVeli ? "Kişi ara ve seç" : "Personel ara ve seç"}
          </h3>
          <p className="comm-recipient-picker-sub">
            {hint
              || (allowOgrenci || allowVeli
                ? (allowPersonel
                  ? "Öğrenci veya veli arayınca ilişkili kişiler birlikte listelenir."
                  : "Öğrenci arayınca velisi, veli arayınca öğrencisi birlikte çıkar.")
                : "İsim veya telefon ile personel ekleyin; seçilenler listeden çıkarılabilir.")}
          </p>
        </div>
        {chips.length > 0 && (
          <span className="comm-recipient-picker-badge">{chips.length} seçili</span>
        )}
      </div>

      <div className="comm-recipient-search-box">
        <span className="comm-recipient-search-icon" aria-hidden="true">⌕</span>
        <input
          id="recipient-search"
          type="search"
          className="comm-recipient-search-input"
          placeholder={
            allowOgrenci || allowVeli
              ? (allowPersonel ? "Ad, soyad, telefon…" : "Öğrenci veya veli adı, telefon…")
              : "Personel adı veya telefon…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {searching && <span className="comm-recipient-search-status">Aranıyor…</span>}
      </div>

      <div className="comm-recipient-results" role="listbox" aria-label="Arama sonuçları">
        {qLen === 0 && (
          <div className="comm-recipient-empty">
            <div className="comm-recipient-empty-icon" aria-hidden="true">⌕</div>
            <strong>Aramaya başlayın</strong>
            <p>
              En az 2 karakter yazın.
              {allowPersonel
                ? " Öğrenci, veli ve personel sonuçları birlikte listelenir."
                : " Öğrenci ve veli sonuçları birlikte listelenir."}
            </p>
          </div>
        )}

        {showHint && (
          <div className="comm-recipient-empty comm-recipient-empty--soft">
            <p>Aramaya devam edin — en az 2 karakter gerekli.</p>
          </div>
        )}

        {showEmpty && (
          <div className="comm-recipient-empty">
            <div className="comm-recipient-empty-icon" aria-hidden="true">∅</div>
            <strong>“{query.trim()}” için sonuç yok</strong>
            <p>Yazımı kontrol edin veya farklı bir ad / telefon deneyin.</p>
          </div>
        )}

        {(["ogrenci", "veli", "personel"] as const).map((kind) => {
          const items = grouped[kind];
          if (!items.length) return null;
          return (
            <div key={kind} className="comm-recipient-group">
              <div className="comm-recipient-group-label">
                {KIND_LABEL[kind]}
                <span>{items.length}</span>
              </div>
              <ul className="comm-recipient-search-list">
                {items.map((hit) => {
                  const checked = isChecked(hit);
                  const expanded = hit.kind === "ogrenci" && expandedOgrenciId === hit.id;
                  const veliler = hit.kind === "ogrenci" ? (velilerByStudent[hit.id] || []) : [];
                  return (
                    <li
                      key={`${hit.kind}-${hit.id}`}
                      className={`comm-recipient-search-item${expanded ? " is-open" : ""}${checked ? " is-picked" : ""}`}
                    >
                      <div className="comm-recipient-search-row">
                        <label className="comm-recipient-hit">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleHit(hit, e.target.checked)}
                          />
                          <span className={`comm-recipient-avatar is-${hit.kind}`} aria-hidden="true">
                            {initials(hit.label)}
                          </span>
                          <span className="comm-recipient-hit-text">
                            <strong>{hit.label}</strong>
                            <small>
                              {[hit.meta, hit.phone || "telefon yok"].filter(Boolean).join(" · ")}
                            </small>
                          </span>
                        </label>
                        {hit.kind === "ogrenci" && (
                          <div className="comm-recipient-hit-actions">
                            <button
                              type="button"
                              className="comm-btn-secondary comm-recipient-pick-all"
                              onClick={() => selectStudentFamily(hit)}
                            >
                              + Veliler
                            </button>
                            <button
                              type="button"
                              className="comm-recipient-expand-btn"
                              onClick={() => expandOgrenci(hit)}
                              aria-expanded={expanded}
                            >
                              {expanded ? "▲" : "▼"}
                            </button>
                          </div>
                        )}
                        {hit.kind === "veli" && hit.ogrenci_id && (
                          <div className="comm-recipient-hit-actions">
                            <button
                              type="button"
                              className="comm-btn-secondary comm-recipient-pick-all"
                              onClick={() => selectParentWithStudent(hit)}
                            >
                              + Öğrenci
                            </button>
                          </div>
                        )}
                      </div>

                      {expanded && (
                        <div className="comm-recipient-expand">
                          {loadingVeliler === hit.id && (
                            <p className="comm-studio-muted">Veliler yükleniyor…</p>
                          )}
                          {loadingVeliler !== hit.id && veliler.length === 0 && (
                            <p className="comm-studio-muted">Bu öğrenciye bağlı veli kaydı yok.</p>
                          )}
                          {veliler.map((veli) => {
                            const veliName = veli.tam_ad || `${veli.ad} ${veli.soyad}`.trim();
                            return (
                              <label key={veli.id} className="comm-recipient-check">
                                <input
                                  type="checkbox"
                                  checked={veliSet.has(veli.id)}
                                  onChange={(e) => toggleVeliRow(hit.label, veli, e.target.checked)}
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
            </div>
          );
        })}
      </div>

      {chips.length > 0 && (
        <div className="comm-recipient-selected">
          <div className="comm-filter-block-title">
            Seçilenler
            <button
              type="button"
              className="comm-recipient-clear"
              onClick={() => emit({ ogrenci_ids: [], veli_ids: [], personel_ids: [] })}
            >
              Tümünü temizle
            </button>
          </div>
          <div className="comm-recipient-chips">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`comm-recipient-chip is-${chip.kind}`}
                onClick={() => removeChip(chip)}
                title="Kaldır"
              >
                <span className="comm-recipient-chip-type">{KIND_LABEL[chip.kind]}</span>
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
