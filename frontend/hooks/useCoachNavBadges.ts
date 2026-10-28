"use client";

import { useEffect, useState } from "react";
import { fetchNotificationSummary, inboxPortalDepartment } from "@/lib/communication-api";
import { fetchKontrolBadge } from "@/lib/resources-api";

export type CoachNavBadges = {
  homework: number;
  messages: number;
};

const POLL_MS = 30_000;

let badges: CoachNavBadges = { homework: 0, messages: 0 };
const listeners = new Set<(next: CoachNavBadges) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;
let queued: "all" | "messages" | null = null;

function publish(next: CoachNavBadges) {
  badges = next;
  listeners.forEach((listener) => listener(badges));
}

/** Zil ile aynı kapsam ve sayı: koçluk departmanındaki okunmamış sohbet adedi. */
function fetchMessageBadge() {
  return fetchNotificationSummary({ department: inboxPortalDepartment("coach"), cards: false })
    .then((data) => data.unread_conversations ?? data.unread_count ?? 0)
    .catch(() => null);
}

async function run(part: "all" | "messages") {
  if (part === "messages") {
    const messages = await fetchMessageBadge();
    if (messages == null) return;
    publish({ ...badges, messages });
    return;
  }
  const [homework, messages] = await Promise.all([
    fetchKontrolBadge().catch(() => null),
    fetchMessageBadge(),
  ]);
  publish({
    homework:
      homework?.success && homework.data ? homework.data.count ?? 0 : badges.homework,
    messages: messages ?? badges.messages,
  });
}

function refresh(part: "all" | "messages" = "all") {
  if (inflight) {
    queued = queued === "all" || part === "all" ? "all" : "messages";
    return inflight;
  }
  inflight = run(part).finally(() => {
    inflight = null;
    const next = queued;
    queued = null;
    if (next && listeners.size > 0) void refresh(next);
  });
  return inflight;
}

function onInboxRefresh() {
  void refresh("messages");
}

function subscribe(listener: (next: CoachNavBadges) => void) {
  listeners.add(listener);
  listener(badges);
  if (listeners.size === 1) {
    void refresh("all");
    timer = setInterval(() => void refresh("all"), POLL_MS);
    window.addEventListener("lms:notifications-refresh", onInboxRefresh);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (timer) clearInterval(timer);
    timer = null;
    queued = null;
    window.removeEventListener("lms:notifications-refresh", onInboxRefresh);
  };
}

/** Yan menü ve alt menü aynı ödev/sohbet rozetini paylaşır. */
export function useCoachNavBadges(): CoachNavBadges {
  const [state, setState] = useState(badges);
  useEffect(() => subscribe(setState), []);
  return state;
}
