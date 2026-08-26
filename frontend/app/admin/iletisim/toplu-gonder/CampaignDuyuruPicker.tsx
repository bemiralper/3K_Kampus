"use client";

import { useEffect, useMemo, useState } from "react";
import AttachmentDropZone from "@/components/communication/AttachmentDropZone";
import WhatsAppPhonePreview from "@/components/communication/WhatsAppPhonePreview";
import { headerTypeOf } from "@/components/communication/MetaTemplateSelect";
import {
  accountLabel,
  AudiencePersonType,
  CampaignAttachmentItem,
  fetchLocalMetaTemplates,
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
} from "@/lib/communication-api";

const FAMILIES = [
  { key: "duyuru", label: "Duyuru" },
  { key: "hatirlatma", label: "Hatırlatma" },
  { key: "bilgilendirme", label: "Bilgilendirme" },
] as const;

const MEDIA = [
  { key: "metin", label: "Metin", headers: ["TEXT", "NONE"] },
  { key: "gorsel", label: "Görsel", headers: ["IMAGE"] },
  { key: "pdf", label: "Belge / PDF", headers: ["DOCUMENT"] },
] as const;

const AUDIENCES = [
  { key: "veli", label: "Veli", suffix: "" },
  { key: "ogrenci", label: "Öğrenci", suffix: "_ogrenci" },
  { key: "personel", label: "Personel", suffix: "_personel" },
] as const;

const NAME_RE = /^(duyuru|hatirlatma|bilgilendirme)_(metin|gorsel|pdf)(_ogrenci|_personel)?$/;

type FamilyKey = (typeof FAMILIES)[number]["key"];
type MediaKey = (typeof MEDIA)[number]["key"];
type AudienceKey = (typeof AUDIENCES)[number]["key"];

interface CampaignDuyuruPickerProps {
  title: string;
  onTitleChange: (value: string) => void;
  accounts: WhatsAppAccount[];
  accountId: string;
  onAccountChange: (value: string) => void;
  personTypes: AudiencePersonType[];
  templateName: string;
  selectedTemplate: WhatsAppMetaTemplateItem | null;
  onTemplateChange: (name: string, language: string, tpl: WhatsAppMetaTemplateItem | null) => void;
  message: string;
  onMessageChange: (value: string) => void;
  attachments: CampaignAttachmentItem[];
  onAttachmentsChange: (items: CampaignAttachmentItem[]) => void;
}

export default function CampaignDuyuruPicker({
  title,
  onTitleChange,
  accounts,
  accountId,
  onAccountChange,
  personTypes,
  templateName,
  selectedTemplate,
  onTemplateChange,
  message,
  onMessageChange,
  attachments,
  onAttachmentsChange,
}: CampaignDuyuruPickerProps) {
  const [templates, setTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState<FamilyKey>("duyuru");
  const [audience, setAudience] = useState<AudienceKey>(defaultAudience(personTypes));
  const [media, setMedia] = useState<MediaKey>(mediaFromAttachments(attachments));

  useEffect(() => {
    setAudience(defaultAudience(personTypes));
  }, [personTypes.join("|")]);

  useEffect(() => {
    setMedia(mediaFromAttachments(attachments));
  }, [attachments.map((a) => a.mime_type).join("|")]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLocalMetaTemplates({
      account_id: accountId || undefined,
      usage: "CAMPAIGN",
      usage_exact: true,
      approved_only: false,
    })
      .then((res) => {
        if (cancelled) return;
        const rows = (res.templates || []).filter((tpl) => {
          if (!NAME_RE.test(tpl.name)) return false;
          const status = String(tpl.status || "").toUpperCase();
          return status === "APPROVED" || status === "DRAFT" || status === "PENDING";
        });
        setTemplates(rows);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [accountId]);

  const wantedName = `${family}_${media}${AUDIENCES.find((a) => a.key === audience)?.suffix || ""}`;
  const match = useMemo(
    () => pickTemplate(templates, wantedName),
    [templates, wantedName],
  );

  useEffect(() => {
    if (!match) return;
    if (match.name === templateName && selectedTemplate?.id === match.id) return;
    onTemplateChange(match.name, match.language || "tr", match);
  }, [match?.id, match?.name]);

  const previewText = fillPreview(match?.body_named || selectedTemplate?.body_named || "", message);
  const headerMismatch = attachmentMismatch(attachments, match || selectedTemplate);
  const audienceOptions = AUDIENCES.filter((item) => {
    if (!personTypes.length) return true;
    return personTypes.includes(item.key);
  });
  const visibleAudiences = audienceOptions.length ? audienceOptions : [...AUDIENCES];

  return (
    <div className="tg-msg-grid">
      <section className="tg-card">
        <h2>Mesaj şablonu</h2>
        <p className="lead">
          Duyuru, hatırlatma veya bilgilendirme şablonunu seçin. Aynı gönderimde
          birden fazla kişi türü varsa hitabı aşağıdan belirleyin.
        </p>

        <label className="tg-field">
          <span>Başlık</span>
          <input className="tg-search" value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="İsteğe bağlı gönderim başlığı" />
        </label>
        <label className="tg-field">
          <span>WhatsApp hesabı</span>
          <select className="tg-select" value={accountId} onChange={(e) => onAccountChange(e.target.value)}>
            {accounts.length === 0 && <option value="">Hesap yok</option>}
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{accountLabel(acc)}</option>
            ))}
          </select>
        </label>

        <div className="tg-field">
          <span>Şablon türü</span>
          <div className="tg-seg" role="tablist" aria-label="Şablon türü">
            {FAMILIES.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`tg-seg-btn${family === item.key ? " is-on" : ""}`}
                onClick={() => setFamily(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="tg-field">
          <span>Hitap</span>
          <div className="tg-seg" role="tablist" aria-label="Hitap">
            {visibleAudiences.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`tg-seg-btn${audience === item.key ? " is-on" : ""}`}
                onClick={() => setAudience(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="tg-field">
          <span>İçerik</span>
          <div className="tg-seg" role="tablist" aria-label="İçerik">
            {MEDIA.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`tg-seg-btn${media === item.key ? " is-on" : ""}`}
                onClick={() => setMedia(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="tg-empty">Şablonlar yükleniyor…</p>
        ) : match ? (
          <div className={`tg-tpl-card is-on${String(match.status).toUpperCase() !== "APPROVED" ? " is-draft" : ""}`}>
            <strong>{labelFor(match.name)}</strong>
            <span>{match.name} · {statusLabel(match.status)}</span>
          </div>
        ) : (
          <div className="tg-empty">
            {wantedName} şablonu bu hesapta yok. Meta’da duyuru taslaklarını onaylatın.
          </div>
        )}

        <label className="tg-field">
          <span>Mesaj</span>
          <textarea
            className="tg-textarea"
            rows={5}
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="Şablondaki {{mesaj}} alanına gidecek metin"
          />
        </label>

        <AttachmentDropZone attachments={attachments} onChange={onAttachmentsChange} />
        {headerMismatch && <p className="tg-warn" style={{ marginTop: 8 }}>{headerMismatch}</p>}
      </section>
      <aside>
        <WhatsAppPhonePreview
          text={previewText || "Şablon ve mesaj burada önizlenir."}
          attachments={attachments}
          previewContext={{ mesaj: message || "Duyuru metni" }}
        />
      </aside>
    </div>
  );
}

function defaultAudience(types: AudiencePersonType[]): AudienceKey {
  if (types.includes("veli") && types.length === 1) return "veli";
  if (types.includes("ogrenci") && types.length === 1) return "ogrenci";
  if (types.includes("personel") && types.length === 1) return "personel";
  if (types.includes("veli")) return "veli";
  if (types.includes("ogrenci")) return "ogrenci";
  if (types.includes("personel")) return "personel";
  return "veli";
}

function mediaFromAttachments(atts: CampaignAttachmentItem[]): MediaKey {
  if (!atts.length) return "metin";
  const mime = (atts[0].mime_type || "").toLowerCase();
  return mime.startsWith("image/") ? "gorsel" : "pdf";
}

function pickTemplate(templates: WhatsAppMetaTemplateItem[], name: string): WhatsAppMetaTemplateItem | null {
  const matches = templates.filter((tpl) => tpl.name === name);
  return (
    matches.find((tpl) => String(tpl.status).toUpperCase() === "APPROVED")
    || matches[0]
    || null
  );
}

function fillPreview(body: string, message: string): string {
  return body.replace(/\{\{\s*mesaj\s*\}\}/g, message.trim() || "{{mesaj}}");
}

function labelFor(name: string): string {
  const m = name.match(NAME_RE);
  if (!m) return name;
  const family = FAMILIES.find((f) => f.key === m[1])?.label || m[1];
  const media = MEDIA.find((item) => item.key === m[2])?.label || m[2];
  const audience = m[3] === "_ogrenci" ? "Öğrenci" : m[3] === "_personel" ? "Personel" : "Veli";
  return `${family} — ${audience} — ${media}`;
}

function statusLabel(status?: string): string {
  const raw = String(status || "").toUpperCase();
  if (raw === "APPROVED") return "Onaylı";
  if (raw === "PENDING") return "Onay bekliyor";
  if (raw === "DRAFT") return "Taslak";
  return raw;
}

function attachmentMismatch(
  atts: CampaignAttachmentItem[],
  tpl: WhatsAppMetaTemplateItem | null,
): string | null {
  if (!tpl) return null;
  const htype = headerTypeOf(tpl);
  if (!atts.length) {
    return ["IMAGE", "DOCUMENT", "VIDEO"].includes(htype)
      ? "Bu şablon ek bekliyor. Görsel veya PDF ekleyin, ya da Metin seçin."
      : null;
  }
  const mime = (atts[0].mime_type || "").toLowerCase();
  if (mime.startsWith("image/") && htype !== "IMAGE") {
    return "Görsel ek için Görsel şablonunu seçin.";
  }
  if (!mime.startsWith("image/") && htype !== "DOCUMENT") {
    return "PDF/belge ek için Belge şablonunu seçin.";
  }
  return null;
}
