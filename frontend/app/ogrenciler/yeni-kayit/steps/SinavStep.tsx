"use client";

import { GunuBirlikSinav } from "../types";

type SinavStepProps = {
  exams: GunuBirlikSinav[];
  examId: string;
  sessionId: string;
  error?: string;
  onChange: (examId: string, sessionId: string) => void;
};

function formatDate(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("tr-TR");
}

export default function SinavStep({ exams, examId, sessionId, error, onChange }: SinavStepProps) {
  const exam = exams.find((item) => String(item.id) === examId);
  const sessions = exam?.sessions || [];

  return (
    <div className="wizard-form-grid">
      <div className="wizard-field" style={{ gridColumn: "1 / -1" }}>
        <label className="wizard-label required">Deneme sınavı</label>
        <select
          className={`wizard-select ${error ? "error" : ""}`}
          value={examId}
          onChange={(event) => {
            const nextId = event.target.value;
            const next = exams.find((item) => String(item.id) === nextId);
            const onlySession = next?.sessions.length === 1 ? String(next.sessions[0].id) : "";
            onChange(nextId, onlySession);
          }}
        >
          <option value="">Seçiniz</option>
          {exams.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.exam_date ? ` — ${formatDate(item.exam_date)}` : ""}
              {item.exam_type ? ` (${item.exam_type})` : ""}
            </option>
          ))}
        </select>
        {error && <span className="wizard-error">{error}</span>}
        {exams.length === 0 && (
          <span className="wizard-error">Bu şube ve eğitim yılı için aktif sınav yok.</span>
        )}
      </div>

      {sessions.length > 1 && (
        <div className="wizard-field" style={{ gridColumn: "1 / -1" }}>
          <label className="wizard-label required">Oturum</label>
          <select
            className="wizard-select"
            value={sessionId}
            onChange={(event) => onChange(examId, event.target.value)}
          >
            <option value="">Seçiniz</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
                {session.session_date ? ` — ${formatDate(session.session_date)}` : ""}
                {session.schedule_preference_display ? ` (${session.schedule_preference_display})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
