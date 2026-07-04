"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useOgrenciPath } from "@/components/ogrenci/OgrenciPathProvider";
import { useRouter, useSearchParams } from "next/navigation";
import { OgrenciDetay, TabType, TabConfig } from "../types";
import OgrenciProfilKart from "./OgrenciProfilKart";
import OgrenciBilgiDrawer from "./OgrenciBilgiDrawer";
import { VeliTab, AkademikTab, SinavTab, FinansTab, RehberlikTab, IletisimTab } from "./tabs";

// Tab configurations
const tabs: TabConfig[] = [
  {
    id: 'veli',
    label: 'Veli',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'akademik',
    label: 'Akademik',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
      </svg>
    ),
  },
  {
    id: 'sinav',
    label: 'Sınav',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: 'finans',
    label: 'Finans',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    id: 'rehberlik',
    label: 'Rehberlik',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    id: 'iletisim',
    label: 'İletişim',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

// Tab content renderer
function renderTabContent(activeTab: TabType, data: OgrenciDetay) {
  switch (activeTab) {
    case 'veli':
      return <VeliTab data={data} />;
    case 'akademik':
      return <AkademikTab ogrenciId={data.id} />;
    case 'sinav':
      return <SinavTab ogrenciId={data.id} />;
    case 'finans':
      return <FinansTab ogrenciId={data.id} />;
    case 'rehberlik':
      return <RehberlikTab />;
    case 'iletisim':
      return <IletisimTab ogrenciId={data.id} ogrenciAd={data.tam_ad} />;
    default:
      return null;
  }
}

export default function OgrenciDetayClient({ data: initialData }: { data: OgrenciDetay }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { listHref, portalHomeHref, href } = useOgrenciPath();
  const [activeTab, setActiveTab] = useState<TabType>('veli');
  const [data, setData] = useState<OgrenciDetay>(initialData);
  const [showEditDrawer, setShowEditDrawer] = useState(searchParams.get('edit') === '1');

  useEffect(() => {
    if (searchParams.get('edit') === '1') {
      setShowEditDrawer(true);
    }
  }, [searchParams]);

  // Handle successful update
  const handleUpdateSuccess = (updatedData: OgrenciDetay) => {
    setData(updatedData);
    // Refresh the page to get the latest data from server
    router.refresh();
  };

  // Handle photo update
  const handlePhotoUpdate = (newPhotoUrl: string | null) => {
    setData(prev => ({ ...prev, profil_foto: newPhotoUrl }));
  };

  return (
    <div className="section">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h2>Öğrenci Detayı</h2>
          <div className="breadcrumb">
            <Link href={portalHomeHref}>Ana Sayfa</Link>
            <span>/</span>
            <Link href={listHref}>Öğrenci Listesi</Link>
            <span>/</span>
            <span>{data.tam_ad}</span>
          </div>
        </div>
        <div className="page-header-right">
          <Link href={listHref} className="btn-modern btn-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Geri Dön
          </Link>
          <button 
            onClick={() => setShowEditDrawer(true)} 
            className="btn-modern btn-primary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Düzenle
          </button>
        </div>
      </div>

      {/* Student Profile Card */}
      <OgrenciProfilKart 
        data={data} 
        onEditClick={() => setShowEditDrawer(true)} 
        onPhotoUpdate={handlePhotoUpdate}
      />

      {/* Tab Menu */}
      <div className="student-tabs-container">
        <div className="student-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`student-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="student-tab-content">
        {renderTabContent(activeTab, data)}
      </div>

      {/* Edit Drawer */}
      <OgrenciBilgiDrawer 
        isOpen={showEditDrawer}
        onClose={() => setShowEditDrawer(false)}
        data={data}
        onSuccess={handleUpdateSuccess}
      />
    </div>
  );
}
