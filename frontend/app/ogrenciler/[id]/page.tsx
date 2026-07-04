"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useOgrenciPath } from "@/components/ogrenci/OgrenciPathProvider";
import { OgrenciDetayClient } from "./components";
import { OgrenciDetay } from "./types";

export default function OgrenciDetayPage() {
  const { listHref } = useOgrenciPath();
  const params = useParams();
  const [data, setData] = useState<OgrenciDetay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchOgrenci() {
      try {
        // Proxy üzerinden veri çek (cookie'ler için gerekli)
        const response = await fetch(`/api/ogrenciler/api/${params.id}/`, {
          credentials: "include",
        });
        
        if (response.ok) {
          const result = await response.json();
          // Backend direkt data dönebilir veya { success, data } formatında
          const ogrenciData = result.data || result;
          setData(ogrenciData);
        } else {
          console.error("API error:", response.status, response.statusText);
          setError(true);
        }
      } catch (err) {
        console.error("Öğrenci verisi alınamadı:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    if (params.id) {
      fetchOgrenci();
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="section">
        <div className="card-modern">
          <div className="card-modern-body" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div className="loading-spinner" style={{ 
              width: '40px', 
              height: '40px', 
              border: '4px solid #e2e8f0',
              borderTopColor: '#2d5a87',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }}></div>
            <p style={{ color: '#64748b' }}>Yükleniyor...</p>
            <style jsx>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="section">
        <div className="card-modern">
          <div className="card-modern-body" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" style={{ marginBottom: '16px' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h3 style={{ color: '#64748b', marginBottom: '8px' }}>Öğrenci Bulunamadı</h3>
            <p style={{ color: '#94a3b8', marginBottom: '24px' }}>İstediğiniz öğrenci kaydına ulaşılamadı.</p>
            <Link href={listHref} className="btn-modern btn-secondary">
              Öğrenci Listesine Dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <OgrenciDetayClient data={data} />;
}
