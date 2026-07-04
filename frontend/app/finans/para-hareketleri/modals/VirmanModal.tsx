"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { financialAccountService, paymentMethodService } from "../../services/finans-api";
import { hesapTransferiService } from "../../services/para-hareketi-api";
import FinansModal, {
  FinansModalField,
  FinansModalButton,
  finansModalInputStyle,
} from "@/components/finans/FinansModal";
import IslemMasrafiFields from "@/components/finans/IslemMasrafiFields";
import { EMPTY_ISLEM_MASRAFI, buildIslemMasrafiPayload } from "../../types/islem-masrafi-types";
import { islemMasrafiGoster } from "../../utils/islem-masrafi-eligibility";
import "../../cari-hesaplar/components/cari-tab-toolbar.css";

const fmtTL = (v: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v || 0);
const today = () => new Date().toISOString().slice(0, 10);

export type VirmanMode = "virman" | "kasadan_bankaya" | "bankadan_kasaya";

const MODE_META: Record<
  VirmanMode,
  { title: string; subtitle: string; icon: string; accent: string; kaynakTip?: string; hedefTip?: string }
> = {
  virman: {
    title: "Virman",
    subtitle: "Hesaplar arası serbest transfer",
    icon: "↔️",
    accent: "#6366f1",
  },
  kasadan_bankaya: {
    title: "Bankaya Para Yatır",
    subtitle: "Kasadan bankaya para yatırma",
    icon: "📥",
    accent: "#2563eb",
    kaynakTip: "kasa",
    hedefTip: "banka",
  },
  bankadan_kasaya: {
    title: "Bankadan Kasaya Çek",
    subtitle: "Bankadan nakit çekme",
    icon: "📤",
    accent: "#0891b2",
    kaynakTip: "banka",
    hedefTip: "kasa",
  },
};

interface VirmanModalProps {
  mode: VirmanMode;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function VirmanModal({ mode, onClose, onSuccess }: VirmanModalProps) {
  const { activeKurum, activeSube } = useKurum();
  const meta = MODE_META[mode];
  const [maliHesaplar, setMaliHesaplar] = useState<{ id: number; ad: string; tip: string }[]>([]);
  const [odemeYontemleri, setOdemeYontemleri] = useState<{ id: number; ad: string; tip: string }[]>([]);
  const [kaynakHesapId, setKaynakHesapId] = useState("");
  const [hedefHesapId, setHedefHesapId] = useState("");
  const [tutar, setTutar] = useState("");
  const [tarih, setTarih] = useState(today());
  const [aciklama, setAciklama] = useState("");
  const [odemeYontemiId, setOdemeYontemiId] = useState("");
  const [masrafForm, setMasrafForm] = useState({ ...EMPTY_ISLEM_MASRAFI });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeKurum?.id) return;
    financialAccountService
      .dropdownByKurum(activeKurum.id, activeSube?.id)
      .then((res) => setMaliHesaplar(res.mali_hesaplar || []))
      .catch(() => setMaliHesaplar([]));
  }, [activeKurum?.id, activeSube?.id]);

  useEffect(() => {
    if (!activeKurum?.id || !kaynakHesapId) {
      setOdemeYontemleri([]);
      return;
    }
    paymentMethodService
      .dropdown(activeKurum.id, Number(kaynakHesapId))
      .then((res) => setOdemeYontemleri(res.odeme_yontemleri || []))
      .catch(() => setOdemeYontemleri([]));
  }, [activeKurum?.id, kaynakHesapId]);

  const kaynakSecenekleri = useMemo(
    () => (meta.kaynakTip ? maliHesaplar.filter((h) => h.tip === meta.kaynakTip) : maliHesaplar),
    [maliHesaplar, meta.kaynakTip]
  );
  const hedefSecenekleri = useMemo(
    () =>
      meta.hedefTip
        ? maliHesaplar.filter((h) => h.tip === meta.hedefTip)
        : maliHesaplar.filter((h) => String(h.id) !== kaynakHesapId),
    [maliHesaplar, meta.hedefTip, kaynakHesapId]
  );

  const kaynakHesap = maliHesaplar.find((h) => String(h.id) === kaynakHesapId);
  const hedefHesap = maliHesaplar.find((h) => String(h.id) === hedefHesapId);
  const selectedYontem = odemeYontemleri.find((y) => String(y.id) === odemeYontemiId);
  const masrafVisible = islemMasrafiGoster(selectedYontem?.tip, kaynakHesap?.tip);
  const bankInvolved =
    kaynakHesap?.tip === "banka" ||
    hedefHesap?.tip === "banka" ||
    kaynakHesap?.tip === "pos" ||
    hedefHesap?.tip === "sanal_pos";

  const handleSubmit = async () => {
    setError(null);
    if (!kaynakHesapId || !hedefHesapId) {
      setError("Kaynak ve hedef hesap seçmelisiniz.");
      return;
    }
    if (kaynakHesapId === hedefHesapId) {
      setError("Kaynak ve hedef hesap aynı olamaz.");
      return;
    }
    const tutarNum = Number(tutar);
    if (!tutarNum || tutarNum <= 0) {
      setError("Geçerli bir tutar girin.");
      return;
    }
    const masraf = buildIslemMasrafiPayload(masrafForm);
    if (masraf && !odemeYontemiId) {
      setError("İşlem ücreti için ödeme yöntemi seçin.");
      return;
    }

    setSaving(true);
    try {
      await hesapTransferiService.create({
        kaynak_hesap_id: Number(kaynakHesapId),
        hedef_hesap_id: Number(hedefHesapId),
        tutar: tutarNum,
        transfer_tarihi: tarih,
        transfer_turu: mode,
        aciklama,
        odeme_yontemi_id: odemeYontemiId ? Number(odemeYontemiId) : undefined,
        ...masraf,
      });
      onSuccess(`${fmtTL(tutarNum)} transfer edildi.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer yapılamadı.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FinansModal
      title={meta.title}
      subtitle={meta.subtitle}
      icon={meta.icon}
      accent={meta.accent}
      onClose={onClose}
      footer={
        <>
          <FinansModalButton variant="secondary" onClick={onClose}>
            İptal
          </FinansModalButton>
          <FinansModalButton onClick={handleSubmit} disabled={saving}>
            {saving ? "Kaydediliyor…" : "Transferi Yap"}
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

      <div className="virman-modal-summary">
        <div className="virman-modal-account">
          <label>{meta.kaynakTip === "kasa" ? "Kaynak Kasa" : meta.kaynakTip === "banka" ? "Kaynak Banka" : "Kaynak Hesap"}</label>
          <select
            value={kaynakHesapId}
            onChange={(e) => {
              setKaynakHesapId(e.target.value);
              setOdemeYontemiId("");
            }}
          >
            <option value="">Seçiniz…</option>
            {kaynakSecenekleri.map((h) => (
              <option key={h.id} value={h.id}>
                {h.ad}
              </option>
            ))}
          </select>
        </div>
        <div className="virman-modal-arrow">→</div>
        <div className="virman-modal-account">
          <label>{meta.hedefTip === "kasa" ? "Hedef Kasa" : meta.hedefTip === "banka" ? "Hedef Banka" : "Hedef Hesap"}</label>
          <select value={hedefHesapId} onChange={(e) => setHedefHesapId(e.target.value)}>
            <option value="">Seçiniz…</option>
            {hedefSecenekleri.map((h) => (
              <option key={h.id} value={h.id}>
                {h.ad}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="virman-modal-tutar-wrap">
        <span className="virman-modal-tutar-prefix">₺</span>
        <input
          type="number"
          min={1}
          value={tutar}
          onChange={(e) => setTutar(e.target.value)}
          placeholder="0"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <FinansModalField label="Transfer Tarihi">
          <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} style={finansModalInputStyle} />
        </FinansModalField>
        <FinansModalField label="Açıklama (opsiyonel)">
          <input type="text" value={aciklama} onChange={(e) => setAciklama(e.target.value)} style={finansModalInputStyle} placeholder="Transfer notu…" />
        </FinansModalField>
      </div>

      {bankInvolved && kaynakHesapId && (
        <div className="virman-modal-section">
          <div className="virman-modal-section-title">Banka / İşlem Detayı</div>
          <FinansModalField label="Ödeme Yöntemi">
            <select
              value={odemeYontemiId}
              onChange={(e) => setOdemeYontemiId(e.target.value)}
              style={finansModalInputStyle}
            >
              <option value="">Seçiniz…</option>
              {odemeYontemleri.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.ad}
                </option>
              ))}
            </select>
          </FinansModalField>
          <IslemMasrafiFields
            visible={masrafVisible || !!masrafForm.kesinti_turu}
            form={masrafForm}
            onChange={(patch) => setMasrafForm((f) => ({ ...f, ...patch }))}
          />
        </div>
      )}
    </FinansModal>
  );
}
