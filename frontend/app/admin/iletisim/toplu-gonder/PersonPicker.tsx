"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AudiencePersonType,
  BulkRecipientGroup,
  BulkRecipientHit,
  searchAudiencePeople,
} from "@/lib/communication-api";
import { personTypeLabel } from "./audience-utils";

interface PersonPickerProps {
  allowPersonel: boolean;
  excludeKeys?: Set<string>;
  onPickMany: (hits: BulkRecipientHit[]) => void;
}

const hitKey = (hit: BulkRecipientHit) => `${hit.kind}:${hit.id}`;

/** Eski API'ler `groups` göndermezse düz listeden aile grupları türet. */
function groupsFromResults(results: BulkRecipientHit[]): BulkRecipientGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, BulkRecipientGroup>();
  for (const hit of results) {
    const key = hit.group_key
      || (hit.kind === "personel" ? "personel" : `${hit.kind}:${hit.ogrenci_id ?? hit.id}`);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        kind: hit.kind === "personel" ? "personel" : "aile",
        label: hit.kind === "veli" ? hit.ogrenci_name || hit.label : hit.label,
        meta: hit.kind === "ogrenci" ? hit.sinif : undefined,
        items: [],
      };
      byKey.set(key, group);
      order.push(key);
    }
    group.items.push(hit);
  }
  return order.map((key) => byKey.get(key)!);
}

export default function PersonPicker({
  allowPersonel,
  excludeKeys,
  onPickMany,
}: PersonPickerProps) {
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<BulkRecipientGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, BulkRecipientHit>>({});

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setGroups([]);
      return;
    }
    const id = window.setTimeout(() => {
      setLoading(true);
      const kinds: AudiencePersonType[] = allowPersonel
        ? ["ogrenci", "veli", "personel"]
        : ["ogrenci", "veli"];
      searchAudiencePeople(needle, { kinds, includePersonel: allowPersonel })
        .then((res) => setGroups(res.groups?.length ? res.groups : groupsFromResults(res.results || [])))
        .catch(() => setGroups([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(id);
  }, [q, allowPersonel]);

  // Zaten kitleye eklenmiş kişiler listede görünmez.
  const visibleGroups = useMemo(() => (
    groups
      .map((group) => ({ ...group, items: group.items.filter((hit) => !excludeKeys?.has(hitKey(hit))) }))
      .filter((group) => group.items.length > 0)
  ), [groups, excludeKeys]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  const toggle = useCallback((hit: BulkRecipientHit) => {
    setSelected((prev) => {
      const next = { ...prev };
      const key = hitKey(hit);
      if (next[key]) delete next[key];
      else next[key] = hit;
      return next;
    });
  }, []);

  const toggleGroup = useCallback((group: BulkRecipientGroup, on: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const hit of group.items) {
        if (on) next[hitKey(hit)] = hit;
        else delete next[hitKey(hit)];
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSelected({});
    setQ("");
    setGroups([]);
  }, []);

  const commit = useCallback(() => {
    if (selectedList.length === 0) return;
    onPickMany(selectedList);
    reset();
  }, [selectedList, onPickMany, reset]);

  const showPanel = loading || visibleGroups.length > 0 || q.trim().length >= 2;

  return (
    <div className="tg-people">
      <label className="tg-people-label" htmlFor="tg-person-search">Kişi ekle</label>
      <input
        id="tg-person-search"
        className="tg-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            reset();
          }
        }}
        placeholder="Ad, soyad veya telefon — öğrenci arayınca velisi de listelenir"
        autoComplete="off"
      />

      {showPanel && (
        <div className="tg-people-list">
          {loading && <div className="tg-empty">Aranıyor…</div>}
          {!loading && q.trim().length >= 2 && visibleGroups.length === 0 && (
            <div className="tg-empty">Kişi bulunamadı.</div>
          )}

          {visibleGroups.map((group) => {
            const allOn = group.items.every((hit) => selected[hitKey(hit)]);
            return (
              <div key={group.key} className="tg-fam">
                <div className="tg-fam-head">
                  <span className="tg-fam-title">
                    {group.kind === "aile" ? group.label : "Personel"}
                    {group.meta ? <small>{group.meta}</small> : null}
                  </span>
                  <button
                    type="button"
                    className="tg-fam-all"
                    onClick={() => toggleGroup(group, !allOn)}
                  >
                    {allOn ? "Seçimi kaldır" : `Tümünü seç (${group.items.length})`}
                  </button>
                </div>
                {group.items.map((hit) => {
                  const key = hitKey(hit);
                  const on = Boolean(selected[key]);
                  return (
                    <button
                      key={key}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      className={`tg-opt tg-opt-card tg-fam-row${on ? " is-on" : ""}`}
                      onClick={() => toggle(hit)}
                    >
                      <span className={`tg-check${on ? " is-on" : ""}`} aria-hidden="true" />
                      <span className="tg-fam-row-text">
                        <strong>{hit.label}</strong>
                        <span>
                          {hit.role || personTypeLabel(hit.kind)}
                          {hit.phone ? ` · ${hit.phone}` : " · telefon yok"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {selectedList.length > 0 && (
            <div className="tg-people-actions">
              <span>{selectedList.length} kişi seçildi</span>
              <div>
                <button type="button" className="tg-btn" onClick={() => setSelected({})}>Temizle</button>
                <button type="button" className="tg-btn-primary" onClick={commit}>Kitleye ekle</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
