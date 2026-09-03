import type {
  ChatContactKind,
  ConversationListItem,
  MessageItem,
} from "@/lib/communication-api";

export const CONTACT_KIND_LABELS: Record<ChatContactKind, string> = {
  ogrenci: "Öğrenci",
  veli: "Veli",
  koc: "Koç",
  ogretmen: "Öğretmen",
  diger: "Diğer",
};

/** Avatar arka planı — ada göre sabit, rastgele değil. */
const AVATAR_TONES = [
  "#0f766e",
  "#1d4ed8",
  "#7c3aed",
  "#b45309",
  "#be123c",
  "#0369a1",
  "#4d7c0f",
  "#9333ea",
];

export function avatarTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

export function conversationTitle(conv: ConversationListItem): string {
  return (
    conv.contact_name?.trim() ||
    conv.veli_ad?.trim() ||
    conv.ogrenci_ad?.trim() ||
    conv.subject?.trim() ||
    conv.contact_phone ||
    "İsimsiz sohbet"
  );
}

/** Liste satırındaki ikinci satır: bağlı öğrenci / rol bilgisi. */
export function conversationSubtitle(conv: ConversationListItem): string {
  const kind = conv.contact_kind;
  if (kind === "veli") {
    const students = conv.ogrenci_adlari?.length
      ? conv.ogrenci_adlari.join(", ")
      : conv.ogrenci_ad;
    return students ? `Veli · ${students}` : "Veli";
  }
  if (kind === "ogrenci") return "Öğrenci";
  if (kind === "koc") return "Koç";
  if (kind === "ogretmen") return "Personel";
  return conv.contact_phone || "";
}

const TIME_FMT = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit",
});
const DAY_FMT = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const WEEKDAY_FMT = new Intl.DateTimeFormat("tr-TR", { weekday: "long" });
const SHORT_DATE_FMT = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Sohbet listesindeki zaman damgası: bugün saat, dün "Dün", öncesi tarih. */
export function listTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (dayDiff <= 0) return TIME_FMT.format(date);
  if (dayDiff === 1) return "Dün";
  if (dayDiff < 7) return WEEKDAY_FMT.format(date);
  return SHORT_DATE_FMT.format(date);
}

export function messageTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : TIME_FMT.format(date);
}

/** Mesaj akışındaki gün ayıracı. */
export function dayDivider(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (dayDiff <= 0) return "Bugün";
  if (dayDiff === 1) return "Dün";
  return DAY_FMT.format(date);
}

export function sameDay(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return startOfDay(da) === startOfDay(db);
}

export type DeliveryState =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export function deliveryState(message: MessageItem): DeliveryState | null {
  if (message.direction !== "OUTBOUND") return null;
  switch (message.status) {
    case "PENDING":
    case "SENDING":
      return "sending";
    case "SENT":
      return "sent";
    case "DELIVERED":
      return "delivered";
    case "READ":
      return "read";
    case "FAILED":
    case "CANCELLED":
      return "failed";
    default:
      return "sent";
  }
}

export const DELIVERY_LABELS: Record<DeliveryState, string> = {
  sending: "Gönderiliyor",
  sent: "Gönderildi",
  delivered: "Teslim edildi",
  read: "Okundu",
  failed: "Gönderilemedi",
};

export function humanFileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageAttachment(mime: string | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}

export function isPdfAttachment(mime: string | undefined): boolean {
  return mime === "application/pdf";
}

/** Bekleme süresini "42 dk" / "3 sa" biçiminde göster. */
export function waitingLabel(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 60) return "";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa`;
  return `${Math.floor(hours / 24)} gün`;
}

/** Sohbeti sıralarken sabitlenmişler her zaman üstte kalır. */
export function sortConversations(items: ConversationListItem[]): ConversationListItem[] {
  return [...items].sort((a, b) => {
    if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
    const at = a.last_message_at ?? a.created_at;
    const bt = b.last_message_at ?? b.created_at;
    return new Date(bt).getTime() - new Date(at).getTime();
  });
}

/** Arama sonucunda eşleşen parçayı işaretlemek için bölümlere ayır. */
export function splitHighlight(text: string, query: string): Array<{ text: string; hit: boolean }> {
  if (!query.trim()) return [{ text, hit: false }];
  const lower = text.toLocaleLowerCase("tr");
  const needle = query.toLocaleLowerCase("tr");
  const parts: Array<{ text: string; hit: boolean }> = [];
  let cursor = 0;
  let index = lower.indexOf(needle, cursor);
  while (index !== -1) {
    if (index > cursor) parts.push({ text: text.slice(cursor, index), hit: false });
    parts.push({ text: text.slice(index, index + needle.length), hit: true });
    cursor = index + needle.length;
    index = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  return parts;
}

/** Mesaj listesi önizlemesi — ek varsa dosya adını göster. */
export function messagePreview(message: MessageItem): string {
  if (message.body?.trim()) return message.body.trim();
  const attachment = message.attachments?.[0];
  if (attachment) {
    return isImageAttachment(attachment.mime_type)
      ? "Fotoğraf"
      : attachment.original_name || "Dosya";
  }
  return "";
}

/**
 * Mesaj metnini bağlantı / bağlantı dışı parçalara ayırır.
 *
 * Sunucu tarafında unfurl (başlık + görsel çekme) yok; bu yüzden bağlantılar
 * tıklanabilir hale getirilip alan adı ayrı bir satırda gösterilir.
 */
const URL_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

export function splitLinks(text: string): Array<{ text: string; href?: string }> {
  const parts: Array<{ text: string; href?: string }> = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    // Cümle sonu noktalama işaretini bağlantının dışında bırak.
    const trimmed = raw.replace(/[.,;:!?)\]]+$/, "");
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({
      text: trimmed,
      href: trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    });
    cursor = start + trimmed.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

/** Mesajdaki ilk bağlantının alan adı — önizleme şeridi için. */
export function firstLinkHost(text: string): { href: string; host: string } | null {
  const link = splitLinks(text).find((p) => p.href);
  if (!link?.href) return null;
  try {
    return { href: link.href, host: new URL(link.href).hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}
