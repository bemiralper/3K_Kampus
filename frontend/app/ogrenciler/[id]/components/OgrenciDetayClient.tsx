"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useOgrenciPath } from "@/components/ogrenci/OgrenciPathProvider";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { ModulePermissions, PermissionChecks } from "@/app/roles/role.permissions";
import { OgrenciDetay, TabType, TabConfig } from "../types";
import OgrenciProfilKart from "./OgrenciProfilKart";
import OgrenciBilgiDrawer from "./OgrenciBilgiDrawer";
import { VeliTab, AkademikTab, SinavTab, FinansTab, RehberlikTab, IletisimTab, NotlarTab } from "./tabs";

const ALL_TABS: TabConfig[] = [
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
  {
    id: 'notlar',
    label: 'Notlar',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    ),
  },
];

export default function OgrenciDetayClient({ data: initialData }: { data: OgrenciDetay }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { listHref, portalHomeHref } = useOgrenciPath();
  const perms = user?.permissions || [];
  const canViewNotes = PermissionChecks.hasAnyPermission(perms, [
    ModulePermissions.OGRENCI.NOTES,
    ModulePermissions.OGRENCI.MANAGE,
  ]);
  const canEditOgrenci = PermissionChecks.canWrite(perms, 'ogrenci');
  const tabs = useMemo(
    () => (canViewNotes ? ALL_TABS : ALL_TABS.filter((t) => t.id !== 'notlar')),
    [canViewNotes],
  );
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const hasAkademikQuery = Boolean(searchParams.get('akademik'));
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (tabFromUrl && ALL_TABS.some((t) => t.id === tabFromUrl)) return tabFromUrl;
    if (hasAkademikQuery) return 'akademik';
    return 'veli';
  });
  const [data, setData] = useState<OgrenciDetay>(initialData);
  const [showEditDrawer, setShowEditDrawer] = useState(searchParams.get('edit') === '1');
  const [editDrawerStep, setEditDrawerStep] = useState<'kisisel' | 'iletisim' | 'egitim'>('kisisel');
  const openEditDrawer = (step: 'kisisel' | 'iletisim' | 'egitim' = 'kisisel') => {
    setEditDrawerStep(step);
    setShowEditDrawer(true);
  };

  useEffect(() => {
    if (searchParams.get('edit') === '1' && canEditOgrenci) {
      setShowEditDrawer(true);
    }
  }, [searchParams, canEditOgrenci]);

  useEffect(() => {
    const t = searchParams.get('tab') as TabType | null;
    if (t && tabs.some((x) => x.id === t)) {
      setActiveTab(t);
    } else if (t === 'notlar' && !canViewNotes) {
      setActiveTab('veli');
    } else if (searchParams.get('akademik')) {
      setActiveTab('akademik');
    }
  }, [searchParams, tabs, canViewNotes]);

  useEffect(() => {
    if (activeTab === 'notlar' && !canViewNotes) {
      setActiveTab('veli');
    }
  }, [activeTab, canViewNotes]);

  function renderTabContent(tab: TabType) {
    switch (tab) {
      case 'veli':
        return <VeliTab data={data} />;
      case 'akademik':
        return (
          <AkademikTab
            ogrenciId={data.id}
            onSwitchTopTab={(id) => setActiveTab(id as TabType)}
          />
        );
      case 'sinav':
        return <SinavTab ogrenciId={data.id} />;
      case 'finans':
        return <FinansTab ogrenciId={data.id} />;
      case 'rehberlik':
        return <RehberlikTab />;
      case 'iletisim':
        return <IletisimTab ogrenciId={data.id} ogrenciAd={data.tam_ad} />;
      case 'notlar':
        return canViewNotes ? <NotlarTab ogrenciId={data.id} /> : null;
      default:
        return null;
    }
  }

  const handleUpdateSuccess = (updatedData: OgrenciDetay) => {
    setData(updatedData);
    router.refresh();
  };

  const handlePhotoUpdate = (newPhotoUrl: string | null) => {
    setData(prev => ({ ...prev, profil_foto: newPhotoUrl }));
  };

  return (
    <div className="section mobile-cards">
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
          {canEditOgrenci ? (
            <button
              onClick={() => openEditDrawer('kisisel')}
              className="btn-modern btn-primary"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Düzenle
            </button>
          ) : null}
        </div>
      </div>

      <OgrenciProfilKart
        data={data}
        onEditClick={canEditOgrenci ? () => openEditDrawer('kisisel') : undefined}
        onSchoolEditClick={canEditOgrenci ? () => openEditDrawer('egitim') : undefined}
        onPhotoUpdate={canEditOgrenci ? handlePhotoUpdate : undefined}
      />

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

      <div className="student-tab-content">
        {renderTabContent(activeTab)}
      </div>

      <OgrenciBilgiDrawer
        isOpen={showEditDrawer}
        onClose={() => setShowEditDrawer(false)}
        data={data}
        onSuccess={handleUpdateSuccess}
        initialStep={editDrawerStep}
      />
    </div>
  );
}
