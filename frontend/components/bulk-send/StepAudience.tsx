"use client";

import { useMemo, useState } from "react";

import FilterBuilder from "@/app/admin/iletisim/toplu-gonder/FilterBuilder";
import PersonPicker from "@/app/admin/iletisim/toplu-gonder/PersonPicker";
import {
  applyQuickStart,
  hasAnyFilter,
  includePerson,
  listedIncludes,
  personTypeLabel,
  removeIncluded,
  togglePersonType,
} from "@/app/admin/iletisim/toplu-gonder/audience-utils";
import type {
  AudiencePersonType,
  AudienceQuickStart,
  BulkRecipientHit,
  SavedAudienceItem,
} from "@/lib/communication-api";

import type { BulkSendDraft } from "./useBulkSendDraft";

interface Props {
  draft: BulkSendDraft;
  saved: SavedAudienceItem[];
  onSaveAudience: (name: string) => Promise<void>;
  onDeleteSaved: (id: string) => Promise<void>;
  onOpenRecipients: () => void;
}

const FALLBACK_QUICK: AudienceQuickStart[] = [
  { key: "veli", label: "Tüm veliler", person_types: ["veli"], hint: "Aktif öğrencilerin velileri" },
  { key: "ogrenci", label: "Tüm öğrenciler", person_types: ["ogrenci"], hint: "Telefonu olan aktif öğrenciler" },
  { key: "personel", label: "Tüm personel", person_types: ["personel"], hint: "Aktif çalışanlar" },
];

const FALLBACK_TYPES = [
  { key: "ogrenci" as const, label: "Öğrenci" },
  { key: "veli" as const, label: "Veli" },
  { key: "personel" as const, label: "Personel" },
];

/** 1. adım — kitleyi kur: hazır kitle, kişi türü, kişi ekleme, filtre. */
export default function StepAudience({
  draft,
  saved,
  onSaveAudience,
  onDeleteSaved,
  onOpenRecipients,
}: Props) {
  const { query, setQuery, personTypes, catalog, isCoach } = draft;
  const [pickedLabels, setPickedLabels] = useState<Record<string, BulkRecipientHit>>({});
  const [saveName, setSaveName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const quickStarts = useMemo(() => {
    const list = catalog?.quick_starts?.length ? catalog.quick_starts : FALLBACK_QUICK;
    return list.filter((item) => !isCoach || !item.person_types.includes("personel"));
  }, [catalog, isCoach]);

  const availableTypes = useMemo(() => {
    const list = catalog?.person_types?.length ? catalog.person_types : FALLBACK_TYPES;
    return list.filter((type) => !isCoach || type.key !== "personel");
  }, [catalog, isCoach]);

  const included = listedIncludes(query);
  const includedKeys = useMemo(
    () => new Set(included.map((person) => `${person.kind}:${person.id}`)),
    [included],
  );

  const activeQuickKey = useMemo(() => {
    if (hasAnyFilter(query) || included.length) return null;
    const signature = [...personTypes].sort().join("|");
    return quickStarts.find(
      (item) => !item.add_field && [...item.person_types].sort().join("|") === signature,
    )?.key ?? null;
  }, [query, included.length, personTypes, quickStarts]);

  const addPeople = (hits: BulkRecipientHit[]) => {
    let next = query;
    const labels = { ...pickedLabels };
    for (const hit of hits) {
      next = includePerson(next, hit.kind, hit.id);
      labels[`${hit.kind}:${hit.id}`] = hit;
    }
    setPickedLabels(labels);
    setQuery(next);
  };

  const canSave = !isCoach && (personTypes.length > 0 || included.length > 0);

  return (
    <div className="bss-step">
      <section className="bss-panel">
        <header className="bss-panel-head">
          <div>
            <h3>Hazır kitle</h3>
            <p>Bir kalıpla başlayın, aşağıda daraltın.</p>
          </div>
        </header>
        <div className="bss-tiles" role="list">
          {quickStarts.map((item) => (
            <button
              key={item.key}
              type="button"
              role="listitem"
              className={`bss-tile${activeQuickKey === item.key ? " is-on" : ""}`}
              onClick={() => setQuery(applyQuickStart(item.person_types, item.add_field, item.add_value))}
            >
              <strong>{item.label}</strong>
              <span>{item.hint || item.person_types.map(personTypeLabel).join(" · ")}</span>
            </button>
          ))}
        </div>

        {!isCoach && saved.length > 0 && (
          <div className="bss-saved">
            <span className="bss-saved-label">Kayıtlı kitleler</span>
            <div className="bss-saved-list">
              {saved.map((item) => (
                <span key={item.id} className="bss-saved-chip">
                  <button
                    type="button"
                    onClick={() => setQuery({ ...item.query, audience_type: "query" })}
                    title={item.description || item.name}
                  >
                    {item.name}
                    {item.counts?.deliverable_count != null && (
                      <em>{item.counts.deliverable_count.toLocaleString("tr-TR")}</em>
                    )}
                  </button>
                  <button
                    type="button"
                    className="bss-saved-x"
                    aria-label={`${item.name} kitlesini sil`}
                    onClick={() => void onDeleteSaved(item.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="bss-panel">
        <header className="bss-panel-head">
          <div>
            <h3>Kişi türü</h3>
            <p>Mesaj kimlere gidecek? Birden fazla seçebilirsiniz.</p>
          </div>
        </header>
        <div className="bss-seg" role="group" aria-label="Kişi türü">
          {availableTypes.map((type) => {
            const on = personTypes.includes(type.key);
            return (
              <button
                key={type.key}
                type="button"
                className={`bss-seg-btn${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => setQuery({
                  ...query,
                  person_types: togglePersonType(personTypes, type.key as AudiencePersonType),
                })}
              >
                {type.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="bss-panel">
        <header className="bss-panel-head">
          <div>
            <h3>Filtre</h3>
            <p>Şube, sınıf, koç, paket gibi alanlarla daraltın.</p>
          </div>
          {hasAnyFilter(query) && (
            <button
              type="button"
              className="bss-link"
              onClick={() => setQuery({ ...query, tree: { join: "or", groups: [] } })}
            >
              Filtreleri temizle
            </button>
          )}
        </header>
        {personTypes.length > 0 ? (
          <FilterBuilder query={query} catalog={catalog} personTypes={personTypes} onChange={setQuery} />
        ) : (
          <p className="bss-hint">Filtre için önce bir kişi türü seçin.</p>
        )}
      </section>

      <section className="bss-panel">
        <header className="bss-panel-head">
          <div>
            <h3>Tek tek kişi ekle</h3>
            <p>Filtreye girmeyen kişileri isimle ekleyin. İsme tıklamak yeterli.</p>
          </div>
          {included.length > 0 && <span className="bss-count-badge">{included.length} kişi</span>}
        </header>
        <PersonPicker
          embedded
          allowPersonel={!isCoach}
          addedKeys={includedKeys}
          onPickMany={addPeople}
          onRemove={(hit) => setQuery(removeIncluded(query, hit.kind, hit.id))}
        >
          {included.length > 0 && (
            <div className="bss-chips" aria-label="Eklenen kişiler">
              {included.map((person) => {
                const key = `${person.kind}:${person.id}`;
                const hit = pickedLabels[key];
                return (
                  <span key={key} className={`bss-chip is-${person.kind}`}>
                    <b>{hit?.label || `${personTypeLabel(person.kind)} #${person.id}`}</b>
                    <small>{personTypeLabel(person.kind)}</small>
                    <button
                      type="button"
                      aria-label="Kaldır"
                      onClick={() => setQuery(removeIncluded(query, person.kind, person.id))}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </PersonPicker>
      </section>

      <div className="bss-step-foot">
        <button type="button" className="bss-btn" onClick={onOpenRecipients}>
          Alıcı listesini aç
        </button>
        {canSave && (
          <div className="bss-save">
            <input
              className="bss-input"
              placeholder="Bu kitleyi kaydet (ör. 9. sınıf velileri)"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
            />
            <button
              type="button"
              className="bss-btn"
              disabled={!saveName.trim() || saveBusy}
              onClick={async () => {
                setSaveBusy(true);
                try {
                  await onSaveAudience(saveName.trim());
                  setSaveName("");
                } finally {
                  setSaveBusy(false);
                }
              }}
            >
              {saveBusy ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
