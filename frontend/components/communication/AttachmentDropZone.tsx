"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { CampaignAttachmentItem, uploadCampaignAttachment } from "@/lib/communication-api";
import { ALLOWED_EXTENSIONS, validateAttachment } from "@/lib/attachment-policy";

interface AttachmentDropZoneProps {
  attachments: CampaignAttachmentItem[];
  onChange: (attachments: CampaignAttachmentItem[]) => void;
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentDropZone({
  attachments,
  onChange,
  disabled = false,
}: AttachmentDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Art arda / eşzamanlı yüklemelerde kapanış içindeki eski `attachments`
  // üzerine yazılmasın: en güncel liste ref'te tutulur ve `prev => next`
  // biçiminde eşzamanlı güncellenir (fonksiyonel setState eşdeğeri).
  const latest = useRef(attachments);
  useEffect(() => {
    latest.current = attachments;
  }, [attachments]);

  const emit = (update: (prev: CampaignAttachmentItem[]) => CampaignAttachmentItem[]) => {
    const next = update(latest.current);
    latest.current = next;
    onChange(next);
  };

  const handleFiles = async (files: FileList | File[]) => {
    setError(null);
    const list = Array.from(files);
    for (const file of list) {
      // Tür ve boyut kuralı sunucuyla ortak (`lib/attachment-policy`).
      const check = validateAttachment(file);
      if (!check.ok) {
        setError(check.reason);
        continue;
      }
      setUploading(true);
      try {
        const uploaded = await uploadCampaignAttachment(file);
        emit((prev) => (prev.some((a) => a.id === uploaded.id) ? prev : [...prev, uploaded]));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Yükleme başarısız");
      } finally {
        setUploading(false);
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled || uploading) return;
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleFiles(e.target.files);
    e.target.value = "";
  };

  const remove = (id: string) => {
    emit((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="comm-attachment-zone">
      <div
        className={`comm-attachment-drop${dragging ? " dragging" : ""}${disabled ? " disabled" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(",")}
          multiple
          hidden
          onChange={onFileInput}
          disabled={disabled || uploading}
        />
        <span className="comm-attachment-drop-icon" aria-hidden="true">📎</span>
        <span>
          {uploading ? "Yükleniyor…" : "Dosyaları sürükleyin veya tıklayın"}
        </span>
        <span className="comm-attachment-drop-hint">PDF, PNG, JPG, DOC — max 16 MB</span>
      </div>

      {error && <p className="comm-attachment-error">{error}</p>}

      {attachments.length > 0 && (
        <ul className="comm-attachment-list">
          {attachments.map((att) => (
            <li key={att.id} className="comm-attachment-item">
              <span aria-hidden="true">
                {att.mime_type.startsWith("image/") ? "🖼" : att.mime_type.includes("pdf") ? "📄" : "📎"}
              </span>
              <span className="comm-attachment-item-name">{att.original_name}</span>
              <span className="comm-attachment-item-size">{formatSize(att.file_size)}</span>
              <button
                type="button"
                className="comm-attachment-remove"
                onClick={() => remove(att.id)}
                aria-label={`${att.original_name} kaldır`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
