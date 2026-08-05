'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_VISIBLE_LIST_COLUMNS,
  LIST_COLUMNS,
  LIST_COLUMN_IDS,
  OGRENCI_LIST_COLUMNS_STORAGE_KEY,
  type OgrenciListColumnId,
} from '../lib/ogrenci-list-utils';

const VALID = new Set<string>(LIST_COLUMN_IDS);
const LOCKED = new Set(
  LIST_COLUMNS.filter((c) => c.locked).map((c) => c.id),
);

function normalizeVisible(raw: unknown): OgrenciListColumnId[] {
  const fromStore = Array.isArray(raw)
    ? raw.filter((id): id is OgrenciListColumnId => typeof id === 'string' && VALID.has(id))
    : [];
  const set = new Set<OgrenciListColumnId>(fromStore);
  for (const id of LOCKED) set.add(id);
  // Tanım sırasını koru
  return LIST_COLUMN_IDS.filter((id) => set.has(id));
}

function loadVisible(): OgrenciListColumnId[] {
  if (typeof window === 'undefined') return [...DEFAULT_VISIBLE_LIST_COLUMNS];
  try {
    const raw = localStorage.getItem(OGRENCI_LIST_COLUMNS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_VISIBLE_LIST_COLUMNS];
    return normalizeVisible(JSON.parse(raw));
  } catch {
    return [...DEFAULT_VISIBLE_LIST_COLUMNS];
  }
}

function saveVisible(ids: OgrenciListColumnId[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OGRENCI_LIST_COLUMNS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function useOgrenciListColumns() {
  const [visibleColumns, setVisibleColumns] = useState<OgrenciListColumnId[]>([
    ...DEFAULT_VISIBLE_LIST_COLUMNS,
  ]);

  useEffect(() => {
    setVisibleColumns(loadVisible());
  }, []);

  const toggleColumn = useCallback((id: OgrenciListColumnId) => {
    if (LOCKED.has(id)) return;
    setVisibleColumns((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      for (const locked of LOCKED) nextSet.add(locked);
      const next = LIST_COLUMN_IDS.filter((col) => nextSet.has(col));
      saveVisible(next);
      return next;
    });
  }, []);

  const resetColumns = useCallback(() => {
    const next = [...DEFAULT_VISIBLE_LIST_COLUMNS];
    saveVisible(next);
    setVisibleColumns(next);
  }, []);

  const isVisible = useCallback(
    (id: OgrenciListColumnId) => visibleColumns.includes(id),
    [visibleColumns],
  );

  const toggleableColumns = useMemo(
    () => LIST_COLUMNS.filter((c) => !c.locked),
    [],
  );

  return {
    columns: LIST_COLUMNS,
    toggleableColumns,
    visibleColumns,
    isVisible,
    toggleColumn,
    resetColumns,
  };
}
