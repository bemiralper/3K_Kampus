"use client";

import { useEffect, useState } from "react";

import { querySummary } from "@/app/admin/iletisim/toplu-gonder/audience-utils";
import {
  AudienceRecipientRow,
  CampaignAttachmentItem,
  accountLabel,
  fetchAudienceRecipients,
} from "@/lib/communication-api";

import { isApprovedTemplate, missingVariableFields, needsAttachment } from "./message-helpers";
import type { BulkSendDraft } from "./useBulkSendDraft";

interface Props {
  draft: BulkSendDraft;
  attachments: CampaignAttachmentItem[];
  onGoToStep: (step: 1 | 2) => void;
  onOpenRecipients: () => void;
}

const SAMPLE_SIZE = 6;

/** 3. adım — son kontrol: kime, ne, hangi hat; eksikler tek listede. */
export default function StepReview({ draft, attachments, onGoToStep, onOpenRecipients }: Props) {
  const { query, preview, selectedTemplate, variableValues, accounts, accountId, title } = draft;
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

  const checks: Array<{ label: string; value: string; ok: boolean; step?: 1 | 2 }> = [
    {
      label: "Kitle",
      value: deliverable > 0
        ? `${deliverable.toLocaleString("tr-TR")} kişi · ${querySummary(query)}`
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
      value: account ? accountLabel(account) : "Varsayılan",
      ok: true,
      step: 2,
    },
  ];

  return (
    <div className="bss-step">
      <section className="bss-panel bss-review-hero">
        <div className={`bss-hero-count${deliverable ? "" : " is-zero"}`}>
          <b>{deliverable.toLocaleString("tr-TR")}</b>
          <span>kişiye gönderilecek</span>
        </div>
        <p>
          {unsuitable > 0
            ? `${unsuitable.toLocaleString("tr-TR")} kişi telefonu olmadığı için atlanacak.`
            : "Seçilen herkese ulaşılabiliyor."}
          {" "}Gönderim kuyruğa alınır; henüz gitmemiş mesajlar iptal edilebilir.
        </p>
        {title.trim() && <p className="bss-hero-title">Başlık: <strong>{title.trim()}</strong></p>}
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
