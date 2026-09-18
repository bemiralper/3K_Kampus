import type { ScheduleGridCell, ScheduleGridSlot } from "@/lib/academic-api";

export type ScheduleGridRow = {
  key: string;
  slot: ScheduleGridSlot;
  slotIds: number[];
};

/** Aynı saatli satırları birleştir; sıralama duvar saatine göre (akşam alta). */
export function groupScheduleSlots(slots: ScheduleGridSlot[]): ScheduleGridRow[] {
  const map = new Map<string, ScheduleGridRow>();
  const sorted = [...slots].sort((a, b) => {
    const aStart = a.start || "99:99";
    const bStart = b.start || "99:99";
    if (aStart !== bStart) return aStart.localeCompare(bStart);
    const aEnd = a.end || "";
    const bEnd = b.end || "";
    if (aEnd !== bEnd) return aEnd.localeCompare(bEnd);
    return (a.order || 0) - (b.order || 0);
  });
  for (const slot of sorted) {
    const key = `${slot.start || ""}-${slot.end || ""}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { key, slot, slotIds: [slot.id] });
    } else if (!existing.slotIds.includes(slot.id)) {
      existing.slotIds.push(slot.id);
    }
  }
  return [...map.values()];
}

export function cellForRow(
  row: ScheduleGridRow,
  dayId: number,
  cellMap: Map<string, ScheduleGridCell>,
): ScheduleGridCell | undefined {
  for (const slotId of row.slotIds) {
    const cell = cellMap.get(`${dayId}:${slotId}`);
    if (cell) return cell;
  }
  return undefined;
}

export function slotTimeLabel(slot: ScheduleGridSlot, cell?: ScheduleGridCell | null): string {
  const start = cell?.start || slot.start;
  const end = cell?.end || slot.end;
  return [start, end].filter(Boolean).join(" – ");
}
