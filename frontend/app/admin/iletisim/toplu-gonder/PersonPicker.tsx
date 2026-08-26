"use client";

import { useEffect, useState } from "react";
import {
  AudiencePersonType,
  BulkRecipientHit,
  searchAudiencePeople,
} from "@/lib/communication-api";
import { personTypeLabel } from "./audience-utils";

interface PersonPickerProps {
  allowPersonel: boolean;
  excludeKeys?: Set<string>;
  onPick: (hit: BulkRecipientHit) => void;
}

export default function PersonPicker({
  allowPersonel,
  excludeKeys,
  onPick,
}: PersonPickerProps) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<BulkRecipientHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setHits([]);
      return;
    }
    const id = window.setTimeout(() => {
      setLoading(true);
      const kinds: AudiencePersonType[] = allowPersonel
        ? ["ogrenci", "veli", "personel"]
        : ["ogrenci", "veli"];
      searchAudiencePeople(needle, { kinds, includePersonel: allowPersonel })
        .then((res) => setHits(res.results || []))
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(id);
  }, [q, allowPersonel]);

  const visible = hits.filter((hit) => !excludeKeys?.has(`${hit.kind}:${hit.id}`));

  return (
    <div className="tg-people">
      <label className="tg-people-label">Kişi ekle</label>
      <input
        className="tg-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ad, soyad veya telefon — öğrenci, veli, personel karışık"
      />
      {(loading || visible.length > 0 || q.trim().length >= 2) && (
        <div className="tg-people-list">
          {loading && <div className="tg-empty">Aranıyor…</div>}
          {!loading && q.trim().length >= 2 && visible.length === 0 && (
            <div className="tg-empty">Kişi bulunamadı.</div>
          )}
          {visible.map((hit) => (
            <button
              key={`${hit.kind}-${hit.id}`}
              type="button"
              className="tg-opt tg-opt-card"
              onClick={() => {
                onPick(hit);
                setQ("");
                setHits([]);
              }}
            >
              <strong>{hit.label}</strong>
              <span>
                {personTypeLabel(hit.kind)}
                {hit.meta ? ` · ${hit.meta}` : ""}
                {hit.phone ? ` · ${hit.phone}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
