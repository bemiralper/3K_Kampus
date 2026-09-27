"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  removeIncluded,
  unexcludePerson,
} from "./audience-utils";
import PersonPicker from "./PersonPicker";

interface RecipientsModalProps {
  query: AudienceFilter;
  allowPersonel: boolean;
  onClose: () => void;
  onChangeQuery: (query: AudienceFilter) => void;
}

const PAGE_SIZE = 25;

export default function RecipientsModal({
  query,
  allowPersonel,
  onClose,
  onChangeQuery,
}: RecipientsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<AudienceRecipientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAudienceRecipients(query, { page, pageSize: PAGE_SIZE })
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

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const html = document.documentElement;
    const locked: HTMLElement[] = [html, document.body];
    document.querySelectorAll(".app-main, .app-content, .coach-main, .coach-content").forEach((el) => {
      locked.push(el as HTMLElement);
    });
    const previous = locked.map((el) => el.style.overflow);
    html.classList.add("bs-rcpt-lock");
    locked.forEach((el) => { el.style.overflow = "hidden"; });

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement
        && active.closest(".bs-rcpt-search")
        && active.value.trim()
      ) {
        return;
      }
      event.preventDefault();
      onCloseRef.current();
    };
    const stopBackgroundScroll = (event: WheelEvent | TouchEvent) => {
      const node = event.target instanceof Element
        ? event.target
        : event.target instanceof Node
          ? event.target.parentElement
          : null;
      const scroller = node?.closest(".bs-rcpt-list, .tg-people-list");
      if (!(scroller instanceof HTMLElement)) {
        event.preventDefault();
        return;
      }
      if (!(event instanceof WheelEvent)) return;
      const atTop = scroller.scrollTop <= 0 && event.deltaY < 0;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 && event.deltaY > 0;
      if (atTop || atBottom || scroller.scrollHeight <= scroller.clientHeight) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("wheel", stopBackgroundScroll, { passive: false, capture: true });
    document.addEventListener("touchmove", stopBackgroundScroll, { passive: false, capture: true });
    dialogRef.current?.focus();

    return () => {
      html.classList.remove("bs-rcpt-lock");
      locked.forEach((el, index) => { el.style.overflow = previous[index]; });
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("wheel", stopBackgroundScroll, true);
      document.removeEventListener("touchmove", stopBackgroundScroll, true);
    };
  }, []);

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

  const includeHits = (hits: BulkRecipientHit[]) => {
    onChangeQuery(hits.reduce((acc, hit) => includePerson(acc, hit.kind, hit.id), query));
  };

  const removeHit = (hit: BulkRecipientHit) => {
    onChangeQuery(removeIncluded(query, hit.kind, hit.id));
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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const pickedKeys = new Set([
    ...(query.included_ogrenci_ids || []).map((id) => `ogrenci:${id}`),
    ...(query.included_veli_ids || []).map((id) => `veli:${id}`),
    ...(query.included_personel_ids || []).map((id) => `personel:${id}`),
  ]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="bs-rcpt-back" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="bs-rcpt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bs-rcpt-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="bs-rcpt-head">
          <div>
            <h2 id="bs-rcpt-title">Alıcılar</h2>
            <p>
              {loading && total === 0
                ? "Liste hazırlanıyor"
                : `${total.toLocaleString("tr-TR")} kişi bu kitlenin içinde`}
            </p>
          </div>
          <button type="button" className="bs-rcpt-close" onClick={onClose}>
            Kapat
            <kbd>Esc</kbd>
          </button>
        </header>

        <div className="bs-rcpt-search">
          <span>Kitleye kişi ekle</span>
          <PersonPicker
            embedded
            allowPersonel={allowPersonel}
            addedKeys={pickedKeys}
            onPickMany={includeHits}
            onRemove={removeHit}
          />
        </div>

        <div className="bs-rcpt-list">
          {loading ? (
            <p className="bs-rcpt-empty">Liste yükleniyor…</p>
          ) : rows.length === 0 ? (
            <p className="bs-rcpt-empty">Bu kitlede gösterilecek kişi yok.</p>
          ) : (
            <table className="bs-rcpt-table">
              <thead>
                <tr>
                  <th className="bs-rcpt-check">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && pageSelected.length === rows.length}
                      onChange={(e) => togglePage(e.target.checked)}
                      aria-label="Sayfadakilerin tümünü seç"
                    />
                  </th>
                  <th>Ad soyad</th>
                  <th className="bs-rcpt-extra">Kişi türü</th>
                  <th className="bs-rcpt-extra">Sınıf / Rol</th>
                  <th className="bs-rcpt-extra">Şube</th>
                  <th className="bs-rcpt-extra">Koç</th>
                  <th>Telefon</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const selected = !excluded.has(rowKey(row));
                  return (
                    <tr
                      key={row.key}
                      className={selected ? "" : "is-off"}
                      onClick={() => toggleRow(row, !selected)}
                    >
                      <td className="bs-rcpt-check">
                        <input
                          type="checkbox"
                          checked={selected}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => toggleRow(row, event.target.checked)}
                          aria-label={`${row.display_name} seç`}
                        />
                      </td>
                      <td>
                        <strong>{row.display_name}</strong>
                        {!row.deliverable && (
                          <em>{row.skip_reason || "Uygun değil"}</em>
                        )}
                      </td>
                      <td className="bs-rcpt-extra">
                        <span className={`bs-rcpt-type is-${row.person_type}`}>
                          {personTypeLabel(row.person_type)}
                        </span>
                      </td>
                      <td className="bs-rcpt-extra">{row.class_or_role || "—"}</td>
                      <td className="bs-rcpt-extra">{row.sube_name || "—"}</td>
                      <td className="bs-rcpt-extra">{row.coach_name || "—"}</td>
                      <td className="bs-rcpt-phone">{row.phone || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="bs-rcpt-foot">
          <span>
            {total === 0
              ? "0 kişi"
              : `${rangeStart.toLocaleString("tr-TR")}–${rangeEnd.toLocaleString("tr-TR")} / ${total.toLocaleString("tr-TR")}`}
          </span>
          <div>
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              Önceki
            </button>
            <b>{page} / {pageCount}</b>
            <button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((p) => p + 1)}>
              Sonraki
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
