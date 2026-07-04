"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadColumnOrder,
  loadVisibleColumns,
  reorderColumnOrder,
  saveColumnOrder,
  saveVisibleColumns,
  toggleVisibleColumn,
  type ColumnMeta,
} from "./column-order-utils";
import { TableGripIcon } from "./useReorderableColumns";

export function useFinansTableColumns<T extends string>(
  storageKey: string,
  defaultOrder: readonly T[],
  columns: Record<T, ColumnMeta>
) {
  const [columnOrder, setColumnOrder] = useState<T[]>([...defaultOrder]);
  const [visibleColumns, setVisibleColumns] = useState<T[]>([...defaultOrder]);
  const [dragCol, setDragCol] = useState<T | null>(null);
  const [overCol, setOverCol] = useState<T | null>(null);

  useEffect(() => {
    setColumnOrder(loadColumnOrder(storageKey, defaultOrder, columns));
    setVisibleColumns(loadVisibleColumns(storageKey, defaultOrder, columns));
  }, [storageKey, defaultOrder, columns]);

  const displayOrder = useMemo(
    () => columnOrder.filter((id) => visibleColumns.includes(id)),
    [columnOrder, visibleColumns]
  );

  const handleDrop = (targetId: T) => {
    if (!dragCol || dragCol === targetId) return;
    const next = reorderColumnOrder(columnOrder, dragCol, targetId);
    setColumnOrder(next);
    saveColumnOrder(storageKey, next);
    setDragCol(null);
    setOverCol(null);
  };

  const toggleColumn = useCallback(
    (colId: T) => {
      setVisibleColumns((prev) => {
        const next = toggleVisibleColumn(prev, colId, columnOrder);
        saveVisibleColumns(storageKey, next);
        return next;
      });
    },
    [columnOrder, storageKey]
  );

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
        className={`finans-th-draggable${isDragging ? " is-dragging" : ""}${isOver ? " is-over" : ""}${col.align === "right" ? " text-right" : col.align === "center" ? " text-center" : ""}`}
        style={{ textAlign: col.align, width: col.width }}
      >
        <span
          className={`finans-th-inner${col.align === "right" ? " finans-th-inner--right" : ""}`}
        >
          <TableGripIcon />
          {col.label}
        </span>
      </th>
    );
  };

  const exportColumns = useMemo(
    () =>
      displayOrder
        .filter((id) => columns[id].hideable !== false)
        .map((id) => ({
          key: columns[id].exportKey || id,
          label: columns[id].label,
        })),
    [displayOrder, columns]
  );

  return {
    columnOrder,
    visibleColumns,
    displayOrder,
    exportColumns,
    renderHeader,
    toggleColumn,
    setVisibleColumns: (next: T[]) => {
      setVisibleColumns(next);
      saveVisibleColumns(storageKey, next);
    },
  };
}
