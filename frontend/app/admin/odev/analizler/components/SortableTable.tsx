"use client";

import React, { useMemo, useState } from "react";

export type SortableColumn<T> = {
  key: keyof T & string;
  label: string;
  /** Sütun başlığında tooltip olarak gösterilir */
  hint?: string;
  type?: "text" | "number";
  render?: (row: T, index: number) => React.ReactNode;
};

type Props<T> = {
  columns: SortableColumn<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string | number;
  emptyLabel?: string;
};

export default function SortableTable<T extends Record<string, any>>({
  columns,
  rows,
  rowKey,
  emptyLabel = "Veri yok",
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    const type = col?.type || "text";
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (type === "number") {
        cmp = (Number(av) || 0) - (Number(bv) || 0);
      } else {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""), "tr", {
          sensitivity: "base",
          numeric: true,
        });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir, columns]);

  const onHeaderClick = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f8fafc", textAlign: "left" }}>
            <th style={{ padding: "8px 10px", width: 48, color: "#64748b" }}>#</th>
            {columns.map((col) => {
              const active = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  style={{
                    padding: "8px 10px",
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                    color: active ? "#0061a6" : undefined,
                  }}
                  onClick={() => onHeaderClick(col.key)}
                  title={col.hint ? `${col.hint} (sıralamak için tıklayın)` : "Sıralamak için tıklayın"}
                >
                  {col.label}
                  {active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row, i) : i}
              style={{ borderTop: "1px solid #e2e8f0" }}
            >
              <td style={{ padding: "8px 10px", color: "#94a3b8" }}>{i + 1}</td>
              {columns.map((col) => (
                <td key={col.key} style={{ padding: "8px 10px" }}>
                  {col.render ? col.render(row, i) : (row[col.key] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
          {!sorted.length && (
            <tr>
              <td
                colSpan={columns.length + 1}
                style={{ padding: 16, color: "#64748b" }}
              >
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
