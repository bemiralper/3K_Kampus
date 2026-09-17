"use client";

import { useState, useMemo, useEffect } from "react";
import { TahsilatItem, TahsilatFiltre } from "../types";
import {
  formatCurrency, formatDate, tahsilatTuruLabel, tahsilatDurumLabel,
  DurumBadge,
} from "../helpers";
import Pagination, { paginateList } from "../components/Pagination";
import TahsilatExportModal from "../components/TahsilatExportModal";
import {
  applyTahsilatFilters,
  tahsilatFilterActive,
  tahsilatYontemOptions,
} from "../lib/filterTahsilatlar";

const KURUM_COLOR = "#0262a7";

const cellStyle: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontSize: 13, borderBottom: "1px solid #f3f4f6",
};
const thStyle: React.CSSProperties = {
  ...cellStyle, fontWeight: 600, color: "#6b7280", background: "#f9fafb", borderBottom: "2px solid #e5e7eb",
  position: "sticky" as const, top: 0, zIndex: 1,
};

interface Props {
  tahsilatlar: TahsilatItem[];
  onTahsilatCancel: (tahsilatId: number) => void;
  onMakbuz: (tahsilatId: number) => void;
  onSelectSozlesme?: (sozlesmeId: number) => void;
}

export default function TahsilatlarTab({
  tahsilatlar: initialTahsilatlar,
  onTahsilatCancel,
  onMakbuz,
  onSelectSozlesme,
}: Props) {
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [filters, setFilters] = useState<TahsilatFiltre>({});
  const yontemOptions = useMemo(
    () => tahsilatYontemOptions(initialTahsilatlar),
    [initialTahsilatlar],
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const selectedYontem = useMemo(
    () => yontemOptions.find((o) => o.key === filters.odeme_yontemi_id) || null,
    [filters.odeme_yontemi_id, yontemOptions],
  );
  const tahsilatlar = useMemo(
    () => applyTahsilatFilters(initialTahsilatlar, filters, selectedYontem
      ? { tip: selectedYontem.key, ad: selectedYontem.label }
      : null),
    [initialTahsilatlar, filters, selectedYontem],
  );
  const hasActiveFilters = tahsilatFilterActive(filters);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, initialTahsilatlar]);

  const handleClearFilters = () => {
    setFilters({});
    setCurrentPage(1);
  };

  // Toplam hesapla
  const aktifTahsilatlar = tahsilatlar.filter(t => t.durum === "aktif");
  const toplamTutar = aktifTahsilatlar.reduce((t, th) => t + th.tutar, 0);

  return (
    <div>
      {/* Üst bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>
            Aktif Toplam: {formatCurrency(toplamTutar)}
          </span>
          {hasActiveFilters && (
            <span style={{ marginLeft: 12, fontSize: 12, color: "#6b7280" }}>
              {tahsilatlar.length} kayıt (filtrelenmiş)
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowExport(true)}
            disabled={tahsilatlar.length === 0}
            style={{
              padding: "8px 16px", borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontSize: 13, cursor: tahsilatlar.length === 0 ? "not-allowed" : "pointer",
              color: "#374151",
              display: "flex", alignItems: "center", gap: 6,
              opacity: tahsilatlar.length === 0 ? 0.55 : 1,
            }}
          >
            ⬇ Dışa Aktar
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: "8px 16px", borderRadius: 8,
              border: hasActiveFilters ? `2px solid ${KURUM_COLOR}` : "1px solid #d1d5db",
              background: hasActiveFilters ? "#f0f7ff" : "#fff",
              fontSize: 13, cursor: "pointer", color: "#374151",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            🔍 Filtreler {hasActiveFilters && "●"}
          </button>
        </div>
      </div>

      {/* Filtre Paneli */}
      {showFilters && (
        <div style={{
          padding: 20, borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb",
          marginBottom: 16, animation: "fadeIn .2s",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {/* Öğrenci Adı */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Öğrenci Adı</label>
              <input
                type="text"
                placeholder="Ara..."
                value={filters.ogrenci_adi || ""}
                onChange={(e) => setFilters({ ...filters, ogrenci_adi: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") setCurrentPage(1); }}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
              />
            </div>

            {/* Sözleşme No */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Sözleşme No</label>
              <input
                type="text"
                placeholder="Ara..."
                value={filters.sozlesme_no || ""}
                onChange={(e) => setFilters({ ...filters, sozlesme_no: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") setCurrentPage(1); }}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
              />
            </div>

            {/* Tarih Başlangıç */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Tarih Başlangıç</label>
              <input
                type="date"
                value={filters.tarih_baslangic || ""}
                onChange={(e) => setFilters({ ...filters, tarih_baslangic: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
              />
            </div>

            {/* Tarih Bitiş */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Tarih Bitiş</label>
              <input
                type="date"
                value={filters.tarih_bitis || ""}
                onChange={(e) => setFilters({ ...filters, tarih_bitis: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
              />
            </div>

            {/* Durum */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Durum</label>
              <select
                value={filters.durum || ""}
                onChange={(e) => setFilters({ ...filters, durum: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
              >
                <option value="">Tümü</option>
                <option value="aktif">Aktif</option>
                <option value="iptal_edildi">İptal Edildi</option>
              </select>
            </div>

            {/* Tahsilat Türü */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Tahsilat Türü</label>
              <select
                value={filters.tahsilat_turu || ""}
                onChange={(e) => setFilters({ ...filters, tahsilat_turu: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
              >
                <option value="">Tümü</option>
                {Object.entries(tahsilatTuruLabel).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Ödeme Yöntemi */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Ödeme Yöntemi</label>
              <select
                value={filters.odeme_yontemi_id || ""}
                onChange={(e) => setFilters({ ...filters, odeme_yontemi_id: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
              >
                <option value="">Tümü</option>
                {yontemOptions.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button
              type="button"
              onClick={handleClearFilters}
              style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, cursor: "pointer" }}
            >
              Temizle
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              style={{
                padding: "8px 20px", borderRadius: 6, border: "none",
                background: KURUM_COLOR, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Filtrele
            </button>
          </div>
        </div>
      )}

      {/* Tablo */}
      {tahsilatlar.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9ca3af", background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
          <p style={{ fontSize: 14 }}>
            {hasActiveFilters ? "Filtrelere uygun tahsilat bulunamadı" : "Henüz tahsilat kaydı bulunmuyor"}
          </p>
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden", background: "#fff" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Tarih</th>
                  <th style={thStyle}>Sözleşme</th>
                  <th style={thStyle}>Öğrenci</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Taksit</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Tutar</th>
                  <th style={thStyle}>Ödeme Yöntemi</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Tür</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Durum</th>
                  <th style={thStyle}>Referans</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {paginateList(tahsilatlar, currentPage, pageSize).map((th) => (
                  <tr key={th.id} style={{ opacity: th.durum === "iptal_edildi" ? 0.5 : 1 }}>
                    <td style={cellStyle}>{formatDate(th.tahsilat_tarihi)}</td>
                    <td style={{ ...cellStyle, fontWeight: 700, color: KURUM_COLOR }}>
                      {onSelectSozlesme && th.sozlesme_id ? (
                        <button
                          type="button"
                          onClick={() => onSelectSozlesme(th.sozlesme_id)}
                          style={{
                            border: "none",
                            background: "none",
                            padding: 0,
                            color: KURUM_COLOR,
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: "pointer",
                            textDecoration: "underline",
                            textUnderlineOffset: 2,
                          }}
                        >
                          {th.sozlesme_no}
                        </button>
                      ) : (
                        th.sozlesme_no
                      )}
                    </td>
                    <td style={cellStyle}>
                      {onSelectSozlesme && th.sozlesme_id ? (
                        <button
                          type="button"
                          onClick={() => onSelectSozlesme(th.sozlesme_id)}
                          style={{
                            border: "none",
                            background: "none",
                            padding: 0,
                            color: KURUM_COLOR,
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: "pointer",
                            textDecoration: "underline",
                            textUnderlineOffset: 2,
                          }}
                        >
                          {th.ogrenci_adi}
                        </button>
                      ) : (
                        th.ogrenci_adi
                      )}
                    </td>
                    <td style={{ ...cellStyle, textAlign: "center", fontWeight: 600 }}>
                      {th.dagitim && th.dagitim.length > 1
                        ? th.dagitim.map(d => `#${d.taksit_no}`).join(", ")
                        : th.dagitim && th.dagitim.length === 1
                          ? `#${th.dagitim[0].taksit_no}`
                          : th.taksit_no ? `#${th.taksit_no}` : "-"
                      }
                    </td>
                    <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700 }}>{formatCurrency(th.tutar)}</td>
                    <td style={cellStyle}>{th.odeme_yontemi?.ad || "-"}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "#f3f4f6", fontWeight: 600 }}>
                        {tahsilatTuruLabel[th.tahsilat_turu] || th.tahsilat_turu}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      <DurumBadge durum={th.durum} map={tahsilatDurumLabel} />
                    </td>
                    <td style={{ ...cellStyle, fontSize: 12, color: "#6b7280" }}>{th.referans_no || "-"}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button
                          onClick={() => onMakbuz(th.id)}
                          title="Makbuz"
                          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14 }}
                        >🧾</button>
                        {th.durum === "aktif" && (
                          <button
                            onClick={() => onTahsilatCancel(th.id)}
                            title="İptal Et"
                            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#dc2626" }}
                          >✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Sayfalama */}
          <div style={{ padding: "0 14px", borderTop: "1px solid #f3f4f6" }}>
            <Pagination
              currentPage={currentPage}
              totalItems={tahsilatlar.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </div>
      )}

      <TahsilatExportModal
        open={showExport}
        onClose={() => setShowExport(false)}
        rows={tahsilatlar}
        filterSummary={hasActiveFilters ? `${tahsilatlar.length} kayıt (filtrelenmiş)` : undefined}
      />
    </div>
  );
}
