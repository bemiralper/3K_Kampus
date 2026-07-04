"use client";

// İleride rehberlik verileri geldiğinde OgrenciDetay tipini import edebilirsiniz
// import { OgrenciDetay } from "../../types";

export default function RehberlikTab() {
  // İleride rehberlik verileri eklenecek
  const hasData = false;

  if (!hasData) {
    return (
      <div className="tab-panel">
        <div className="empty-tab-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <h4>Rehberlik Notları</h4>
          <p>Bu öğrenciye ait rehberlik kaydı bulunmamaktadır.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-panel">
      <div className="card-modern">
        <div className="card-modern-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Rehberlik Notları
          </h3>
        </div>
        <div className="card-modern-body">
          {/* Rehberlik içeriği buraya gelecek */}
        </div>
      </div>
    </div>
  );
}
