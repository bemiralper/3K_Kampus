"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { useContractPackageSelection } from "../hooks/useContractPackageSelection";

type Sel = ReturnType<typeof useContractPackageSelection>;

const trLower = (s: string) => s.toLocaleLowerCase("tr");

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
        gap: 10,
        padding: "12px 14px",
        border: dahil ? "1.5px solid #a7f3d0" : selected ? "1.5px solid #2563eb" : "1px solid #e5e7eb",
        borderRadius: 10,
        cursor: disabled || dahil ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        background: dahil ? "#ecfdf5" : selected ? "#eff6ff" : "#fff",
        boxShadow: selected && !dahil ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
        transition: "border-color .12s, box-shadow .12s, background .12s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            flexShrink: 0,
            borderRadius: 6,
            border: selected && !dahil ? "none" : "1.5px solid #cbd5e1",
            background: selected && !dahil ? "#2563eb" : dahil ? "#059669" : "#fff",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {(selected && !dahil) || dahil ? "✓" : ""}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: selected ? 600 : 500, color: "#1e293b" }}>{label}</div>
          {sub && <div style={{ fontSize: 12, color: "#6b7280" }}>{sub}</div>}
        </div>
      </div>
      {dahil ? (
        <span style={{ color: "#059669", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>Ücretsiz</span>
      ) : price != null ? (
        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{formatCurrency(price)}</span>
      ) : null}
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);
}

const KALEM_TURU_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  grup_dersi: { label: "Grup Dersi", icon: "👥", color: "#1d4ed8", bg: "#eff6ff" },
  premium: { label: "Premium", icon: "💎", color: "#7c3aed", bg: "#f5f3ff" },
  ozel_ders: { label: "Özel Ders", icon: "🎓", color: "#c2410c", bg: "#fff7ed" },
  deneme: { label: "Deneme", icon: "📝", color: "#0f766e", bg: "#f0fdfa" },
  yayin: { label: "Yayın", icon: "📚", color: "#a16207", bg: "#fefce8" },
  ek_hizmet: { label: "Ek Hizmet", icon: "🧩", color: "#4b5563", bg: "#f9fafb" },
};

function kalemMeta(item: { kalem_turu: string; paket_turu?: string }) {
  const key = item.kalem_turu === "ek_hizmet" ? "ek_hizmet" : (item.paket_turu || "");
  return KALEM_TURU_META[key] || { label: "Kalem", icon: "📦", color: "#4b5563", bg: "#f9fafb" };
}

/** Seçili bir kalemi tek tıkla kaldır (özet çipindeki × butonu). */
function removeBillable(sel: Sel, b: { kalem_turu: string; paket_turu?: string; kalem_id: number }) {
  if (b.kalem_turu === "ek_hizmet") {
    sel.toggleEkHizmet(b.kalem_id);
    return;
  }
  switch (b.paket_turu) {
    case "grup_dersi":
      sel.toggleGrup(b.kalem_id);
      break;
    case "premium":
      sel.togglePremium(b.kalem_id);
      break;
    case "ozel_ders":
      sel.toggleOzelDers(b.kalem_id);
      break;
    case "deneme":
      sel.toggleDeneme(b.kalem_id);
      break;
    case "yayin":
      sel.toggleYayin(b.kalem_id);
      break;
  }
}

/** Modern seçili kalem özeti — düzenleme/oluşturmada ne seçili olduğunu net gösterir. */
function SelectedSummary({ sel }: { sel: Sel }) {
  const billable = sel.billableItems;
  const includedItems = [
    ...sel.included.ekHizmetler,
    ...sel.included.denemeler,
    ...sel.included.yayinlar,
  ];
  const total = billable.reduce((s, b) => s + (b.fiyat || 0), 0);

  return (
    <div
      style={{
        border: "1px solid #dbeafe",
        borderRadius: 14,
        padding: 18,
        background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
          Seçili Kalemler {billable.length > 0 && (
            <span style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>({billable.length})</span>
          )}
        </h3>
        {total > 0 && (
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
            Liste: {formatCurrency(total)}
          </span>
        )}
      </div>

      {billable.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
          Henüz kalem seçilmedi. Aşağıdaki listelerden paket/ders seçin.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {billable.map((b) => {
            const meta = kalemMeta(b);
            return (
              <div
                key={b.key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 6px 6px 12px",
                  borderRadius: 10,
                  background: "#fff",
                  border: `1px solid ${meta.color}22`,
                  boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: meta.color,
                    background: meta.bg,
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  {meta.icon} {meta.label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{b.kalem_adi}</span>
                {b.fiyat != null && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{formatCurrency(b.fiyat)}</span>
                )}
                <button
                  type="button"
                  title="Kaldır"
                  aria-label={`${b.kalem_adi} kaldır`}
                  onClick={() => removeBillable(sel, b)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: "none",
                    background: "#fee2e2",
                    color: "#b91c1c",
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {includedItems.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #cbd5e1" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#059669", marginRight: 8 }}>Pakete dahil (ücretsiz):</span>
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, verticalAlign: "middle" }}>
            {includedItems.map((item) => (
              <span
                key={`inc-${item.id}`}
                style={{ fontSize: 12, padding: "3px 10px", background: "#d1fae5", color: "#065f46", borderRadius: 14 }}
              >
                {item.ad}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
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

type SectionItem = { id: number; ad: string; fiyat?: number; sub?: string };

type SectionDef = {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: SectionItem[];
  disabled?: boolean;
  isSelected: (id: number) => boolean;
  isDahil?: (id: number) => boolean;
  onToggle: (id: number) => void;
  emptyText?: string;
};

const rowGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: 8,
};

function CollapsibleSection({
  title,
  icon,
  color,
  itemCount,
  selectedCount,
  open,
  disabled,
  onToggle,
  children,
}: {
  title: string;
  icon: string;
  color: string;
  itemCount: number;
  selectedCount: number;
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden", ...(disabled ? { opacity: 0.5 } : {}) }}>
      <button
        type="button"
        onClick={disabled ? undefined : onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "13px 16px",
          border: "none",
          background: open ? "#f8fafc" : "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 17 }}>{icon}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{title}</span>
          {selectedCount > 0 && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
                background: color,
                padding: "1px 9px",
                borderRadius: 999,
              }}
            >
              {selectedCount} seçili
            </span>
          )}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{itemCount}</span>
          <span
            aria-hidden
            style={{
              display: "inline-block",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform .15s",
              color: "#64748b",
              fontSize: 14,
            }}
          >
            ▶
          </span>
        </span>
      </button>
      {open && (
        <div style={{ padding: "4px 16px 16px", pointerEvents: disabled ? "none" : "auto" }}>{children}</div>
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
  const { catalog, hasGrupSelected, hasPremiumSelected } = sel;
  const disabledPremium = hasGrupSelected;
  const disabledGrup = hasPremiumSelected;
  const disabledOzel = hasPremiumSelected;

  const [query, setQuery] = useState("");
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  const q = trLower(query.trim());
  const nameMatches = (name: string) => !q || trLower(name).includes(q);

  const sections: SectionDef[] = useMemo(
    () => [
      {
        id: "grup",
        title: "Grup Dersleri",
        icon: "👥",
        color: "#2563eb",
        items: catalog.grupDersleri.map((p) => ({ id: p.id, ad: p.ad, fiyat: p.fiyat })),
        disabled: disabledGrup,
        isSelected: (id) => sel.isParentSelected("grup_dersi", id),
        onToggle: (id) => sel.toggleGrup(id),
      },
      {
        id: "premium",
        title: "Premium Paketler",
        icon: "💎",
        color: "#7c3aed",
        items: catalog.premiumPaketler.map((p) => ({ id: p.id, ad: p.ad, fiyat: p.fiyat })),
        disabled: disabledPremium,
        isSelected: (id) => sel.isParentSelected("premium", id),
        onToggle: (id) => sel.togglePremium(id),
      },
      {
        id: "ozel",
        title: "Özel Dersler",
        icon: "🎓",
        color: "#c2410c",
        items: catalog.ozelDersler.map((p) => ({ id: p.id, ad: p.ad, fiyat: p.fiyat })),
        disabled: disabledOzel,
        isSelected: (id) => sel.isOzelDersSelected(id),
        onToggle: (id) => sel.toggleOzelDers(id),
      },
      {
        id: "ek",
        title: "Ek Hizmetler (Kütüphane, Koçluk)",
        icon: "🧩",
        color: "#059669",
        items: catalog.ekHizmetler.map((h) => ({ id: h.id, ad: h.ad, fiyat: h.fiyat, sub: h.hizmet_turu })),
        isSelected: (id) => sel.isEkHizmetSelected(id),
        isDahil: (id) => sel.isEkHizmetDahil(id),
        onToggle: (id) => sel.toggleEkHizmet(id),
        emptyText:
          "Bu şube ve eğitim yılı için tanımlı ek hizmet yok. Grup/premium paket seçerek dahil hizmetleri görebilirsiniz.",
      },
      {
        id: "deneme",
        title: "Deneme Paketleri (en fazla 1)",
        icon: "📝",
        color: "#0f766e",
        items: catalog.denemeler.map((d) => ({ id: d.id, ad: d.ad, fiyat: d.fiyat })),
        isSelected: (id) => sel.isDenemeSelected(id),
        isDahil: (id) => sel.isDenemeDahil(id),
        onToggle: (id) => sel.toggleDeneme(id),
        emptyText: "Tanımlı deneme paketi bulunamadı.",
      },
      {
        id: "yayin",
        title: "Yayın Paketleri",
        icon: "📚",
        color: "#a16207",
        items: catalog.yayinPaketleri.map((y) => ({ id: y.id, ad: y.ad, fiyat: y.fiyat })),
        isSelected: (id) => sel.isYayinSelected(id),
        isDahil: (id) => sel.isYayinDahil(id),
        onToggle: (id) => sel.toggleYayin(id),
        emptyText: "Tanımlı yayın paketi bulunamadı.",
      },
    ],
    [catalog, disabledGrup, disabledPremium, disabledOzel, sel],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SelectedSummary sel={sel} />

      <div style={{ position: "relative" }}>
        <span
          aria-hidden
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 15 }}
        >
          🔎
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Paket veya ders ara..."
          style={{
            width: "100%",
            padding: "11px 14px 11px 38px",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            fontSize: 14,
            background: "#fff",
            boxSizing: "border-box",
          }}
        />
      </div>

      {sections.map((s) => {
        const total = s.items.length;
        if (total === 0) {
          if (!s.emptyText || q) return null;
          return (
            <div key={s.id} style={{ ...cardStyle, background: "#f9fafb" }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>
                {s.icon} {s.title}
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>{s.emptyText}</p>
            </div>
          );
        }
        const filtered = s.items.filter((i) => nameMatches(i.ad));
        if (q && filtered.length === 0) return null;
        const selectedCount = s.items.reduce((n, i) => n + (s.isSelected(i.id) ? 1 : 0), 0);
        const open = q ? true : openState[s.id] ?? (selectedCount > 0 || total <= 6);
        return (
          <CollapsibleSection
            key={s.id}
            title={s.title}
            icon={s.icon}
            color={s.color}
            itemCount={total}
            selectedCount={selectedCount}
            open={open}
            disabled={s.disabled}
            onToggle={() => setOpenState((prev) => ({ ...prev, [s.id]: !open }))}
          >
            <div style={rowGridStyle}>
              {filtered.map((i) => (
                <Row
                  key={`${s.id}-${i.id}`}
                  label={i.ad}
                  sub={i.sub}
                  price={i.fiyat}
                  selected={s.isSelected(i.id)}
                  dahil={s.isDahil?.(i.id)}
                  onClick={() => s.onToggle(i.id)}
                />
              ))}
            </div>
          </CollapsibleSection>
        );
      })}

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
