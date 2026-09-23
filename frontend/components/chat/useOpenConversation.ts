"use client";

import { useEffect, useState } from "react";

import {
  ConversationListItem,
  InboxPortal,
  WhatsAppAccount,
  fetchAccessibleWhatsAppAccounts,
  inboxPortalDepartment,
  openConversationByPhone,
} from "@/lib/communication-api";

export interface OpenConversationTarget {
  phone: string;
  contactLabel?: string;
  ogrenciId?: number;
  veliId?: number;
  personelId?: number;
}

interface Options {
  target: OpenConversationTarget | null | undefined;
  portal: InboxPortal;
}

/**
 * Telefon numarasından sohbet açma (öğrenci/veli/personel kartlarındaki
 * WhatsApp düğmesi).
 *
 * Önce erişilebilir WhatsApp hesapları çekilir; varsayılan (ya da ilk) hesap
 * seçilir ve o hesapla sohbet açılır. Kullanıcı hesabı değiştirince aynı
 * numara yeni `channel_config_id` ile yeniden açılır.
 */
export function useOpenConversation({ target, portal }: Options) {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [accountsReady, setAccountsReady] = useState(false);
  const [conversation, setConversation] = useState<ConversationListItem | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phone = target?.phone?.trim() || "";

  // Hesaplar hedef başına bir kez yüklenir.
  useEffect(() => {
    if (!phone) {
      setAccounts([]);
      setAccountId("");
      setAccountsReady(false);
      setConversation(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setAccountsReady(false);
    fetchAccessibleWhatsAppAccounts()
      .then((res) => {
        if (cancelled) return;
        const list = res.accounts || [];
        setAccounts(list);
        const initial = res.default_account_id || list[0]?.id || "";
        setAccountId((prev) => (prev && list.some((a) => a.id === prev) ? prev : initial));
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setAccountsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  useEffect(() => {
    if (!phone || !accountsReady) return;
    let cancelled = false;
    setOpening(true);
    setError(null);
    openConversationByPhone(phone, {
      ogrenci_id: target?.ogrenciId,
      veli_id: target?.veliId,
      personel_id: target?.personelId,
      channel_config_id: accountId || undefined,
      department: inboxPortalDepartment(portal),
    })
      .then((conv) => {
        if (cancelled) return;
        setConversation(
          conv.contact_name || !target?.contactLabel
            ? conv
            : { ...conv, contact_name: target.contactLabel },
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setConversation(null);
        setError(err instanceof Error ? err.message : "Konuşma açılamadı.");
      })
      .finally(() => {
        if (!cancelled) setOpening(false);
      });
    return () => {
      cancelled = true;
    };
    // target nesnesi her render'da değişebilir; yalnızca anlamlı alanlar izlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    phone,
    target?.ogrenciId,
    target?.veliId,
    target?.personelId,
    target?.contactLabel,
    accountId,
    accountsReady,
    portal,
  ]);

  return { accounts, accountId, setAccountId, conversation, opening, error };
}
