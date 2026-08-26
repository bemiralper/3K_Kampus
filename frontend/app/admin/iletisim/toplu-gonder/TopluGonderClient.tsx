"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";
import "../panel/iletisim-panel.css";
import "./toplu-gonder.css";
import {
  AudienceCatalog,
  AudienceFilter,
  AudiencePersonType,
  AudienceQueryPreview,
  BulkRecipientHit,
  CAMPAIGN_STATUS_LABELS,
  CampaignAttachmentItem,
  CampaignItem,
  SavedAudienceItem,
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
  cancelCampaign,
  createCampaign,
  createSavedAudience,
  deleteSavedAudience,
  fetchAccessibleWhatsAppAccounts,
  fetchAudienceCatalog,
  fetchCampaigns,
  fetchSavedAudiences,
  previewAudienceQuery,
} from "@/lib/communication-api";
import CampaignDuyuruPicker from "./CampaignDuyuruPicker";
import FilterBuilder from "./FilterBuilder";
import PersonPicker from "./PersonPicker";
import RecipientsModal from "./RecipientsModal";
import {
  applyQuickStart,
  emptyAudienceQuery,
  hasIncluded,
  includePerson,
  listedIncludes,
  personTypeLabel,
  querySummary,
  removeIncluded,
  togglePersonType,
} from "./audience-utils";

const STEPS = [
  { title: "Kitle", hint: "Kime" },
  { title: "Mesaj", hint: "Ne yazılacak" },
  { title: "Kontrol & Gönder", hint: "Son kontrol" },
];

export interface TopluGonderClientProps {
  mode?: "admin" | "coach" | "muhasebe";
  breadcrumbs?: Array<{ label: string; href?: string }>;
  campaignDetailPath?: (id: string) => string;
}

export default function TopluGonderClient({
  mode = "admin",
  breadcrumbs,
  campaignDetailPath,
}: TopluGonderClientProps) {
  const isCoach = mode === "coach";
  const detailPath = campaignDetailPath || ((id: string) => `/admin/iletisim/kampanyalar/${id}`);
  const [tab, setTab] = useState<"compose" | "history" | "saved">("compose");
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState<AudienceFilter>(() => emptyAudienceQuery(isCoach ? ["ogrenci"] : []));
  const [catalog, setCatalog] = useState<AudienceCatalog | null>(null);
  const [preview, setPreview] = useState<AudienceQueryPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("tr");
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppMetaTemplateItem | null>(null);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<CampaignAttachmentItem[]>([]);
  const [pickedLabels, setPickedLabels] = useState<Record<string, BulkRecipientHit>>({});
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentCampaign, setSentCampaign] = useState<CampaignItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<CampaignItem[]>([]);
  const [saved, setSaved] = useState<SavedAudienceItem[]>([]);

  const personTypes = (query.person_types || []) as AudiencePersonType[];

  useEffect(() => {
    fetchAudienceCatalog(personTypes.length ? personTypes : undefined)
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, [personTypes.join("|")]);

  useEffect(() => {
    fetchAccessibleWhatsAppAccounts()
      .then((res) => {
        setAccounts(res.accounts || []);
        setAccountId(res.default_account_id || res.accounts?.[0]?.id || "");
      })
      .catch(() => setAccounts([]));
  }, []);

  const loadPreview = useCallback(async () => {
    if (!personTypes.length && !hasIncluded(query)) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      setPreview(await previewAudienceQuery(query));
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [query, personTypes.length]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadPreview(), 280);
    return () => window.clearTimeout(id);
  }, [loadPreview]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetchCampaigns();
      setHistory(res.campaigns || []);
    } catch {
      setHistory([]);
    }
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetchSavedAudiences();
      setSaved(res.items || []);
    } catch {
      setSaved([]);
    }
  }, []);

  useEffect(() => {
    if (tab === "history") void loadHistory();
    if (tab === "saved") void loadSaved();
  }, [tab, loadHistory, loadSaved]);

  const setPersonTypes = (types: AudiencePersonType[]) => {
    setQuery((prev) => ({ ...prev, person_types: types }));
  };

  const defaultCrumbs = isCoach
    ? [{ label: "Koç Paneli", href: "/coach/dashboard" }, { label: "Toplu Gönderim" }]
    : mode === "muhasebe"
      ? [{ label: "WhatsApp", href: "/muhasebe/iletisim/mesajlar" }, { label: "Toplu Gönderim" }]
      : [{ label: "İletişim", href: "/admin/iletisim/panel" }, { label: "Toplu Gönderim" }];

  const includedPeople = listedIncludes(query);
  const pickedKeys = useMemo(
    () => new Set(includedPeople.map((item) => `${item.kind}:${item.id}`)),
    [includedPeople],
  );
  const canContinueAudience = (preview?.deliverable_count || 0) > 0;
  const body = selectedTemplate?.body_named || "";
  const previewBody = fillPreview(body, message);
  const canSend = !!templateName && (preview?.deliverable_count || 0) > 0 && message.trim().length > 0;

  const startSend = async () => {
    if (!canSend) return;
    setSubmitting(true);
    setError(null);
    try {
      const campaign = await createCampaign({
        title: title.trim() || querySummary(query),
        body: body || undefined,
        template_name: templateName,
        template_language: templateLanguage,
        audience_filter: query,
        attachment_ids: attachments.map((a) => a.id),
        send_options: { template_context: { mesaj: message } },
        channel_config_id: accountId || undefined,
      });
      setSentCampaign(campaign);
      setTab("history");
      void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gönderim başlatılamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const saveAudience = async () => {
    if (!saveName.trim()) return;
    setSaveBusy(true);
    try {
      await createSavedAudience({ name: saveName.trim(), query, description: querySummary(query) });
      setSaveName("");
      setTab("saved");
      void loadSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kitle kaydedilemedi");
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <CommunicationPageShell
      title="Toplu Gönderim"
      subtitle="Genel WhatsApp mesajı için kitle oluşturun ve gönderin"
      icon="📢"
      breadcrumbs={breadcrumbs || defaultCrumbs}
      maxWidth="full"
      className={isCoach ? "comm-page--coach" : undefined}
    >
      <div className="tg">
        <div className="tg-tabs" role="tablist">
          {[
            ["compose", "Yeni Gönderim"],
            ["history", "Son Gönderimler"],
            ["saved", "Kayıtlı Kitleler"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`tg-tab${tab === key ? " is-on" : ""}`}
              onClick={() => setTab(key as typeof tab)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="comm-alert comm-alert-danger">{error}</div>}

        {tab === "compose" && (
          <>
            <div className="tg-stepper">
              {STEPS.map((item, i) => (
                <div key={item.title} className="tg-step-wrap" style={{ display: "contents" }}>
                  <div className={`tg-step${step === i ? " is-on" : ""}${step > i ? " is-done" : ""}`}>
                    <span className="tg-step-num">{i + 1}</span>
                    <span className="tg-step-copy">
                      <strong>{item.title}</strong>
                      <span>{item.hint}</span>
                    </span>
                  </div>
                  {i < STEPS.length - 1 && <div className={`tg-step-line${step > i ? " is-done" : ""}`} />}
                </div>
              ))}
            </div>

            {step === 0 && (
              <div className="tg-grid">
                <section className="tg-card">
                  <h2>Kime mesaj göndermek istiyorsunuz?</h2>
                  <p className="lead">Filtreleri kullanarak göndermek istediğiniz kişi grubunu oluşturun.</p>

                  <div className="tg-quick">
                    {(catalog?.quick_starts || []).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="tg-chip"
                        title={item.hint}
                        onClick={() => setQuery(applyQuickStart(item.person_types, item.add_field))}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <div className="tg-types">
                    {(catalog?.person_types || [
                      { key: "ogrenci" as const, label: "Öğrenci" },
                      { key: "veli" as const, label: "Veli" },
                      ...(!isCoach ? [{ key: "personel" as const, label: "Personel" }] : []),
                    ]).map((item) => {
                      const on = personTypes.includes(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`tg-type${on ? " is-on" : ""}`}
                          onClick={() => setPersonTypes(togglePersonType(personTypes, item.key))}
                        >
                          <span className={`tg-check${on ? " is-on" : ""}`} aria-hidden="true" />
                          <strong>{item.label}</strong>
                          <span>{on ? "Seçili" : "Seçilmedi"}</span>
                        </button>
                      );
                    })}
                  </div>

                  <PersonPicker
                    allowPersonel={!isCoach}
                    excludeKeys={pickedKeys}
                    onPick={(hit) => {
                      setQuery((prev) => includePerson(prev, hit.kind, hit.id));
                      setPickedLabels((prev) => ({ ...prev, [`${hit.kind}:${hit.id}`]: hit }));
                    }}
                  />

                  {includedPeople.length > 0 && (
                    <div className="tg-multi" style={{ margin: "10px 0 16px" }}>
                      {includedPeople.map((item) => {
                        const key = `${item.kind}:${item.id}`;
                        const hit = pickedLabels[key];
                        return (
                          <span key={key} className="tg-pill">
                            {hit?.label || `${personTypeLabel(item.kind)} #${item.id}`}
                            <small>{personTypeLabel(item.kind)}</small>
                            <button
                              type="button"
                              className="tg-pill-x"
                              aria-label="Kaldır"
                              onClick={() => setQuery((prev) => removeIncluded(prev, item.kind, item.id))}
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {personTypes.length > 0 && (
                    <FilterBuilder
                      query={query}
                      catalog={catalog}
                      personTypes={personTypes}
                      onChange={setQuery}
                    />
                  )}
                </section>

                <aside className="tg-summary">
                  <div className="tg-kpi">
                    <div className="num">{previewLoading ? "…" : (preview?.matched_count ?? 0).toLocaleString("tr-TR")}</div>
                    <div className="lbl">kişilik kitle</div>
                    <div className="tg-kpi-row">
                      <span>Öğrenci <b>{preview?.ogrenci_count ?? 0}</b></span>
                      <span>Veli <b>{preview?.veli_count ?? 0}</b></span>
                      {!isCoach && <span>Personel <b>{preview?.personel_count ?? 0}</b></span>}
                    </div>
                    <div className="tg-kpi-row">
                      <span className="tg-ok">Gönderilebilir <b>{preview?.deliverable_count ?? 0}</b></span>
                      <span className="tg-warn">Uygun değil <b>{preview?.unsuitable_count ?? 0}</b></span>
                    </div>
                  </div>
                  <button type="button" className="tg-btn" onClick={() => setShowRecipients(true)}>
                    Alıcıları gör / kişi seç
                  </button>
                  <div className="tg-card" style={{ padding: 14 }}>
                    <strong style={{ fontSize: 13 }}>Kitleyi kaydet</strong>
                    <input
                      className="tg-search"
                      style={{ margin: "8px 0" }}
                      placeholder="Örn. 11-A velileri"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                    />
                    <button type="button" className="tg-btn" disabled={!saveName.trim() || saveBusy} onClick={() => void saveAudience()}>
                      {saveBusy ? "Kaydediliyor…" : "Kitleyi kaydet"}
                    </button>
                  </div>
                </aside>
              </div>
            )}

            {step === 1 && (
              <CampaignDuyuruPicker
                title={title}
                onTitleChange={setTitle}
                accounts={accounts}
                accountId={accountId}
                onAccountChange={setAccountId}
                personTypes={personTypes}
                templateName={templateName}
                selectedTemplate={selectedTemplate}
                onTemplateChange={(name, lang, tpl) => {
                  setTemplateName(name);
                  if (lang) setTemplateLanguage(lang);
                  setSelectedTemplate(tpl);
                }}
                message={message}
                onMessageChange={setMessage}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />
            )}

            {step === 2 && (
              <section className="tg-card">
                <h2>Kontrol & gönder</h2>
                <p className="lead">Gönderimi başlatmadan önce kitle ve mesajı kontrol edin.</p>
                <div className="tg-kpi-row" style={{ justifyContent: "flex-start", gap: 24 }}>
                  <div>
                    <div className="lbl">Kitle</div>
                    <strong>{querySummary(query)}</strong>
                  </div>
                  <div>
                    <div className="lbl">Alıcı</div>
                    <strong>{preview?.matched_count ?? 0} kişi</strong>
                  </div>
                  <div>
                    <div className="lbl">Gönderilebilir</div>
                    <strong className="tg-ok">{preview?.deliverable_count ?? 0} kişi</strong>
                  </div>
                </div>
                <p style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{previewBody || "Mesaj seçilmedi"}</p>
                <p className="lead">Ek: {attachments.length ? attachments.map((a) => a.original_name).join(", ") : "Yok"}</p>
              </section>
            )}

            {sentCampaign && (
              <div className="tg-card">
                <strong>Gönderim kuyruğa alındı</strong>
                <div className="tg-kpi-row">
                  <span>Toplam <b>{sentCampaign.total_recipients}</b></span>
                  <span>Başarılı <b>{sentCampaign.sent_count}</b></span>
                  <span>Başarısız <b>{sentCampaign.failed_count}</b></span>
                  <span>Bekleyen <b>{Math.max(0, (sentCampaign.total_recipients || 0) - (sentCampaign.sent_count || 0) - (sentCampaign.failed_count || 0))}</b></span>
                </div>
                <Link href={detailPath(sentCampaign.id)}>Gönderim detayı</Link>
              </div>
            )}

            <div className="tg-footer">
              <button
                type="button"
                className="tg-btn"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Geri
              </button>
              {step < 2 ? (
                <button
                  type="button"
                  className="tg-btn-primary"
                  disabled={step === 0 ? !canContinueAudience : !templateName || !message.trim()}
                  onClick={() => setStep((s) => s + 1)}
                >
                  {step === 0 ? "Mesaj oluştur" : "Kontrole geç"}
                </button>
              ) : (
                <div className="tg-actions-row">
                  <button type="button" className="tg-btn" onClick={() => setStep(1)}>Mesajı düzenle</button>
                  <button type="button" className="tg-btn-primary" disabled={!canSend || submitting} onClick={() => void startSend()}>
                    {submitting ? "Gönderiliyor…" : "Gönderimi başlat"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "history" && (
          <HistoryTab items={history} detailPath={detailPath} onCancel={async (id) => {
            await cancelCampaign(id);
            void loadHistory();
          }} />
        )}

        {tab === "saved" && (
          <SavedTab
            items={saved}
            onUse={(item) => {
              setQuery({ ...item.query, audience_type: "query" });
              setTab("compose");
              setStep(0);
            }}
            onDelete={async (id) => {
              await deleteSavedAudience(id);
              void loadSaved();
            }}
          />
        )}
      </div>

      {showRecipients && (
        <RecipientsModal
          query={query}
          allowPersonel={!isCoach}
          onClose={() => setShowRecipients(false)}
          onChangeQuery={setQuery}
        />
      )}
    </CommunicationPageShell>
  );
}

function HistoryTab({
  items,
  detailPath,
  onCancel,
}: {
  items: CampaignItem[];
  detailPath: (id: string) => string;
  onCancel: (id: string) => Promise<void>;
}) {
  if (!items.length) return <div className="tg-empty">Henüz gönderim yok.</div>;
  return (
    <div className="tg-history">
      <div className="tg-row head">
        <span>Tarih</span><span>Kitle</span><span>Mesaj</span><span>Alıcı</span>
        <span>Başarılı</span><span>Başarısız</span><span>Durum</span><span>Gönderen</span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="tg-row">
          <span>{formatDate(item.created_at)}</span>
          <span>{querySummary(item.recipient_filter_json || {})}</span>
          <span>{item.title || "Genel mesaj"}</span>
          <span>{item.total_recipients}</span>
          <span>{item.sent_count}</span>
          <span>{item.failed_count}</span>
          <span>
            <span className="tg-badge">{CAMPAIGN_STATUS_LABELS[item.status] || item.status}</span>
            {["QUEUED", "PROCESSING", "DRAFT"].includes(item.status) && (
              <button type="button" className="tg-btn-ghost" onClick={() => void onCancel(item.id)}>İptal</button>
            )}
          </span>
          <span>
            {item.created_by_name || "—"}
            <div><Link href={detailPath(item.id)}>Detay</Link></div>
          </span>
        </div>
      ))}
    </div>
  );
}

function SavedTab({
  items,
  onUse,
  onDelete,
}: {
  items: SavedAudienceItem[];
  onUse: (item: SavedAudienceItem) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  if (!items.length) return <div className="tg-empty">Kayıtlı kitle yok. Kitle adımında “Kitleyi kaydet” ile ekleyin.</div>;
  return (
    <div className="tg-saved">
      {items.map((item) => (
        <div key={item.id} className="tg-card">
          <div className="tg-group-head">
            <div>
              <strong>{item.name}</strong>
              <p className="lead" style={{ marginBottom: 0 }}>{item.description}</p>
              {item.counts && (
                <p className="lead">Şu an {item.counts.deliverable_count} gönderilebilir kişi</p>
              )}
            </div>
            <div className="tg-actions-row">
              <button type="button" className="tg-btn-primary" onClick={() => onUse(item)}>Kullan</button>
              <button type="button" className="tg-btn" onClick={() => void onDelete(item.id)}>Sil</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function fillPreview(body: string, message: string): string {
  return body.replace(/\{\{\s*mesaj\s*\}\}/g, message.trim() || "{{mesaj}}");
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("tr-TR");
  } catch {
    return iso;
  }
}
