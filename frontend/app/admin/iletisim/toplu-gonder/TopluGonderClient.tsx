"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CommunicationPageShell,
  createComposerState,
  StepWizard,
  BulkSendStudio,
  AdvancedFilterPanel,
  RecipientPickerPanel,
  CampaignHistoryPanel,
} from "@/components/communication";
import "@/components/communication/communication.css";
import { AudienceFilter, CampaignPreviewStats, previewCampaign } from "@/lib/communication-api";
import { getContextHeaders } from "@/lib/api";
import RoleService from "@/app/roles/role.service";
import type { Role } from "@/app/roles/role.types";

const STORAGE_KEYS = { activeEgitimYili: "3k_active_egitim_yili" };

function readEgitimYiliId(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = localStorage.getItem(STORAGE_KEYS.activeEgitimYili);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    const id = typeof parsed === "object" && parsed?.id != null ? parsed.id : parsed;
    return Number(id) || undefined;
  } catch {
    return Number(raw) || undefined;
  }
}

export type BulkAudienceType =
  | "all_veliler"
  | "all_ogrenciler"
  | "all_personeller"
  | "sinif"
  | "coach_students"
  | "coach_parents"
  | "advanced"
  | "custom_ids";

export interface AudienceOption {
  value: BulkAudienceType;
  icon: string;
  title: string;
  description: string;
}

/** Portal / öğrenci rolleri personel kitlesinde gösterilmez. */
const PERSONEL_ROLE_EXCLUDE_CODES = new Set(["ogrenci", "okuyucu", "super_admin"]);

export const ADMIN_AUDIENCE_OPTIONS: AudienceOption[] = [
  { value: "custom_ids", icon: "🔎", title: "Arama ile seç", description: "Öğrenci, veli veya personel arayıp seçerek gönder" },
  { value: "all_veliler", icon: "👨‍👩‍👧", title: "Tüm veliler", description: "Duyuru opt-in vermiş tüm velilere gönder" },
  { value: "all_ogrenciler", icon: "🎓", title: "Tüm öğrenciler", description: "Aktif öğrencilere gönder" },
  { value: "all_personeller", icon: "🧑‍💼", title: "Personeller", description: "Role göre personel seç; istersen tek tek ekle/çıkar" },
  { value: "sinif", icon: "🏫", title: "Sınıf", description: "Belirli bir sınıfın velilerine gönder" },
  { value: "coach_students", icon: "🎯", title: "Koç öğrencileri", description: "Koçluk kapsamındaki öğrencilere gönder" },
  { value: "coach_parents", icon: "👪", title: "Koç velileri", description: "Koçluk kapsamındaki öğrenci velilerine gönder" },
  { value: "advanced", icon: "🧭", title: "Gelişmiş filtre", description: "Sınıf, kalem, koç, mali durum gibi kriterlere göre özel kitle oluştur" },
];

export const COACH_AUDIENCE_OPTIONS: AudienceOption[] = [
  { value: "custom_ids", icon: "🔎", title: "Arama ile seç", description: "Öğrenci veya veli arayıp seçerek gönder" },
  { value: "coach_students", icon: "🎯", title: "Öğrencilerim", description: "Koçluk kapsamındaki öğrencilere gönder" },
  { value: "coach_parents", icon: "👪", title: "Velilerim", description: "Koçluk kapsamındaki öğrenci velilerine gönder" },
];

type PageTab = "compose" | "history";

export interface TopluGonderClientProps {
  mode?: "admin" | "coach";
  breadcrumbs?: Array<{ label: string; href?: string }>;
  campaignDetailPath?: (id: string) => string;
}

export default function TopluGonderClient({
  mode = "admin",
  breadcrumbs,
  campaignDetailPath,
}: TopluGonderClientProps) {
  const isCoach = mode === "coach";
  const audienceOptions = isCoach ? COACH_AUDIENCE_OPTIONS : ADMIN_AUDIENCE_OPTIONS;
  const defaultAudience = isCoach ? "coach_students" : "all_veliler";

  const [pageTab, setPageTab] = useState<PageTab>("compose");
  const [step, setStep] = useState(0);
  const [audienceType, setAudienceType] = useState<BulkAudienceType>(defaultAudience as BulkAudienceType);
  const [sinifId, setSinifId] = useState("");
  const [composerState, setComposerState] = useState(createComposerState());
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("tr");
  const [title, setTitle] = useState("");
  const [miniPreview, setMiniPreview] = useState<CampaignPreviewStats | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siniflar, setSiniflar] = useState<Array<{ id: number; ad: string }>>([]);
  const [advancedFilter, setAdvancedFilter] = useState<AudienceFilter>({});
  const [pickedOgrenciIds, setPickedOgrenciIds] = useState<number[]>([]);
  const [pickedVeliIds, setPickedVeliIds] = useState<number[]>([]);
  const [pickedPersonelIds, setPickedPersonelIds] = useState<number[]>([]);
  /** Personel kitlesinde manuel eklenenler (rol filtresine ek). */
  const [includedPersonelIds, setIncludedPersonelIds] = useState<number[]>([]);
  const [selectedRolIds, setSelectedRolIds] = useState<number[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [historyKey, setHistoryKey] = useState(0);

  const buildFilter = useCallback((): AudienceFilter => {
    const egitimYiliId = readEgitimYiliId();
    const filter: AudienceFilter = { audience_type: audienceType };
    if (egitimYiliId) filter.egitim_yili_id = egitimYiliId;
    if (audienceType === "sinif" && sinifId) filter.sinif_id = Number(sinifId);
    if (audienceType === "advanced") {
      Object.assign(filter, advancedFilter);
    }
    if (audienceType === "custom_ids") {
      filter.ogrenci_ids = pickedOgrenciIds;
      filter.veli_ids = pickedVeliIds;
      if (!isCoach) filter.personel_ids = pickedPersonelIds;
    }
    if (audienceType === "all_personeller" && !isCoach) {
      if (selectedRolIds.length) filter.rol_ids = selectedRolIds;
      if (includedPersonelIds.length) filter.included_personel_ids = includedPersonelIds;
    }
    return filter;
  }, [
    audienceType,
    sinifId,
    advancedFilter,
    pickedOgrenciIds,
    pickedVeliIds,
    pickedPersonelIds,
    includedPersonelIds,
    selectedRolIds,
    isCoach,
  ]);

  useEffect(() => {
    if (isCoach) return;
    // Kurum/şube bağlamı header ile gider; ikisi de yoksa uç zaten 400 döner.
    const contextHeaders = getContextHeaders();
    if (!contextHeaders["X-Kurum-ID"] || !contextHeaders["X-Sube-ID"]) return;
    const egitimYiliId = readEgitimYiliId();
    const params = new URLSearchParams();
    if (egitimYiliId) params.set("egitim_yili_id", String(egitimYiliId));
    const qs = params.toString();
    fetch(`/api/siniflar/api/${qs ? `?${qs}` : ""}`, {
      credentials: "include",
      headers: contextHeaders,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = data?.siniflar || [];
        setSiniflar(
          list.map((s: { id: number; ad: string }) => ({ id: s.id, ad: s.ad })),
        );
      })
      .catch(() => null);
  }, [isCoach]);

  useEffect(() => {
    if (isCoach) return;
    RoleService.listRoles({ is_active: true })
      .then((res) => {
        const list = (res.success ? res.roles : []) || [];
        setRoles(
          list.filter((r) => !PERSONEL_ROLE_EXCLUDE_CODES.has((r.code || "").toLowerCase())),
        );
      })
      .catch(() => setRoles([]));
  }, [isCoach]);

  const toggleRol = (id: number) => {
    setSelectedRolIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  const refreshMiniPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const stats = await previewCampaign(buildFilter());
      setMiniPreview(stats);
    } catch {
      setMiniPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [buildFilter]);

  useEffect(() => {
    if (pageTab === "compose" && step === 0) refreshMiniPreview();
  }, [
    pageTab,
    step,
    audienceType,
    sinifId,
    advancedFilter,
    pickedOgrenciIds,
    pickedVeliIds,
    pickedPersonelIds,
    includedPersonelIds,
    selectedRolIds,
    refreshMiniPreview,
  ]);

  const handleNext = () => {
    if (step === 0 && audienceType === "sinif" && !sinifId) {
      setError("Lütfen bir sınıf seçin.");
      return;
    }
    if (
      step === 0 &&
      audienceType === "custom_ids" &&
      pickedOgrenciIds.length === 0 &&
      pickedVeliIds.length === 0 &&
      pickedPersonelIds.length === 0
    ) {
      setError(isCoach ? "En az bir öğrenci veya veli seçin." : "En az bir öğrenci, veli veya personel seçin.");
      return;
    }
    setError(null);
    setStep(1);
  };

  const defaultBreadcrumbs = isCoach
    ? [{ label: "Koç Paneli", href: "/coach/dashboard" }, { label: "Toplu Gönder" }]
    : [
        { label: "İletişim", href: "/admin/iletisim/toplu-gonder" },
        { label: "Toplu Gönderim" },
      ];

  const detailPath =
    campaignDetailPath ||
    ((id: string) => `/admin/iletisim/kampanyalar/${id}`);

  return (
    <CommunicationPageShell
      title="Toplu Gönderim"
      subtitle={isCoach ? "Öğrenci ve velilerinize WhatsApp mesajı gönderin" : "WhatsApp toplu mesaj oluşturun ve geçmişi takip edin"}
      icon="📢"
      breadcrumbs={breadcrumbs || defaultBreadcrumbs}
      className={isCoach ? "comm-page--coach" : undefined}
    >
      <div className="comm-tabbar" style={{ marginBottom: "1rem" }}>
        <div className="comm-tabs" role="tablist" aria-label="Toplu gönderim sekmeleri">
          <button
            type="button"
            role="tab"
            aria-selected={pageTab === "compose"}
            className={`comm-tab${pageTab === "compose" ? " active" : ""}`}
            onClick={() => setPageTab("compose")}
          >
            Yeni gönderim
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pageTab === "history"}
            className={`comm-tab${pageTab === "history" ? " active" : ""}`}
            onClick={() => {
              setPageTab("history");
              setHistoryKey((k) => k + 1);
            }}
          >
            Son gönderimler
          </button>
        </div>
      </div>

      {pageTab === "history" && (
        <CampaignHistoryPanel
          key={historyKey}
          limit={20}
          detailPath={detailPath}
          emptyHref="/admin/iletisim/toplu-gonder"
          emptyActionLabel="Yeni gönderim oluştur"
        />
      )}

      {pageTab === "compose" && (
        <>
          {step === 0 && <StepWizard steps={["Kitle", "Stüdyo"]} currentStep={step} />}

          {error && step === 0 && <div className="comm-alert comm-alert-danger">{error}</div>}

          {step === 0 && (
            <div className="comm-step-panel comm-card">
              <h2 className="comm-step-panel-title">Hedef kitleyi seçin</h2>
              <div className="comm-audience-grid">
                {audienceOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={`comm-audience-card${audienceType === opt.value ? " selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="audience"
                      checked={audienceType === opt.value}
                      onChange={() => setAudienceType(opt.value)}
                    />
                    <span className="comm-audience-icon" aria-hidden="true">{opt.icon}</span>
                    <span className="comm-audience-text">
                      <strong>{opt.title}</strong>
                      <span>{opt.description}</span>
                    </span>
                  </label>
                ))}
              </div>

              {audienceType === "sinif" && !isCoach && (
                <div className="comm-form-field" style={{ marginTop: "1rem" }}>
                  <label htmlFor="sinif-select">Sınıf</label>
                  <select
                    id="sinif-select"
                    className="form-control"
                    value={sinifId}
                    onChange={(e) => setSinifId(e.target.value)}
                  >
                    <option value="">Sınıf seçin</option>
                    {siniflar.map((s) => (
                      <option key={s.id} value={s.id}>{s.ad}</option>
                    ))}
                  </select>
                </div>
              )}

              {audienceType === "advanced" && !isCoach && (
                <div style={{ marginTop: "1rem" }}>
                  <AdvancedFilterPanel
                    value={advancedFilter}
                    onChange={(patch) => setAdvancedFilter((prev) => ({ ...prev, ...patch }))}
                  />
                </div>
              )}

              {audienceType === "custom_ids" && (
                <div style={{ marginTop: "1rem" }}>
                  <RecipientPickerPanel
                    ogrenciIds={pickedOgrenciIds}
                    veliIds={pickedVeliIds}
                    personelIds={pickedPersonelIds}
                    allowPersonel={!isCoach}
                    onChange={({ ogrenci_ids, veli_ids, personel_ids }) => {
                      setPickedOgrenciIds(ogrenci_ids);
                      setPickedVeliIds(veli_ids);
                      setPickedPersonelIds(personel_ids);
                    }}
                  />
                </div>
              )}

              {audienceType === "all_personeller" && !isCoach && (
                <div style={{ marginTop: "1rem" }} className="comm-personel-audience">
                  <div className="comm-form-field">
                    <label>Rol (opsiyonel)</label>
                    <p className="comm-studio-muted" style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem" }}>
                      Boş bırakırsanız telefonu olan tüm aktif personel seçilir. Bir veya daha fazla rol işaretleyebilirsiniz.
                    </p>
                    <div className="comm-role-chip-grid" role="group" aria-label="Personel rolleri">
                      {roles.length === 0 ? (
                        <span className="comm-studio-muted">Roller yükleniyor…</span>
                      ) : (
                        roles.map((role) => {
                          const active = selectedRolIds.includes(role.id);
                          return (
                            <button
                              key={role.id}
                              type="button"
                              className={`comm-role-chip${active ? " is-active" : ""}`}
                              aria-pressed={active}
                              onClick={() => toggleRol(role.id)}
                            >
                              {role.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                    {selectedRolIds.length > 0 && (
                      <button
                        type="button"
                        className="comm-link-btn"
                        style={{ marginTop: "0.5rem" }}
                        onClick={() => setSelectedRolIds([])}
                      >
                        Rol seçimini temizle
                      </button>
                    )}
                  </div>

                  <div style={{ marginTop: "1.25rem" }}>
                    <RecipientPickerPanel
                      ogrenciIds={[]}
                      veliIds={[]}
                      personelIds={includedPersonelIds}
                      allowOgrenci={false}
                      allowVeli={false}
                      allowPersonel
                      hint="Rol filtresine ek olarak personel arayıp ekleyin. Stüdyoda listeden de çıkarabilirsiniz."
                      onChange={({ personel_ids }) => setIncludedPersonelIds(personel_ids)}
                    />
                  </div>
                </div>
              )}

              <div className="comm-audience-preview-banner">
                <div className="comm-audience-preview-count">
                  <strong>
                    {previewLoading ? "…" : (miniPreview?.total_recipients ?? 0).toLocaleString("tr-TR")}
                  </strong>
                  <span>alıcıya gönderilecek</span>
                </div>
                <div className="comm-audience-preview-breakdown">
                  <span>{previewLoading ? "…" : miniPreview?.veli_count ?? 0} veli</span>
                  <span>{previewLoading ? "…" : miniPreview?.ogrenci_count ?? 0} öğrenci</span>
                  {!isCoach && (
                    <span>{previewLoading ? "…" : miniPreview?.personel_count ?? 0} personel</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="comm-studio-back-row">
                <button
                  type="button"
                  className="comm-studio-back-btn"
                  onClick={() => {
                    setError(null);
                    setStep(0);
                  }}
                >
                  ← Kitleye dön
                </button>
              </div>
              <BulkSendStudio
                audienceFilter={buildFilter()}
                audienceType={audienceType}
                title={title}
                onTitleChange={setTitle}
                composerState={composerState}
                onComposerChange={setComposerState}
                templateName={templateName}
                onTemplateNameChange={setTemplateName}
                templateLanguage={templateLanguage}
                onTemplateLanguageChange={setTemplateLanguage}
                campaignDetailPath={detailPath}
              />
            </>
          )}

          {step === 0 && (
            <div className="comm-step-actions">
              <button type="button" className="comm-btn-primary" onClick={handleNext}>
                Stüdyoya Geç
              </button>
            </div>
          )}
        </>
      )}
    </CommunicationPageShell>
  );
}
