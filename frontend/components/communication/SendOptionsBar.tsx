"use client";

import { SendMode } from "@/lib/communication-api";

interface SendOptionsBarProps {
  sendMode: SendMode;
  onSendModeChange: (mode: SendMode) => void;
  scheduledAt: string;
  onScheduledAtChange: (value: string) => void;
  saveAsTemplate: boolean;
  onSaveAsTemplateChange: (value: boolean) => void;
  saveAsDraft: boolean;
  onSaveAsDraftChange: (value: boolean) => void;
}

export default function SendOptionsBar({
  sendMode,
  onSendModeChange,
  scheduledAt,
  onScheduledAtChange,
  saveAsTemplate,
  onSaveAsTemplateChange,
  saveAsDraft,
  onSaveAsDraftChange,
}: SendOptionsBarProps) {
  const mode: "now" | "scheduled" | "draft" = saveAsDraft
    ? "draft"
    : sendMode === "scheduled"
      ? "scheduled"
      : "now";

  return (
    <div className="comm-studio-send-options">
      <div className="comm-studio-segment" role="radiogroup" aria-label="Gönderim zamanı">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "now"}
          className={mode === "now" ? "is-active" : undefined}
          onClick={() => {
            onSendModeChange("now");
            onSaveAsDraftChange(false);
          }}
        >
          Şimdi
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "scheduled"}
          className={mode === "scheduled" ? "is-active" : undefined}
          onClick={() => {
            onSendModeChange("scheduled");
            onSaveAsDraftChange(false);
          }}
        >
          Planla
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "draft"}
          className={mode === "draft" ? "is-active" : undefined}
          onClick={() => {
            onSendModeChange("draft");
            onSaveAsDraftChange(true);
          }}
        >
          Taslak
        </button>
      </div>

      {mode === "scheduled" && (
        <input
          type="datetime-local"
          className="comm-studio-datetime"
          value={scheduledAt}
          onChange={(e) => onScheduledAtChange(e.target.value)}
          aria-label="Gönderim tarihi"
        />
      )}

      <label className="comm-studio-check">
        <input
          type="checkbox"
          checked={saveAsTemplate}
          onChange={(e) => onSaveAsTemplateChange(e.target.checked)}
        />
        Şablon olarak kaydet
      </label>
    </div>
  );
}
