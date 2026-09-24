"use client";

import { useMemo, useState } from "react";

import FilterBuilder from "@/app/admin/iletisim/toplu-gonder/FilterBuilder";
import PersonPicker from "@/app/admin/iletisim/toplu-gonder/PersonPicker";
import RecipientsModal from "@/app/admin/iletisim/toplu-gonder/RecipientsModal";
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
}

const DEFAULT_QUICK: AudienceQuickStart[] = [
  { key: "veli", label: "Tüm veliler", person_types: ["veli"], hint: "Aktif öğrencilerin velileri" },
  { key: "ogrenci", label: "Tüm öğrenciler", person_types: ["ogrenci"], hint: "Telefonu olan aktif öğrenciler" },
  { key: "personel", label: "Tüm personel", person_types: ["personel"], hint: "Aktif çalışanlar" },
];

/**
 * "Kime?" — hızlı başlangıç kartları, kişi türü, filtre grupları, elle kişi ekleme,
 * canlı sayaç. Sorgu mantığı audience-utils'te; burada yalnız kompozisyon var.
 */
export default function AudienceComposer({ draft, saved, onSaveAudience, onDeleteSaved }: Props) {
  const { query, setQuery, personTypes, catalog, preview, previewLoading, previewError, isCoach } = draft;
  const [showRecipients, setShowRecipients] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedLabels, setPickedLabels] = useState<Record<string, BulkRecipientHit>>({});
  const [saveName, setSaveName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const quickStarts = useMemo(() => {
    const fromCatalog = catalog?.quick_starts || [];
    const base = (fromCatalog.length ? fromCatalog : DEFAULT_QUICK)
      .filter((q) => !isCoach || !q.person_types.includes("personel"));
    return base.slice(0, 6);
  }, [catalog, isCoach]);

  const availableTypes = useMemo(() => {
    const list = catalog?.person_types?.length
      ? catalog.person_types
      : [{ key: "ogrenci" as const, label: "Öğrenci" }, { key: "veli" as const, label: "Veli" }, { key: "personel" as const, label: "Personel" }];
    return list.filter((t) => !isCoach || t.key !== "personel");
  }, [catalog, isCoach]);

  const included = listedIncludes(query);
  const filterCount = (query.tree?.groups || []).reduce((n, g) => n + (g.filters || []).length, 0);

  const activeQuickKey = useMemo(() => {
    if (hasAnyFilter(query) || included.length) return null;
    const types = [...personTypes].sort().join("|");
    return quickStarts.find((q) => [...q.person_types].sort().join("|") === types && !q.add_field)?.key ?? null;
  }, [query, included.length, personTypes, quickStarts]);

  const deliverable = preview?.deliverable_count ?? 0;
  const matched = preview?.matched_count ?? 0;
  const unsuitable = preview?.unsuitable_count ?? 0;

  const pickMany = (hits: BulkRecipientHit[]) => {
    let next = query;
    const labels = { ...pickedLabels };
    for (const hit of hits) {
      next = includePerson(next, hit.kind, hit.id);
      labels[`${hit.kind}:${hit.id}`] = hit;
    }
    setPickedLabels(labels);
    setQuery(next);
  };

  return (
    <>
      <section className="bs-card">
        <div className="bs-card-head">
          <div>
            <h2><span className="bs-step">1</span>Kime gönderilecek?</h2>
            <p>Bir hızlı başlangıç seçin ya da kitleyi filtrelerle daraltın.</p>
          </div>
          {saved.length > 0 && (
            <select
              className="bs-select"
              style={{ width: "auto", maxWidth: 220 }}
              value=""
              onChange={(e) => {
                const item = saved.find((s) => s.id === e.target.value);
                if (item) setQuery({ ...item.query, audience_type: "query" });
              }}
              aria-label="Kayıtlı kitle yükle"
            >
              <option value="">Kayıtlı kitle…</option>
              {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        <div className="bs-quick" role="list">
          {quickStarts.map((q) => (
            <button
              key={q.key}
              type="button"
              role="listitem"
              className={`bs-quick-card${activeQuickKey === q.key ? " is-on" : ""}`}
              onClick={() => setQuery(applyQuickStart(q.person_types, q.add_field, q.add_value))}
            >
              <strong>{q.label}</strong>
              <span>{q.hint || q.person_types.map(personTypeLabel).join(" + ")}</span>
            </button>
          ))}
          <button
            type="button"
            role="listitem"
            className={`bs-quick-card${pickerOpen ? " is-on" : ""}`}
            onClick={() => setPickerOpen((v) => !v)}
          >
            <strong>Kişi ara ve ekle</strong>
            <span>Ad ile tek tek seç</span>
          </button>
        </div>

        <div className="bs-section-title">
          <span>Kişi türü</span>
          {filterCount > 0 && (
            <button type="button" className="bs-btn-ghost bs-btn-sm" onClick={() => setQuery({ ...query, tree: { join: "or", groups: [] } })}>
              Filtreleri temizle
            </button>
          )}
        </div>
        <div className="bs-chips" role="group" aria-label="Kişi türü">
          {availableTypes.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`bs-chip${personTypes.includes(t.key) ? " is-on" : ""}`}
              aria-pressed={personTypes.includes(t.key)}
              onClick={() => setQuery({ ...query, person_types: togglePersonType(personTypes, t.key as AudiencePersonType) })}
            >
              {t.label}
            </button>
          ))}
        </div>

        {personTypes.length > 0 && (
          <details className="bs-collapse" open={filterCount > 0}>
            <summary>
              Filtreler <small>{filterCount ? `${filterCount} koşul` : "sınıf, şube, koç, kayıt türü…"}</small>
            </summary>
            <FilterBuilder query={query} catalog={catalog} personTypes={personTypes} onChange={setQuery} />
          </details>
        )}

        {pickerOpen && (
          <div style={{ marginTop: 10 }}>
            <PersonPicker
              allowPersonel={!isCoach}
              excludeKeys={new Set(included.map((i) => `${i.kind}:${i.id}`))}
              onPickMany={pickMany}
            />
          </div>
        )}

        {included.length > 0 && (
          <>
            <div className="bs-section-title"><span>Elle eklenenler ({included.length})</span></div>
            <div className="bs-pills">
              {included.map((p) => {
                const key = `${p.kind}:${p.id}`;
                const hit = pickedLabels[key];
                return (
                  <span key={key} className="bs-pill">
                    {hit?.label || `${personTypeLabel(p.kind)} #${p.id}`}
                    {hit?.role && <small className="bs-muted">· {hit.role}</small>}
                    <button type="button" aria-label="Kaldır" onClick={() => setQuery(removeIncluded(query, p.kind, p.id))}>×</button>
                  </span>
                );
              })}
            </div>
          </>
        )}

        <div className="bs-counter" style={{ marginTop: 14 }} aria-live="polite">
          <div className={`bs-counter-num${deliverable ? "" : " is-zero"}`}>
            {previewLoading && !preview ? <span className="bs-skeleton" style={{ width: 56, height: 28, display: "inline-block" }} /> : deliverable.toLocaleString("tr-TR")}
          </div>
          <div className="bs-counter-meta">
            <div>
              <strong>kişiye gönderilecek</strong>
              {matched > deliverable && <> · {matched.toLocaleString("tr-TR")} eşleşen</>}
              {unsuitable > 0 && (
                <> · <button type="button" className="bs-counter-link" onClick={() => setShowRecipients(true)}>{unsuitable} kişiye gitmeyecek</button></>
              )}
              {previewLoading && preview && <span className="bs-muted"> · güncelleniyor…</span>}
            </div>
            <div className="bs-counter-bar" aria-hidden="true">
              <i style={{ width: matched ? `${(deliverable / matched) * 100}%` : 0, background: "#0061a6" }} />
              <i style={{ width: matched ? `${(unsuitable / matched) * 100}%` : 0, background: "#f59e0b" }} />
            </div>
            <div className="bs-small">
              {preview ? (
                <>
                  {preview.ogrenci_count ? `${preview.ogrenci_count} öğrenci` : null}
                  {preview.ogrenci_count && (preview.veli_count || preview.personel_count) ? " · " : null}
                  {preview.veli_count ? `${preview.veli_count} veli` : null}
                  {preview.veli_count && preview.personel_count ? " · " : null}
                  {preview.personel_count ? `${preview.personel_count} personel` : null}
                  {" "}
                  <button type="button" className="bs-counter-link" onClick={() => setShowRecipients(true)}>listeyi gör</button>
                </>
              ) : previewError ? (
                <span style={{ color: "var(--bs-bad)" }}>{previewError}</span>
              ) : (
                "Kişi türü seçin veya kişi ekleyin."
              )}
            </div>
          </div>
        </div>

        {!isCoach && (deliverable > 0) && (
          <div className="bs-toolbar" style={{ marginTop: 12 }}>
            <input
              className="bs-input grow"
              placeholder="Bu kitleyi kaydet (ör. 9. sınıf velileri)"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <button
              type="button"
              className="bs-btn"
              disabled={!saveName.trim() || saveBusy}
              onClick={async () => {
                setSaveBusy(true);
                try { await onSaveAudience(saveName.trim()); setSaveName(""); } finally { setSaveBusy(false); }
              }}
            >
              Kaydet
            </button>
          </div>
        )}
        {saved.length > 0 && !isCoach && (
          <details className="bs-collapse">
            <summary>Kayıtlı kitleler <small>{saved.length}</small></summary>
            <div className="bs-pills" style={{ marginTop: 6 }}>
              {saved.map((s) => (
                <span key={s.id} className="bs-pill">
                  <button type="button" style={{ padding: 0, fontWeight: 600 }} onClick={() => setQuery({ ...s.query, audience_type: "query" })}>{s.name}</button>
                  {s.counts?.deliverable_count != null && <small className="bs-muted">· {s.counts.deliverable_count}</small>}
                  <button type="button" aria-label="Sil" onClick={() => void onDeleteSaved(s.id)}>×</button>
                </span>
              ))}
            </div>
          </details>
        )}
      </section>

      {showRecipients && (
        <RecipientsModal
          query={query}
          allowPersonel={!isCoach}
          onClose={() => setShowRecipients(false)}
          onChangeQuery={setQuery}
        />
      )}
    </>
  );
}
