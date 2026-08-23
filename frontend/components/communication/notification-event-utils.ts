import {
  NotificationEventCatalog,
  NotificationEventItem,
  NotificationEventSlot,
} from "@/lib/communication-api";

export const RECIPIENT_LABELS: Record<string, string> = {
  VELI: "Veli",
  OGRENCI: "Öğrenci",
  PERSONEL: "Personel",
};

export function eventTemplateGroup(event: NotificationEventItem | null | undefined): string {
  if (!event) return "";
  if (event.template_group) return event.template_group;
  if (event.module === "yoklama" && event.group) return `yoklama:${event.group}`;
  return event.module || "";
}

export function eventTemplateGroupLabel(event: NotificationEventItem | null | undefined): string {
  if (!event) return "Genel";
  if (event.template_group_label) return event.template_group_label;
  if (event.module === "yoklama" && event.group_label) {
    return `${event.module_label || "Yoklama"} — ${event.group_label}`;
  }
  return event.module_label || event.module || "Genel";
}

export function pickerValueOf(eventKey: string, recipient: string): string {
  return eventKey && recipient ? `${eventKey}::${recipient}` : "";
}

export function parsePickerValue(value: string): { eventKey: string; recipient: string } | null {
  const [eventKey, recipient] = (value || "").split("::");
  if (!eventKey || !recipient) return null;
  return { eventKey, recipient };
}

export interface EventSlotSelection {
  event: NotificationEventItem;
  slot: NotificationEventSlot;
  groupKey: string;
  groupLabel: string;
}

export function findEventSlot(
  catalog: NotificationEventCatalog | null | undefined,
  eventKey: string,
  recipient: string,
): EventSlotSelection | null {
  if (!catalog || !eventKey || !recipient) return null;
  const event = catalog.events.find((item) => item.key === eventKey);
  const slot = event?.slots.find((item) => item.recipient_type === recipient);
  if (!event || !slot) return null;
  return {
    event,
    slot,
    groupKey: eventTemplateGroup(event),
    groupLabel: eventTemplateGroupLabel(event),
  };
}

export function catalogTemplateGroups(
  catalog: NotificationEventCatalog | null | undefined,
): Array<{ key: string; label: string }> {
  if (catalog?.template_groups?.length) return catalog.template_groups;
  const seen = new Set<string>();
  const items: Array<{ key: string; label: string }> = [];
  for (const event of catalog?.events || []) {
    const key = eventTemplateGroup(event);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({ key, label: eventTemplateGroupLabel(event) });
  }
  return items;
}
