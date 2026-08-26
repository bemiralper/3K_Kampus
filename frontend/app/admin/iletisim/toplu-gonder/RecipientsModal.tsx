"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AudienceFilter,
  AudienceRecipientRow,
  BulkRecipientHit,
  fetchAudienceRecipients,
} from "@/lib/communication-api";
import {
  excludePerson,
  includePerson,
  personTypeLabel,
  unexcludePerson,
} from "./audience-utils";
import PersonPicker from "./PersonPicker";

interface RecipientsModalProps {
  query: AudienceFilter;
  allowPersonel: boolean;
  onClose: () => void;
  onChangeQuery: (query: AudienceFilter) => void;
}

export default function RecipientsModal({
  query,
  allowPersonel,
  onClose,
  onChangeQuery,
}: RecipientsModalProps) {
  const [rows, setRows] = useState<AudienceRecipientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAudienceRecipients(query, { page, pageSize: 25 })
      .then((res) => {
        if (cancelled) return;
        setRows(res.recipients || []);
        setTotal(res.recipients_total || 0);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [query, page]);

  const excluded = useMemo(() => new Set([
    ...(query.excluded_ogrenci_ids || []).map((id) => `ogrenci:${id}`),
    ...(query.excluded_veli_ids || []).map((id) => `veli:${id}`),
    ...(query.excluded_personel_ids || []).map((id) => `personel:${id}`),
  ]), [query]);

  const rowKey = (row: AudienceRecipientRow) => {
    if (row.person_type === "ogrenci" && row.ogrenci_id) return `ogrenci:${row.ogrenci_id}`;
    if (row.person_type === "veli" && row.veli_id) return `veli:${row.veli_id}`;
    if (row.person_type === "personel" && row.personel_id) return `personel:${row.personel_id}`;
    return row.key;
  };

  const rowKindId = (row: AudienceRecipientRow) => {
    if (row.person_type === "ogrenci" && row.ogrenci_id) return { kind: "ogrenci" as const, id: row.ogrenci_id };
    if (row.person_type === "veli" && row.veli_id) return { kind: "veli" as const, id: row.veli_id };
    if (row.person_type === "personel" && row.personel_id) return { kind: "personel" as const, id: row.personel_id };
    return null;
  };

  const toggleRow = (row: AudienceRecipientRow, selected: boolean) => {
    const target = rowKindId(row);
    if (!target) return;
    onChangeQuery(selected ? unexcludePerson(query, target.kind, target.id) : excludePerson(query, target.kind, target.id));
  };

  const includeHit = (hit: BulkRecipientHit) => {
    onChangeQuery(includePerson(query, hit.kind, hit.id));
  };

  const pageSelected = rows.filter((row) => !excluded.has(rowKey(row)));
  const togglePage = (selected: boolean) => {
    let next = query;
    for (const row of rows) {
      const target = rowKindId(row);
      if (!target) continue;
      next = selected ? unexcludePerson(next, target.kind, target.id) : excludePerson(next, target.kind, target.id);
    }
    onChangeQuery(next);
  };

  const pageCount = Math.max(1, Math.ceil(total / 25));
  const pickedKeys = new Set([
    ...(query.included_ogrenci_ids || []).map((id) => `ogrenci:${id}`),
    ...(query.included_veli_ids || []).map((id) => `veli:${id}`),
    ...(query.included_personel_ids || []).map((id) => `personel:${id}`),
  ]);

  return (
    <div className="tg-modal-back" role="dialog" aria-modal="true" aria-label="Alıcılar">
      <div className="tg-modal">
        <div className="tg-group-head">
          <div>
            <h2 style={{ margin: 0 }}>Alıcılar</h2>
            <p className="lead" style={{ marginBottom: 0 }}>{total} kişi bu kitlenin içinde</p>
          </div>
          <button type="button" className="tg-btn" onClick={onClose}>Kapat</button>
        </div>

        <PersonPicker
          allowPersonel={allowPersonel}
          excludeKeys={pickedKeys}
          onPick={includeHit}
        />

        {loading ? (
          <p className="tg-empty">Liste yükleniyor…</p>
        ) : (
          <table className="tg-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && pageSelected.length === rows.length}
                    onChange={(e) => togglePage(e.target.checked)}
                    aria-label="Sayfadakilerin tümünü seç"
                  />
                </th>
                <th>Ad soyad</th>
                <th>Kişi türü</th>
                <th>Sınıf / Rol</th>
                <th>Şube</th>
                <th>Koç</th>
                <th>Telefon</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = !excluded.has(rowKey(row));
                return (
                  <tr key={row.key} className={selected ? "" : "is-off"}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => toggleRow(row, e.target.checked)}
                        aria-label={`${row.display_name} seç`}
                      />
                    </td>
                    <td>
                      {row.display_name}
                      {!row.deliverable && (
                        <div><span className="tg-badge no">{row.skip_reason || "Uygun değil"}</span></div>
                      )}
                    </td>
                    <td><span className="tg-badge">{personTypeLabel(row.person_type)}</span></td>
                    <td>{row.class_or_role || "—"}</td>
                    <td>{row.sube_name || "—"}</td>
                    <td>{row.coach_name || "—"}</td>
                    <td>{row.phone || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {pageCount > 1 && (
          <div className="tg-footer" style={{ marginTop: 12 }}>
            <button type="button" className="tg-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Önceki</button>
            <span>{page} / {pageCount}</span>
            <button type="button" className="tg-btn" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Sonraki</button>
          </div>
        )}
      </div>
    </div>
  );
}
