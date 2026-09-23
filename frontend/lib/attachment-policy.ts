/**
 * Ek dosya kuralları — sunucu tarafındaki `attachment_service` ile birebir.
 *
 * İstemci tarafı ön kontrol: kullanıcı yükleme bitmeden anlamlı bir Türkçe
 * hata görür; nihai karar yine sunucudadır.
 */

export const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx"] as const;

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;

/** `<input accept>` için hazır değer. */
export const ATTACHMENT_ACCEPT = [...ALLOWED_MIME_TYPES, ...ALLOWED_EXTENSIONS].join(",");

export type AttachmentValidation = { ok: true } | { ok: false; reason: string };

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Dosyayı uzantı + boyut üzerinden doğrular.
 *
 * MIME türü tarayıcıya göre boş ya da yanlış gelebildiği için karar uzantıya
 * dayanır; MIME yalnızca uzantı tanınmadığında yedek olarak bakılır.
 */
export function validateAttachment(
  file: File,
  options: { maxBytes?: number } = {},
): AttachmentValidation {
  const maxBytes = options.maxBytes ?? MAX_ATTACHMENT_BYTES;
  const ext = fileExtension(file.name);
  const extOk = (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
  const mimeOk = !!file.type && (ALLOWED_MIME_TYPES as readonly string[]).includes(file.type);
  if (!extOk && !mimeOk) {
    return {
      ok: false,
      reason: "Desteklenmeyen dosya türü. PDF, PNG, JPG, DOC veya DOCX kullanın.",
    };
  }
  if (file.size > maxBytes) {
    return {
      ok: false,
      reason: `Dosya boyutu ${formatMegabytes(maxBytes)} sınırını aşıyor.`,
    };
  }
  return { ok: true };
}
