"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CommunicationPageShell,
  createComposerState,
  StepWizard,
  BulkSendStudio,
} from "@/components/communication";
import "@/components/communication/communication.css";
import { AudienceFilter, CampaignPreviewStats, previewCampaign } from "@/lib/communication-api";

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
  | "sinif"
  | "coach_students"
  | "coach_parents";

export interface AudienceOption {
  value: BulkAudienceType;
  icon: string;
  title: string;
  description: string;
}

export const ADMIN_AUDIENCE_OPTIONS: AudienceOption[] = [
  { value: "all_veliler", icon: "👨‍👩‍👧", title: "Tüm veliler", description: "Duyuru opt-in vermiş tüm velilere gönder" },
  { value: "all_ogrenciler", icon: "🎓", title: "Tüm öğrenciler", description: "Aktif öğrencilere gönder" },
  { value: "sinif", icon: "🏫", title: "Sınıf", description: "Belirli bir sınıfın velilerine gönder" },
  { value: "coach_students", icon: "🎯", title: "Koç öğrencileri", description: "Koçluk kapsamındaki öğrencilere gönder" },
  { value: "coach_parents", icon: "👪", title: "Koç velileri", description: "Koçluk kapsamındaki öğrenci velilerine gönder" },
];

export const COACH_AUDIENCE_OPTIONS: AudienceOption[] = [
  { value: "coach_students", icon: "🎯", title: "Öğrencilerim", description: "Koçluk kapsamındaki öğrencilere gönder" },
  { value: "coach_parents", icon: "👪", title: "Velilerim", description: "Koçluk kapsamındaki öğrenci velilerine gönder" },
];

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

  const buildFilter = useCallback((): AudienceFilter => {
    const egitimYiliId = readEgitimYiliId();
    const filter: AudienceFilter = { audience_type: audienceType };
    if (egitimYiliId) filter.egitim_yili_id = egitimYiliId;
    if (audienceType === "sinif" && sinifId) filter.sinif_id = Number(sinifId);
    return filter;
  }, [audienceType, sinifId]);

  useEffect(() => {
    if (isCoach) return;
    const kurumRaw = localStorage.getItem("3k_active_kurum");
    const subeRaw = localStorage.getItem("3k_active_sube");
    if (!kurumRaw) return;
    try {
      const kurum = JSON.parse(kurumRaw);
      const sube = subeRaw ? JSON.parse(subeRaw) : null;
      const egitimYiliId = readEgitimYiliId();
      const params = new URLSearchParams();
      if (kurum?.id) params.set("kurum_id", String(kurum.id));
      if (sube?.id) params.set("sube_id", String(sube.id));
      if (egitimYiliId) params.set("egitim_yili_id", String(egitimYiliId));
      fetch(`/api/sinif/?${params}`)
        .then((r) => r.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : data.results || data.siniflar || [];
          setSiniflar(list.map((s: { id: number; ad: string }) => ({ id: s.id, ad: s.ad })));
        })
        .catch(() => null);
    } catch {
      /* ignore */
    }
  }, [isCoach]);

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
    if (step === 0) refreshMiniPreview();
  }, [step, audienceType, sinifId, refreshMiniPreview]);

  const handleNext = () => {
    if (step === 0 && audienceType === "sinif" && !sinifId) {
      setError("Lütfen bir sınıf seçin.");
      return;
    }
    setError(null);
    setStep(1);
  };

  const defaultBreadcrumbs = isCoach
    ? [{ label: "Koç Paneli", href: "/coach/dashboard" }, { label: "Toplu Gönder" }]
    : [
        { label: "İletişim", href: "/admin/iletisim/kampanyalar" },
        { label: "Kampanyalar", href: "/admin/iletisim/kampanyalar" },
        { label: "Toplu Gönderim" },
      ];

  const detailPath =
    campaignDetailPath ||
    ((id: string) =>
      isCoach ? `/admin/iletisim/kampanyalar/${id}` : `/admin/iletisim/kampanyalar/${id}`);

  return (
    <CommunicationPageShell
      title="Toplu Gönderim"
      subtitle={isCoach ? "Öğrenci ve velilerinize WhatsApp mesajı gönderin" : "WhatsApp toplu mesaj kampanyası oluşturun"}
      icon="📢"
      breadcrumbs={breadcrumbs || defaultBreadcrumbs}
    >
      <StepWizard steps={["Kitle", "Stüdyo"]} currentStep={step} />

      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

      {step === 0 && (
        <div className="comm-step-panel comm-card">
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Hedef kitleyi seçin</h2>
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

          {miniPreview && (
            <div className="comm-studio-mini-stats" style={{ marginTop: "1.25rem" }}>
              <div><strong>{previewLoading ? "…" : miniPreview.total_recipients}</strong><span>Toplam</span></div>
              <div><strong>{previewLoading ? "…" : miniPreview.veli_count}</strong><span>Veli</span></div>
              <div><strong>{previewLoading ? "…" : miniPreview.ogrenci_count}</strong><span>Öğrenci</span></div>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
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
          readOnlyTemplates={isCoach}
        />
      )}

      <div className="comm-step-actions">
        {step > 0 && (
          <button type="button" className="comm-btn-secondary" onClick={() => { setError(null); setStep(0); }}>
            Geri
          </button>
        )}
        {step === 0 && (
          <button type="button" className="comm-btn-primary" onClick={handleNext}>
            Stüdyoya Geç
          </button>
        )}
      </div>
    </CommunicationPageShell>
  );
}
