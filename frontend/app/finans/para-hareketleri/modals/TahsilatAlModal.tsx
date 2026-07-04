"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { financialAccountService } from "../../services/finans-api";
import { odemeTakipBridge, type SozlesmeAramaSonuc } from "../../services/odeme-takip-bridge";
import type { Taksit, OdemeYontemi } from "@/app/odeme-takip/types";
import FinansModal, {
  FinansModalField,
  FinansModalButton,
  finansModalInputStyle,
} from "@/components/finans/FinansModal";
import SozlesmeArama from "./SozlesmeArama";
import IslemMasrafiFields from "@/components/finans/IslemMasrafiFields";
import {
  EMPTY_ISLEM_MASRAFI,
  buildIslemMasrafiPayload,
  type IslemMasrafiFormState,
} from "@/app/finans/types/islem-masrafi-types";
import { islemMasrafiGoster } from "@/app/finans/utils/islem-masrafi-eligibility";

const fmtTL = (v: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const today = () => new Date().toISOString().slice(0, 10);

interface TahsilatAlModalProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
  prefillSozlesmeId?: number;
  prefillTaksitId?: number;
}

export default function TahsilatAlModal({ onClose, onSuccess, prefillSozlesmeId, prefillTaksitId }: TahsilatAlModalProps) {
  const { activeKurum, activeSube } = useKurum();
  const [sozlesme, setSozlesme] = useState<SozlesmeAramaSonuc | null>(null);
  const [taksitler, setTaksitler] = useState<Taksit[]>([]);
  const [odemeYontemleri, setOdemeYontemleri] = useState<OdemeYontemi[]>([]);
  const [maliHesaplar, setMaliHesaplar] = useState<{ id: number; ad: string; tip: string }[]>([]);
  const [loadingTaksit, setLoadingTaksit] = useState(false);

  const [taksitId, setTaksitId] = useState("");
  const [odemeYontemiId, setOdemeYontemiId] = useState("");
  const [maliHesapId, setMaliHesapId] = useState("");
  const [tutar, setTutar] = useState("");
  const [tarih, setTarih] = useState(today());
  const [referansNo, setReferansNo] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [masrafForm, setMasrafForm] = useState<IslemMasrafiFormState>({ ...EMPTY_ISLEM_MASRAFI });
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

  // Ön-doldurma: Gecikmiş Ödemeler ekranından tek tıkla açılış
  useEffect(() => {
    if (!prefillSozlesmeId) return;
    odemeTakipBridge
      .sozlesmeler()
      .then((list) => {
        const found = list.find((s) => s.id === prefillSozlesmeId);
        if (found) setSozlesme(found);
      })
      .catch(() => {});
  }, [prefillSozlesmeId]);

  useEffect(() => {
    if (!sozlesme) {
      setTaksitler([]);
      return;
    }
    setLoadingTaksit(true);
    odemeTakipBridge
      .taksitler(sozlesme.id)
      .then((list) => {
        setTaksitler(Array.isArray(list) ? list : []);
        const target = prefillTaksitId
          ? list.find((t) => t.id === prefillTaksitId)
          : list.find((t) => t.durum === "beklemede" || t.durum === "gecikti" || t.durum === "kismi_odendi");
        if (target) {
          setTaksitId(String(target.id));
          setTutar(String(target.kalan_tutar));
        }
      })
      .catch(() => setTaksitler([]))
      .finally(() => setLoadingTaksit(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sozlesme?.id]);

  const selectedTaksit = useMemo(() => taksitler.find((t) => String(t.id) === taksitId) || null, [taksitler, taksitId]);
  const selectedYontem = odemeYontemleri.find((o) => String(o.id) === odemeYontemiId);
  const selectedHesap = maliHesaplar.find((m) => String(m.id) === maliHesapId);
  const masrafVisible = islemMasrafiGoster(selectedYontem?.tip, selectedHesap?.tip);

  const handleTaksitChange = (id: string) => {
    setTaksitId(id);
    const t = taksitler.find((x) => String(x.id) === id);
    if (t) setTutar(String(t.kalan_tutar));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!sozlesme) { setError("Lütfen bir sözleşme seçin."); return; }
    if (!odemeYontemiId) { setError("Ödeme yöntemi seçmelisiniz."); return; }
    const tutarNum = Number(tutar);
    if (!tutarNum || tutarNum <= 0) { setError("Geçerli bir tutar girin."); return; }

    setSaving(true);
    try {
      const masraf = buildIslemMasrafiPayload(masrafForm);
      await odemeTakipBridge.tahsilatOlustur({
        sozlesme_id: sozlesme.id,
        taksit_id: taksitId ? Number(taksitId) : null,
        odeme_yontemi_id: Number(odemeYontemiId),
        mali_hesap_id: maliHesapId ? Number(maliHesapId) : null,
        tutar: tutarNum,
        tahsilat_tarihi: tarih,
        referans_no: referansNo,
        aciklama,
        ...masraf,
      });
      onSuccess(`${fmtTL(tutarNum)} tahsilat kaydedildi.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tahsilat kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FinansModal
      title="Tahsilat Al"
      subtitle="Öğrenci / veli sözleşmesinden ödeme al"
      icon="➕"
      accent="#059669"
      onClose={onClose}
      footer={
        <>
          <FinansModalButton variant="secondary" onClick={onClose}>İptal</FinansModalButton>
          <FinansModalButton onClick={handleSubmit} disabled={saving}>
            {saving ? "Kaydediliyor…" : "Tahsilatı Kaydet"}
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
        <FinansModalField label="Taksit (opsiyonel — boş bırakılırsa emanet/fazla ödeme)">
          <select
            value={taksitId}
            onChange={(e) => handleTaksitChange(e.target.value)}
            style={finansModalInputStyle}
            disabled={loadingTaksit}
          >
            <option value="">Emanet / Fazla Ödeme</option>
            {taksitler.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.taksit_no} · Vade {t.vade_tarihi} · Kalan {fmtTL(t.kalan_tutar)} ({t.durum})
              </option>
            ))}
          </select>
        </FinansModalField>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FinansModalField label="İşlem Tutarı (₺)">
          <input type="number" min={1} value={tutar} onChange={(e) => setTutar(e.target.value)} style={finansModalInputStyle} />
        </FinansModalField>
        <FinansModalField label="Tahsilat Tarihi">
          <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} style={finansModalInputStyle} />
        </FinansModalField>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FinansModalField label="Mali Hesap (Kasa / Banka)" hint="Boş bırakılırsa ödeme yöntemi/sözleşme varsayılanı kullanılır">
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
        <FinansModalField label="Ödeme Yöntemi">
          <select value={odemeYontemiId} onChange={(e) => setOdemeYontemiId(e.target.value)} style={finansModalInputStyle}>
            <option value="">Seçiniz…</option>
            {odemeYontemleri.map((o) => (
              <option key={o.id} value={o.id}>{o.ad}</option>
            ))}
          </select>
        </FinansModalField>
      </div>

      <IslemMasrafiFields
        visible={masrafVisible}
        form={masrafForm}
        onChange={(patch) => setMasrafForm((f) => ({ ...f, ...patch }))}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FinansModalField label="Referans No (opsiyonel)">
          <input type="text" value={referansNo} onChange={(e) => setReferansNo(e.target.value)} style={finansModalInputStyle} />
        </FinansModalField>
        <FinansModalField label="Açıklama (opsiyonel)">
          <input type="text" value={aciklama} onChange={(e) => setAciklama(e.target.value)} style={finansModalInputStyle} />
        </FinansModalField>
      </div>
    </FinansModal>
  );
}
