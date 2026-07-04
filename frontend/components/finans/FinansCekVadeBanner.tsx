"use client";

import { useCallback, useEffect, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { giderKaydiService } from "@/app/finans/services/gider-kaydi-api";
import type { GiderTaksit } from "@/app/finans/types/gider-types";
import "./finans-list.css";

function fmtTarih(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtTutar(v: number | string) {
  return Number(v || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function FinansCekVadeBanner({
  kurumId,
  onViewVadeler,
  dismissedKey = "3k_cek_vade_banner_dismissed",
}: {
  kurumId: number;
  onViewVadeler?: () => void;
  dismissedKey?: string;
}) {
  const { activeSube } = useKurum();
  const [items, setItems] = useState<GiderTaksit[]>([]);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await giderKaydiService.yaklasanVadeler(kurumId, 14, {
        subeId: activeSube?.id,
        odemeYontemiTipi: "cek",
      });
      setItems(data);
    } catch {
      setItems([]);
    }
  }, [kurumId, activeSube?.id]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const until = localStorage.getItem(dismissedKey);
      if (until && Date.now() < Number(until)) {
        setDismissed(true);
        return;
      }
    }
    load();
  }, [load, dismissedKey]);

  if (dismissed || items.length === 0) return null;

  const preview = items.slice(0, 3);
  const rest = items.length - preview.length;

  return (
    <div className="finans-cek-banner" role="status">
      <div aria-hidden style={{ fontSize: 22 }}>
        🔔
      </div>
      <div>
        <strong>
          {items.length} çek ödemesinin vadesi önümüzdeki 14 gün içinde
        </strong>
        <p>
          {preview.map((t, i) => (
            <span key={t.id}>
              {i > 0 ? " · " : ""}
              {t.cari_hesap_adi}
              {t.aciklama ? ` (${t.aciklama.trim()})` : ""} — {fmtTarih(t.vade_tarihi)} — ₺
              {fmtTutar(t.kalan_tutar)}
            </span>
          ))}
          {rest > 0 ? ` · +${rest} kayıt daha` : ""}
        </p>
      </div>
      <div className="finans-cek-banner-actions" style={{ display: "flex", gap: 8 }}>
        {onViewVadeler && (
          <button type="button" onClick={onViewVadeler}>
            Vadeleri Gör
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(dismissedKey, String(Date.now() + 24 * 60 * 60 * 1000));
            setDismissed(true);
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "none",
            background: "transparent",
            color: "#92400e",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Kapat
        </button>
      </div>
    </div>
  );
}
