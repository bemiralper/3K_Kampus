"use client";

import { useState, useRef, useEffect } from "react";
import { useKurum, Kurum, Sube, EgitimYili } from "@/lib/contexts/KurumContext";

type ContextSelectorProps = {
  /** Mobilde tam genişlik özet şerit */
  layout?: "inline" | "mobile-bar";
};

/** Kurum / şube / eğitim yılı seçici — admin, koç ve muhasebe header'larında ortak */
export default function ContextSelector({ layout = "inline" }: ContextSelectorProps) {
  const {
    filteredKurumlar,
    activeKurum,
    activeSube,
    activeEgitimYili,
    setActiveKurum,
    setActiveSube,
    setActiveEgitimYili,
    filteredSubeler,
    filteredEgitimYillari,
    loading,
  } = useKurum();

  const [showPopover, setShowPopover] = useState(false);
  const [activeTab, setActiveTab] = useState<"kurum" | "sube" | "yil">("kurum");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKurumSelect = (kurum: Kurum) => {
    setActiveKurum(kurum);
    setActiveTab("sube");
  };

  const handleSubeSelect = (sube: Sube) => {
    setActiveSube(sube);
    setActiveTab("yil");
  };

  const handleYilSelect = (yil: EgitimYili) => {
    setActiveEgitimYili(yil);
    setShowPopover(false);
  };

  const summaryParts: string[] = [];
  if (activeKurum) summaryParts.push(activeKurum.ad.length > 12 ? activeKurum.ad.substring(0, 12) + "…" : activeKurum.ad);
  if (activeSube) summaryParts.push(activeSube.ad.length > 10 ? activeSube.ad.substring(0, 10) + "…" : activeSube.ad);
  if (activeEgitimYili) summaryParts.push(`${activeEgitimYili.baslangic_yil}-${activeEgitimYili.bitis_yil}`);
  const summaryText = summaryParts.length > 0 ? summaryParts.join(" • ") : "Bağlam Seçin";

  if (loading) {
    return <div className="ctx-compact-loading">Yükleniyor...</div>;
  }

  const tabs = [
    { key: "kurum" as const, label: "Kurum", icon: "🏢" },
    { key: "sube" as const, label: "Şube", icon: "🏠" },
    { key: "yil" as const, label: "Yıl", icon: "📅" },
  ];

  const isMobileBar = layout === "mobile-bar";

  return (
    <div className={`ctx-compact-wrapper${isMobileBar ? " ctx-compact-wrapper--mobile-bar" : ""}`} ref={popoverRef}>
      <button
        className={`ctx-compact-btn${isMobileBar ? " ctx-compact-btn--mobile-bar" : ""}`}
        type="button"
        onClick={() => setShowPopover(!showPopover)}
        title="Kurum / Şube / Eğitim Yılı Seçimi"
        aria-label="Kurum, şube ve eğitim yılı seç"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
        </svg>
        <span className="ctx-compact-text">{summaryText}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {showPopover && (
        <div className="ctx-popover">
          <div className="ctx-popover-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`ctx-tab ${activeTab === tab.key ? "active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.key === "kurum" && activeKurum && <span className="ctx-tab-dot" />}
                {tab.key === "sube" && activeSube && <span className="ctx-tab-dot" />}
                {tab.key === "yil" && activeEgitimYili && <span className="ctx-tab-dot" />}
              </button>
            ))}
          </div>

          <div className="ctx-popover-content">
            {activeTab === "kurum" && (
              <div className="ctx-list">
                {filteredKurumlar.length > 0 ? (
                  filteredKurumlar.map((kurum) => (
                    <button
                      key={kurum.id}
                      type="button"
                      className={`ctx-item ${activeKurum?.id === kurum.id ? "active" : ""}`}
                      onClick={() => handleKurumSelect(kurum)}
                    >
                      <span className="ctx-item-name">{kurum.ad}</span>
                      {kurum.aktif_mi && <span className="ctx-item-badge">Aktif</span>}
                    </button>
                  ))
                ) : (
                  <div className="ctx-empty">Kurum bulunamadı</div>
                )}
              </div>
            )}

            {activeTab === "sube" && (
              <div className="ctx-list">
                {!activeKurum ? (
                  <div className="ctx-empty">Önce kurum seçin</div>
                ) : filteredSubeler.length > 0 ? (
                  filteredSubeler.map((sube) => (
                    <button
                      key={sube.id}
                      type="button"
                      className={`ctx-item ${activeSube?.id === sube.id ? "active" : ""}`}
                      onClick={() => handleSubeSelect(sube)}
                    >
                      <span className="ctx-item-name">{sube.ad}</span>
                      {sube.aktif_mi && <span className="ctx-item-badge">Aktif</span>}
                    </button>
                  ))
                ) : (
                  <div className="ctx-empty">Şube bulunamadı</div>
                )}
              </div>
            )}

            {activeTab === "yil" && (
              <div className="ctx-list">
                {filteredEgitimYillari.length > 0 ? (
                  filteredEgitimYillari.map((yil) => (
                    <button
                      key={yil.id}
                      type="button"
                      className={`ctx-item ${activeEgitimYili?.id === yil.id ? "active" : ""}`}
                      onClick={() => handleYilSelect(yil)}
                    >
                      <span className="ctx-item-name">{yil.baslangic_yil}-{yil.bitis_yil}</span>
                      {yil.aktif_mi && <span className="ctx-item-badge">Aktif</span>}
                    </button>
                  ))
                ) : (
                  <div className="ctx-empty">Eğitim yılı bulunamadı</div>
                )}
              </div>
            )}
          </div>

          <div className="ctx-popover-footer">
            <span className="ctx-footer-label">Aktif:</span>
            <span className="ctx-footer-value">
              {activeKurum?.ad || "—"} / {activeSube?.ad || "—"} / {activeEgitimYili ? `${activeEgitimYili.baslangic_yil}-${activeEgitimYili.bitis_yil}` : "—"}
            </span>
          </div>
        </div>
      )}

      <style jsx>{`
        .ctx-compact-wrapper {
          position: relative;
        }
        .ctx-compact-loading {
          font-size: 12px;
          color: #64748b;
          padding: 6px 12px;
          background: #f1f5f9;
          border-radius: 8px;
        }
        .ctx-compact-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 14px;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 500;
          color: #334155;
          cursor: pointer;
          transition: all 0.2s ease;
          max-width: 320px;
        }
        .ctx-compact-btn:hover {
          border-color: #0262a7;
          background: linear-gradient(135deg, #f0f7ff 0%, #e8f2ff 100%);
        }
        .ctx-compact-btn svg {
          flex-shrink: 0;
          color: #0262a7;
        }
        .ctx-compact-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ctx-compact-wrapper--mobile-bar {
          width: 100%;
        }
        .ctx-compact-btn--mobile-bar {
          width: 100%;
          max-width: none;
          justify-content: flex-start;
          padding: 8px 12px;
          font-size: 12px;
          background: #f0f7ff;
          border-color: #bfdbfe;
        }
        .ctx-compact-btn--mobile-bar .ctx-compact-text {
          display: block;
          flex: 1;
          text-align: left;
        }
        .ctx-compact-wrapper--mobile-bar .ctx-popover {
          left: 0;
          right: 0;
          width: auto;
        }
        .ctx-popover {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          width: 340px;
          max-width: calc(100vw - 24px);
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.14);
          z-index: 1000;
          overflow: hidden;
          animation: ctxFade 0.2s ease;
        }
        @keyframes ctxFade {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ctx-popover-tabs {
          display: flex;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .ctx-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 10px 8px;
          border: none;
          background: none;
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
          cursor: pointer;
          transition: all 0.15s;
          position: relative;
        }
        .ctx-tab:hover {
          color: #0262a7;
          background: #f0f7ff;
        }
        .ctx-tab.active {
          color: #0262a7;
          background: white;
          box-shadow: inset 0 -2px 0 #0262a7;
        }
        .ctx-tab-dot {
          width: 6px;
          height: 6px;
          background: #10b981;
          border-radius: 50%;
        }
        .ctx-popover-content {
          max-height: 220px;
          overflow-y: auto;
        }
        .ctx-list {
          padding: 6px;
        }
        .ctx-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 9px 12px;
          background: none;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          color: #334155;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
        }
        .ctx-item:hover {
          background: #f1f5f9;
        }
        .ctx-item.active {
          background: #eff6ff;
          color: #0262a7;
          font-weight: 500;
        }
        .ctx-item-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ctx-item-badge {
          flex-shrink: 0;
          margin-left: 8px;
          padding: 2px 8px;
          font-size: 10px;
          font-weight: 600;
          color: #059669;
          background: #d1fae5;
          border-radius: 10px;
        }
        .ctx-empty {
          padding: 20px;
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
        }
        .ctx-popover-footer {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          font-size: 11px;
        }
        .ctx-footer-label {
          color: #64748b;
          font-weight: 600;
        }
        .ctx-footer-value {
          color: #334155;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        @media (max-width: 768px) {
          .ctx-compact-btn:not(.ctx-compact-btn--mobile-bar) {
            max-width: 44px;
            padding: 7px 10px;
          }
          .ctx-compact-btn:not(.ctx-compact-btn--mobile-bar) .ctx-compact-text {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
