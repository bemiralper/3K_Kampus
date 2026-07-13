"use client";

import { todayIsoLocal } from "@/lib/date-utils";
import React, { useEffect, useMemo, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { financialAccountService } from "../../services/finans-api";
import { odemeTakipBridge, type SozlesmeAramaSonuc } from "../../services/odeme-takip-bridge";
import type { OdemeYontemi, Sozlesme } from "@/app/odeme-takip/types";
import FinansModal, {
  FinansModalField,
  FinansModalButton,
  finansModalInputStyle,
} from "@/components/finans/FinansModal";
import SozlesmeArama from "./SozlesmeArama";

const fmtTL = (v: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const today = () => todayIsoLocal();

interface IadeModalProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function IadeModal({ onClose, onSuccess }: IadeModalProps) {
  const { activeKurum, activeSube } = useKurum();
  const [sozlesme, setSozlesme] = useState<SozlesmeAramaSonuc | null>(null);
  const [sozlesmeDetay, setSozlesmeDetay] = useState<Sozlesme | null>(null);
  const [odemeYontemleri, setOdemeYontemleri] = useState<OdemeYontemi[]>([]);
  const [maliHesaplar, setMaliHesaplar] = useState<{ id: number; ad: string; tip: string }[]>([]);

  const [kaynakTahsilatId, setKaynakTahsilatId] = useState("");
  const [tutar, setTutar] = useState("");
  const [tarih, setTarih] = useState(today());
  const [odemeYontemiId, setOdemeYontemiId] = useState("");
  const [maliHesapId, setMaliHesapId] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    odemeTakipBridge
      .odemeSekilleri(maliHesapId ? Number(maliHesapId) : null)
      .then(setOdemeYontemleri)
      .catch(() => setOdemeYontemleri([]));
  }, [maliHesapId]);

  useEffect(() => {
    if (!activeKurum?.id) return;
    financialAccountService
      .dropdownByKurum(activeKurum.id, activeSube?.id)
      .then((res) => setMaliHesaplar(res.mali_hesaplar || []))
      .catch(() => setMaliHesaplar([]));
  }, [activeKurum?.id, activeSube?.id]);

  useEffect(() => {
    if (!sozlesme) { setSozlesmeDetay(null); return; }
    odemeTakipBridge.sozlesmeDetay(sozlesme.id).then(setSozlesmeDetay).catch(() => setSozlesmeDetay(null));
  }, [sozlesme?.id]);

  const aktifTahsilatlar = useMemo(
    () => (sozlesmeDetay?.tahsilatlar || []).filter((t) => t.durum === "aktif" && t.tahsilat_turu !== "iade"),
    [sozlesmeDetay],
  );

  const kalanIadeEdilebilir = sozlesme ? sozlesme.kalan_borc < 0 ? 0 : (sozlesme.toplam_odenen || 0) : 0;

  const handleSubmit = async () => {
    setError(null);
    if (!sozlesme) { setError("Lütfen bir sözleşme seçin."); return; }
    const tutarNum = Number(tutar);
    if (!tutarNum || tutarNum <= 0) { setError("Geçerli bir tutar girin."); return; }
    if (kalanIadeEdilebilir > 0 && tutarNum > kalanIadeEdilebilir) {
      setError(`İade tutarı en fazla ${fmtTL(kalanIadeEdilebilir)} olabilir.`);
      return;
    }

    setSaving(true);
    try {
      await odemeTakipBridge.tahsilatIade({
        sozlesme_id: sozlesme.id,
        tutar: tutarNum,
        tahsilat_tarihi: tarih,
        aciklama,
        kaynak_tahsilat_id: kaynakTahsilatId ? Number(kaynakTahsilatId) : null,
        odeme_yontemi_id: odemeYontemiId ? Number(odemeYontemiId) : null,
        mali_hesap_id: maliHesapId ? Number(maliHesapId) : null,
      });
      onSuccess(`${fmtTL(tutarNum)} iade işlemi kaydedildi.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İade kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FinansModal
      title="İade"
      subtitle="Kurumdan öğrenciye / veliye nakit iade"
      icon="🔄"
      accent="#d97706"
      onClose={onClose}
      footer={
        <>
          <FinansModalButton variant="secondary" onClick={onClose}>İptal</FinansModalButton>
          <FinansModalButton variant="danger" onClick={handleSubmit} disabled={saving}>
            {saving ? "Kaydediliyor…" : "İadeyi Kaydet"}
          </FinansModalButton>
        </>
      }
    >
      {error && (
        <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#991b1b", fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <FinansModalField label="Sözleşme / Öğrenci">
        <SozlesmeArama value={sozlesme} onChange={setSozlesme} />
      </FinansModalField>

      {sozlesme && (
        <FinansModalField
          label="Kaynak Tahsilat (opsiyonel)"
          hint={`Boş bırakılırsa sözleşme bazlı serbest iade yapılır — en fazla ${fmtTL(kalanIadeEdilebilir)}`}
        >
          <select value={kaynakTahsilatId} onChange={(e) => setKaynakTahsilatId(e.target.value)} style={finansModalInputStyle}>
            <option value="">Sözleşme bazlı (serbest iade)</option>
            {aktifTahsilatlar.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.id} · {t.tahsilat_tarihi} · {fmtTL(t.tutar)} ({t.odeme_yontemi?.ad})
              </option>
            ))}
          </select>
        </FinansModalField>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FinansModalField label="İade Tutarı (₺)">
          <input type="number" min={1} value={tutar} onChange={(e) => setTutar(e.target.value)} style={finansModalInputStyle} />
        </FinansModalField>
        <FinansModalField label="İade Tarihi">
          <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} style={finansModalInputStyle} />
        </FinansModalField>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FinansModalField label="Mali Hesap (opsiyonel)" hint="Paranın çıktığı kasa/banka hesabı">
          <select
            value={maliHesapId}
            onChange={(e) => { setMaliHesapId(e.target.value); setOdemeYontemiId(""); }}
            style={finansModalInputStyle}
          >
            <option value="">Otomatik</option>
            {maliHesaplar.map((m) => (
              <option key={m.id} value={m.id}>{m.ad} ({m.tip === "kasa" ? "Kasa" : m.tip === "banka" ? "Banka" : m.tip})</option>
            ))}
          </select>
        </FinansModalField>
        <FinansModalField label="Ödeme Yöntemi (opsiyonel)">
          <select value={odemeYontemiId} onChange={(e) => setOdemeYontemiId(e.target.value)} style={finansModalInputStyle}>
            <option value="">Otomatik</option>
            {odemeYontemleri.map((o) => (
              <option key={o.id} value={o.id}>{o.ad}</option>
            ))}
          </select>
        </FinansModalField>
      </div>

      <FinansModalField label="Açıklama (opsiyonel)">
        <input type="text" value={aciklama} onChange={(e) => setAciklama(e.target.value)} style={finansModalInputStyle} />
      </FinansModalField>
    </FinansModal>
  );
}
