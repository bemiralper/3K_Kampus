"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { usePersonelPath } from "@/components/personel/PersonelPathProvider";
import { apiGet } from "@/lib/api";
import PersonelDetayClient from "./components/PersonelDetayClient";
import { PersonelDetay, PersonelGorevlendirme, AktiviteLog, PersonelStats } from "./types";
import "./styles/personel-detay.css";

interface PersonelFullData {
  personel: PersonelDetay;
  gorevlendirmeler: PersonelGorevlendirme[];
  aktivite_loglari: AktiviteLog[];
  stats: PersonelStats;
}

export default function PersonelDetayPage() {
  const { basePath } = usePersonelPath();
  const params = useParams();
  const [data, setData] = useState<PersonelFullData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchPersonel = async () => {
    try {
      const result = await apiGet<{
        personel?: PersonelDetay;
        gorevlendirmeler?: PersonelGorevlendirme[];
        aktivite_loglari?: AktiviteLog[];
        stats?: PersonelStats;
        success?: boolean;
      }>(`/personel/api/${params.id}/full/`);

      const personel = (result.personel ?? result.data?.personel) as PersonelDetay | undefined;
      if (result.success && personel) {
        setData({
          personel,
          gorevlendirmeler: (result.gorevlendirmeler ?? result.data?.gorevlendirmeler ?? []) as PersonelGorevlendirme[],
          aktivite_loglari: (result.aktivite_loglari ?? result.data?.aktivite_loglari ?? []) as AktiviteLog[],
          stats: (result.stats ?? result.data?.stats) as PersonelStats,
        });
      } else {
        setError(true);
      }
    } catch (err) {
      console.error("Personel verisi alınamadı:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) {
      fetchPersonel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) {
    return (
      <div className="section">
        <div className="card-modern">
          <div className="card-modern-body loading-container">
            <div className="loading-spinner"></div>
            <p>Yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="section">
        <div className="card-modern">
          <div className="card-modern-body error-container">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h3>Personel Bulunamadı</h3>
            <p>İstediğiniz personel kaydına ulaşılamadı.</p>
            <Link href={basePath} className="btn-modern btn-secondary">
              Personel Listesine Dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PersonelDetayClient 
      data={data.personel} 
      gorevlendirmeler={data.gorevlendirmeler}
      aktiviteler={data.aktivite_loglari}
      stats={data.stats}
      onRefresh={fetchPersonel}
    />
  );
}
