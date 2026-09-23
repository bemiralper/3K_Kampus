"use client";

import { useEffect, useState } from "react";

import {
  ConversationTagItem,
  createConversationNote,
  fetchConversationNotes,
  fetchTagCatalog,
  setConversationTags,
  type ChatContextData,
  type ConversationListItem,
} from "@/lib/communication-api";

import { conversationTitle } from "./chat-utils";
import { Avatar } from "./ChatSidebar";
import { IconClose, IconTransfer } from "./icons";

type ConversationNote = Awaited<ReturnType<typeof fetchConversationNotes>>["notes"][number];

interface Props {
  conversation: ConversationListItem;
  context: ChatContextData | null;
  loading: boolean;
  /** Öğrenci 360 gibi derin bağlantılar portala göre değişir. */
  studentHref?: (studentId: number) => string;
  onClose: () => void;
  onTransfer: () => void;
  /** Etiket değişince güncel satır listeye/açık sohbete işlenir. */
  onConversationPatched?: (conv: ConversationListItem) => void;
}

const NOTE_TIME_FMT = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function noteTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : NOTE_TIME_FMT.format(date);
}

export function ChatInfoPanel({
  conversation,
  context,
  loading,
  studentHref,
  onClose,
  onTransfer,
  onConversationPatched,
}: Props) {
  const title = conversationTitle(conversation);
  const student = context?.ogrenci;

  // ── Notlar / etiketler: panel yalnızca açıkken mount olur, veri o zaman çekilir ──
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [tagCatalog, setTagCatalog] = useState<ConversationTagItem[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNotes([]);
    setNoteDraft("");
    setNotesError(null);
    setNotesLoading(true);
    fetchConversationNotes(conversation.id)
      .then((res) => {
        if (!cancelled) setNotes(res.notes || []);
      })
      .catch((err) => {
        if (!cancelled) setNotesError(err instanceof Error ? err.message : "Notlar yüklenemedi.");
      })
      .finally(() => {
        if (!cancelled) setNotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  // Etiket kataloğu yalnızca seçici ilk açıldığında istenir.
  useEffect(() => {
    if (!tagPickerOpen || tagCatalog.length) return;
    let cancelled = false;
    fetchTagCatalog()
      .then((res) => {
        if (!cancelled) setTagCatalog(res.tags || []);
      })
      .catch((err) => {
        if (!cancelled) setTagError(err instanceof Error ? err.message : "Etiketler yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, [tagPickerOpen, tagCatalog.length]);

  const addNote = async () => {
    const body = noteDraft.trim();
    if (!body || noteSaving) return;
    setNoteSaving(true);
    setNotesError(null);
    try {
      await createConversationNote(conversation.id, body);
      setNoteDraft("");
      const res = await fetchConversationNotes(conversation.id);
      setNotes(res.notes || []);
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : "Not eklenemedi.");
    } finally {
      setNoteSaving(false);
    }
  };

  const toggleTag = async (slug: string) => {
    if (tagBusy) return;
    const current = (conversation.tags || []).map((t) => t.slug);
    const next = current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug];
    setTagBusy(true);
    setTagError(null);
    try {
      const updated = await setConversationTags(conversation.id, next);
      onConversationPatched?.(updated);
    } catch (err) {
      setTagError(err instanceof Error ? err.message : "Etiket güncellenemedi.");
    } finally {
      setTagBusy(false);
    }
  };

  const activeSlugs = new Set((conversation.tags || []).map((t) => t.slug));

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

        <Section title="Etiketler">
          {conversation.tags?.length ? (
            <div className="chat-info-tags">
              {conversation.tags.map((tag) => (
                <span key={tag.id} className="chat-info-tag" style={{ borderColor: tag.color }}>
                  {tag.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="chat-info-empty">Etiket yok.</p>
          )}
          <button
            type="button"
            className="chat-link-btn chat-info-inline-btn"
            onClick={() => setTagPickerOpen((v) => !v)}
            aria-expanded={tagPickerOpen}
          >
            {tagPickerOpen ? "Seçiciyi kapat" : "Etiket ekle / kaldır"}
          </button>
          {tagPickerOpen ? (
            <div className="chat-info-tag-picker" role="group" aria-label="Etiket seçimi">
              {tagCatalog.length === 0 && !tagError ? (
                <p className="chat-info-empty">Etiketler yükleniyor…</p>
              ) : null}
              {tagCatalog.map((tag) => {
                const active = activeSlugs.has(tag.slug);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`chat-info-tag chat-info-tag--pick${active ? " is-active" : ""}`}
                    style={
                      active
                        ? { borderColor: tag.color, background: tag.color }
                        : { borderColor: tag.color, color: tag.color }
                    }
                    aria-pressed={active}
                    disabled={tagBusy}
                    onClick={() => void toggleTag(tag.slug)}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          ) : null}
          {tagError ? <p className="chat-composer-error">{tagError}</p> : null}
        </Section>

        <Section title="Notlar">
          {notesLoading ? (
            <p className="chat-info-empty">Notlar yükleniyor…</p>
          ) : notes.length === 0 ? (
            <p className="chat-info-empty">Henüz not yok.</p>
          ) : (
            <ul className="chat-info-notes">
              {notes.map((note) => (
                <li key={note.id} className="chat-info-note">
                  <span className="chat-info-note-meta">
                    {note.author_name || "Personel"}
                    {note.created_at ? ` · ${noteTime(note.created_at)}` : ""}
                  </span>
                  <p className="chat-info-note-body">{note.body}</p>
                </li>
              ))}
            </ul>
          )}
          <textarea
            className="chat-info-note-input"
            rows={3}
            value={noteDraft}
            placeholder="Kurum içi not (kişi görmez)"
            aria-label="Yeni not"
            onChange={(e) => setNoteDraft(e.target.value)}
          />
          <button
            type="button"
            className="chat-btn chat-btn--soft chat-info-action"
            disabled={noteSaving || !noteDraft.trim()}
            onClick={() => void addNote()}
          >
            {noteSaving ? "Ekleniyor…" : "Not ekle"}
          </button>
          {notesError ? <p className="chat-composer-error">{notesError}</p> : null}
        </Section>
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
