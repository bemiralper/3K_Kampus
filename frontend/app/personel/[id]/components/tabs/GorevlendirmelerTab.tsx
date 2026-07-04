"use client";

import { useRouter } from "next/navigation";
import { usePersonelPath } from "@/components/personel/PersonelPathProvider";
import { PersonelGorevlendirme } from "../../types";
import { formatDate } from "../../utils";

interface GorevlendirmelerTabProps {
  gorevlendirmeler: PersonelGorevlendirme[];
  personelId: number;
  onRefresh: () => void;
}

export default function GorevlendirmelerTab({ gorevlendirmeler, personelId, onRefresh }: GorevlendirmelerTabProps) {
  const router = useRouter();
  const { href } = usePersonelPath();

  const handleYeniGorevlendirme = () => {
    router.push(`${href("gorevlendirmeler")}?personel_id=${personelId}`);
  };
  
  if (gorevlendirmeler.length === 0) {
    return (
      <div className="tab-empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <h3>Görevlendirme Bulunamadı</h3>
        <p>Bu personele henüz bir görevlendirme yapılmamış.</p>
        <button onClick={handleYeniGorevlendirme} className="btn-modern btn-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Görevlendirme Ekle
        </button>
      </div>
    );
  }

  // Yıla göre grupla
  const grupluGorevlendirmeler = gorevlendirmeler.reduce((acc, g) => {
    const yil = g.egitim_yili_ad;
    if (!acc[yil]) {
      acc[yil] = [];
    }
    acc[yil].push(g);
    return acc;
  }, {} as Record<string, PersonelGorevlendirme[]>);

  return (
    <div className="gorevlendirmeler-tab">
      <div className="gorevlendirme-tab-header">
        <h3>Görevlendirme Geçmişi</h3>
        <button onClick={handleYeniGorevlendirme} className="btn-modern btn-sm btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Yeni Görevlendirme
        </button>
      </div>

      <div className="gorevlendirme-timeline">
        {Object.entries(grupluGorevlendirmeler).map(([yil, items]) => (
          <div key={yil} className="timeline-year-group">
            <div className={`timeline-year-header ${items[0]?.egitim_yili_aktif ? 'aktif' : ''}`}>
              <span className="year-badge">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {yil}
              </span>
              {items[0]?.egitim_yili_aktif && (
                <span className="aktif-badge">Aktif Yıl</span>
              )}
            </div>

            <div className="timeline-items">
              {items.map((g) => (
                <div key={g.id} className={`timeline-item ${!g.aktif_mi ? 'pasif' : ''}`}>
                  <div className="timeline-dot"></div>
                  <div className="timeline-content">
                    <div className="timeline-card">
                      <div className="timeline-card-header">
                        <span className={`rol-badge ${g.rol_kod?.toLowerCase() || 'default'}`}>
                          {g.rol_ad || 'Rol Belirtilmemiş'}
                        </span>
                        <span className={`status-badge ${g.aktif_mi ? 'aktif' : 'pasif'}`}>
                          {g.aktif_mi ? 'Aktif' : 'Pasif'}
                        </span>
                      </div>
                      
                      <div className="timeline-card-body">
                        <div className="info-row">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                          </svg>
                          <span>Şube: <strong>{g.gorev_sube_ad || '-'}</strong></span>
                        </div>
                        
                        {g.brans_ad && (
                          <div className="info-row">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                            </svg>
                            <span>Branş: <strong>{g.brans_ad}</strong></span>
                          </div>
                        )}
                        
                        <div className="info-row">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                          </svg>
                          <span>
                            {g.gorev_baslangic || 'Başlangıç yok'} 
                            {g.gorev_bitis && ` - ${g.gorev_bitis}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
