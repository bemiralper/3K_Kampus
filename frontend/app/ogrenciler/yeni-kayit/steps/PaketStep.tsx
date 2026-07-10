"use client";

import { useState } from "react";
import { DenemePaketiInfo, EkHizmetInfo, PackageInfo, WizardData, YayinPaketiInfo } from "../types";
import { useStudentPackageSelection } from "../hooks/useStudentPackageSelection";

interface PaketStepProps {
  data: WizardData;
  errors: Record<string, string>;
  onChange: (data: WizardData) => void;
  packages: PackageInfo[];
  ekHizmetler: EkHizmetInfo[];
  denemePaketleri: DenemePaketiInfo[];
  yayinPaketleri: YayinPaketiInfo[];
  loadingPackages: boolean;
  packageLoadError?: string | null;
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  overflow: "hidden",
  background: "#fff",
};

const sectionHeader = (icon: string, title: string, hint: string, color: string): React.CSSProperties => ({
  padding: "16px 20px",
  background: `${color}12`,
  borderBottom: "1px solid #e5e7eb",
});

function formatPrice(fiyat: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(fiyat);
}

function displayPrice(item: { fiyat?: number; kdv_dahil_fiyat?: number }) {
  return item.kdv_dahil_fiyat ?? item.fiyat;
}

function SelectRow({
  label,
  sub,
  price,
  selected,
  disabled,
  dahil,
  onClick,
}: {
  label: string;
  sub?: string;
  price?: number;
  selected: boolean;
  disabled?: boolean;
  dahil?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={() => !disabled && !dahil && onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        border: dahil ? "2px solid #a7f3d0" : selected ? "2px solid #3b82f6" : "2px solid #e5e7eb",
        borderRadius: 10,
        cursor: disabled || dahil ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        background: dahil ? "#ecfdf5" : selected ? "#eff6ff" : "#fff",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: "#1f2937" }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{sub}</div>}
      </div>
      {dahil ? (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#059669" }}>Ücretsiz</span>
      ) : price != null ? (
        <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{formatPrice(price)}</span>
      ) : null}
      {selected && !dahil && <span style={{ color: "#3b82f6", fontWeight: 700 }}>✓</span>}
    </div>
  );
}

export default function PaketStep({
  data,
  errors,
  onChange,
  packages,
  ekHizmetler,
  denemePaketleri,
  yayinPaketleri,
  loadingPackages,
  packageLoadError,
}: PaketStepProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const sel = useStudentPackageSelection(
    data.package,
    (pkg) => onChange({ ...data, package: pkg }),
    { packages, ekHizmetler, denemePaketleri, yayinPaketleri },
  );

  const filterText = (text: string) =>
    !searchTerm || text.toLowerCase().includes(searchTerm.toLowerCase());

  const grupPaketleri = packages.filter((p) => p.kategori === "grup_dersleri" && filterText(p.ad || ""));
  const premiumPaketleri = packages.filter((p) => p.kategori === "premium_paketler" && filterText(p.ad || ""));
  const ozelDersPaketleri = packages.filter((p) => p.kategori === "ozel_dersler" && filterText(p.ad || ""));

  if (loadingPackages) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Paketler yükleniyor...</div>;
  }

  if (packageLoadError) {
    return (
      <div style={{ padding: 24, background: "#fef2f2", borderRadius: 12, color: "#b91c1c" }}>
        {packageLoadError}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ padding: 16, background: "#eff6ff", borderRadius: 10, fontSize: 14, color: "#1e40af" }}>
        Grup dersi veya premium paketten yalnızca birini seçebilirsiniz. Grup dersi ile özel ders birlikte alınabilir;
        premium seçilirse özel ders alınamaz. Pakete tanımlı ücretsiz hizmetler otomatik işaretlenir. Denemeden en fazla bir tane seçilir.
        Kütüphane, koçluk veya yayın paketini grup/premium olmadan da tek başına seçebilirsiniz.
      </div>

      {errors.paket && (
        <div style={{ padding: 12, background: "#fef2f2", borderRadius: 8, color: "#b91c1c", fontSize: 14 }}>
          {errors.paket}
        </div>
      )}

      <input
        type="text"
        placeholder="Paket ara..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{
          padding: "12px 16px",
          border: "1px solid #d1d5db",
          borderRadius: 8,
          fontSize: 14,
        }}
      />

      {/* Grup Dersleri */}
      <div style={{ ...cardStyle, ...(sel.hasPremiumSelected ? { opacity: 0.5, pointerEvents: "none" } : {}) }}>
        <div style={sectionHeader("👥", "Grup Dersleri", "", "#3b82f6")}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>👥 Grup Dersleri</span>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>En fazla 1 paket</p>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {grupPaketleri.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>Uygun grup dersi bulunamadı</p>
          ) : (
            grupPaketleri.map((p) => (
              <SelectRow
                key={p.id}
                label={p.ad || ""}
                sub={p.aciklama}
                price={displayPrice(p)}
                selected={sel.isParentSelected("grup_dersleri", p.db_id || 0)}
                onClick={() => sel.toggleGrup(p.db_id || 0)}
              />
            ))
          )}
        </div>
      </div>

      {/* Premium */}
      <div style={{ ...cardStyle, ...(sel.hasGrupSelected ? { opacity: 0.5, pointerEvents: "none" } : {}) }}>
        <div style={sectionHeader("💎", "Premium Paketler", "", "#0ea5e9")}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>💎 Premium Paketler</span>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>En fazla 1 paket — özel ders ile birlikte alınamaz</p>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {premiumPaketleri.map((p) => (
            <SelectRow
              key={p.id}
              label={p.ad || ""}
              sub={p.aciklama}
              price={displayPrice(p)}
              selected={sel.isParentSelected("premium_paketler", p.db_id || 0)}
              onClick={() => sel.togglePremium(p.db_id || 0)}
            />
          ))}
        </div>
      </div>

      {/* Özel Ders */}
      <div style={{ ...cardStyle, ...(sel.hasPremiumSelected ? { opacity: 0.5, pointerEvents: "none" } : {}) }}>
        <div style={sectionHeader("🎓", "Özel Dersler", "", "#8b5cf6")}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>🎓 Özel Dersler</span>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>Birden fazla seçilebilir</p>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {ozelDersPaketleri.map((p) => (
            <SelectRow
              key={p.id}
              label={p.ad || ""}
              price={displayPrice(p)}
              selected={sel.isOzelDersSelected(p.db_id || 0)}
              onClick={() => sel.toggleOzelDers(p.db_id || 0)}
            />
          ))}
        </div>
      </div>

      {/* Dahil ücretsiz */}
      {(sel.included.ekHizmetler.length > 0 || sel.included.denemeler.length > 0 || sel.included.yayinlar.length > 0) && (
        <div style={{ ...cardStyle, border: "1px solid #a7f3d0" }}>
          <div style={{ padding: 16, background: "#ecfdf5" }}>
            <strong style={{ color: "#065f46" }}>Pakete Dahil (Ücretsiz)</strong>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {sel.included.ekHizmetler.map((h) => (
                <span key={`ek-${h.id}`} style={{ fontSize: 12, padding: "4px 10px", background: "#d1fae5", borderRadius: 20 }}>
                  {h.ad}
                </span>
              ))}
              {sel.included.denemeler.map((d) => (
                <span key={`dn-${d.id}`} style={{ fontSize: 12, padding: "4px 10px", background: "#d1fae5", borderRadius: 20 }}>
                  {d.ad}
                </span>
              ))}
              {sel.included.yayinlar.map((y) => (
                <span key={`yp-${y.id}`} style={{ fontSize: 12, padding: "4px 10px", background: "#d1fae5", borderRadius: 20 }}>
                  {y.ad}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ek Hizmetler */}
      <div style={cardStyle}>
        <div style={sectionHeader("⭐", "Ek Hizmetler", "", "#f59e0b")}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>⭐ Ek Hizmetler (Kütüphane, Koçluk)</span>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>Tek başına veya paketle birlikte seçilebilir</p>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {ekHizmetler.filter((h) => h.hizmet_turu !== "deneme").length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>Tanımlı ek hizmet bulunamadı (Eğitim Paketleri → Ek Hizmetler)</p>
          ) : (
            ekHizmetler.filter((h) => h.hizmet_turu !== "deneme").map((h) => (
              <SelectRow
                key={h.id}
                label={h.ad}
                sub={h.hizmet_turu}
                price={displayPrice(h)}
                selected={sel.isEkHizmetSelected(h.id)}
                dahil={sel.isEkHizmetDahil(h.id)}
                onClick={() => sel.toggleEkHizmet(h.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Deneme */}
      <div style={cardStyle}>
        <div style={sectionHeader("📝", "Deneme Paketleri", "", "#10b981")}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>📝 Deneme Paketleri</span>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>En fazla 1 tane</p>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {denemePaketleri.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>Tanımlı deneme paketi bulunamadı</p>
          ) : (
            denemePaketleri.map((d) => (
              <SelectRow
                key={d.id}
                label={d.ad}
                price={displayPrice(d)}
                selected={sel.isDenemeSelected(d.id)}
                dahil={sel.isDenemeDahil(d.id)}
                onClick={() => sel.toggleDeneme(d.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Yayın */}
      <div style={cardStyle}>
        <div style={sectionHeader("📚", "Yayın Paketleri", "", "#6366f1")}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>📚 Yayın Paketleri</span>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>Tek başına veya paketle birlikte seçilebilir</p>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {yayinPaketleri.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>Tanımlı yayın paketi bulunamadı (Eğitim Paketleri → Yayın Paketleri)</p>
          ) : (
            yayinPaketleri.map((y) => (
              <SelectRow
                key={y.id}
                label={y.ad}
                price={displayPrice(y)}
                selected={sel.isYayinSelected(y.id)}
                dahil={sel.isYayinDahil(y.id)}
                onClick={() => sel.toggleYayin(y.id)}
              />
            ))
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={sel.clearAll}
        style={{
          alignSelf: "flex-start",
          padding: "8px 16px",
          border: "1px solid #d1d5db",
          borderRadius: 8,
          background: "#fff",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Tüm seçimleri temizle
      </button>
    </div>
  );
}
