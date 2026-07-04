"use client";

import { useState } from "react";
import Link from "next/link";
import { usePersonelPath } from "@/components/personel/PersonelPathProvider";
import { PersonelDetay, PersonelGorevlendirme, AktiviteLog, PersonelStats, TabType, TabConfig } from "../types";
import { PersonelProfilKart } from "./index";
import GorevlendirmelerTab from "./tabs/GorevlendirmelerTab";
import HesapTab from "./tabs/HesapTab";
import AktiviteTab from "./tabs/AktiviteTab";
import "../styles/personel-detay.css";

// Tab configurations
const tabs: TabConfig[] = [
  {
    id: 'gorevlendirmeler',
    label: 'Görevlendirmeler',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    id: 'hesap',
    label: 'Hesap Bilgileri',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: 'aktivite',
    label: 'Aktivite Geçmişi',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
];

interface PersonelDetayClientProps {
  data: PersonelDetay;
  gorevlendirmeler: PersonelGorevlendirme[];
  aktiviteler: AktiviteLog[];
  stats: PersonelStats;
  onRefresh: () => void;
}

export default function PersonelDetayClient({ 
  data, 
  gorevlendirmeler, 
  aktiviteler,
  stats,
  onRefresh 
}: PersonelDetayClientProps) {
  const { basePath } = usePersonelPath();
  const [activeTab, setActiveTab] = useState<TabType>('gorevlendirmeler');

  // Tab content renderer
  const renderTabContent = () => {
    switch (activeTab) {
      case 'gorevlendirmeler':
        return <GorevlendirmelerTab gorevlendirmeler={gorevlendirmeler} personelId={data.id} onRefresh={onRefresh} />;
      case 'hesap':
        return <HesapTab data={data} onRefresh={onRefresh} />;
      case 'aktivite':
        return <AktiviteTab aktiviteler={aktiviteler} stats={stats} />;
      default:
        return null;
    }
  };

  return (
    <div className="personel-detay-container">
      {/* Page Header */}
      <div className="personel-detay-header">
        <Link href={basePath} className="btn-back" title="Geri Dön">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <h1>{data.tam_ad}</h1>
      </div>

      <div className="personel-detay-content">
        {/* Sol Kolon - Profil Kartı */}
        <PersonelProfilKart data={data} />

        {/* Sağ Kolon - Tab Panel */}
        <div className="personel-tab-panel">
          {/* Tab Header */}
          <div className="tab-header">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="tab-content">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
