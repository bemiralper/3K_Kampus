"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ConversationListItem,
  ConversationTagItem,
  TransferCandidate,
  createConversationNote,
  fetchConversationNotes,
  fetchTagCatalog,
  fetchTransferCandidates,
  setConversationTags,
  transferConversation,
} from "@/lib/communication-api";

interface ConversationOpsPanelProps {
  conversation: ConversationListItem;
  onUpdated?: (conv: ConversationListItem) => void;
}

export default function ConversationOpsPanel({ conversation, onUpdated }: ConversationOpsPanelProps) {
  const [notes, setNotes] = useState<Array<{ id: string; body: string; author_name?: string; created_at?: string | null }>>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [tags, setTags] = useState<ConversationTagItem[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [transferQuery, setTransferQuery] = useState("");
  const [transferCandidates, setTransferCandidates] = useState<TransferCandidate[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<TransferCandidate | null>(null);
  const [transferReason, setTransferReason] = useState("");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [n, catalog] = await Promise.all([
        fetchConversationNotes(conversation.id),
        fetchTagCatalog(),
      ]);
      setNotes(n.notes || []);
      setTags(catalog.tags || []);
      setSelectedSlugs((conversation.tags || []).map((t) => t.slug));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    }
  }, [conversation.id, conversation.tags]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const q = transferQuery.trim();
    if (q.length < 2) {
      setTransferCandidates([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      fetchTransferCandidates(q)
        .then((res) => {
          if (!cancelled) setTransferCandidates(res.candidates || []);
        })
        .catch(() => {
          if (!cancelled) setTransferCandidates([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [transferQuery]);

  const handleAddNote = async () => {
    if (!noteDraft.trim()) return;
    setBusy(true);
    try {
      await createConversationNote(conversation.id, noteDraft.trim());
      setNoteDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not eklenemedi");
    } finally {
      setBusy(false);
    }
  };

  const toggleTag = async (slug: string) => {
    const next = selectedSlugs.includes(slug)
      ? selectedSlugs.filter((s) => s !== slug)
      : [...selectedSlugs, slug];
    setSelectedSlugs(next);
    setBusy(true);
    try {
      const updated = await setConversationTags(conversation.id, next);
      onUpdated?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Etiket güncellenemedi");
      setSelectedSlugs((conversation.tags || []).map((t) => t.slug));
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedTarget) {
      setError("Devretmek için listeden bir personel seçin.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await transferConversation(
        conversation.id,
        selectedTarget.user_id,
        transferReason,
      );
      onUpdated?.(updated);
      setTransferQuery("");
      setSelectedTarget(null);
      setTransferCandidates([]);
      setTransferReason("");
      setSuccess(`Sohbet ${selectedTarget.name} kişisine devredildi.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Devretme başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="comm-ops-panel">
      <h4>İç Notlar</h4>
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}
      {success && <div className="comm-alert comm-alert-success">{success}</div>}
      <div className="comm-ops-notes">
        {notes.length === 0 && <p className="comm-ops-empty">Henüz not yok.</p>}
        {notes.map((n) => (
          <div key={n.id} className="comm-ops-note">
            <div className="comm-ops-note-meta">
              <strong>{n.author_name || "Personel"}</strong>
              <span>{n.created_at ? new Date(n.created_at).toLocaleString("tr-TR") : ""}</span>
            </div>
            <p>{n.body}</p>
          </div>
        ))}
      </div>
      <textarea
        className="comm-ops-textarea"
        rows={3}
        placeholder="Kurum içi not (müşteri görmez)…"
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
      />
      <button type="button" className="comm-btn-secondary" disabled={busy || !noteDraft.trim()} onClick={handleAddNote}>
        Not Ekle
      </button>

      <h4 style={{ marginTop: 16 }}>Etiketler</h4>
      <div className="comm-ops-tags">
        {tags.map((t) => {
          const active = selectedSlugs.includes(t.slug);
          return (
            <button
              key={t.id}
              type="button"
              className={`comm-tag-chip${active ? " active" : ""}`}
              style={{ borderColor: t.color, color: active ? "#fff" : t.color, background: active ? t.color : "transparent" }}
              onClick={() => toggleTag(t.slug)}
              disabled={busy}
            >
              {t.name}
            </button>
          );
        })}
      </div>

      <h4 style={{ marginTop: 16 }}>Devret</h4>
      <p className="comm-ops-empty" style={{ marginBottom: 8 }}>
        Personel adı yazın, çıkanlardan seçip devredin.
      </p>
      {selectedTarget ? (
        <div className="comm-transfer-selected">
          <div>
            <strong>{selectedTarget.name}</strong>
            <small>
              {[selectedTarget.sube_ad, selectedTarget.email].filter(Boolean).join(" · ") || "Personel"}
            </small>
          </div>
          <button
            type="button"
            className="comm-btn-secondary"
            style={{ padding: "4px 10px", fontSize: 12 }}
            onClick={() => setSelectedTarget(null)}
          >
            Değiştir
          </button>
        </div>
      ) : (
        <>
          <input
            className="comm-ops-textarea"
            style={{ minHeight: 0, height: 36, resize: "none" }}
            placeholder="Personel ara (ad / soyad)…"
            value={transferQuery}
            onChange={(e) => setTransferQuery(e.target.value)}
            autoComplete="off"
          />
          {searching && <p className="comm-ops-empty">Aranıyor…</p>}
          {!searching && transferQuery.trim().length >= 2 && transferCandidates.length === 0 && (
            <p className="comm-ops-empty">Kullanıcı hesabı olan personel bulunamadı.</p>
          )}
          {transferCandidates.length > 0 && (
            <ul className="comm-transfer-candidate-list">
              {transferCandidates.map((c) => (
                <li key={c.user_id}>
                  <button
                    type="button"
                    className="comm-transfer-candidate"
                    onClick={() => {
                      setSelectedTarget(c);
                      setTransferQuery("");
                      setTransferCandidates([]);
                    }}
                  >
                    <strong>{c.name}</strong>
                    <span>{[c.sube_ad, c.email].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <input
        className="comm-ops-textarea"
        style={{ minHeight: 0, height: 36, resize: "none", marginTop: 8 }}
        placeholder="Neden (opsiyonel)"
        value={transferReason}
        onChange={(e) => setTransferReason(e.target.value)}
      />
      <button
        type="button"
        className="comm-btn-secondary"
        disabled={busy || !selectedTarget}
        onClick={handleTransfer}
      >
        Sohbeti Devret
      </button>
    </aside>
  );
}
