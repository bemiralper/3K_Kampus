"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchNotificationEvents,
  NotificationEventCatalog,
} from "@/lib/communication-api";
import {
  EventSlotSelection,
  findEventSlot,
  parsePickerValue,
  pickerValueOf,
  RECIPIENT_LABELS,
} from "./notification-event-utils";

interface NotificationEventPickerProps {
  catalog?: NotificationEventCatalog | null;
  eventKey?: string;
  recipient?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  id?: string;
  onSelect: (selection: EventSlotSelection | null) => void;
}

export default function NotificationEventPicker({
  catalog: catalogProp,
  eventKey = "",
  recipient = "",
  disabled,
  allowEmpty = true,
  emptyLabel = "Olay seçilmedi (serbest şablon)",
  id = "nbx-event-picker",
  onSelect,
}: NotificationEventPickerProps) {
  const [loaded, setLoaded] = useState<NotificationEventCatalog | null>(null);
  const catalog = catalogProp || loaded;

  useEffect(() => {
    if (catalogProp) return;
    let cancelled = false;
    fetchNotificationEvents()
      .then((data) => {
        if (!cancelled) setLoaded(data);
      })
      .catch(() => {
        if (!cancelled) setLoaded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogProp]);

  const groups = useMemo(() => {
    const modules = catalog?.modules || [];
    const events = catalog?.events || [];
    return modules
      .map((mod) => ({
        ...mod,
        events: events.filter((event) => {
          if (mod.key.startsWith("yoklama:")) {
            return event.module === "yoklama" && event.group === mod.key.slice("yoklama:".length);
          }
          return event.module === mod.key;
        }),
      }))
      .filter((group) => group.events.length > 0);
  }, [catalog]);

  const value = pickerValueOf(eventKey, recipient);

  return (
    <div className="nbx-field">
      <label className="nbx-field-label" htmlFor={id}>
        Bildirim olayı
      </label>
      <select
        id={id}
        className="nbx-select"
        disabled={disabled || !catalog}
        value={value}
        onChange={(e) => {
          const parsed = parsePickerValue(e.target.value);
          onSelect(parsed ? findEventSlot(catalog, parsed.eventKey, parsed.recipient) : null);
        }}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {groups.map((group) => (
          <optgroup key={group.key} label={group.label}>
            {group.events.flatMap((event) =>
              event.slots.map((slot) => {
                const optionValue = pickerValueOf(event.key, slot.recipient_type);
                const role = RECIPIENT_LABELS[slot.recipient_type] || slot.recipient_type;
                return (
                  <option key={optionValue} value={optionValue}>
                    {event.label} — {role}
                  </option>
                );
              }),
            )}
          </optgroup>
        ))}
      </select>
      <p className="nbx-hint">
        Seçilirse ad, metin ve şablon grubu olaydan dolar; kayıtta bu alıcıya bağlanır.
      </p>
    </div>
  );
}
