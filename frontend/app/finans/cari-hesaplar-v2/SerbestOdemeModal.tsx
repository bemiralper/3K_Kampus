"use client";

import { useEffect, useState } from "react";
import { todayIsoLocal } from "@/lib/date-utils";
import { useKurum } from "@/lib/contexts/KurumContext";
import { financialAccountService, paymentMethodService } from "../services/finans-api";
import { cariHesapService } from "../services/cari-hesap-api";
import FinansModal, {
  FinansModalField,
  FinansModalButton,
  finansModalInputStyle,
} from "@/components/finans/FinansModal";
import IslemMasrafiFields from "@/components/finans/IslemMasrafiFields";
import { EMPTY_ISLEM_MASRAFI, buildIslemMasrafiPayload } from "../types/islem-masrafi-types";
import { islemMasrafiGoster } from "../utils/islem-masrafi-eligibility";

const fmtTL = (v: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0);

const isCekSenetTip = (tip?: string) => tip === "cek" || tip === "senet";

interface SerbestOdemeModalProps {
  cariHesapId: number;
  cariHesapAdi: string;
  bakiye: number;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

/** Gider kaydına bağlı olmayan, doğrudan cari hesaba serbest ödeme. */
export default function SerbestOdemeModal({
  cariHesapId,
  cariHesapAdi,
  bakiye,
  onClose,
  onSuccess,
}: SerbestOdemeModalProps) {
  const { activeKurum, activeSube } = useKurum();
  const [odemeYontemleri, setOdemeYontemleri] = useState<{ id: number; ad: string; tip: string }[]>([]);
  const [maliHesaplar, setMaliHesaplar] = useState<{ id: number; ad: string; tip: string }[]>([]);
  const [tutar, setTutar] = useState("");
  const [tarih, setTarih] = useState(todayIsoLocal());
  const [odemeYontemiId, setOdemeYontemiId] = useState("");
  const [maliHesapId, setMaliHesapId] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [vadeTarihi, setVadeTarihi] = useState("");
  const [cekSenetNo, setCekSenetNo] = useState("");
  const [bankaAdi, setBankaAdi] = useState("");
  const [masrafForm, setMasrafForm] = useState({ ...EMPTY_ISLEM_MASRAFI });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeKurum?.id) return;
    financialAccountService
      .dropdownByKurum(activeKurum.id, activeSube?.id)
      .then((res) => {
        const list = res.mali_hesaplar || [];
        setMaliHesaplar(list);
        if (list.length > 0) setMaliHesapId(String(list[0].id));
      })
      .catch(() => setMaliHesaplar([]));
  }, [activeKurum?.id, activeSube?.id]);

  // Tüm yöntemler (çek/senet mali hesaba bağlı olmayabilir)
  useEffect(() => {
    if (!activeKurum?.id) return;
    paymentMethodService
      .dropdown(activeKurum.id, null)
      .then((res) => setOdemeYontemleri(res.odeme_yontemleri || []))
      .catch(() => setOdemeYontemleri([]));
  }, [activeKurum?.id]);

  const selectedYontem = odemeYontemleri.find((y) => String(y.id) === odemeYontemiId);
  const isCekPath = isCekSenetTip(selectedYontem?.tip);
  const selectedHesap = maliHesaplar.find((h) => String(h.id) === maliHesapId);
  const masrafVisible = !isCekPath && islemMasrafiGoster(selectedYontem?.tip, selectedHesap?.tip);
  const tutarNum = Number(tutar) || 0;

  const handleSubmit = async () => {
    setError(null);
    if (!activeKurum?.id) {
      setError("Kurum seçilmedi.");
      return;
    }
    if (!isCekPath && !maliHesapId) {
      setError("Lütfen paranın çıkacağı mali hesabı seçin.");
      return;
    }
    if (isCekPath && !odemeYontemiId) {
      setError("Çek/senet ödemesi için ödeme yöntemi seçin.");
      return;
    }
    if (isCekPath && !vadeTarihi) {
      setError("Çek/senet için vade tarihi zorunludur.");
      return;
    }
    if (!tutarNum || tutarNum <= 0) {
      setError("Geçerli bir tutar girin.");
      return;
    }
    if (!tarih) {
      setError("Ödeme tarihi seçin.");
      return;
    }

    setSaving(true);
    try {
      const masraf = isCekPath ? {} : buildIslemMasrafiPayload(masrafForm);
      await cariHesapService.serbestOdeme({
        cari_hesap_id: cariHesapId,
        kurum_id: activeKurum.id,
        tutar: tutarNum,
        odeme_tarihi: tarih,
        mali_hesap_id: maliHesapId ? Number(maliHesapId) : undefined,
        odeme_yontemi_id: odemeYontemiId ? Number(odemeYontemiId) : undefined,
        aciklama: aciklama || undefined,
        ...(isCekPath
          ? {
              vade_tarihi: vadeTarihi,
              cek_senet_no: cekSenetNo || undefined,
              banka_adi: bankaAdi || undefined,
            }
          : {}),
        ...masraf,
      });
      onSuccess(
        isCekPath
          ? `${fmtTL(tutarNum)} çek/senet portföyüne kaydedildi.`
          : `${fmtTL(tutarNum)} serbest ödeme kaydedildi.`,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ödeme kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FinansModal
      title="Serbest Ödeme Yap"
      subtitle={cariHesapAdi}
      icon="💰"
      accent="#059669"
      onClose={onClose}
      footer={
        <>
          <FinansModalButton variant="secondary" onClick={onClose}>
            İptal
          </FinansModalButton>
          <FinansModalButton variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Kaydediliyor…" : "Ödemeyi Kaydet"}
          </FinansModalButton>
        </>
      }
    >
      {error && (
        <div
          style={{
            padding: "10px 12px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 10,
            color: "#991b1b",
            fontSize: 12.5,
            fontWeight: 600,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          background: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
          borderRadius: 12,
          padding: 14,
          border: "1px solid #e2e8f0",
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{cariHesapAdi}</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13 }}>
          <span style={{ color: "#64748b" }}>Mevcut Bakiye</span>
          <strong style={{ color: bakiye < 0 ? "#dc2626" : bakiye > 0 ? "#059669" : "#334155" }}>
            {fmtTL(bakiye)}
          </strong>
        </div>
      </div>

      <div
        style={{
          background: isCekPath ? "#fffbeb" : "#eff6ff",
          borderRadius: 10,
          padding: 12,
          fontSize: 12.5,
          color: isCekPath ? "#92400e" : "#1e40af",
          lineHeight: 1.5,
          border: `1px solid ${isCekPath ? "#fde68a" : "#bfdbfe"}`,
          marginBottom: 14,
        }}
      >
        {isCekPath ? (
          <>
            <strong>Çek/Senet:</strong> Ödeme Çek/Senet portföyüne &quot;verilen&quot; olarak kaydedilir.
            Kasa/bankadan para çıkışı çek <strong>Ödendi</strong> olduğunda yapılır.
          </>
        ) : (
          <>
            <strong>Serbest Ödeme:</strong> Gider kaydına bağlı olmadan doğrudan ödeme yapabilirsiniz.
          </>
        )}
      </div>

      <FinansModalField label={isCekPath ? "Ödeme Yöntemi *" : "Ödeme Yöntemi"}>
        <select
          style={finansModalInputStyle}
          value={odemeYontemiId}
          onChange={(e) => {
            setOdemeYontemiId(e.target.value);
            setMasrafForm({ ...EMPTY_ISLEM_MASRAFI });
          }}
        >
          <option value="">{isCekPath ? "Seçiniz" : "Seçiniz (opsiyonel)"}</option>
          {odemeYontemleri.map((o) => (
            <option key={o.id} value={o.id}>
              {o.ad}
              {isCekSenetTip(o.tip) ? ` (${o.tip === "senet" ? "Senet" : "Çek"})` : ""}
            </option>
          ))}
        </select>
      </FinansModalField>

      <FinansModalField
        label={
          isCekPath
            ? "Ödeme Hesabı (çek ödenince)"
            : "Mali Hesap (Kasa/Banka) *"
        }
      >
        <select
          style={finansModalInputStyle}
          value={maliHesapId}
          onChange={(e) => {
            setMaliHesapId(e.target.value);
            setMasrafForm({ ...EMPTY_ISLEM_MASRAFI });
          }}
        >
          <option value="">{isCekPath ? "Sonra seçilebilir" : "Seçiniz"}</option>
          {maliHesaplar.map((m) => (
            <option key={m.id} value={m.id}>
              {m.ad}
            </option>
          ))}
        </select>
      </FinansModalField>

      {isCekPath && (
        <>
          <FinansModalField label="Vade Tarihi *">
            <input
              type="date"
              style={finansModalInputStyle}
              value={vadeTarihi}
              onChange={(e) => setVadeTarihi(e.target.value)}
            />
          </FinansModalField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FinansModalField label="Çek/Senet No">
              <input
                type="text"
                style={finansModalInputStyle}
                value={cekSenetNo}
                onChange={(e) => setCekSenetNo(e.target.value)}
                placeholder="Örn: CHK-123"
              />
            </FinansModalField>
            <FinansModalField label="Banka">
              <input
                type="text"
                style={finansModalInputStyle}
                value={bankaAdi}
                onChange={(e) => setBankaAdi(e.target.value)}
                placeholder="Banka adı"
              />
            </FinansModalField>
          </div>
        </>
      )}

      <IslemMasrafiFields
        visible={masrafVisible}
        form={masrafForm}
        onChange={(patch) => setMasrafForm((f) => ({ ...f, ...patch }))}
        fieldErrors={{}}
      />

      <FinansModalField label="Tutar (₺) *">
        <input
          type="number"
          step="any"
          min="0"
          style={finansModalInputStyle}
          value={tutar}
          onChange={(e) => setTutar(e.target.value)}
          placeholder="0.00"
        />
      </FinansModalField>

      <FinansModalField label="Ödeme Tarihi *">
        <input
          type="date"
          style={finansModalInputStyle}
          value={tarih}
          onChange={(e) => setTarih(e.target.value)}
        />
      </FinansModalField>

      <FinansModalField label="Açıklama">
        <textarea
          style={{ ...finansModalInputStyle, resize: "vertical", minHeight: 64 }}
          value={aciklama}
          onChange={(e) => setAciklama(e.target.value)}
          placeholder="Ör: Erken ödeme, avans..."
        />
      </FinansModalField>

      {tutarNum > 0 && (
        <div
          style={{
            background: "#f0fdf4",
            borderRadius: 12,
            padding: 14,
            textAlign: "center",
            border: "1px solid #a7f3d0",
            marginTop: 4,
          }}
        >
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            {isCekPath ? "Cari Bakiye (çek kaydı sonrası)" : "Ödeme Sonrası Tahmini Bakiye"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#059669", marginTop: 4 }}>
            {fmtTL(bakiye + tutarNum)}
          </div>
        </div>
      )}
    </FinansModal>
  );
}
