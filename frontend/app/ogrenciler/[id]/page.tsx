"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useOgrenciPath } from "@/components/ogrenci/OgrenciPathProvider";
import { useKurum } from "@/lib/contexts/KurumContext";
import { apiGet } from "@/lib/api";
import { OgrenciDetayClient } from "./components";
import { OgrenciDetay } from "./types";

export default function OgrenciDetayPage() {
  const { listHref } = useOgrenciPath();
  const params = useParams();
  const { initialized, loading: contextLoading, activeSube } = useKurum();
  const [data, setData] = useState<OgrenciDetay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id || !initialized || contextLoading) return;

    let cancelled = false;

    async function fetchOgrenci() {
      setLoading(true);
      setError(null);
      try {
        if (!activeSube?.id) {
          if (!cancelled) {
            setError("Öğrenci detayını görmek için şube seçmeniz gerekiyor.");
            setData(null);
          }
          return;
        }

        const response = await apiGet<OgrenciDetay>(`/ogrenciler/api/${params.id}/`);

        if (cancelled) return;

        if (response.success && response.data) {
          const ogrenciData = response.data;
          setData(ogrenciData);
          setError(null);
        } else {
          const msg = response.error || "Öğrenci kaydına ulaşılamadı.";
          // 403 / şube uyumsuzluğu için daha net mesaj
          if (typeof msg === "string" && (msg.includes("şube") || msg.includes("Sube") || msg.includes("403"))) {
            setError(msg);
          } else if (typeof msg === "string" && (msg.includes("400") || msg.toLowerCase().includes("zorunlu"))) {
            setError("Şube bağlamı eksik. Üst menüden şube seçip tekrar deneyin.");
          } else {
            setError(msg);
          }
          setData(null);
        }
      } catch (err) {
        console.error("Öğrenci verisi alınamadı:", err);
        if (!cancelled) {
          setError("Bağlantı hatası. Lütfen tekrar deneyin.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOgrenci();
    return () => {
      cancelled = true;
    };
  }, [params.id, initialized, contextLoading, activeSube?.id]);

  if (!initialized || contextLoading || loading) {
    return (
      <div className="section">
        <div className="card-modern">
          <div className="card-modern-body" style={{ textAlign: "center", padding: "60px 20px" }}>
            <div
              className="loading-spinner"
              style={{
                width: "40px",
                height: "40px",
                border: "4px solid #e2e8f0",
                borderTopColor: "#2d5a87",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <p style={{ color: "#64748b" }}>Yükleniyor...</p>
            <style jsx>{`
              @keyframes spin {
                to {
                  transform: rotate(360deg);
                }
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
          <div className="card-modern-body" style={{ textAlign: "center", padding: "60px 20px" }}>
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.5"
              style={{ marginBottom: "16px" }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h3 style={{ color: "#64748b", marginBottom: "8px" }}>Öğrenci yüklenemedi</h3>
            <p style={{ color: "#94a3b8", marginBottom: "24px" }}>
              {error || "İstediğiniz öğrenci kaydına ulaşılamadı."}
            </p>
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
