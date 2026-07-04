"use client";

import { useEffect, useState, useCallback } from "react";
import { COACH_NAV_ITEMS, type CoachNavItemDef } from "@/components/coach/coachNavItems";

const STORAGE_KEY = "coach-sidebar-menu-order";

export function useCoachMenuOrder() {
  const defaultIds = COACH_NAV_ITEMS.map((i) => i.id);
  const [orderedIds, setOrderedIds] = useState<string[]>(defaultIds);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed: string[] = JSON.parse(saved);
      const valid = parsed.filter((id) => defaultIds.includes(id));
      const missing = defaultIds.filter((id) => !valid.includes(id));
      if (valid.length > 0) setOrderedIds([...valid, ...missing]);
    } catch {
      /* ignore */
    }
  }, []);

  const reorder = useCallback((fromId: string, toId: string, position: "before" | "after") => {
    setOrderedIds((prev) => {
      const next = prev.filter((id) => id !== fromId);
      const targetIdx = next.indexOf(toId);
      if (targetIdx === -1) return prev;
      const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
      next.splice(insertIdx, 0, fromId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getOrderedItems = useCallback((): CoachNavItemDef[] => {
    const map = new Map(COACH_NAV_ITEMS.map((i) => [i.id, i]));
    const result: CoachNavItemDef[] = [];
    for (const id of orderedIds) {
      const item = map.get(id);
      if (item) result.push(item);
    }
    for (const item of COACH_NAV_ITEMS) {
      if (!result.find((r) => r.id === item.id)) result.push(item);
    }
    return result;
  }, [orderedIds]);

  return { reorder, getOrderedItems };
}
