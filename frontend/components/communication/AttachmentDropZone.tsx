"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { CampaignAttachmentItem, uploadAttachment } from "@/lib/communication-api";

const MAX_BYTES = 16 * 1024 * 1024;
const ALLOWED = [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx"];

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

  const handleFiles = async (files: FileList | File[]) => {
    setError(null);
    const list = Array.from(files);
    for (const file of list) {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED.includes(ext)) {
        setError("Desteklenmeyen dosya türü. PDF, PNG, JPG veya DOC kullanın.");
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError("Dosya boyutu 16 MB sınırını aşıyor.");
        continue;
      }
      setUploading(true);
      try {
        const uploaded = await uploadAttachment(file);
        onChange([...attachments, uploaded]);
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
    onChange(attachments.filter((a) => a.id !== id));
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
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
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
