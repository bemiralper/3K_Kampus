"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { financialAccountService, paymentMethodService } from "../../services/finans-api";
import { cariHesapService } from "../../services/cari-hesap-api";
import type { CariHesapDropdownItem } from "../../types/cari-hesap-types";
import FinansModal, {
  FinansModalField,
  FinansModalButton,
  finansModalInputStyle,
} from "@/components/finans/FinansModal";
import IslemMasrafiFields from "@/components/finans/IslemMasrafiFields";
import { EMPTY_ISLEM_MASRAFI, buildIslemMasrafiPayload } from "../../types/islem-masrafi-types";
import { islemMasrafiGoster } from "../../utils/islem-masrafi-eligibility";

const fmtTL = (v: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const today = () => new Date().toISOString().slice(0, 10);

interface OdemeYapModalProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
}

/** Gider kaydına bağlı olmayan, doğrudan cari hesaba (tedarikçi) ödeme. */
export default function OdemeYapModal({ onClose, onSuccess }: OdemeYapModalProps) {
  const { activeKurum, activeSube } = useKurum();
  const [cariler, setCariler] = useState<CariHesapDropdownItem[]>([]);
  const [odemeYontemleri, setOdemeYontemleri] = useState<{ id: number; ad: string; tip: string }[]>([]);
  const [maliHesaplar, setMaliHesaplar] = useState<{ id: number; ad: string; tip: string }[]>([]);

  const [cariHesapId, setCariHesapId] = useState("");
  const [tutar, setTutar] = useState("");
  const [tarih, setTarih] = useState(today());
  const [odemeYontemiId, setOdemeYontemiId] = useState("");
  const [maliHesapId, setMaliHesapId] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [masrafForm, setMasrafForm] = useState({ ...EMPTY_ISLEM_MASRAFI });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeKurum?.id) return;
    cariHesapService
      .dropdown({ kurum_id: String(activeKurum.id) })
      .then((data) => setCariler(data.filter((c) => c.hesap_turu !== "musteri")))
      .catch(() => setCariler([]));
    financialAccountService
      .dropdownByKurum(activeKurum.id, activeSube?.id)
      .then((res) => setMaliHesaplar(res.mali_hesaplar || []))
      .catch(() => setMaliHesaplar([]));
  }, [activeKurum?.id, activeSube?.id]);

  useEffect(() => {
    if (!activeKurum?.id) return;
    paymentMethodService
      .dropdown(activeKurum.id, maliHesapId ? Number(maliHesapId) : null)
      .then((res) => setOdemeYontemleri(res.odeme_yontemleri || []))
      .catch(() => setOdemeYontemleri([]));
  }, [activeKurum?.id, maliHesapId]);

  const selectedCari = useMemo(() => cariler.find((c) => String(c.id) === cariHesapId) || null, [cariler, cariHesapId]);
  const selectedYontem = odemeYontemleri.find((y) => String(y.id) === odemeYontemiId);
  const selectedHesap = maliHesaplar.find((h) => String(h.id) === maliHesapId);
  const masrafVisible = islemMasrafiGoster(selectedYontem?.tip, selectedHesap?.tip);

  const handleSubmit = async () => {
    setError(null);
    if (!activeKurum?.id) { setError("Kurum seçilmedi."); return; }
    if (!cariHesapId) { setError("Lütfen ödeme yapılacak cariyi seçin."); return; }
    if (!maliHesapId) { setError("Lütfen paranın çıkacağı mali hesabı seçin."); return; }
    const tutarNum = Number(tutar);
    if (!tutarNum || tutarNum <= 0) { setError("Geçerli bir tutar girin."); return; }

    setSaving(true);
    try {
      const masraf = buildIslemMasrafiPayload(masrafForm);
      await cariHesapService.serbestOdeme({
        cari_hesap_id: Number(cariHesapId),
        kurum_id: activeKurum.id,
        tutar: tutarNum,
        odeme_tarihi: tarih,
        mali_hesap_id: Number(maliHesapId),
        odeme_yontemi_id: odemeYontemiId ? Number(odemeYontemiId) : undefined,
        aciklama,
        ...masraf,
      });
      onSuccess(`${fmtTL(tutarNum)} ödeme kaydedildi.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ödeme kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FinansModal
      title="Ödeme Yap"
      subtitle="Tedarikçi / cariye doğrudan ödeme yap"
      icon="➖"
      accent="#dc2626"
      onClose={onClose}
      footer={
        <>
          <FinansModalButton variant="secondary" onClick={onClose}>İptal</FinansModalButton>
          <FinansModalButton variant="danger" onClick={handleSubmit} disabled={saving}>
            {saving ? "Kaydediliyor…" : "Ödemeyi Kaydet"}
          </FinansModalButton>
        </>
      }
    >
      {error && (
        <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#991b1b", fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <FinansModalField label="Cari Hesap (Tedarikçi)">
        <select value={cariHesapId} onChange={(e) => setCariHesapId(e.target.value)} style={finansModalInputStyle}>
          <option value="">Seçiniz…</option>
          {cariler.map((c) => (
            <option key={c.id} value={c.id}>{c.gorunen_ad}</option>
          ))}
        </select>
        {selectedCari && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            Bu ödeme, herhangi bir gider kaydına bağlı olmadan doğrudan cari bakiyesine işlenir.
          </div>
        )}
      </FinansModalField>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FinansModalField label="Tutar (₺)">
          <input type="number" min={1} value={tutar} onChange={(e) => setTutar(e.target.value)} style={finansModalInputStyle} />
        </FinansModalField>
        <FinansModalField label="Ödeme Tarihi">
          <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} style={finansModalInputStyle} />
        </FinansModalField>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FinansModalField label="Mali Hesap (Kasa / Banka)">
          <select
            value={maliHesapId}
            onChange={(e) => { setMaliHesapId(e.target.value); setOdemeYontemiId(""); }}
            style={finansModalInputStyle}
          >
            <option value="">Seçiniz…</option>
            {maliHesaplar.map((m) => (
              <option key={m.id} value={m.id}>{m.ad} ({m.tip === "kasa" ? "Kasa" : m.tip === "banka" ? "Banka" : m.tip})</option>
            ))}
          </select>
        </FinansModalField>
        <FinansModalField label="Ödeme Yöntemi (opsiyonel)">
          <select value={odemeYontemiId} onChange={(e) => setOdemeYontemiId(e.target.value)} style={finansModalInputStyle} disabled={!maliHesapId}>
            <option value="">{maliHesapId ? "Seçiniz…" : "Önce mali hesap seçin"}</option>
            {odemeYontemleri.map((o) => (
              <option key={o.id} value={o.id}>{o.ad}</option>
            ))}
          </select>
        </FinansModalField>
      </div>

      <FinansModalField label="Açıklama (opsiyonel)">
        <input type="text" value={aciklama} onChange={(e) => setAciklama(e.target.value)} style={finansModalInputStyle} />
      </FinansModalField>

      <IslemMasrafiFields
        visible={masrafVisible}
        form={masrafForm}
        onChange={(patch) => setMasrafForm((prev) => ({ ...prev, ...patch }))}
      />
    </FinansModal>
  );
}
