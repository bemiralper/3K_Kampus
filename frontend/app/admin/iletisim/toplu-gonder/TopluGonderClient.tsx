"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CommConfirmDialog,
  CommDialog,
  CommToast,
  CommunicationPageShell,
  WhatsAppPhonePreview,
  useCommToast,
  type CommConfirmState,
} from "@/components/communication";
import "@/components/communication/communication.css";
import "../panel/iletisim-panel.css";
import "./toplu-gonder.css";
import {
  AudienceCatalog,
  AudienceFilter,
  AudiencePersonType,
  AudienceQueryPreview,
  AudienceRecipientRow,
  BulkRecipientHit,
  CAMPAIGN_STATUS_LABELS,
  CampaignAttachmentItem,
  CampaignItem,
  SavedAudienceItem,
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
  accountLabel,
  campaignStatusBadgeClass,
  cancelCampaign,
  communicationPortalPaths,
  createCampaign,
  createSavedAudience,
  deleteSavedAudience,
  describeAudienceSummary,
  fetchAccessibleWhatsAppAccounts,
  fetchAudienceCatalog,
  fetchAudienceRecipients,
  fetchCampaigns,
  fetchSavedAudiences,
  isCampaignActive,
  newCampaignClientToken,
  previewAudienceQuery,
} from "@/lib/communication-api";
import CampaignDuyuruPicker, {
  campaignMessageReady,
  composePreview,
} from "./CampaignDuyuruPicker";
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

const HISTORY_PAGE_SIZE = 20;
const DRAFT_SAVE_DELAY_MS = 500;

/** sessionStorage'a yazılan taslak — ekler (dosya) kasıtlı olarak dışarıda. */
interface TopluGonderDraft {
  v: 1;
  query: AudienceFilter;
  title: string;
  templateName: string;
  templateLanguage: string;
  variableValues: Record<string, string>;
  accountId: string;
  step: number;
  savedAt: string;
}

function draftStorageKey(mode: string): string {
  return `tg-draft:${mode}`;
}

/** Boş formu taslak sayma — banner ve kayıt yalnız gerçek içerik varsa. */
function draftHasContent(
  draft: Pick<TopluGonderDraft, "query" | "title" | "templateName" | "variableValues" | "step">,
  isCoach: boolean,
): boolean {
  const types = draft.query.person_types || [];
  return (
    !!draft.title.trim()
    || !!draft.templateName
    || Object.values(draft.variableValues).some((v) => (v || "").trim())
    || hasIncluded(draft.query)
    || (isCoach ? types.join("|") !== "ogrenci" : types.length > 0)
    || draft.step > 0
  );
}

function readDraft(mode: string): TopluGonderDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(draftStorageKey(mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TopluGonderDraft>;
    if (!parsed || parsed.v !== 1 || !parsed.query || typeof parsed.query !== "object") return null;
    return {
      v: 1,
      query: parsed.query,
      title: typeof parsed.title === "string" ? parsed.title : "",
      templateName: typeof parsed.templateName === "string" ? parsed.templateName : "",
      templateLanguage: typeof parsed.templateLanguage === "string" ? parsed.templateLanguage : "tr",
      variableValues:
        parsed.variableValues && typeof parsed.variableValues === "object" ? parsed.variableValues : {},
      accountId: typeof parsed.accountId === "string" ? parsed.accountId : "",
      step: typeof parsed.step === "number" ? Math.min(2, Math.max(0, parsed.step)) : 0,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

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
  const detailPath: (id: string) => string =
    campaignDetailPath ?? communicationPortalPaths(mode).campaign;
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
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<CampaignAttachmentItem[]>([]);
  const [pickedLabels, setPickedLabels] = useState<Record<string, BulkRecipientHit>>({});
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentCampaign, setSentCampaign] = useState<CampaignItem | null>(null);
  const [idempotentReplay, setIdempotentReplay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gönderim onayı
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSample, setConfirmSample] = useState<AudienceRecipientRow[]>([]);
  // Aynı gönderim için tek anahtar: başarılı yanıta kadar korunur, ağ hatasında
  // tekrar aynı anahtarla gider; yeni gönderimde sıfırdan üretilir.
  const clientTokenRef = useRef<string | null>(null);

  // Taslak
  const draftHydrated = useRef(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const [history, setHistory] = useState<CampaignItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyConfirm, setHistoryConfirm] = useState<CommConfirmState | null>(null);
  const [saved, setSaved] = useState<SavedAudienceItem[]>([]);
  const { toast, show: showToast } = useCommToast();

  const personTypes = (query.person_types || []) as AudiencePersonType[];
  const includedPeople = listedIncludes(query);
  const audienceKinds = useMemo<AudiencePersonType[]>(() => {
    if (personTypes.length) return personTypes;
    return Array.from(new Set(includedPeople.map((item) => item.kind)));
  }, [personTypes.join("|"), includedPeople.map((item) => item.kind).join("|")]);

  // ── Taslak: sayfa açılınca geri yükle ──
  useEffect(() => {
    const draft = readDraft(mode);
    if (draft && draftHasContent(draft, isCoach)) {
      setQuery(draft.query);
      setTitle(draft.title);
      setTemplateName(draft.templateName);
      setTemplateLanguage(draft.templateLanguage || "tr");
      setVariableValues(draft.variableValues);
      if (draft.accountId) setAccountId(draft.accountId);
      setStep(draft.step);
      setDraftRestored(true);
    }
    draftHydrated.current = true;
  }, [mode, isCoach]);

  // ── Taslak: değişiklikte gecikmeli kaydet (boş form → kayıt silinir) ──
  useEffect(() => {
    if (!draftHydrated.current || typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      const payload: TopluGonderDraft = {
        v: 1,
        query,
        title,
        templateName,
        templateLanguage,
        variableValues,
        accountId,
        step,
        savedAt: new Date().toISOString(),
      };
      try {
        if (draftHasContent(payload, isCoach)) {
          window.sessionStorage.setItem(draftStorageKey(mode), JSON.stringify(payload));
        } else {
          window.sessionStorage.removeItem(draftStorageKey(mode));
        }
      } catch {
        /* kota dolu / gizli mod — taslak kaydı isteğe bağlı */
      }
    }, DRAFT_SAVE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [mode, isCoach, query, title, templateName, templateLanguage, variableValues, accountId, step]);

  const clearDraftStorage = useCallback(() => {
    try {
      window.sessionStorage.removeItem(draftStorageKey(mode));
    } catch {
      /* yok say */
    }
  }, [mode]);

  const resetCompose = useCallback(() => {
    setQuery(emptyAudienceQuery(isCoach ? ["ogrenci"] : []));
    setTitle("");
    setTemplateName("");
    setTemplateLanguage("tr");
    setSelectedTemplate(null);
    setVariableValues({});
    setAttachments([]);
    setPickedLabels({});
    setStep(0);
    setPreview(null);
    setDraftRestored(false);
  }, [isCoach]);

  const clearDraft = () => {
    clearDraftStorage();
    resetCompose();
    showToast("Taslak temizlendi.", "info");
  };

  const hasDraftContent = draftHasContent(
    { query, title, templateName, variableValues, step },
    isCoach,
  );

  useEffect(() => {
    fetchAudienceCatalog(personTypes.length ? personTypes : undefined)
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, [personTypes.join("|")]);

  useEffect(() => {
    fetchAccessibleWhatsAppAccounts()
      .then((res) => {
        const list = res.accounts || [];
        setAccounts(list);
        // Taslaktan gelen hesap hâlâ erişilebilirse koru; yoksa varsayılana dön.
        setAccountId((prev) =>
          prev && list.some((acc) => acc.id === prev)
            ? prev
            : res.default_account_id || list[0]?.id || "",
        );
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

  /**
   * Geçmiş listesi.
   * - reset: ilk sayfayı baştan yükle
   * - poll: ilk sayfayı çek, yüklü satırları kimliğe göre güncelle (ek sayfalar korunur)
   * - more: sıradaki sayfayı ekle
   */
  const historyLengthRef = useRef(0);
  useEffect(() => {
    historyLengthRef.current = history.length;
  }, [history.length]);

  const loadHistory = useCallback(async (kind: "reset" | "poll" | "more" = "reset") => {
    if (kind === "reset") setHistoryLoading(true);
    if (kind === "more") setHistoryLoadingMore(true);
    try {
      const loaded = historyLengthRef.current;
      const offset = kind === "more" ? loaded : 0;
      const res = await fetchCampaigns({ limit: HISTORY_PAGE_SIZE, offset });
      setHistoryTotal(res.total);
      if (kind === "more") {
        setHistory((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...res.campaigns.filter((item) => !seen.has(item.id))];
        });
        setHistoryHasMore(res.has_more);
      } else if (kind === "poll" && loaded > res.campaigns.length) {
        // Ek sayfalar yüklüyse: ilk sayfayı kimliğe göre yerinde güncelle, yenileri başa ekle.
        setHistory((prev) => {
          const fresh = new Map(res.campaigns.map((item) => [item.id, item]));
          const merged = prev.map((item) => fresh.get(item.id) || item);
          const known = new Set(prev.map((item) => item.id));
          const added = res.campaigns.filter((item) => !known.has(item.id));
          return added.length ? [...added, ...merged] : merged;
        });
      } else {
        setHistory(res.campaigns);
        setHistoryHasMore(res.has_more);
      }
    } catch {
      if (kind === "reset") setHistory([]);
    } finally {
      setHistoryLoading(false);
      setHistoryLoadingMore(false);
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
    if (tab === "history") void loadHistory("reset");
    if (tab === "saved") void loadSaved();
  }, [tab, loadHistory, loadSaved]);

  // Kuyruk arka planda işlenir; devam eden gönderim varken yalnız ilk sayfayı tazele.
  const historyInflight = history.some((item) => isCampaignActive(item.status));
  useEffect(() => {
    if (tab !== "history" || !historyInflight) return;
    const id = window.setInterval(() => void loadHistory("poll"), 5000);
    return () => window.clearInterval(id);
  }, [tab, historyInflight, loadHistory]);

  const setPersonTypes = (types: AudiencePersonType[]) => {
    setQuery((prev) => ({ ...prev, person_types: types }));
  };

  const defaultCrumbs = isCoach
    ? [{ label: "Koç Paneli", href: "/coach/dashboard" }, { label: "Toplu Gönderim" }]
    : mode === "muhasebe"
      ? [{ label: "WhatsApp", href: "/muhasebe/iletisim/sohbetler" }, { label: "Toplu Gönderim" }]
      : [{ label: "İletişim", href: "/admin/iletisim/panel" }, { label: "Toplu Gönderim" }];

  const pickedKeys = useMemo(
    () => new Set(includedPeople.map((item) => `${item.kind}:${item.id}`)),
    [includedPeople],
  );
  const canContinueAudience = (preview?.deliverable_count || 0) > 0;
  const body = selectedTemplate?.body_named || "";
  const previewBody = composePreview(selectedTemplate, variableValues);
  const templateReady = campaignMessageReady(
    selectedTemplate,
    variableValues,
    attachments,
  );
  const canSend = templateReady && (preview?.deliverable_count || 0) > 0;
  const selectedAccount = accounts.find((acc) => acc.id === accountId) || null;

  const openConfirm = () => {
    if (!canSend) return;
    if (!clientTokenRef.current) clientTokenRef.current = newCampaignClientToken();
    setConfirmError(null);
    setConfirmSample([]);
    setConfirmOpen(true);
    fetchAudienceRecipients(query, { page: 1, pageSize: 3 })
      .then((res) => setConfirmSample((res.recipients || []).filter((row) => row.deliverable).slice(0, 3)))
      .catch(() => setConfirmSample([]));
  };

  const startSend = async () => {
    if (!canSend || submitting) return;
    if (!clientTokenRef.current) clientTokenRef.current = newCampaignClientToken();
    setSubmitting(true);
    setConfirmError(null);
    setError(null);
    try {
      const templateContext = Object.fromEntries(
        Object.entries(variableValues).filter(([, value]) => (value || "").trim()),
      );
      const campaign = await createCampaign({
        title: title.trim() || querySummary(query),
        body: body || undefined,
        template_name: templateName,
        template_language: templateLanguage,
        audience_filter: query,
        attachment_ids: attachments.map((a) => a.id),
        send_options: { template_context: templateContext },
        channel_config_id: accountId || undefined,
        client_token: clientTokenRef.current,
      });
      // Başarılı: anahtar tüketildi, taslak silinir, form sıfırlanır.
      clientTokenRef.current = null;
      clearDraftStorage();
      setIdempotentReplay(!!campaign.idempotent_replay);
      setSentCampaign(campaign);
      setConfirmOpen(false);
      resetCompose();
      setTab("history");
      showToast(
        campaign.idempotent_replay ? "Mevcut gönderim gösteriliyor." : "Gönderim kuyruğa alındı.",
        campaign.idempotent_replay ? "info" : "success",
      );
    } catch (err) {
      // Anahtar korunur: kullanıcı "Gönder"e tekrar basarsa sunucu çift kayıt açmaz.
      setConfirmError(err instanceof Error ? err.message : "Gönderim başlatılamadı");
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

  const askCancelCampaign = (item: CampaignItem) => {
    setHistoryConfirm({
      title: "Gönderimi iptal et",
      description: `"${item.title || "Genel mesaj"}" için bekleyen mesajlar iptal edilecek. Gönderilmiş mesajlar geri alınmaz.`,
      confirmLabel: "İptal et",
      danger: true,
      onConfirm: async () => {
        try {
          await cancelCampaign(item.id);
          showToast("Gönderim iptal edildi.");
          void loadHistory("poll");
        } catch (err) {
          showToast(err instanceof Error ? err.message : "İptal başarısız", "error");
        }
      },
    });
  };

  const pendingCount = sentCampaign
    ? Math.max(
      0,
      (sentCampaign.total_recipients || 0)
        - (sentCampaign.sent_count || 0)
        - (sentCampaign.failed_count || 0),
    )
    : 0;

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

        {sentCampaign && idempotentReplay && (
          <div className="comm-alert comm-alert-info">
            Bu gönderim zaten kuyruğa alınmış; yeni kampanya açılmadı.
          </div>
        )}

        {sentCampaign && (
          <div className="tg-card">
            <strong>Gönderim kuyruğa alındı</strong>
            <p className="lead" style={{ marginBottom: 8 }}>
              Alıcılar arka planda kuyruğa alınıp gönderilir. İlerlemeyi gönderim
              detayından izleyebilirsiniz.
            </p>
            <div className="tg-kpi-row">
              <span>Toplam <b>{sentCampaign.total_recipients}</b></span>
              <span>Başarılı <b>{sentCampaign.sent_count}</b></span>
              <span>Başarısız <b>{sentCampaign.failed_count}</b></span>
              <span>Bekleyen <b>{pendingCount}</b></span>
            </div>
            <Link href={detailPath(sentCampaign.id)}>Gönderim detayı</Link>
          </div>
        )}

        {tab === "compose" && (
          <>
            {draftRestored && (
              <div className="tg-info tg-draft-bar">
                <span>Kaydedilmiş taslak geri yüklendi. Dosya ekleri yeniden eklenmelidir.</span>
                <button type="button" className="tg-btn-ghost" onClick={clearDraft}>Taslağı temizle</button>
              </div>
            )}

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
                        onClick={() =>
                          setQuery(
                            applyQuickStart(item.person_types, item.add_field, item.add_value),
                          )
                        }
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
                    onPickMany={(hits) => {
                      setQuery((prev) => hits.reduce(
                        (acc, hit) => includePerson(acc, hit.kind, hit.id),
                        prev,
                      ));
                      setPickedLabels((prev) => {
                        const next = { ...prev };
                        for (const hit of hits) next[`${hit.kind}:${hit.id}`] = hit;
                        return next;
                      });
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
                personTypes={audienceKinds}
                templateName={templateName}
                selectedTemplate={selectedTemplate}
                onTemplateChange={(name, lang, tpl) => {
                  setTemplateName(name);
                  if (lang) setTemplateLanguage(lang);
                  setSelectedTemplate(tpl);
                }}
                variableValues={variableValues}
                onVariableValuesChange={setVariableValues}
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
                <p className="lead" style={{ marginTop: 16 }}>
                  Şablon: {selectedTemplate?.name || "seçilmedi"}
                  {selectedTemplate?.status_label ? ` · ${selectedTemplate.status_label}` : ""}
                  {selectedAccount ? ` · Hesap: ${accountLabel(selectedAccount)}` : ""}
                </p>
                {selectedAccount?.send_error && (
                  <p className="lead" style={{ marginTop: -8 }}>
                    <span className="comm-account-error-badge" title={selectedAccount.send_error.error}>
                      ⚠ Hesap hatası
                    </span>{" "}
                    <span style={{ color: "#b45309" }}>{selectedAccount.send_error.error}</span>
                  </p>
                )}
                <div style={{ marginTop: 12, maxWidth: 360 }}>
                  <WhatsAppPhonePreview
                    text={previewBody || "Mesaj seçilmedi"}
                    previewContext={variableValues}
                  />
                </div>
              </section>
            )}

            <div className="tg-footer">
              <div className="tg-actions-row" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className="tg-btn"
                  disabled={step === 0}
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  Geri
                </button>
                {hasDraftContent && !draftRestored && (
                  <button type="button" className="tg-btn-ghost" onClick={clearDraft}>
                    Taslağı temizle
                  </button>
                )}
              </div>
              {step < 2 ? (
                <button
                  type="button"
                  className="tg-btn-primary"
                  disabled={step === 0 ? !canContinueAudience : !templateReady}
                  onClick={() => setStep((s) => s + 1)}
                >
                  {step === 0 ? "Mesaj oluştur" : "Kontrole geç"}
                </button>
              ) : (
                <div className="tg-actions-row" style={{ marginTop: 0 }}>
                  <button type="button" className="tg-btn" onClick={() => setStep(1)}>Mesajı düzenle</button>
                  <button type="button" className="tg-btn-primary" disabled={!canSend || submitting} onClick={openConfirm}>
                    Gönderimi başlat
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "history" && (
          <HistoryTab
            items={history}
            total={historyTotal}
            hasMore={historyHasMore}
            loading={historyLoading}
            loadingMore={historyLoadingMore}
            detailPath={detailPath}
            onCancel={askCancelCampaign}
            onLoadMore={() => void loadHistory("more")}
          />
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

      <CommDialog
        open={confirmOpen}
        title="Gönderimi onayla"
        description="Aşağıdaki kitleye WhatsApp şablon mesajı gönderilecek. Bu işlem geri alınamaz."
        width={480}
        onClose={() => {
          if (!submitting) setConfirmOpen(false);
        }}
        footer={
          <>
            <button type="button" className="comm-btn-secondary" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Vazgeç
            </button>
            <button type="button" className="comm-btn-primary" onClick={() => void startSend()} disabled={!canSend || submitting}>
              {submitting ? "Gönderiliyor…" : "Gönder"}
            </button>
          </>
        }
      >
        {confirmError && <div className="comm-alert comm-alert-danger">{confirmError}</div>}
        <div className="comm-confirm-summary">
          <div>
            <span className="lbl">Gönderilebilir</span>
            <strong className="is-ok">{(preview?.deliverable_count ?? 0).toLocaleString("tr-TR")}</strong>
          </div>
          <div>
            <span className="lbl">Eşleşen</span>
            <strong>{(preview?.matched_count ?? 0).toLocaleString("tr-TR")}</strong>
          </div>
          <div>
            <span className="lbl">Uygun değil</span>
            <strong className={preview?.unsuitable_count ? "is-warn" : undefined}>
              {(preview?.unsuitable_count ?? 0).toLocaleString("tr-TR")}
            </strong>
          </div>
        </div>
        <ul className="comm-confirm-list">
          <li>
            <span>Kitle</span>
            <span>{querySummary(query)}</span>
          </li>
          <li>
            <span>Şablon</span>
            <span>
              {selectedTemplate?.name || templateName || "—"}
              {templateLanguage ? ` · ${templateLanguage}` : ""}
            </span>
          </li>
          <li>
            <span>Hesap</span>
            <span>
              {selectedAccount ? accountLabel(selectedAccount) : "Varsayılan hesap"}
              {selectedAccount?.send_error && (
                <>
                  {" "}
                  <span className="comm-account-error-badge" title={selectedAccount.send_error.error}>
                    ⚠ Hesap hatası
                  </span>
                </>
              )}
            </span>
          </li>
          <li>
            <span>Ek</span>
            <span>{attachments.length ? `${attachments.length} dosya` : "Yok"}</span>
          </li>
          {confirmSample.length > 0 && (
            <li>
              <span>İlk alıcılar</span>
              <span>
                {confirmSample.map((row) => row.display_name).join(", ")}
                {(preview?.deliverable_count ?? 0) > confirmSample.length ? " …" : ""}
              </span>
            </li>
          )}
        </ul>
      </CommDialog>

      <CommConfirmDialog state={historyConfirm} onClose={() => setHistoryConfirm(null)} />
      <CommToast toast={toast} />
    </CommunicationPageShell>
  );
}

function HistoryTab({
  items,
  total,
  hasMore,
  loading,
  loadingMore,
  detailPath,
  onCancel,
  onLoadMore,
}: {
  items: CampaignItem[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  detailPath: (id: string) => string;
  onCancel: (item: CampaignItem) => void;
  onLoadMore: () => void;
}) {
  if (loading && !items.length) return <div className="tg-empty">Gönderimler yükleniyor…</div>;
  if (!items.length) return <div className="tg-empty">Henüz gönderim yok.</div>;
  return (
    <div className="tg-history">
      <div className="tg-row head">
        <span>Tarih</span><span>Kitle</span><span>Mesaj</span><span>Alıcı</span>
        <span>Başarılı</span><span>Başarısız</span><span>Durum</span><span>Gönderen</span>
      </div>
      {items.map((item) => {
        const materializeError = (item.materialize_error || "").trim();
        const cancellable =
          !!item.can_manage && ["QUEUED", "PROCESSING", "DRAFT", "CONFIRMED"].includes(item.status);
        return (
          <div key={item.id} className="tg-row">
            <span data-label="Tarih">{formatDate(item.created_at)}</span>
            <span data-label="Kitle">{describeAudienceSummary(item.audience_summary)}</span>
            <span data-label="Mesaj" className="tg-row-primary">
              {item.title || item.template_name || "Genel mesaj"}
              {item.template_name && item.title && item.title !== item.template_name && (
                <small>{item.template_name}</small>
              )}
            </span>
            <span data-label="Alıcı">{item.total_recipients}</span>
            <span data-label="Başarılı">{item.sent_count}</span>
            <span data-label="Başarısız">{item.failed_count}</span>
            <span data-label="Durum" className="tg-row-status">
              <span className={`comm-status-badge ${campaignStatusBadgeClass(item.status)}`}>
                {CAMPAIGN_STATUS_LABELS[item.status] || item.status}
              </span>
              {item.status === "CONFIRMED" && (
                <small className="tg-row-progress">
                  Kuyruğa alınıyor {item.materialized_count ?? 0}/{item.total_recipients}
                </small>
              )}
              {materializeError && (
                <small className="tg-row-error" title={materializeError}>{materializeError}</small>
              )}
              {cancellable && (
                <button type="button" className="tg-btn-ghost" onClick={() => onCancel(item)}>İptal</button>
              )}
            </span>
            <span data-label="Gönderen">
              {item.created_by_name || "—"}
              <div><Link href={detailPath(item.id)}>Detay</Link></div>
            </span>
          </div>
        );
      })}
      {hasMore && (
        <div className="tg-actions-row" style={{ justifyContent: "center", marginTop: 4 }}>
          <button type="button" className="tg-btn" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? "Yükleniyor…" : `Daha fazla (${items.length}/${total})`}
          </button>
        </div>
      )}
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

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("tr-TR");
  } catch {
    return iso;
  }
}
