"use client";

import type { CSSProperties } from "react";
import type { useContractPackageSelection } from "../hooks/useContractPackageSelection";

type Sel = ReturnType<typeof useContractPackageSelection>;

export type CatalogPaketItem = {
  id: number;
  ad: string;
  fiyat?: number;
  kdv_dahil_fiyat?: number;
  hizmet_turu?: string;
  hizmet_turu_display?: string;
};

export type TumPaketlerState = {
  grupDersleri: CatalogPaketItem[];
  ozelDersler: CatalogPaketItem[];
  premiumPaketler: CatalogPaketItem[];
  denemeler: CatalogPaketItem[];
  yayinPaketleri: CatalogPaketItem[];
  ekHizmetler: CatalogPaketItem[];
  filtreUyari?: string | null;
};

export type CatalogAddProps = {
  showPaketEkle: boolean;
  onTogglePaketEkle: () => void;
  tumPaketlerLoading: boolean;
  tumPaketler: TumPaketlerState | null;
  onLoadTumPaketler: () => void;
  onAddPaket: (paket: CatalogPaketItem, tur: string) => void;
  onAddEkHizmet: (hizmet: CatalogPaketItem) => void;
  isPaketMevcut: (tur: string, id: number) => boolean;
  isEkMevcut: (id: number) => boolean;
};

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};

function Row({
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
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 14px",
        border: dahil ? "2px solid #a7f3d0" : selected ? "2px solid #0262a7" : "1px solid #e5e7eb",
        borderRadius: 8,
        marginBottom: 8,
        cursor: disabled || dahil ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        background: dahil ? "#ecfdf5" : selected ? "#eff6ff" : "#fff",
      }}
    >
      <div>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "#6b7280" }}>{sub}</div>}
      </div>
      {dahil ? (
        <span style={{ color: "#059669", fontSize: 13, fontWeight: 600 }}>Ücretsiz</span>
      ) : price != null ? (
        <span style={{ fontWeight: 600 }}>{formatCurrency(price)}</span>
      ) : null}
      {selected && !dahil && <span style={{ color: "#0262a7", fontWeight: 700, marginLeft: 8 }}>✓</span>}
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);
}

function CatalogAddRow({
  label,
  sub,
  price,
  mevcut,
  disabled,
  onAdd,
}: {
  label: string;
  sub?: string;
  price?: number;
  mevcut: boolean;
  disabled?: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        background: mevcut ? "#f0fdf4" : "#f9fafb",
        borderRadius: 8,
        border: `1px solid ${mevcut ? "#bbf7d0" : "#e5e7eb"}`,
        marginBottom: 6,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
        {sub && <span style={{ marginLeft: 6, fontSize: 11, color: "#6b7280" }}>({sub})</span>}
        {price != null && (
          <span style={{ marginLeft: 8, fontSize: 12, color: "#059669", fontWeight: 700 }}>
            {formatCurrency(price)}
          </span>
        )}
      </div>
      {mevcut ? (
        <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ Mevcut</span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            border: "none",
            background: disabled ? "#9ca3af" : "#059669",
            color: "#fff",
            fontSize: 12,
            cursor: disabled ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          + Ekle
        </button>
      )}
    </div>
  );
}

export default function ContractPackageStep({
  sel,
  catalogAdd,
}: {
  sel: Sel;
  catalogAdd?: CatalogAddProps;
}) {
  const { catalog, included, hasGrupSelected, hasPremiumSelected } = sel;
  const disabledPremium = hasGrupSelected;
  const disabledGrup = hasPremiumSelected;
  const disabledOzel = hasPremiumSelected;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ fontSize: 14, color: "#4b5563", margin: 0 }}>
        Kayıt sırasında seçilen kalemler otomatik işaretlenir. Seçili kaleme tekrar tıklayarak kaldırabilir veya yeni kalem ekleyebilirsiniz.
        Kütüphane, koçluk veya yayın paketi tek başına da seçilebilir.
      </p>

      {catalog.grupDersleri.length > 0 && (
        <div style={{ ...cardStyle, ...(disabledGrup ? { opacity: 0.5, pointerEvents: "none" } : {}) }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Grup Dersleri</h3>
          {catalog.grupDersleri.map((p) => (
            <Row
              key={`grup-${p.id}`}
              label={p.ad}
              price={p.fiyat}
              selected={sel.isParentSelected("grup_dersi", p.id)}
              onClick={() => sel.toggleGrup(p.id)}
            />
          ))}
        </div>
      )}

      {catalog.premiumPaketler.length > 0 && (
        <div style={{ ...cardStyle, ...(disabledPremium ? { opacity: 0.5, pointerEvents: "none" } : {}) }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Premium Paketler</h3>
          {catalog.premiumPaketler.map((p) => (
            <Row
              key={`prem-${p.id}`}
              label={p.ad}
              price={p.fiyat}
              selected={sel.isParentSelected("premium", p.id)}
              onClick={() => sel.togglePremium(p.id)}
            />
          ))}
        </div>
      )}

      {catalog.ozelDersler.length > 0 && (
        <div style={{ ...cardStyle, ...(disabledOzel ? { opacity: 0.5, pointerEvents: "none" } : {}) }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Özel Dersler</h3>
          {catalog.ozelDersler.map((p) => (
            <Row
              key={`ozel-${p.id}`}
              label={p.ad}
              price={p.fiyat}
              selected={sel.isOzelDersSelected(p.id)}
              onClick={() => sel.toggleOzelDers(p.id)}
            />
          ))}
        </div>
      )}

      {(included.ekHizmetler.length > 0 || included.denemeler.length > 0 || included.yayinlar.length > 0) && (
        <div style={{ ...cardStyle, border: "1px solid #a7f3d0", background: "#ecfdf5" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15, color: "#065f46" }}>Pakete Dahil (Ücretsiz)</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[...included.ekHizmetler, ...included.denemeler, ...included.yayinlar].map((item) => (
              <span key={item.id} style={{ fontSize: 12, padding: "4px 10px", background: "#d1fae5", borderRadius: 16 }}>
                {item.ad}
              </span>
            ))}
          </div>
        </div>
      )}

      {catalog.ekHizmetler.length > 0 ? (
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Ek Hizmetler (Kütüphane, Koçluk)</h3>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>
            Grup/premium seçiliyken pakete dahil olanlar ücretsizdir. Paketi kaldırırsanız aynı hizmetleri ücretli seçebilirsiniz.
          </p>
          {catalog.ekHizmetler.map((h) => (
            <Row
              key={`ek-${h.id}`}
              label={h.ad}
              sub={h.hizmet_turu}
              price={h.fiyat}
              selected={sel.isEkHizmetSelected(h.id)}
              dahil={sel.isEkHizmetDahil(h.id)}
              onClick={() => sel.toggleEkHizmet(h.id)}
            />
          ))}
        </div>
      ) : (
        <div style={{ ...cardStyle, background: "#f9fafb" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Ek Hizmetler (Kütüphane, Koçluk)</h3>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
            Bu şube ve eğitim yılı için tanımlı ek hizmet bulunamadı. Eğitim Paketleri modülünden ekleyin veya grup/premium paket seçerek dahil hizmetleri görün.
          </p>
        </div>
      )}

      {catalog.denemeler.length > 0 ? (
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Deneme Paketleri (max 1)</h3>
          {catalog.denemeler.map((d) => (
            <Row
              key={`dn-${d.id}`}
              label={d.ad}
              price={d.fiyat}
              selected={sel.isDenemeSelected(d.id)}
              dahil={sel.isDenemeDahil(d.id)}
              onClick={() => sel.toggleDeneme(d.id)}
            />
          ))}
        </div>
      ) : (
        <div style={{ ...cardStyle, background: "#f9fafb" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Deneme Paketleri</h3>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Tanımlı deneme paketi bulunamadı.</p>
        </div>
      )}

      {catalog.yayinPaketleri.length > 0 ? (
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Yayın Paketleri</h3>
          {catalog.yayinPaketleri.map((y) => (
            <Row
              key={`yp-${y.id}`}
              label={y.ad}
              price={y.fiyat}
              selected={sel.isYayinSelected(y.id)}
              dahil={sel.isYayinDahil(y.id)}
              onClick={() => sel.toggleYayin(y.id)}
            />
          ))}
        </div>
      ) : (
        <div style={{ ...cardStyle, background: "#f9fafb" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Yayın Paketleri</h3>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Tanımlı yayın paketi bulunamadı.</p>
        </div>
      )}

      {catalogAdd && (
        <div style={{ ...cardStyle, border: "1px dashed #0262a7" }}>
          <button
            type="button"
            onClick={() => {
              catalogAdd.onTogglePaketEkle();
              if (!catalogAdd.showPaketEkle && !catalogAdd.tumPaketler) {
                catalogAdd.onLoadTumPaketler();
              }
            }}
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "none",
              borderRadius: 8,
              background: "#eff6ff",
              color: "#0262a7",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {catalogAdd.showPaketEkle ? "▲ Katalog panelini kapat" : "+ Yeni Paket veya Hizmet Ekle (Katalog)"}
          </button>

          {catalogAdd.showPaketEkle && (
            <div style={{ marginTop: 16 }}>
              {catalogAdd.tumPaketlerLoading && (
                <p style={{ color: "#6b7280", fontSize: 14 }}>Katalog yükleniyor...</p>
              )}
              {catalogAdd.tumPaketler?.filtreUyari && (
                <p style={{ fontSize: 13, color: "#b45309", background: "#fffbeb", padding: 10, borderRadius: 8 }}>
                  {catalogAdd.tumPaketler.filtreUyari}
                </p>
              )}
              {catalogAdd.tumPaketler && !catalogAdd.tumPaketlerLoading && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {catalogAdd.tumPaketler.grupDersleri.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>👥 Grup Dersleri</h4>
                      {catalogAdd.tumPaketler.grupDersleri.map((p) => (
                        <CatalogAddRow
                          key={`cg-${p.id}`}
                          label={p.ad}
                          price={p.kdv_dahil_fiyat ?? p.fiyat}
                          mevcut={catalogAdd.isPaketMevcut("grup_dersi", p.id)}
                          disabled={hasPremiumSelected}
                          onAdd={() => catalogAdd.onAddPaket(p, "grup_dersi")}
                        />
                      ))}
                    </div>
                  )}
                  {catalogAdd.tumPaketler.premiumPaketler.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>💎 Premium Paketler</h4>
                      {catalogAdd.tumPaketler.premiumPaketler.map((p) => (
                        <CatalogAddRow
                          key={`cp-${p.id}`}
                          label={p.ad}
                          price={p.kdv_dahil_fiyat ?? p.fiyat}
                          mevcut={catalogAdd.isPaketMevcut("premium", p.id)}
                          disabled={hasGrupSelected}
                          onAdd={() => catalogAdd.onAddPaket(p, "premium")}
                        />
                      ))}
                    </div>
                  )}
                  {catalogAdd.tumPaketler.ozelDersler.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>🎓 Özel Dersler</h4>
                      {catalogAdd.tumPaketler.ozelDersler.map((p) => (
                        <CatalogAddRow
                          key={`co-${p.id}`}
                          label={p.ad}
                          price={p.kdv_dahil_fiyat ?? p.fiyat}
                          mevcut={catalogAdd.isPaketMevcut("ozel_ders", p.id)}
                          disabled={hasPremiumSelected}
                          onAdd={() => catalogAdd.onAddPaket(p, "ozel_ders")}
                        />
                      ))}
                    </div>
                  )}
                  {catalogAdd.tumPaketler.denemeler.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>📝 Deneme Paketleri</h4>
                      {catalogAdd.tumPaketler.denemeler.map((p) => (
                        <CatalogAddRow
                          key={`cd-${p.id}`}
                          label={p.ad}
                          price={p.kdv_dahil_fiyat ?? p.fiyat}
                          mevcut={catalogAdd.isPaketMevcut("deneme", p.id) || sel.isDenemeDahil(p.id)}
                          onAdd={() => catalogAdd.onAddPaket(p, "deneme")}
                        />
                      ))}
                    </div>
                  )}
                  {catalogAdd.tumPaketler.yayinPaketleri.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>📚 Yayın Paketleri</h4>
                      {catalogAdd.tumPaketler.yayinPaketleri.map((p) => (
                        <CatalogAddRow
                          key={`cy-${p.id}`}
                          label={p.ad}
                          price={p.kdv_dahil_fiyat ?? p.fiyat}
                          mevcut={catalogAdd.isPaketMevcut("yayin", p.id) || sel.isYayinDahil(p.id)}
                          onAdd={() => catalogAdd.onAddPaket(p, "yayin")}
                        />
                      ))}
                    </div>
                  )}
                  {catalogAdd.tumPaketler.ekHizmetler.filter((h) => h.hizmet_turu !== "deneme").length > 0 && (
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>🧩 Ek Hizmetler</h4>
                      {catalogAdd.tumPaketler.ekHizmetler
                        .filter((h) => h.hizmet_turu !== "deneme")
                        .map((h) => (
                          <CatalogAddRow
                            key={`ce-${h.id}`}
                            label={h.ad}
                            sub={h.hizmet_turu_display || h.hizmet_turu}
                            price={h.kdv_dahil_fiyat ?? h.fiyat}
                            mevcut={catalogAdd.isEkMevcut(h.id) || sel.isEkHizmetDahil(h.id)}
                            onAdd={() => catalogAdd.onAddEkHizmet(h)}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
