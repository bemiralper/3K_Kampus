"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CampaignDuyuruPicker, {
  campaignMessageReady,
} from "@/app/admin/iletisim/toplu-gonder/CampaignDuyuruPicker";
import { querySummary } from "@/app/admin/iletisim/toplu-gonder/audience-utils";
import "@/app/admin/iletisim/toplu-gonder/toplu-gonder.css";
import { CommDialog } from "@/components/communication/CommDialog";
import { CommToast, useCommToast } from "@/components/communication/CommToast";
import CommunicationPageShell from "@/components/communication/CommunicationPageShell";
import "@/components/communication/communication.css";
import {
  AudienceRecipientRow,
  CampaignAttachmentItem,
  CampaignItem,
  SavedAudienceItem,
  accountLabel,
  communicationPortalPaths,
  createCampaign,
  createSavedAudience,
  deleteSavedAudience,
  fetchAudienceRecipients,
  fetchCampaign,
  fetchSavedAudiences,
  isCampaignActive,
  newCampaignClientToken,
} from "@/lib/communication-api";

import AudienceComposer from "./AudienceComposer";
import { CampaignSegmentBar, CampaignStatusBadge } from "./CampaignProgress";
import { type BulkSendMode, useBulkSendDraft } from "./useBulkSendDraft";
import "./bulk-send.css";

interface Props {
  mode?: BulkSendMode;
}

/**
 * Toplu Gönderim v2 — tek ekran: solda kitle, sağda mesaj, altta sabit gönder çubuğu,
 * gönderimden sonra aynı ekranda canlı ilerleme. Backend sözleşmesi değişmedi.
 */
export default function BulkSendStudio({ mode = "admin" }: Props) {
  const draft = useBulkSendDraft(mode);
  const paths = communicationPortalPaths(mode);
  const { toast, show: showToast } = useCommToast();

  const [attachments, setAttachments] = useState<CampaignAttachmentItem[]>([]);
  const [saved, setSaved] = useState<SavedAudienceItem[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSample, setConfirmSample] = useState<AudienceRecipientRow[] | null>(null);
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

  const deliverable = draft.preview?.deliverable_count ?? 0;
  const templateReady = campaignMessageReady(draft.selectedTemplate, draft.variableValues, attachments);
  const canSend = deliverable > 0 && templateReady && !submitting;
  const account = draft.accounts.find((a) => a.id === draft.accountId) || null;

  // Gönderim sonrası kampanya canlıyken 4 sn'de bir tazele
  useEffect(() => {
    if (!sent || !isCampaignActive(sent.status)) return;
    const id = window.setInterval(async () => {
      try {
        const fresh = await fetchCampaign(sent.id);
        setSent(fresh);
      } catch {
        /* geçici hata — sonraki turda tekrar */
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [sent]);

  const openConfirm = async () => {
    if (!canSend) return;
    if (!clientToken.current) clientToken.current = newCampaignClientToken();
    setConfirmSample(null);
    setConfirmOpen(true);
    try {
      const page = await fetchAudienceRecipients(draft.query, { page: 1, pageSize: 3 });
      setConfirmSample(page.recipients || []);
    } catch {
      setConfirmSample([]);
    }
  };

  const send = async () => {
    if (!canSend) return;
    setSubmitting(true);
    setError(null);
    try {
      const templateContext = Object.fromEntries(
        Object.entries(draft.variableValues).filter(([, v]) => (v || "").trim()),
      );
      const result = await createCampaign({
        title: draft.title.trim() || querySummary(draft.query),
        body: draft.selectedTemplate?.body_named || undefined,
        template_name: draft.templateName,
        template_language: draft.templateLanguage,
        audience_filter: draft.query,
        attachment_ids: attachments.map((a) => a.id),
        send_options: { template_context: templateContext },
        channel_config_id: draft.accountId || undefined,
        client_token: clientToken.current || undefined,
      });
      setSent(result);
      setReplayed(!!result.idempotent_replay);
      clientToken.current = null;
      setConfirmOpen(false);
      setAttachments([]);
      draft.reset();
      showToast(result.idempotent_replay ? "Bu gönderim zaten kuyruğa alınmıştı." : "Gönderim kuyruğa alındı.", "success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gönderim başlatılamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const checks = useMemo(() => ([
    { ok: deliverable > 0, label: deliverable > 0 ? `${deliverable.toLocaleString("tr-TR")} alıcı seçildi` : "Kitle seçilmedi" },
    { ok: !!draft.selectedTemplate, label: draft.selectedTemplate ? `Şablon: ${draft.selectedTemplate.name}` : "Onaylı şablon seçilmedi" },
    { ok: templateReady || !draft.selectedTemplate, label: templateReady || !draft.selectedTemplate ? "Değişkenler ve ekler tamam" : "Eksik değişken / ek var" },
  ]), [deliverable, draft.selectedTemplate, templateReady]);

  const crumbs = mode === "coach"
    ? [{ label: "Koç Paneli", href: "/coach/dashboard" }, { label: "Toplu Gönderim" }]
    : mode === "muhasebe"
      ? [{ label: "WhatsApp", href: paths.home }, { label: "Toplu Gönderim" }]
      : [{ label: "İletişim", href: paths.home }, { label: "Toplu Gönderim" }];

  return (
    <CommunicationPageShell
      title="Toplu Gönderim"
      subtitle="Kitleyi seçin, şablonu doldurun, tek adımda gönderin"
      breadcrumbs={crumbs}
      maxWidth="full"
      actions={
        <Link href={mode === "coach" ? "/coach/toplu-gonder" : paths.history} className="bs-btn">
          Gönderim geçmişi
        </Link>
      }
    >
      <div className="bs">
        {draft.restoredFromDraft && (
          <div className="bs-alert tone-info" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span>Kaydedilmiş taslağınız geri yüklendi.</span>
            <span style={{ display: "flex", gap: 10 }}>
              <button type="button" className="bs-counter-link" onClick={draft.dismissRestored}>Tamam</button>
              <button type="button" className="bs-counter-link" onClick={() => { draft.reset(); setAttachments([]); }}>Taslağı temizle</button>
            </span>
          </div>
        )}
        {error && <div className="bs-alert tone-bad" style={{ marginBottom: 12 }}>{error}</div>}

        {sent && (
          <section className="bs-card bs-progress-card" style={{ marginBottom: 16 }} aria-live="polite">
            <div className="bs-card-head">
              <div>
                <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {sent.title || "Gönderim"} <CampaignStatusBadge status={sent.status} />
                </h2>
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
              <div className="bs-detail-actions">
                {paths.campaign && (
                  <Link href={paths.campaign(sent.id)} className="bs-btn bs-btn-sm">Detay</Link>
                )}
                <button type="button" className="bs-btn-ghost bs-btn-sm" onClick={() => setSent(null)}>Kapat</button>
              </div>
            </div>
            <CampaignSegmentBar campaign={sent} legend />
            <div className="bs-progress-kpis">
              <div className="bs-kpi"><b>{sent.total_recipients}</b><span>Alıcı</span></div>
              <div className="bs-kpi"><b>{sent.sent_count}</b><span>Gönderildi</span></div>
              <div className="bs-kpi"><b>{sent.delivered_count}</b><span>İletildi</span></div>
              <div className="bs-kpi"><b>{sent.read_count}</b><span>Okundu</span></div>
              <div className="bs-kpi"><b style={{ color: sent.failed_count ? "var(--bs-bad)" : undefined }}>{sent.failed_count}</b><span>Başarısız</span></div>
            </div>
            {sent.materialize_error && <div className="bs-alert tone-bad">{sent.materialize_error}</div>}
          </section>
        )}

        <div className="bs-studio">
          <div className="bs-col">
            <AudienceComposer
              draft={draft}
              saved={saved}
              onSaveAudience={async (name) => {
                await createSavedAudience({ name, query: draft.query, description: querySummary(draft.query) });
                await loadSaved();
                showToast("Kitle kaydedildi.", "success");
              }}
              onDeleteSaved={async (id) => {
                await deleteSavedAudience(id);
                await loadSaved();
              }}
            />
          </div>

          <div className="bs-col">
            <section className="bs-card">
              <div className="bs-card-head">
                <div>
                  <h2><span className="bs-step">2</span>Ne gönderilecek?</h2>
                  <p>Meta onaylı şablon seçin; değişkenler önizlemede anında dolar.</p>
                </div>
              </div>
              <div className="tg">
                <CampaignDuyuruPicker
                  title={draft.title}
                  onTitleChange={draft.setTitle}
                  accounts={draft.accounts}
                  accountId={draft.accountId}
                  onAccountChange={draft.setAccountId}
                  personTypes={draft.personTypes}
                  templateName={draft.templateName}
                  selectedTemplate={draft.selectedTemplate}
                  onTemplateChange={draft.onTemplateChange}
                  variableValues={draft.variableValues}
                  onVariableValuesChange={draft.setVariableValues}
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                />
              </div>
            </section>
          </div>
        </div>

        <div className="bs-sendbar">
          <div className="bs-sendbar-inner">
            <div className="bs-sendbar-summary">
              <div className="bs-checks">
                {checks.map((c) => (
                  <span key={c.label} className={`bs-check ${c.ok ? "ok" : "todo"}`}>{c.label}</span>
                ))}
              </div>
              {account && (
                <>
                  <span className="sep" />
                  <span>Hat: <strong>{accountLabel(account)}</strong></span>
                </>
              )}
            </div>
            <div className="bs-sendbar-actions">
              <button type="button" className="bs-btn" onClick={() => { draft.reset(); setAttachments([]); }} disabled={submitting}>
                Sıfırla
              </button>
              <button type="button" className="bs-btn-primary" disabled={!canSend} onClick={() => void openConfirm()}>
                {deliverable > 0 ? `${deliverable.toLocaleString("tr-TR")} kişiye gönder` : "Gönder"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <CommDialog
        open={confirmOpen}
        title="Gönderimi onayla"
        description="Gönderim kuyruğa alınır ve geri alınamaz; yalnız bekleyen mesajlar iptal edilebilir."
        width={520}
        onClose={() => !submitting && setConfirmOpen(false)}
        footer={
          <>
            <button type="button" className="bs-btn" onClick={() => setConfirmOpen(false)} disabled={submitting}>Vazgeç</button>
            <button type="button" className="bs-btn-primary" onClick={() => void send()} disabled={submitting}>
              {submitting ? "Gönderiliyor…" : `${deliverable.toLocaleString("tr-TR")} kişiye gönder`}
            </button>
          </>
        }
      >
        <div className="bs">
          <dl className="bs-facts" style={{ marginBottom: 12 }}>
            <div><dt>Alıcı</dt><dd><strong>{deliverable.toLocaleString("tr-TR")}</strong> gönderilebilir{(draft.preview?.unsuitable_count || 0) > 0 && <span className="bs-muted"> · {draft.preview?.unsuitable_count} atlanacak</span>}</dd></div>
            <div><dt>Şablon</dt><dd>{draft.selectedTemplate?.name} <span className="bs-muted">({draft.templateLanguage})</span></dd></div>
            <div><dt>Hat</dt><dd>{account ? accountLabel(account) : "Varsayılan"}</dd></div>
            {attachments.length > 0 && <div><dt>Ek</dt><dd>{attachments.length} dosya</dd></div>}
          </dl>
          <div className="bs-small bs-muted" style={{ marginBottom: 6 }}>İlk alıcılar</div>
          {confirmSample === null ? (
            <div className="bs-skeleton" style={{ height: 40 }} />
          ) : confirmSample.length === 0 ? (
            <div className="bs-small bs-muted">Liste alınamadı.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.86rem", lineHeight: 1.6 }}>
              {confirmSample.map((r) => (
                <li key={r.key}>{r.display_name} <span className="bs-muted">· {r.phone || r.e164}{r.class_or_role ? ` · ${r.class_or_role}` : ""}</span></li>
              ))}
              {deliverable > confirmSample.length && <li className="bs-muted">…ve {deliverable - confirmSample.length} kişi daha</li>}
            </ul>
          )}
          {account?.send_error && (
            <div className="bs-alert tone-warn" style={{ marginTop: 10 }}>
              Bu hat son gönderimde hata verdi: {account.send_error.error}
            </div>
          )}
        </div>
      </CommDialog>

      <CommToast toast={toast} />
    </CommunicationPageShell>
  );
}
