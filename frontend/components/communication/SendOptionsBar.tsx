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
  return (
    <div className="comm-send-options">
      <span className="comm-send-options-label">Gönderim:</span>
      <div className="comm-send-options-radios">
        <label>
          <input
            type="radio"
            name="sendMode"
            checked={sendMode === "now" && !saveAsDraft}
            onChange={() => { onSendModeChange("now"); onSaveAsDraftChange(false); }}
          />
          Şimdi gönder
        </label>
        <label>
          <input
            type="radio"
            name="sendMode"
            checked={sendMode === "scheduled"}
            onChange={() => { onSendModeChange("scheduled"); onSaveAsDraftChange(false); }}
          />
          Belirli tarih
        </label>
        <label>
          <input
            type="radio"
            name="sendMode"
            checked={saveAsDraft}
            onChange={() => { onSendModeChange("draft"); onSaveAsDraftChange(true); }}
          />
          Taslak
        </label>
      </div>

      {sendMode === "scheduled" && !saveAsDraft && (
        <input
          type="datetime-local"
          className="comm-scheduled-input"
          value={scheduledAt}
          onChange={(e) => onScheduledAtChange(e.target.value)}
        />
      )}

      <label className="comm-send-option-check">
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
