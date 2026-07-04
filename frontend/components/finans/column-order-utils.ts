export type ColumnMeta = {
  label: string;
  align?: "right" | "center";
  width?: string;
  /** Rapor dışa aktarmada kullanılacak alan anahtarı */
  exportKey?: string;
  /** false ise kolon seçicide gizlenir (ör. işlem) */
  hideable?: boolean;
  defaultVisible?: boolean;
};

export function loadColumnOrder<T extends string>(
  storageKey: string,
  defaultOrder: readonly T[],
  validIds: Record<string, unknown>
): T[] {
  if (typeof window === "undefined") return [...defaultOrder];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [...defaultOrder];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...defaultOrder];

    const seen = new Set<T>();
    const order: T[] = [];
    for (const id of parsed) {
      if (typeof id === "string" && id in validIds && !seen.has(id as T)) {
        seen.add(id as T);
        order.push(id as T);
      }
    }
    for (const id of defaultOrder) {
      if (!seen.has(id)) order.push(id);
    }
    return order.length ? order : [...defaultOrder];
  } catch {
    return [...defaultOrder];
  }
}

export function saveColumnOrder<T extends string>(storageKey: string, order: T[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

export function reorderColumnOrder<T extends string>(
  order: T[],
  from: T,
  to: T
): T[] {
  if (from === to) return order;
  const next = [...order];
  const fromIdx = next.indexOf(from);
  const toIdx = next.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return order;
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, from);
  return next;
}

function visibilityStorageKey(orderKey: string): string {
  return `${orderKey}_visible_v1`;
}

export function loadVisibleColumns<T extends string>(
  orderKey: string,
  defaultOrder: readonly T[],
  columns: Record<T, ColumnMeta>
): T[] {
  if (typeof window === "undefined") {
    return defaultOrder.filter((id) => columns[id]?.defaultVisible !== false);
  }
  try {
    const raw = localStorage.getItem(visibilityStorageKey(orderKey));
    if (!raw) {
      return defaultOrder.filter((id) => columns[id]?.defaultVisible !== false);
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return defaultOrder.filter((id) => columns[id]?.defaultVisible !== false);
    }
    const valid = parsed.filter(
      (id): id is T => typeof id === "string" && id in columns
    );
    return valid.length ? valid : defaultOrder.filter((id) => columns[id]?.defaultVisible !== false);
  } catch {
    return defaultOrder.filter((id) => columns[id]?.defaultVisible !== false);
  }
}

export function saveVisibleColumns<T extends string>(orderKey: string, visible: T[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(visibilityStorageKey(orderKey), JSON.stringify(visible));
  } catch {
    /* ignore */
  }
}

export function toggleVisibleColumn<T extends string>(
  visible: T[],
  colId: T,
  columnOrder: T[]
): T[] {
  if (visible.includes(colId)) {
    const next = visible.filter((id) => id !== colId);
    return next.length ? next : visible;
  }
  const merged = [...visible, colId].sort(
    (a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b)
  );
  return merged;
}
