'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  fetchCoachStudentProfile,
  STUDENT360_TABS,
  type CoachStudentProfileData,
  type Student360ActionId,
  type Student360TabId,
} from '@/lib/coach-api';
import { useAuth } from '@/lib/contexts/AuthContext';
import { recordRecentVisit, togglePinnedStudent, isPinnedStudent } from '@/lib/coach-students-prefs';
import Student360Header, { Student360HeaderSkeleton } from '@/components/coach/Student360Header';
import QuickActionBar from '@/components/coach/QuickActionBar';
import GorusmeEkleDrawer from '@/components/coach/GorusmeEkleDrawer';
import RiskBildirDrawer from '@/components/coach/RiskBildirDrawer';
import CoachOdevVerSheet from '@/components/coach/CoachOdevVerSheet';
import CoachProgramSheet from '@/components/coach/CoachProgramSheet';
import CoachStudentInfoDrawer from '@/components/coach/CoachStudentInfoDrawer';
import {
  GenelBakisTab,
  OdevlerTab,
  SinavlarTab,
  GorusmelerTab,
  MesajlarTab,
  ProgramTab,
  KutuphaneTab,
  VeliTab,
  BelgelerTab,
} from '@/components/coach/student360';
import '@/app/coach/coach.css';

const VALID_TABS = new Set<string>(STUDENT360_TABS.map((t) => t.id));
const VALID_ACTIONS = new Set<string>(['gorusme-ekle', 'odev-ver', 'program', 'risk']);

function parseTab(value: string | null): Student360TabId {
  if (value && VALID_TABS.has(value)) return value as Student360TabId;
  return 'genel';
}

interface Student360ClientProps {
  studentId: number;
}

export default function Student360Client({ studentId }: Student360ClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [profile, setProfile] = useState<CoachStudentProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [tabReloadKey, setTabReloadKey] = useState(0);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Partial<Record<Student360TabId, HTMLButtonElement>>>({});
  const [tabBubble, setTabBubble] = useState({ left: 0, width: 0, height: 0, opacity: 0 });

  const activeTab = useMemo(
    () => parseTab(searchParams.get('tab')),
    [searchParams]
  );

  const activeAction = searchParams.get('action');
  const showGorusmeDrawer = activeAction === 'gorusme-ekle';
  const showOdevSheet = activeAction === 'odev-ver';
  const showProgramSheet = activeAction === 'program';
  const showRiskDrawer = activeAction === 'risk';

  const studentDisplayName = profile?.student.full_name || profile?.student.tam_ad || '';

  const loadProfile = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetchCoachStudentProfile(studentId);
      if (res.success && res.data) {
        setProfile(res.data);
        setError(null);
      } else {
        setError(res.error || 'Profil yüklenemedi');
        if (!opts?.silent) setProfile(null);
      }
    } catch {
      setError('Profil yüklenirken hata oluştu');
      if (!opts?.silent) setProfile(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!user?.id) return;
    setPinned(isPinnedStudent(user.id, studentId));
  }, [user?.id, studentId]);

  useEffect(() => {
    if (!profile || !user?.id) return;
    recordRecentVisit(user.id, {
      id: profile.student.id,
      tam_ad: profile.student.full_name || `${profile.student.ad} ${profile.student.soyad}`.trim(),
      sinif:
        typeof profile.student.sinif === 'string'
          ? profile.student.sinif
          : profile.student.sinif?.ad ?? null,
      profil_foto: profile.student.profil_foto,
    });
  }, [profile, user?.id]);

  const handleTogglePin = useCallback(() => {
    if (!user?.id) return;
    const next = togglePinnedStudent(user.id, studentId);
    setPinned(next.includes(studentId));
  }, [user?.id, studentId]);

  const setQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, val]) => {
        if (val === null) params.delete(key);
        else params.set(key, val);
      });
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams]
  );

  const setTab = (tab: Student360TabId) => {
    setQuery({ tab, action: null });
  };

  const updateTabBubble = useCallback(() => {
    const container = tabsContainerRef.current;
    const activeButton = tabButtonRefs.current[activeTab];
    if (!container || !activeButton) return;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    setTabBubble({
      left: buttonRect.left - containerRect.left + container.scrollLeft,
      width: buttonRect.width,
      height: buttonRect.height,
      opacity: 1,
    });
  }, [activeTab]);

  useLayoutEffect(() => {
    updateTabBubble();
  }, [updateTabBubble, loading]);

  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const handleResize = () => updateTabBubble();
    container.addEventListener('scroll', handleResize, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      container.removeEventListener('scroll', handleResize);
      window.removeEventListener('resize', handleResize);
    };
  }, [updateTabBubble]);

  useEffect(() => {
    const activeButton = tabButtonRefs.current[activeTab];
    activeButton?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    updateTabBubble();
  }, [activeTab, updateTabBubble]);

  const handlePhotoUpdate = useCallback(
    (url: string | null) => {
      setProfile((prev) =>
        prev ? { ...prev, student: { ...prev.student, profil_foto: url } } : prev
      );
      loadProfile({ silent: true });
    },
    [loadProfile]
  );

  const handleAction = (action: Student360ActionId) => {
    setQuery({ action });
  };

  const closeDrawer = () => setQuery({ action: null });

  const handleGorusmeSuccess = () => {
    loadProfile({ silent: true });
    setTabReloadKey((k) => k + 1);
    if (activeTab !== 'gorusmeler') setTab('gorusmeler');
  };

  const handleOdevSuccess = () => {
    setTabReloadKey((k) => k + 1);
    if (activeTab !== 'odevler') setTab('odevler');
    else loadProfile({ silent: true });
  };

  const handleProgramOpen = () => setQuery({ action: 'program' });

  useEffect(() => {
    if (activeAction && !VALID_ACTIONS.has(activeAction)) {
      setQuery({ action: null });
    }
  }, [activeAction, setQuery]);

  const renderTab = () => {
    if (!profile) return null;
    switch (activeTab) {
      case 'genel':
        return <GenelBakisTab profile={profile} onNavigateTab={setTab} />;
      case 'odevler':
        return <OdevlerTab key={`odevler-${tabReloadKey}`} studentId={studentId} />;
      case 'sinavlar':
        return <SinavlarTab studentId={studentId} />;
      case 'gorusmeler':
        return (
          <GorusmelerTab
            key={`gorusmeler-${tabReloadKey}`}
            studentId={studentId}
            studentName={profile.student.full_name}
          />
        );
      case 'mesajlar':
        return (
          <MesajlarTab
            key={`mesajlar-${tabReloadKey}`}
            studentId={studentId}
            studentName={profile.student.full_name}
          />
        );
      case 'program':
        return (
          <ProgramTab
            key={`program-${tabReloadKey}`}
            studentId={studentId}
            onOpenProgram={handleProgramOpen}
          />
        );
      case 'kutuphane':
        return (
          <KutuphaneTab studentId={studentId} studentName={profile.student.full_name} />
        );
      case 'veli':
        return <VeliTab key={`veli-${tabReloadKey}`} student={profile.student} />;
      case 'belgeler':
        return <BelgelerTab studentId={studentId} />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="student360-page">
        <div className="student360-main">
          <Student360HeaderSkeleton />
          <div className="student360-tabs-wrap">
            <div className="student360-tabs">
              {STUDENT360_TABS.map((t) => (
                <button key={t.id} type="button" className="student360-tab" disabled>
                  <span className="student360-tab-icon">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="student360-content">
            <div className="coach-skeleton" style={{ height: 120, borderRadius: 14 }} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="student360-page">
        <div className="student360-main">
          <div className="coach-error-banner">
            {error || 'Öğrenci profili bulunamadı'}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => loadProfile()}>
                Tekrar dene
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="student360-page">
      <div className="student360-main">
        <Student360Header
          profile={profile}
          pinned={pinned}
          onTogglePin={handleTogglePin}
          onShowInfo={() => setShowInfoDrawer(true)}
          onRefresh={() => loadProfile({ silent: true })}
          refreshing={refreshing}
        />

        <div className="student360-tabs-wrap">
          <div
            ref={tabsContainerRef}
            className="student360-tabs"
            role="tablist"
            aria-label="Öğrenci sekmeleri"
          >
            <div
              className="student360-tab-bubble"
              aria-hidden="true"
              style={{
                width: tabBubble.width,
                height: tabBubble.height,
                transform: `translateX(${tabBubble.left}px)`,
                opacity: tabBubble.opacity,
              }}
            />
            {STUDENT360_TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  if (el) tabButtonRefs.current[t.id] = el;
                  else delete tabButtonRefs.current[t.id];
                }}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                className={`student360-tab${activeTab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className="student360-tab-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="student360-content" role="tabpanel" key={activeTab}>
          {renderTab()}
        </div>
      </div>

      <QuickActionBar onAction={handleAction} />

      {showGorusmeDrawer && (
        <GorusmeEkleDrawer
          studentId={studentId}
          studentName={studentDisplayName}
          coachId={user?.coach_profile_id ?? undefined}
          onClose={closeDrawer}
          onSuccess={handleGorusmeSuccess}
        />
      )}

      {showOdevSheet && (
        <CoachOdevVerSheet
          studentId={studentId}
          studentName={studentDisplayName}
          onClose={closeDrawer}
          onSuccess={handleOdevSuccess}
        />
      )}

      {showProgramSheet && (
        <CoachProgramSheet
          studentId={studentId}
          studentName={studentDisplayName}
          coachId={user?.coach_profile_id ?? undefined}
          onClose={() => {
            setTabReloadKey((k) => k + 1);
            closeDrawer();
          }}
        />
      )}

      {showRiskDrawer && (
        <RiskBildirDrawer
          studentId={studentId}
          studentName={studentDisplayName}
          onClose={closeDrawer}
          onSuccess={() => loadProfile({ silent: true })}
        />
      )}

      {showInfoDrawer && (
        <CoachStudentInfoDrawer
          student={profile.student}
          onClose={() => setShowInfoDrawer(false)}
          onNavigateVeli={() => {
            setShowInfoDrawer(false);
            setTab('veli');
          }}
          onPhotoUpdate={handlePhotoUpdate}
        />
      )}
    </div>
  );
}
