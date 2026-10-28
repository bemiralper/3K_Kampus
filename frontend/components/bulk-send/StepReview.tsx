"use client";

import { useEffect, useState } from "react";

import { querySummary } from "@/app/admin/iletisim/toplu-gonder/audience-utils";
import {
  AudienceRecipientRow,
  CampaignAttachmentItem,
  accountLabel,
  fetchAudienceRecipients,
} from "@/lib/communication-api";

import {
  QUIET_HOURS_LABEL,
  isApprovedTemplate,
  isQuietHour,
  missingVariableFields,
  needsAttachment,
  scheduleError,
  toLocalInputValue,
} from "./message-helpers";
import type { BulkSendDraft } from "./useBulkSendDraft";

export type ScheduleMode = "now" | "later";

interface Props {
  draft: BulkSendDraft;
  attachments: CampaignAttachmentItem[];
  previewText: string;
  scheduleMode: ScheduleMode;
  scheduledAt: string;
  onScheduleChange: (mode: ScheduleMode, value: string) => void;
  onGoToStep: (step: 1 | 2) => void;
  onOpenRecipients: () => void;
}

const SAMPLE_SIZE = 6;

/** 3. adım — son kontrol: kime, ne, hangi hat, ne zaman; eksikler tek listede. */
export default function StepReview({
  draft,
  attachments,
  previewText,
  scheduleMode,
  scheduledAt,
  onScheduleChange,
  onGoToStep,
  onOpenRecipients,
}: Props) {
  const { query, preview, selectedTemplate, variableValues, accounts, accountId, title, catalog } = draft;
  const [sample, setSample] = useState<AudienceRecipientRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSample(null);
    fetchAudienceRecipients(query, { page: 1, pageSize: SAMPLE_SIZE })
      .then((res) => { if (!cancelled) setSample(res.recipients || []); })
      .catch(() => { if (!cancelled) setSample([]); });
    return () => { cancelled = true; };
  }, [query]);

  const deliverable = preview?.deliverable_count ?? 0;
  const unsuitable = preview?.unsuitable_count ?? 0;
  const account = accounts.find((item) => item.id === accountId);
  const missingVars = missingVariableFields(selectedTemplate, variableValues);
  const attachmentNeeded = needsAttachment(selectedTemplate) && attachments.length === 0;
  const scheduleProblem = scheduleMode === "later" ? scheduleError(scheduledAt) : null;
  const sendAt = scheduleMode === "later" && !scheduleProblem ? new Date(scheduledAt) : new Date();
  const quiet = isQuietHour(sendAt);

  const checks: Array<{ label: string; value: string; ok: boolean; step?: 1 | 2 }> = [
    {
      label: "Kitle",
      value: deliverable > 0
        ? `${deliverable.toLocaleString("tr-TR")} kişi · ${querySummary(query, catalog)}`
        : "Alıcı yok",
      ok: deliverable > 0,
      step: 1,
    },
    {
      label: "Şablon",
      value: selectedTemplate
        ? `${selectedTemplate.name}${isApprovedTemplate(selectedTemplate) ? "" : " — onaylı değil"}`
        : "Seçilmedi",
      ok: Boolean(selectedTemplate) && isApprovedTemplate(selectedTemplate),
      step: 2,
    },
    {
      label: "Değişkenler",
      value: !selectedTemplate
        ? "Şablon bekleniyor"
        : missingVars.length
          ? `Eksik: ${missingVars.join(", ")}`
          : "Tamam",
      ok: Boolean(selectedTemplate) && missingVars.length === 0,
      step: 2,
    },
    {
      label: "Ek",
      value: attachmentNeeded
        ? "Şablon medya bekliyor"
        : attachments.length
          ? `${attachments.length} dosya`
          : "Gerekmiyor",
      ok: !attachmentNeeded,
      step: 2,
    },
    {
      label: "Hat",
      value: account
        ? `${accountLabel(account)}${account.send_error ? " — son gönderimde hata verdi" : ""}`
        : "Varsayılan",
      ok: !account?.send_error,
      step: 2,
    },
  ];

  const minSchedule = toLocalInputValue(new Date(Date.now() + 6 * 60 * 1000));

  return (
    <div className="bss-step">
      <section className="bss-panel bss-review-hero">
        <div className={`bss-hero-count${deliverable ? "" : " is-zero"}`}>
          <b>{deliverable.toLocaleString("tr-TR")}</b>
          <span>kişiye gönderilecek</span>
        </div>
        <p>
          {unsuitable > 0
            ? `${unsuitable.toLocaleString("tr-TR")} kişi telefonu olmadığı ya da izin vermediği için atlanacak.`
            : "Seçilen herkese ulaşılabiliyor."}
          {" "}Gönderim kuyruğa alınır; henüz gitmemiş mesajlar iptal edilebilir.
        </p>
        {title.trim() && <p className="bss-hero-title">Başlık: <strong>{title.trim()}</strong></p>}
      </section>

      <section className="bss-panel">
        <header className="bss-panel-head">
          <div>
            <h3>Ne zaman?</h3>
            <p>Hemen gönderin ya da ileri bir saate zamanlayın.</p>
          </div>
        </header>
        <div className="bss-seg" role="radiogroup" aria-label="Gönderim zamanı">
          <button
            type="button"
            role="radio"
            aria-checked={scheduleMode === "now"}
            className={`bss-seg-btn${scheduleMode === "now" ? " is-on" : ""}`}
            onClick={() => onScheduleChange("now", scheduledAt)}
          >
            Hemen gönder
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scheduleMode === "later"}
            className={`bss-seg-btn${scheduleMode === "later" ? " is-on" : ""}`}
            onClick={() => onScheduleChange("later", scheduledAt || nextMorningValue())}
          >
            İleri tarihe zamanla
          </button>
        </div>
        {scheduleMode === "later" && (
          <label className="bss-field">
            <span>Gönderim zamanı</span>
            <input
              type="datetime-local"
              className="bss-input"
              value={scheduledAt}
              min={minSchedule}
              onChange={(event) => onScheduleChange("later", event.target.value)}
            />
            {scheduleProblem ? (
              <small className="bss-field-error">{scheduleProblem}</small>
            ) : (
              <small className="bss-field-note">
                Alıcı listesi gönderim anında yeniden hesaplanır. Zamanlanan gönderimi Gönderim geçmişinden iptal edebilirsiniz.
              </small>
            )}
          </label>
        )}
        {quiet && !scheduleProblem && (
          <p className="bss-alert tone-warn">
            Gönderim {QUIET_HOURS_LABEL} arasına denk geliyor. Veliler için rahatsız edici olabilir; sabaha zamanlamayı düşünün.
          </p>
        )}
      </section>

      <section className="bss-panel">
        <header className="bss-panel-head">
          <div>
            <h3>Son kontrol</h3>
            <p>Eksik varsa satırdaki bağlantıdan dönün.</p>
          </div>
        </header>
        <ul className="bss-checks">
          {checks.map((check) => (
            <li key={check.label} className={check.ok ? "is-ok" : "is-bad"}>
              <span className="bss-checks-mark" aria-hidden="true">{check.ok ? "✓" : "!"}</span>
              <span className="bss-checks-text">
                <strong>{check.label}</strong>
                <span>{check.value}</span>
              </span>
              {!check.ok && check.step && (
                <button type="button" className="bss-link" onClick={() => onGoToStep(check.step!)}>
                  Düzelt
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {previewText && (
        <section className="bss-panel">
          <header className="bss-panel-head">
            <div>
              <h3>Giden mesaj</h3>
              <p>Değişkenler her alıcıda kendi bilgisiyle dolar.</p>
            </div>
            <button type="button" className="bss-link" onClick={() => onGoToStep(2)}>Düzenle</button>
          </header>
          <p className="bss-message-text">{previewText}</p>
        </section>
      )}

      <section className="bss-panel">
        <header className="bss-panel-head">
          <div>
            <h3>İlk alıcılar</h3>
            <p>Listenin başından örnek.</p>
          </div>
          <button type="button" className="bss-link" onClick={onOpenRecipients}>Tüm listeyi aç</button>
        </header>
        {sample === null ? (
          <div className="bss-tpl-list">
            <div className="bss-skeleton" />
            <div className="bss-skeleton" />
          </div>
        ) : sample.length === 0 ? (
          <p className="bss-hint">Liste alınamadı. Yukarıdaki sayı yine de geçerlidir.</p>
        ) : (
          <ul className="bss-sample">
            {sample.map((row) => (
              <li key={row.key}>
                <strong>{row.display_name}</strong>
                <span>{[row.phone, row.class_or_role, row.sube_name].filter(Boolean).join(" · ") || "—"}</span>
              </li>
            ))}
            {deliverable > sample.length && (
              <li className="is-more">ve {(deliverable - sample.length).toLocaleString("tr-TR")} kişi daha</li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Zamanlamaya geçince önerilen değer: ertesi sabah 10:00. */
function nextMorningValue(): string {
  const at = new Date();
  at.setDate(at.getDate() + 1);
  at.setHours(10, 0, 0, 0);
  return toLocalInputValue(at);
}
