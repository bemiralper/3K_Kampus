"use client";

import React from "react";
import {
  useFinansTableColumns,
} from "./useFinansTableColumns";
import type { ColumnMeta } from "./column-order-utils";
import "./finans-list.css";

type FinansDataTableProps<T extends string, Row> = {
  storageKey: string;
  defaultOrder: readonly T[];
  columns: Record<T, ColumnMeta>;
  items: Row[];
  rowKey: (row: Row) => string | number;
  renderCell: (colId: T, row: Row) => React.ReactNode;
  emptyMessage?: string;
  onColumnsReady?: (api: {
    displayOrder: T[];
    exportColumns: { key: string; label: string }[];
    visibleColumns: T[];
    toggleColumn: (id: T) => void;
    columnOrder: T[];
    columns: Record<T, ColumnMeta>;
  }) => void;
};

export default function FinansDataTable<T extends string, Row>({
  storageKey,
  defaultOrder,
  columns,
  items,
  rowKey,
  renderCell,
  emptyMessage = "Kayıt bulunamadı",
  onColumnsReady,
}: FinansDataTableProps<T, Row>) {
  const tableCols = useFinansTableColumns(storageKey, defaultOrder, columns);
  const { displayOrder, renderHeader } = tableCols;

  React.useEffect(() => {
    onColumnsReady?.({
      displayOrder: tableCols.displayOrder,
      exportColumns: tableCols.exportColumns,
      visibleColumns: tableCols.visibleColumns,
      toggleColumn: tableCols.toggleColumn,
      columnOrder: tableCols.columnOrder,
      columns,
    });
  }, [
    onColumnsReady,
    tableCols.displayOrder,
    tableCols.exportColumns,
    tableCols.visibleColumns,
    tableCols.toggleColumn,
    tableCols.columnOrder,
    columns,
  ]);

  if (items.length === 0) {
    return (
      <div className="finans-table-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="finans-table-wrap finans-table-wrap--modern">
      <table className="table-modern table-modern--cari">
        <thead>
          <tr>{displayOrder.map((colId) => renderHeader(colId))}</tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={rowKey(row)}>
              {displayOrder.map((colId) => {
                const col = columns[colId];
                return (
                  <td
                    key={colId}
                    data-col={colId}
                    style={{ textAlign: col.align }}
                    className="finans-td-modern"
                  >
                    {renderCell(colId, row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
