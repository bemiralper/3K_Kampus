'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  fetchCoachStudentProfile,
  normalizeStudent360Tab,
  type CoachStudentProfileData,
  type Student360ActionId,
  type Student360TabId,
} from '@/lib/coach-api';
import { useAuth } from '@/lib/contexts/AuthContext';
import { recordRecentVisit, togglePinnedStudent, isPinnedStudent } from '@/lib/coach-students-prefs';
import Student360Header, { Student360HeaderSkeleton } from '@/components/coach/Student360Header';
import Student360GroupNav from '@/components/coach/Student360GroupNav';
import QuickActionBar from '@/components/coach/QuickActionBar';
import GorusmeEkleDrawer from '@/components/coach/GorusmeEkleDrawer';
import RiskBildirDrawer from '@/components/coach/RiskBildirDrawer';
import CoachProgramSheet from '@/components/coach/CoachProgramSheet';
import CoachStudentInfoDrawer from '@/components/coach/CoachStudentInfoDrawer';
import {
  OzetTab,
  BilgiTab,
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

const VALID_ACTIONS = new Set<string>(['gorusme-ekle', 'program', 'risk']);

type PanelId = Exclude<Student360TabId, 'genel'>;

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

  const activeTab = useMemo(
    () => normalizeStudent360Tab(searchParams.get('tab')),
    [searchParams]
  );

  const activeAction = searchParams.get('action');
  const showGorusmeDrawer = activeAction === 'gorusme-ekle';
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

  const setTab = (tab: PanelId) => {
    setQuery({ tab: tab === 'ozet' ? null : tab, action: null });
  };

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
    if (action === 'odev-ver') {
      const returnTo = `/coach/ogrenciler/${studentId}?tab=odevler`;
      router.push(
        `/coach/odev/ver?student=${studentId}&locked=1&return=${encodeURIComponent(returnTo)}`
      );
      return;
    }
    setQuery({ action });
  };

  const closeDrawer = () => setQuery({ action: null });

  const handleGorusmeSuccess = () => {
    loadProfile({ silent: true });
    setTabReloadKey((k) => k + 1);
    if (activeTab !== 'gorusmeler') setTab('gorusmeler');
  };

  const handleProgramOpen = () => setQuery({ action: 'program' });

  useEffect(() => {
    if (activeAction === 'odev-ver') {
      const returnTo = `/coach/ogrenciler/${studentId}?tab=odevler`;
      router.replace(
        `/coach/odev/ver?student=${studentId}&locked=1&return=${encodeURIComponent(returnTo)}`
      );
      return;
    }
    if (activeAction && !VALID_ACTIONS.has(activeAction)) {
      setQuery({ action: null });
    }
  }, [activeAction, setQuery, router, studentId]);

  // Legacy ?tab=genel → temiz URL
  useEffect(() => {
    if (searchParams.get('tab') === 'genel') {
      setQuery({ tab: null });
    }
  }, [searchParams, setQuery]);

  const renderTab = () => {
    if (!profile) return null;
    switch (activeTab) {
      case 'ozet':
        return (
          <OzetTab profile={profile} onNavigateTab={setTab} onAction={handleAction} />
        );
      case 'bilgi':
        return (
          <BilgiTab
            student={profile.student}
            onPhotoUpdate={handlePhotoUpdate}
            onNavigateVeli={() => setTab('veli')}
          />
        );
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
            veliTelefon={profile.student.veli_telefon || profile.student.veli?.telefon}
            veliId={profile.student.veli?.id}
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
        <aside className="s360-context-rail" aria-label="Öğrenci özeti yükleniyor">
          <Student360HeaderSkeleton />
          <Student360GroupNav activeTab="ozet" onTabChange={() => {}} disabled />
        </aside>
        <div className="student360-main">
          <div className="student360-content">
            <div className="s360-loading-grid">
              <div className="coach-skeleton" style={{ height: 104, borderRadius: 16 }} />
              <div className="coach-skeleton" style={{ height: 104, borderRadius: 16 }} />
              <div className="coach-skeleton" style={{ height: 280, borderRadius: 18 }} />
            </div>
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
      <aside className="s360-context-rail" aria-label="Öğrenci gezinme ve bilgileri">
        <Student360Header
          profile={profile}
          pinned={pinned}
          onTogglePin={handleTogglePin}
          onShowInfo={() => setShowInfoDrawer(true)}
          onRefresh={() => loadProfile({ silent: true })}
          refreshing={refreshing}
          onAction={handleAction}
          onMesaj={() => setTab('mesajlar')}
        />
        <Student360GroupNav activeTab={activeTab} onTabChange={setTab} />
      </aside>

      <main className="student360-main">
        <div className="student360-content" role="tabpanel" key={activeTab}>
          {renderTab()}
        </div>
      </main>

      <QuickActionBar onAction={handleAction} onMesaj={() => setTab('mesajlar')} />

      {showGorusmeDrawer && (
        <GorusmeEkleDrawer
          studentId={studentId}
          studentName={studentDisplayName}
          coachId={user?.coach_profile_id ?? undefined}
          onClose={closeDrawer}
          onSuccess={handleGorusmeSuccess}
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
