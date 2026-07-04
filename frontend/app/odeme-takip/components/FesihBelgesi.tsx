"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { API_BASE } from "../helpers";
import { FesihDetay } from "../types";

/* ── Kurum ana rengi ── */
const KURUM_COLOR = "#0262a7";
const KURUM_LIGHT = "#0380d4";

interface Props {
  sozlesmeId: number;
  onClose: () => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("tr-TR"); } catch { return d; }
}

export default function FesihBelgesi({ sozlesmeId, onClose }: Props) {
  const [fesih, setFesih] = useState<FesihDetay | null>(null);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fetchFesih = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sozlesmeler/${sozlesmeId}/fesih/`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setFesih(data);
      }
    } catch {}
    setLoading(false);
  }, [sozlesmeId]);

  useEffect(() => { fetchFesih(); }, [fetchFesih]);

  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };

  if (loading) {
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 3000 }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          padding: 40, background: "#fff", borderRadius: 16, zIndex: 3001, textAlign: "center",
        }}>
          <p>Yükleniyor...</p>
        </div>
      </>
    );
  }

  if (!fesih) {
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 3000 }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          padding: 40, background: "#fff", borderRadius: 16, zIndex: 3001, textAlign: "center",
        }}>
          <p>Fesih kaydı bulunamadı.</p>
          <button onClick={onClose} style={{ marginTop: 16, padding: "8px 24px", borderRadius: 8, border: "none", background: KURUM_COLOR, color: "#fff", cursor: "pointer" }}>Kapat</button>
        </div>
      </>
    );
  }

  const belgeHTML = generateBelgeHTML(fesih);

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 3000, animation: "fadeIn .2s" }} />

      {/* Modal */}
      <div style={{
        position: "fixed", top: "3%", left: "50%", transform: "translateX(-50%)",
        width: 850, maxHeight: "94vh", background: "#fff", borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,.2)", zIndex: 3001,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Toolbar */}
        <div style={{ padding: "12px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#991b1b" }}>📄 Fesih Belgesi</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handlePrint}
              style={{
                padding: "6px 16px", borderRadius: 6, border: "none",
                background: KURUM_COLOR, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >🖨️ Yazdır</button>
            <button
              onClick={onClose}
              style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}
            >✕</button>
          </div>
        </div>

        {/* iframe ile belge */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <iframe
            ref={iframeRef}
            srcDoc={belgeHTML}
            style={{ width: "100%", height: "100%", border: "none", minHeight: 700 }}
          />
        </div>
      </div>
    </>
  );
}

function generateBelgeHTML(fesih: FesihDetay): string {
  const ogrenciAdi = fesih.ogrenci ? `${fesih.ogrenci.ad} ${fesih.ogrenci.soyad}` : "-";

  const kesintiRows = (fesih.kesintiler || []).map((k, i) => `
    <tr>
      <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; font-size:13px;">${i + 1}. ${k.ad}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; text-align:right; font-size:13px; font-weight:600; color:#dc2626;">${formatCurrency(k.tutar)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #111827; background: #fff; padding: 0; }

    .header { background: ${KURUM_COLOR}; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .header img { height: 50px; }
    .header h1 { color: #fff; font-size: 20px; font-weight: 700; }
    .header-right { color: rgba(255,255,255,.8); font-size: 12px; text-align: right; }

    .title-bar { background: #fef2f2; padding: 16px 32px; border-bottom: 3px solid #dc2626; text-align: center; }
    .title-bar h2 { color: #991b1b; font-size: 18px; font-weight: 700; margin: 0; }

    .content { padding: 24px 32px; }

    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .info-box { padding: 14px; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb; }
    .info-box .label { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
    .info-box .value { font-size: 15px; font-weight: 700; }

    .section { margin-bottom: 24px; }
    .section h3 { font-size: 14px; font-weight: 700; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid ${KURUM_COLOR}; color: ${KURUM_COLOR}; }

    table.calc { width: 100%; border-collapse: collapse; }
    table.calc td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    table.calc tr.total td { font-weight: 700; font-size: 15px; border-top: 2px solid #111; border-bottom: none; padding-top: 12px; }
    table.calc .right { text-align: right; }

    .result-box { padding: 20px; border-radius: 12px; text-align: center; margin: 24px 0; border: 2px solid; }
    .result-box.iade { background: #ecfdf5; border-color: #059669; }
    .result-box.borc { background: #fef2f2; border-color: #dc2626; }
    .result-box.sifir { background: #f3f4f6; border-color: #d1d5db; }
    .result-box .label { font-size: 13px; color: #6b7280; margin-bottom: 4px; }
    .result-box .amount { font-size: 28px; font-weight: 800; }
    .result-box.iade .amount { color: #059669; }
    .result-box.borc .amount { color: #dc2626; }

    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
    .sig-box { text-align: center; }
    .sig-line { border-top: 1px solid #374151; padding-top: 8px; font-size: 12px; color: #6b7280; }

    @media print {
      body { padding: 0; }
      .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .title-bar, .info-box, .result-box, table.calc td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <img src="/img/beyaz-logo.png" alt="Logo" onerror="this.style.display='none'" />
      <h1>SÖZLEŞME FESİH BELGESİ</h1>
    </div>
    <div class="header-right">
      Belge No: FSH-${fesih.sozlesme_no}<br>
      Tarih: ${formatDate(fesih.fesih_tarihi)}
    </div>
  </div>

  <!-- Title -->
  <div class="title-bar">
    <h2>⚠️ SÖZLEŞME FESİH TUTANAĞI</h2>
  </div>

  <div class="content">
    <!-- Bilgiler -->
    <div class="info-grid">
      <div class="info-box">
        <div class="label">Öğrenci</div>
        <div class="value">${ogrenciAdi}</div>
      </div>
      <div class="info-box">
        <div class="label">Sözleşme No</div>
        <div class="value">${fesih.sozlesme_no}</div>
      </div>
      <div class="info-box">
        <div class="label">Fesih Nedeni</div>
        <div class="value">${fesih.fesih_nedeni_display}</div>
      </div>
      <div class="info-box">
        <div class="label">Fesih Tarihi</div>
        <div class="value">${formatDate(fesih.fesih_tarihi)}</div>
      </div>
    </div>

    ${fesih.fesih_aciklama ? `
    <div class="section">
      <h3>Açıklama</h3>
      <p style="font-size:13px; line-height:1.6; color:#374151;">${fesih.fesih_aciklama}</p>
    </div>
    ` : ""}

    <!-- Hesaplama -->
    <div class="section">
      <h3>Mali Hesaplama</h3>
      <table class="calc">
        <tr>
          <td>Sözleşme Net Tutarı</td>
          <td class="right" style="font-weight:600;">${formatCurrency(fesih.sozlesme_net_tutar)}</td>
        </tr>
        <tr>
          <td>Eğitim Süresi</td>
          <td class="right">${fesih.toplam_gun} gün</td>
        </tr>
        <tr>
          <td>Kullanılan Süre</td>
          <td class="right">${fesih.kullanilan_gun} gün</td>
        </tr>
        <tr>
          <td>Kullanılan Eğitim Bedeli <span style="font-size:11px;color:#6b7280;">(${fesih.kullanilan_gun}/${fesih.toplam_gun} gün oranıyla)</span></td>
          <td class="right" style="font-weight:600;">${formatCurrency(fesih.kullanilan_tutar)}</td>
        </tr>
        <tr>
          <td>Toplam Ödenen</td>
          <td class="right" style="font-weight:600; color:#059669;">${formatCurrency(fesih.toplam_odenen)}</td>
        </tr>
      </table>
    </div>

    <!-- Kesintiler -->
    ${fesih.kesintiler && fesih.kesintiler.length > 0 ? `
    <div class="section">
      <h3>Kesintiler</h3>
      <table class="calc">
        ${kesintiRows}
        <tr class="total">
          <td>Kesintiler Toplamı</td>
          <td class="right" style="color:#dc2626;">${formatCurrency(fesih.kesinti_tutari)}</td>
        </tr>
      </table>
    </div>
    ` : ""}

    ${fesih.ceza_orani > 0 ? `
    <div class="section">
      <h3>Ceza</h3>
      <table class="calc">
        <tr>
          <td>Ceza Oranı</td>
          <td class="right">%${fesih.ceza_orani}</td>
        </tr>
        <tr>
          <td>Ceza Tutarı</td>
          <td class="right" style="font-weight:600; color:#dc2626;">${formatCurrency(fesih.ceza_tutari)}</td>
        </tr>
      </table>
    </div>
    ` : ""}

    <!-- Sonuç -->
    <div class="result-box ${fesih.iade_tutari > 0 ? 'iade' : fesih.iade_tutari < 0 ? 'borc' : 'sifir'}">
      <div class="label">${fesih.iade_tutari > 0 ? 'Veliye İade Edilecek Tutar' : fesih.iade_tutari < 0 ? 'Veliden Tahsil Edilecek Tutar' : 'Bakiye'}</div>
      <div class="amount">${formatCurrency(Math.abs(fesih.iade_tutari))}</div>
    </div>

    <!-- İptal edilen taksitler -->
    ${fesih.iptal_edilen_taksit_sayisi > 0 ? `
    <p style="font-size:13px; color:#6b7280; margin-bottom:24px;">
      📅 Bu fesih işlemi ile <strong>${fesih.iptal_edilen_taksit_sayisi}</strong> adet ödenmemiş taksit iptal edilmiştir.
    </p>
    ` : ""}

    <!-- İmza -->
    <div class="footer">
      <p style="font-size:12px; color:#6b7280; margin-bottom:8px;">
        İşbu fesih tutanağı taraflarca okunmuş ve imzalanmıştır.
      </p>
      <div class="signatures">
        <div class="sig-box">
          <div class="sig-line">
            <strong>Kurum Yetkilisi</strong><br>
            ${fesih.fesih_eden || "—"}
          </div>
        </div>
        <div class="sig-box">
          <div class="sig-line">
            <strong>Veli / Vasi</strong><br>
            ${ogrenciAdi} velisi
          </div>
        </div>
      </div>
    </div>
  </div>

</body>
</html>`;
}
