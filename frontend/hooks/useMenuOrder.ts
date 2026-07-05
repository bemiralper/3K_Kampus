"use client";

import { useCallback, useEffect, useState } from "react";

function mergeOrder(saved: string[], defaultIds: string[]): string[] {
  const valid = saved.filter((id) => defaultIds.includes(id));
  const missing = defaultIds.filter((id) => !valid.includes(id));
  return valid.length > 0 ? [...valid, ...missing] : defaultIds;
}

/** Ana menü sırası — localStorage + sürükle-bırak */
export function useMenuOrder(storageKey: string, defaultIds: string[]) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() => defaultIds);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const parsed: string[] = JSON.parse(saved);
      setOrderedIds(mergeOrder(parsed, defaultIds));
    } catch {
      /* ignore */
    }
  }, [storageKey, defaultIds.join(",")]);

  const reorder = useCallback(
    (fromId: string, toId: string, position: "before" | "after") => {
      setOrderedIds((prev) => {
        const next = prev.filter((id) => id !== fromId);
        const targetIdx = next.indexOf(toId);
        if (targetIdx === -1) return prev;
        const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
        next.splice(insertIdx, 0, fromId);
        localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
    [storageKey],
  );

  const getOrdered = useCallback(
    <T extends { id: string }>(items: T[]): T[] => {
      const map = new Map(items.map((i) => [i.id, i]));
      const result: T[] = [];
      for (const id of orderedIds) {
        const item = map.get(id);
        if (item) result.push(item);
      }
      for (const item of items) {
        if (!result.find((r) => r.id === item.id)) result.push(item);
      }
      return result;
    },
    [orderedIds],
  );

  return { reorder, getOrdered, orderedIds };
}

/** Alt menü sırası — parentId başına localStorage */
export function useSubmenuOrderMap(
  storageKeyPrefix: string,
  parents: { id: string; childIds: string[] }[],
) {
  const [orderMap, setOrderMap] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const p of parents) init[p.id] = p.childIds;
    return init;
  });

  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const p of parents) {
      const key = `${storageKeyPrefix}-${p.id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const parsed: string[] = JSON.parse(saved);
          next[p.id] = mergeOrder(parsed, p.childIds);
          continue;
        } catch {
          /* fall through */
        }
      }
      next[p.id] = p.childIds;
    }
    setOrderMap(next);
  }, [storageKeyPrefix, parents.map((p) => `${p.id}:${p.childIds.join(",")}`).join("|")]);

  const reorderSubmenu = useCallback(
    (parentId: string, fromId: string, toId: string, position: "before" | "after") => {
      setOrderMap((prev) => {
        const defaultIds =
          parents.find((p) => p.id === parentId)?.childIds || prev[parentId] || [];
        const current = prev[parentId] || defaultIds;
        const next = current.filter((id) => id !== fromId);
        const targetIdx = next.indexOf(toId);
        if (targetIdx === -1) return prev;
        const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
        next.splice(insertIdx, 0, fromId);
        localStorage.setItem(`${storageKeyPrefix}-${parentId}`, JSON.stringify(next));
        return { ...prev, [parentId]: next };
      });
    },
    [storageKeyPrefix, parents],
  );

  const getOrderedChildren = useCallback(
    <T extends { id?: string; href: string }>(parentId: string, children: T[]): T[] => {
      const defaultIds =
        parents.find((p) => p.id === parentId)?.childIds || children.map((c) => c.id || c.href);
      const orderedIds = orderMap[parentId] || defaultIds;
      const map = new Map(children.map((c) => [(c.id || c.href) as string, c]));
      const result: T[] = [];
      for (const id of orderedIds) {
        const item = map.get(id);
        if (item) result.push(item);
      }
      for (const item of children) {
        const key = (item.id || item.href) as string;
        if (!result.find((r) => (r.id || r.href) === key)) result.push(item);
      }
      return result;
    },
    [orderMap, parents],
  );

  return { reorderSubmenu, getOrderedChildren };
}
