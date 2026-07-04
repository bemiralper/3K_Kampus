"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ConversationListItem,
  fetchConversations,
  formatMessageTime,
} from "@/lib/communication-api";

interface IletisimTabProps {
  ogrenciId: number;
  ogrenciAd?: string;
}

export default function IletisimTab({ ogrenciId, ogrenciAd }: IletisimTabProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConversations({ ogrenci_id: ogrenciId });
      setConversations(data.conversations || []);
    } catch {
      setError("İletişim geçmişi yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [ogrenciId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-muted">Yükleniyor…</p>;
  }

  if (error) {
    return (
      <div className="alert alert-warning">
        <p>{error}</p>
        <button type="button" className="btn btn-sm btn-outline" onClick={load}>
          Tekrar dene
        </button>
      </div>
    );
  }

  return (
    <div className="iletisim-tab">
      <div className="section-header" style={{ marginBottom: "1rem" }}>
        <h3>{ogrenciAd ? `${ogrenciAd} — İletişim` : "WhatsApp İletişim"}</h3>
      </div>

      {conversations.length === 0 ? (
        <p className="text-muted">Bu öğrenci için kayıtlı konuşma bulunmuyor.</p>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Kişi</th>
                <th>Telefon</th>
                <th>Son Mesaj</th>
                <th>Tarih</th>
                <th>Okunmamış</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conv) => (
                <tr key={conv.id}>
                  <td>{conv.contact_name || "—"}</td>
                  <td>{conv.contact_phone}</td>
                  <td>{conv.last_message_preview || "—"}</td>
                  <td>{formatMessageTime(conv.last_message_at)}</td>
                  <td>{conv.unread_count_coach || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
