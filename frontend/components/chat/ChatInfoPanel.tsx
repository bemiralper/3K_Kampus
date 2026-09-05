"use client";

import type { ChatContextData, ConversationListItem } from "@/lib/communication-api";

import { conversationTitle } from "./chat-utils";
import { Avatar } from "./ChatSidebar";
import { IconClose, IconTransfer } from "./icons";

interface Props {
  conversation: ConversationListItem;
  context: ChatContextData | null;
  loading: boolean;
  /** Öğrenci 360 gibi derin bağlantılar portala göre değişir. */
  studentHref?: (studentId: number) => string;
  onClose: () => void;
  onTransfer: () => void;
}

export function ChatInfoPanel({
  conversation,
  context,
  loading,
  studentHref,
  onClose,
  onTransfer,
}: Props) {
  const title = conversationTitle(conversation);
  const student = context?.ogrenci;

  return (
    <aside className="chat-info" aria-label="Kişi ve öğrenci bilgileri">
      <div className="chat-info-head">
        <h2>Sohbet bilgileri</h2>
        <button type="button" className="chat-icon-btn" onClick={onClose} aria-label="Paneli kapat">
          <IconClose size={18} />
        </button>
      </div>

      <div className="chat-info-body">
        <div className="chat-info-identity">
          <Avatar name={title} photo={conversation.profil_foto} size={64} />
          <p className="chat-info-name">{title}</p>
          <p className="chat-info-phone">{conversation.contact_phone}</p>
        </div>

        {loading && !context ? (
          <p className="chat-info-loading">Bilgiler yükleniyor…</p>
        ) : null}

        {student ? (
          <Section title="Öğrenci">
            <Field label="Ad Soyad" value={student.ad_soyad} />
            <Field label="Sınıf" value={student.sinif || student.sinif_seviyesi} />
            <Field label="Şube" value={student.sube} />
            <Field label="Koç" value={student.koc} />
            <Field label="Eğitim yılı" value={student.egitim_yili} />
            <Field label="Kayıt durumu" value={student.aktif ? "Aktif" : "Pasif"} />
            <Field label="Telefon" value={student.telefon} />
            <Field label="E-posta" value={student.email} />
            {studentHref ? (
              <a className="chat-info-link" href={studentHref(student.id)}>
                Öğrenci sayfasını aç
              </a>
            ) : null}
          </Section>
        ) : null}

        {context?.veliler?.length ? (
          <Section title="Veliler">
            {context.veliler.map((veli) => (
              <div className="chat-info-person" key={veli.id}>
                <span className="chat-info-person-name">{veli.ad_soyad}</span>
                <span className="chat-info-person-meta">
                  {[veli.yakinlik, veli.telefon].filter(Boolean).join(" · ")}
                </span>
              </div>
            ))}
          </Section>
        ) : null}

        <Section title="Sohbet">
          <Field
            label="Sorumlu"
            value={
              context?.sorumlu.claimed_by_name ||
              context?.sorumlu.assigned_coach_name ||
              "Atanmadı"
            }
          />
          <Field label="Departman" value={departmentLabel(context?.kanal.department)} />
          <Field
            label="WhatsApp hattı"
            value={
              [context?.kanal.account_name, context?.kanal.display_phone]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
          <Field label="Yanıt penceresi" value={conversation.session?.label || "—"} />
          <button type="button" className="chat-btn chat-btn--soft chat-info-action" onClick={onTransfer}>
            <IconTransfer size={16} />
            Başka personele ata
          </button>
        </Section>

        {conversation.tags?.length ? (
          <Section title="Etiketler">
            <div className="chat-info-tags">
              {conversation.tags.map((tag) => (
                <span key={tag.id} className="chat-info-tag" style={{ borderColor: tag.color }}>
                  {tag.name}
                </span>
              ))}
            </div>
          </Section>
        ) : null}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="chat-info-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="chat-info-field">
      <span className="chat-info-field-label">{label}</span>
      <span className="chat-info-field-value">{value}</span>
    </div>
  );
}

function departmentLabel(department?: string): string {
  switch (department) {
    case "COACHING":
      return "Koçluk";
    case "ACCOUNTING":
      return "Muhasebe";
    case "REGISTRATION":
      return "Kayıt";
    case "MANAGEMENT":
      return "Yönetim";
    default:
      return department || "—";
  }
}
