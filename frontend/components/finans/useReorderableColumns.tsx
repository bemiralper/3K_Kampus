"use client";

import { useEffect, useState } from "react";
import {
  loadColumnOrder,
  reorderColumnOrder,
  saveColumnOrder,
  type ColumnMeta,
} from "./column-order-utils";

export function TableGripIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ opacity: 0.25 }}>
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

export function useReorderableColumns<T extends string>(
  storageKey: string,
  defaultOrder: readonly T[],
  columns: Record<T, ColumnMeta>
) {
  const [columnOrder, setColumnOrder] = useState<T[]>([...defaultOrder]);
  const [dragCol, setDragCol] = useState<T | null>(null);
  const [overCol, setOverCol] = useState<T | null>(null);

  useEffect(() => {
    setColumnOrder(loadColumnOrder(storageKey, defaultOrder, columns));
  }, [storageKey, defaultOrder, columns]);

  const handleDrop = (targetId: T) => {
    if (!dragCol || dragCol === targetId) return;
    const next = reorderColumnOrder(columnOrder, dragCol, targetId);
    setColumnOrder(next);
    saveColumnOrder(storageKey, next);
    setDragCol(null);
    setOverCol(null);
  };

  const renderHeader = (colId: T) => {
    const col = columns[colId];
    const isDragging = dragCol === colId;
    const isOver = overCol === colId && dragCol !== colId;

    return (
      <th
        key={colId}
        draggable
        onDragStart={(e) => {
          setDragCol(colId);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOverCol(colId);
        }}
        onDragLeave={() => {
          if (overCol === colId) setOverCol(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop(colId);
        }}
        onDragEnd={() => {
          setDragCol(null);
          setOverCol(null);
        }}
        className={`finans-th-draggable${isDragging ? " is-dragging" : ""}${isOver ? " is-over" : ""}${col.align === "right" ? " text-right" : ""}`}
        style={{ textAlign: col.align, width: col.width }}
      >
        <span className={`finans-th-inner${col.align === "right" ? " finans-th-inner--right" : ""}`}>
          <TableGripIcon />
          {col.label}
        </span>
      </th>
    );
  };

  return { columnOrder, renderHeader };
}
