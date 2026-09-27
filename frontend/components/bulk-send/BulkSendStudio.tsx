"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import RecipientsModal from "@/app/admin/iletisim/toplu-gonder/RecipientsModal";
import { hasAnyFilter, hasIncluded, querySummary } from "@/app/admin/iletisim/toplu-gonder/audience-utils";
import "@/app/admin/iletisim/toplu-gonder/toplu-gonder.css";
import { CommToast, useCommToast } from "@/components/communication/CommToast";
import CommunicationPageShell from "@/components/communication/CommunicationPageShell";
import WhatsAppPhonePreview from "@/components/communication/WhatsAppPhonePreview";
import "@/components/communication/communication.css";
import {
  CampaignAttachmentItem,
  CampaignItem,
  SavedAudienceItem,
  accountLabel,
  communicationPortalPaths,
  createCampaign,
  createSavedAudience,
  deleteSavedAudience,
  fetchCampaign,
  fetchSavedAudiences,
  isCampaignActive,
  newCampaignClientToken,
} from "@/lib/communication-api";

import { CampaignSegmentBar, CampaignStatusBadge } from "./CampaignProgress";
import StepAudience from "./StepAudience";
import StepMessage from "./StepMessage";
import StepReview from "./StepReview";
import { campaignMessageReady, composePreview } from "./message-helpers";
import { type BulkSendMode, useBulkSendDraft } from "./useBulkSendDraft";
import "./bulk-send.css";
import "./studio.css";

interface Props {
  mode?: BulkSendMode;
}

type StepNo = 1 | 2 | 3;

/**
 * Toplu Gönderim — üç adımlı tek sayfa: kitle → mesaj → gönder.
 * Sağda canlı önizleme, altta her adımda görünen alıcı sayısı ve tek eylem.
 * Backend sözleşmesi aynı; burada yalnız arayüz var.
 */
export default function BulkSendStudio({ mode = "admin" }: Props) {
  const draft = useBulkSendDraft(mode);
  const paths = communicationPortalPaths(mode);
  const { toast, show: showToast } = useCommToast();

  const [step, setStep] = useState<StepNo>(1);
  const [attachments, setAttachments] = useState<CampaignAttachmentItem[]>([]);
  const [saved, setSaved] = useState<SavedAudienceItem[]>([]);
  const [showRecipients, setShowRecipients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<CampaignItem | null>(null);
  const [replayed, setReplayed] = useState(false);
  const clientToken = useRef<string | null>(null);

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetchSavedAudiences();
      setSaved(res.items || []);
    } catch {
      setSaved([]);
    }
  }, []);
  useEffect(() => { if (mode !== "coach") void loadSaved(); }, [loadSaved, mode]);

  // Gönderim sonrası kampanya canlıyken kendini tazeler.
  useEffect(() => {
    if (!sent || !isCampaignActive(sent.status)) return;
    const id = window.setInterval(async () => {
      try {
        setSent(await fetchCampaign(sent.id));
      } catch {
        /* geçici hata — sonraki turda tekrar */
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [sent]);

  const deliverable = draft.preview?.deliverable_count ?? 0;
  const audienceTouched = draft.personTypes.length > 0 || hasIncluded(draft.query) || hasAnyFilter(draft.query);
  const messageReady = campaignMessageReady(draft.selectedTemplate, draft.variableValues, attachments);
  const canSend = deliverable > 0 && messageReady && !submitting;
  const account = draft.accounts.find((item) => item.id === draft.accountId) || null;
  const previewText = composePreview(draft.selectedTemplate, draft.variableValues);

  const steps: Array<{ no: StepNo; label: string; hint: string; ok: boolean }> = useMemo(() => [
    {
      no: 1,
      label: "Kime",
      hint: deliverable > 0
        ? `${deliverable.toLocaleString("tr-TR")} kişi`
        : audienceTouched ? "Alıcı yok" : "Kitle seçin",
      ok: deliverable > 0,
    },
    {
      no: 2,
      label: "Mesaj",
      hint: draft.selectedTemplate ? draft.selectedTemplate.name : "Şablon seçin",
      ok: messageReady,
    },
    {
      no: 3,
      label: "Gönder",
      hint: canSend ? "Hazır" : "Eksik var",
      ok: canSend,
    },
  ], [deliverable, audienceTouched, draft.selectedTemplate, messageReady, canSend]);

  const resetAll = () => {
    draft.reset();
    setAttachments([]);
    setStep(1);
  };

  const send = async () => {
    if (!canSend) return;
    if (!clientToken.current) clientToken.current = newCampaignClientToken();
    setSubmitting(true);
    setError(null);
    try {
      const templateContext = Object.fromEntries(
        Object.entries(draft.variableValues).filter(([, value]) => (value || "").trim()),
      );
      const result = await createCampaign({
        title: draft.title.trim() || querySummary(draft.query),
        body: draft.selectedTemplate?.body_named || undefined,
        template_name: draft.templateName,
        template_language: draft.templateLanguage,
        audience_filter: draft.query,
        attachment_ids: attachments.map((item) => item.id),
        send_options: { template_context: templateContext },
        channel_config_id: draft.accountId || undefined,
        client_token: clientToken.current || undefined,
      });
      setSent(result);
      setReplayed(!!result.idempotent_replay);
      clientToken.current = null;
      resetAll();
      showToast(
        result.idempotent_replay ? "Bu gönderim zaten kuyruğa alınmıştı." : "Gönderim kuyruğa alındı.",
        "success",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gönderim başlatılamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const crumbs = mode === "coach"
    ? [{ label: "Koç Paneli", href: "/coach/dashboard" }, { label: "Toplu Gönderim" }]
    : mode === "muhasebe"
      ? [{ label: "WhatsApp", href: paths.home }, { label: "Toplu Gönderim" }]
      : [{ label: "İletişim", href: paths.home }, { label: "Toplu Gönderim" }];

  return (
    <CommunicationPageShell
      title="Toplu Gönderim"
      subtitle="Kitleyi kurun, mesajı hazırlayın, tek yerden gönderin"
      breadcrumbs={crumbs}
      maxWidth="full"
      actions={
        <Link href={mode === "coach" ? "/coach/toplu-gonder" : paths.history} className="bss-btn">
          Gönderim geçmişi
        </Link>
      }
    >
      <div className="bs bss">
        {draft.restoredFromDraft && (
          <div className="bss-alert tone-info">
            <span>Yarım kalan taslağınız geri yüklendi.</span>
            <span className="bss-alert-actions">
              <button type="button" className="bss-link" onClick={draft.dismissRestored}>Devam et</button>
              <button type="button" className="bss-link" onClick={resetAll}>Taslağı sil</button>
            </span>
          </div>
        )}
        {error && <div className="bss-alert tone-bad">{error}</div>}

        {sent && (
          <section className="bss-panel bss-sent" aria-live="polite">
            <header className="bss-panel-head">
              <div>
                <h3>
                  {sent.title || "Gönderim"} <CampaignStatusBadge status={sent.status} />
                </h3>
                <p>
                  {replayed
                    ? "Bu gönderim daha önce kuyruğa alınmıştı; yeni kampanya açılmadı."
                    : sent.status === "CONFIRMED"
                      ? `Alıcılar kuyruğa alınıyor: ${sent.materialized_count ?? 0}/${sent.total_recipients}`
                      : isCampaignActive(sent.status)
                        ? "Mesajlar arka planda gönderiliyor; sayfa kendini yeniler."
                        : "Gönderim tamamlandı."}
                </p>
              </div>
              <span className="bss-sent-actions">
                {paths.campaign && (
                  <Link href={paths.campaign(sent.id)} className="bss-btn is-sm">Detay</Link>
                )}
                <button type="button" className="bss-link" onClick={() => setSent(null)}>Kapat</button>
              </span>
            </header>
            <CampaignSegmentBar campaign={sent} legend />
            <div className="bss-kpis">
              <div><b>{sent.total_recipients}</b><span>Alıcı</span></div>
              <div><b>{sent.sent_count}</b><span>Gönderildi</span></div>
              <div><b>{sent.delivered_count}</b><span>İletildi</span></div>
              <div><b>{sent.read_count}</b><span>Okundu</span></div>
              <div className={sent.failed_count ? "is-bad" : ""}>
                <b>{sent.failed_count}</b><span>Başarısız</span>
              </div>
            </div>
            {sent.materialize_error && <p className="bss-alert tone-bad">{sent.materialize_error}</p>}
          </section>
        )}

        <nav className="bss-rail" aria-label="Gönderim adımları">
          {steps.map((item) => (
            <button
              key={item.no}
              type="button"
              className={`bss-rail-step${step === item.no ? " is-active" : ""}${item.ok ? " is-ok" : ""}`}
              aria-current={step === item.no ? "step" : undefined}
              onClick={() => setStep(item.no)}
            >
              <span className="bss-rail-no" aria-hidden="true">{item.ok ? "✓" : item.no}</span>
              <span className="bss-rail-text">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="bss-body">
          <main className="bss-main">
            {step === 1 && (
              <StepAudience
                draft={draft}
                saved={saved}
                onOpenRecipients={() => setShowRecipients(true)}
                onSaveAudience={async (name) => {
                  await createSavedAudience({
                    name,
                    query: draft.query,
                    description: querySummary(draft.query),
                  });
                  await loadSaved();
                  showToast("Kitle kaydedildi.", "success");
                }}
                onDeleteSaved={async (id) => {
                  await deleteSavedAudience(id);
                  await loadSaved();
                }}
              />
            )}
            {step === 2 && (
              <StepMessage draft={draft} attachments={attachments} onAttachmentsChange={setAttachments} />
            )}
            {step === 3 && (
              <StepReview
                draft={draft}
                attachments={attachments}
                onGoToStep={setStep}
                onOpenRecipients={() => setShowRecipients(true)}
              />
            )}
          </main>

          <aside className="bss-side" aria-label={step === 1 ? "Kitle özeti" : "Mesaj önizlemesi"}>
            {step === 1 ? (
              <AudienceInsight draft={draft} onOpenRecipients={() => setShowRecipients(true)} />
            ) : (
              <div className="bss-side-card">
                <div className="bss-side-head">Önizleme</div>
                <WhatsAppPhonePreview
                  text={previewText || "Şablonu seçince mesaj burada görünür."}
                  attachments={attachments}
                  previewContext={draft.variableValues}
                />
                <p className="bss-side-note">
                  Değişkenler örnek değerlerle gösterilir; her alıcıda kendi bilgisiyle dolar.
                </p>
              </div>
            )}
          </aside>
        </div>

        <div className="bss-bar" role="region" aria-label="Gönderim özeti">
          <div className={`bss-bar-count${deliverable ? "" : " is-zero"}`}>
            {draft.previewLoading && !draft.preview ? (
              <span className="bss-skeleton is-inline" />
            ) : (
              <b>{deliverable.toLocaleString("tr-TR")}</b>
            )}
            <span>alıcı</span>
          </div>
          <p className="bss-bar-note">
            {step === 1
              ? querySummary(draft.query)
              : step === 2
                ? draft.selectedTemplate?.name || "Şablon seçilmedi"
                : canSend
                  ? `${account ? accountLabel(account) : "Varsayılan hat"} üzerinden gönderilecek`
                  : "Eksikleri tamamlayın"}
          </p>
          <div className="bss-bar-actions">
            {step > 1 && (
              <button
                type="button"
                className="bss-btn"
                onClick={() => setStep((current) => (current === 3 ? 2 : 1))}
                disabled={submitting}
              >
                Geri
              </button>
            )}
            {step < 3 ? (
              <button type="button" className="bss-btn is-primary" onClick={() => setStep(step === 1 ? 2 : 3)}>
                {step === 1 ? "Mesaja geç" : "Son kontrole geç"}
              </button>
            ) : (
              <button
                type="button"
                className="bss-btn is-primary"
                disabled={!canSend}
                onClick={() => void send()}
              >
                {submitting
                  ? "Gönderiliyor…"
                  : deliverable > 0
                    ? `${deliverable.toLocaleString("tr-TR")} kişiye gönder`
                    : "Gönder"}
              </button>
            )}
          </div>
        </div>
      </div>

      {showRecipients && (
        <RecipientsModal
          query={draft.query}
          allowPersonel={!draft.isCoach}
          onClose={() => setShowRecipients(false)}
          onChangeQuery={draft.setQuery}
        />
      )}

      <CommToast toast={toast} />
    </CommunicationPageShell>
  );
}

/** 1. adımda sağ kolon: canlı kitle dağılımı. */
function AudienceInsight({
  draft,
  onOpenRecipients,
}: {
  draft: ReturnType<typeof useBulkSendDraft>;
  onOpenRecipients: () => void;
}) {
  const { preview, previewLoading, previewError, query } = draft;
  const deliverable = preview?.deliverable_count ?? 0;
  const matched = preview?.matched_count ?? 0;
  const unsuitable = preview?.unsuitable_count ?? 0;

  const rows = [
    { label: "Öğrenci", value: preview?.ogrenci_count ?? 0 },
    { label: "Veli", value: preview?.veli_count ?? 0 },
    { label: "Personel", value: preview?.personel_count ?? 0 },
  ].filter((row) => row.value > 0);

  return (
    <div className="bss-side-card">
      <div className="bss-side-head">Kitle</div>
      {previewError ? (
        <p className="bss-alert tone-bad">{previewError}</p>
      ) : (
        <>
          <div className={`bss-side-count${deliverable ? "" : " is-zero"}`}>
            {previewLoading && !preview ? (
              <span className="bss-skeleton is-inline" />
            ) : (
              <b>{deliverable.toLocaleString("tr-TR")}</b>
            )}
            <span>kişiye gidecek</span>
          </div>
          <p className="bss-side-sub">{querySummary(query)}</p>

          {rows.length > 0 && (
            <ul className="bss-breakdown">
              {rows.map((row) => (
                <li key={row.label}>
                  <span>{row.label}</span>
                  <b>{row.value.toLocaleString("tr-TR")}</b>
                </li>
              ))}
              {matched > deliverable && (
                <li className="is-soft">
                  <span>Eşleşen</span>
                  <b>{matched.toLocaleString("tr-TR")}</b>
                </li>
              )}
              {unsuitable > 0 && (
                <li className="is-warn">
                  <span>Telefonsuz</span>
                  <b>{unsuitable.toLocaleString("tr-TR")}</b>
                </li>
              )}
            </ul>
          )}

          {deliverable === 0 && !previewLoading && (
            <p className="bss-side-note">Hazır kitle seçin veya kişi türü işaretleyin.</p>
          )}
          <button type="button" className="bss-btn is-block" onClick={onOpenRecipients}>
            Alıcı listesini aç
          </button>
        </>
      )}
    </div>
  );
}
