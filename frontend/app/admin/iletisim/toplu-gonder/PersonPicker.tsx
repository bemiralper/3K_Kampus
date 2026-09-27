"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AudiencePersonType,
  BulkRecipientGroup,
  BulkRecipientHit,
  searchAudiencePeople,
} from "@/lib/communication-api";
import { personTypeLabel } from "./audience-utils";

interface PersonPickerProps {
  allowPersonel: boolean;
  /** Kitleye çoktan eklenmiş kişiler. Listede kalır, renkli işaretlenir. */
  addedKeys?: Set<string>;
  onPickMany: (hits: BulkRecipientHit[]) => void;
  onRemove?: (hit: BulkRecipientHit) => void;
  autoFocus?: boolean;
  /** Toplu gönderim kartının içine gömülü arama. */
  embedded?: boolean;
  /** Arama kutusu ile sonuçlar arasında, eklenen kişiler. */
  children?: ReactNode;
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
  addedKeys,
  onPickMany,
  onRemove,
  autoFocus = false,
  embedded = false,
  children,
}: PersonPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!autoFocus) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [autoFocus]);
  const [groups, setGroups] = useState<BulkRecipientGroup[]>([]);
  const [loading, setLoading] = useState(false);

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

  const visibleGroups = useMemo(
    () => groups.filter((group) => group.items.length > 0),
    [groups],
  );

  const clearSearch = () => {
    setQ("");
    setGroups([]);
  };

  const activate = (hit: BulkRecipientHit) => {
    if (addedKeys?.has(hitKey(hit))) onRemove?.(hit);
    else onPickMany([hit]);
  };

  const addPending = (group: BulkRecipientGroup) => {
    const pending = group.items.filter((hit) => !addedKeys?.has(hitKey(hit)));
    if (pending.length) onPickMany(pending);
  };

  const showPanel = loading || visibleGroups.length > 0 || q.trim().length >= 2;

  return (
    <div className={embedded ? "tg-people bs-who-picker" : "tg-people"}>
      <label className="tg-people-label" htmlFor={inputId}>Kişi ekle</label>
      <input
        id={inputId}
        ref={inputRef}
        className="tg-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const first = visibleGroups
              .flatMap((group) => group.items)
              .find((hit) => !addedKeys?.has(hitKey(hit)));
            if (first) onPickMany([first]);
          } else if (e.key === "Escape" && q.trim()) {
            e.stopPropagation();
            clearSearch();
          }
        }}
        placeholder="Ad, soyad veya telefon — öğrenci yazınca velisi de listelenir"
        autoComplete="off"
      />

      {children}

      {showPanel && (
        <div className="tg-people-panel">
          <div className="tg-people-list">
            {loading && <div className="tg-empty">Aranıyor…</div>}
            {!loading && q.trim().length >= 2 && visibleGroups.length === 0 && (
              <div className="tg-empty">Kişi bulunamadı.</div>
            )}

            {visibleGroups.map((group) => {
              const pending = group.items.filter((hit) => !addedKeys?.has(hitKey(hit)));
              return (
                <div key={group.key} className="tg-fam">
                  <div className="tg-fam-head">
                    <span className="tg-fam-title">
                      {group.kind === "aile" ? group.label : "Personel"}
                      {group.meta ? <small>{group.meta}</small> : null}
                    </span>
                    {group.items.length > 1 && pending.length > 0 && (
                      <button
                        type="button"
                        className="tg-fam-all"
                        onClick={() => addPending(group)}
                      >
                        {pending.length === group.items.length
                          ? `Tümünü ekle (${group.items.length})`
                          : `Kalanı ekle (${pending.length})`}
                      </button>
                    )}
                  </div>
                  {group.items.map((hit) => {
                    const added = Boolean(addedKeys?.has(hitKey(hit)));
                    return (
                      <div
                        key={hitKey(hit)}
                        role="button"
                        aria-pressed={added}
                        tabIndex={0}
                        className={`tg-opt tg-opt-card tg-fam-row${added ? " is-added" : ""} is-${hit.kind}`}
                        onClick={() => activate(hit)}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            activate(hit);
                          }
                        }}
                      >
                        <span className={`bs-pick-mark${added ? " is-on" : ""}`} aria-hidden="true" />
                        <span className="tg-fam-row-text">
                          <strong>{hit.label}</strong>
                          <span>
                            {hit.role || personTypeLabel(hit.kind)}
                            {hit.phone ? ` · ${hit.phone}` : " · telefon yok"}
                          </span>
                        </span>
                        {added && <span className="bs-pick-state">Eklendi</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
