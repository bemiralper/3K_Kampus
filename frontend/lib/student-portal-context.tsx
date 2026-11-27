'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { clearContextGate } from '@/lib/post-login-routing';
import {
  studentPortalApi,
  type BadgeItem,
  type CourseNoteItem,
  type StudentHomeworkTask,
  type StudentIdentityPayload,
  type StudyBlockItem,
} from '@/lib/student-portal-api';

export interface ActiveFocusSession {
  mode: 'pomodoro' | 'stopwatch';
  block: StudyBlockItem | null;
  homeworkTask: StudentHomeworkTask | null;
  customTitle?: string;
  targetSeconds: number;
  elapsedSeconds: number;
  running: boolean;
  minimized: boolean;
}

interface StudentPortalContextValue {
  identity: StudentIdentityPayload | null;
  loading: boolean;
  error: string | null;
  resolvedTheme: 'light' | 'dark';
  themePref: 'light' | 'dark' | 'system';
  setThemePref: (next: 'light' | 'dark' | 'system') => Promise<void>;
  setDefaultFocusMinutes: (mins: number) => Promise<void>;
  setFocusPresets: (presets: number[], defaultMinutes?: number) => Promise<void>;
  extendActiveFocus: (extraMinutes: number) => void;
  refreshIdentity: () => Promise<void>;
  applyUpdatedIdentity: (next: StudentIdentityPayload) => void;

  // Global Focus Session (Pomodoro / Stopwatch)
  focusSession: ActiveFocusSession | null;
  startFocus: (opts?: {
    block?: StudyBlockItem | null;
    homeworkTask?: StudentHomeworkTask | null;
    mode?: 'pomodoro' | 'stopwatch';
    minutes?: number;
    customTitle?: string;
  }) => void;
  toggleFocusRunning: () => void;
  setFocusMinimized: (minimized: boolean) => void;
  cancelFocus: () => void;
  finishFocusAndSave: (markBlockComplete?: boolean) => Promise<{
    savedMinutes: number;
    newBadges: BadgeItem[];
  }>;

  // Earned badge celebration toast
  celebrationBadges: BadgeItem[];
  dismissCelebration: () => void;
  pushCelebrationBadges: (badges: BadgeItem[]) => void;

  // Split-View PDF / Image Note Viewer (Tablet & PC dock + Mobile sheet)
  splitNote: CourseNoteItem | null;
  openSplitNote: (note: CourseNoteItem) => void;
  closeSplitNote: () => void;

  // Cmd+K / Ctrl+K Command Palette
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

  // Counters refreshed from pages
  unreadCoachCount: number;
  unreadAnnouncementCount: number;
  setPortalCounters: (c: { unreadCoach?: number; unreadAnnouncements?: number }) => void;
  studyRefreshNonce: number;
  bumpStudyRefresh: () => void;
}

const StudentPortalContext = createContext<StudentPortalContextValue | null>(null);

const THEME_STORAGE_KEY = '3k_sp_theme';

export function StudentPortalProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<StudentIdentityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [themePref, setThemePrefState] = useState<'light' | 'dark' | 'system'>('light');
  const [systemDark, setSystemDark] = useState(false);

  const [focusSession, setFocusSession] = useState<ActiveFocusSession | null>(null);
  const [celebrationBadges, setCelebrationBadges] = useState<BadgeItem[]>([]);
  const [splitNote, setSplitNote] = useState<CourseNoteItem | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [unreadCoachCount, setUnreadCoachCount] = useState(0);
  const [unreadAnnouncementCount, setUnreadAnnouncementCount] = useState(0);
  const [studyRefreshNonce, setStudyRefreshNonce] = useState(0);

  useEffect(() => {
    clearContextGate();
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setThemePrefState(saved);
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const handler = (ev: MediaQueryListEvent) => setSystemDark(ev.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const refreshIdentity = useCallback(async () => {
    setError(null);
    try {
      const data = await studentPortalApi.bootstrap();
      setIdentity(data);
      const serverTheme = data.preferences?.theme;
      if (serverTheme === 'light' || serverTheme === 'dark' || serverTheme === 'system') {
        setThemePrefState(serverTheme);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(THEME_STORAGE_KEY, serverTheme);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Öğrenci portalı yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshIdentity();
  }, [refreshIdentity]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        if (!identity?.must_change_password) {
          setPaletteOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [identity?.must_change_password]);

  // Focus Session 1-second ticker
  useEffect(() => {
    if (!focusSession || !focusSession.running) return;
    const timer = window.setInterval(() => {
      setFocusSession((prev) => {
        if (!prev || !prev.running) return prev;
        const nextElapsed = prev.elapsedSeconds + 1;
        if (prev.mode === 'pomodoro' && nextElapsed >= prev.targetSeconds) {
          return {
            ...prev,
            elapsedSeconds: prev.targetSeconds,
            running: false,
            minimized: false,
          };
        }
        return { ...prev, elapsedSeconds: nextElapsed };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [focusSession?.running, focusSession?.mode]);

  const resolvedTheme: 'light' | 'dark' = useMemo(() => {
    if (themePref === 'system') return systemDark ? 'dark' : 'light';
    return themePref;
  }, [themePref, systemDark]);

  const setThemePref = useCallback(async (next: 'light' | 'dark' | 'system') => {
    setThemePrefState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    }
    try {
      await studentPortalApi.updatePreferences({ theme: next });
    } catch {
      // ignore transient network failure; local preference already applied
    }
  }, []);

  const setDefaultFocusMinutes = useCallback(async (mins: number) => {
    const updated = await studentPortalApi.updatePreferences({ focus_minutes: mins });
    setIdentity((prev) => (prev ? { ...prev, preferences: updated } : prev));
  }, []);

  const setFocusPresets = useCallback(
    async (presets: number[], defaultMinutes?: number) => {
      const patch: Partial<StudentIdentityPayload['preferences']> = {
        focus_presets: presets,
      };
      if (typeof defaultMinutes === 'number') {
        patch.focus_minutes = defaultMinutes;
      }
      const updated = await studentPortalApi.updatePreferences(patch);
      setIdentity((prev) => (prev ? { ...prev, preferences: updated } : prev));
    },
    [],
  );

  const extendActiveFocus = useCallback((extraMinutes: number) => {
    setFocusSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        targetSeconds: prev.targetSeconds + Math.max(1, extraMinutes) * 60,
        running: true,
      };
    });
  }, []);

  const applyUpdatedIdentity = useCallback((next: StudentIdentityPayload) => {
    setIdentity(next);
  }, []);

  const startFocus = useCallback(
    (opts?: {
      block?: StudyBlockItem | null;
      homeworkTask?: StudentHomeworkTask | null;
      mode?: 'pomodoro' | 'stopwatch';
      minutes?: number;
      customTitle?: string;
    }) => {
      const fallbackMins =
        opts?.minutes ||
        opts?.block?.estimated_duration_minutes ||
        opts?.homeworkTask?.target_minutes ||
        identity?.preferences?.focus_minutes ||
        25;
      setFocusSession({
        mode: opts?.mode || 'pomodoro',
        block: opts?.block || null,
        homeworkTask: opts?.homeworkTask || null,
        customTitle: opts?.customTitle,
        targetSeconds: Math.max(60, fallbackMins * 60),
        elapsedSeconds: 0,
        running: true,
        minimized: false,
      });
    },
    [identity?.preferences?.focus_minutes],
  );

  const toggleFocusRunning = useCallback(() => {
    setFocusSession((prev) => (prev ? { ...prev, running: !prev.running } : null));
  }, []);

  const setFocusMinimized = useCallback((minimized: boolean) => {
    setFocusSession((prev) => (prev ? { ...prev, minimized } : null));
  }, []);

  const cancelFocus = useCallback(() => {
    setFocusSession(null);
  }, []);

  const bumpStudyRefresh = useCallback(() => {
    setStudyRefreshNonce((n) => n + 1);
  }, []);

  const pushCelebrationBadges = useCallback(
    (badges: BadgeItem[]) => {
      if (badges.length > 0) {
        setCelebrationBadges(badges);
        refreshIdentity();
      }
    },
    [refreshIdentity],
  );

  const dismissCelebration = useCallback(() => {
    setCelebrationBadges([]);
  }, []);

  const finishFocusAndSave = useCallback(
    async (markBlockComplete = true) => {
      if (!focusSession) return { savedMinutes: 0, newBadges: [] };
      const mins = Math.max(1, Math.round(focusSession.elapsedSeconds / 60));
      let newBadges: BadgeItem[] = [];

      if (focusSession.block) {
        const res = await studentPortalApi.completeStudyBlock(focusSession.block.id, {
          is_completed: markBlockComplete ? true : focusSession.block.is_completed,
          focus_minutes_added: mins,
        });
        newBadges = res.new_badges || [];
        if (newBadges.length > 0) {
          setCelebrationBadges(newBadges);
        }
        bumpStudyRefresh();
        refreshIdentity();
      } else if (focusSession.homeworkTask) {
        const res = await studentPortalApi.updateAssignmentTask(focusSession.homeworkTask.id, {
          prepared: markBlockComplete ? true : focusSession.homeworkTask.student_prepared,
          focus_minutes_added: mins,
        });
        newBadges = res.new_badges || [];
        if (newBadges.length > 0) {
          setCelebrationBadges(newBadges);
        }
        bumpStudyRefresh();
        refreshIdentity();
      }

      setFocusSession(null);
      return { savedMinutes: mins, newBadges };
    },
    [focusSession, bumpStudyRefresh, refreshIdentity],
  );

  const openSplitNote = useCallback((note: CourseNoteItem) => {
    setSplitNote(note);
  }, []);

  const closeSplitNote = useCallback(() => {
    setSplitNote(null);
  }, []);

  const setPortalCounters = useCallback(
    (c: { unreadCoach?: number; unreadAnnouncements?: number }) => {
      if (typeof c.unreadCoach === 'number') setUnreadCoachCount(c.unreadCoach);
      if (typeof c.unreadAnnouncements === 'number') {
        setUnreadAnnouncementCount(c.unreadAnnouncements);
      }
    },
    [],
  );

  const value = useMemo<StudentPortalContextValue>(
    () => ({
      identity,
      loading,
      error,
      resolvedTheme,
      themePref,
      setThemePref,
      setDefaultFocusMinutes,
      setFocusPresets,
      extendActiveFocus,
      refreshIdentity,
      applyUpdatedIdentity,
      focusSession,
      startFocus,
      toggleFocusRunning,
      setFocusMinimized,
      cancelFocus,
      finishFocusAndSave,
      celebrationBadges,
      dismissCelebration,
      pushCelebrationBadges,
      splitNote,
      openSplitNote,
      closeSplitNote,
      paletteOpen,
      setPaletteOpen,
      unreadCoachCount,
      unreadAnnouncementCount,
      setPortalCounters,
      studyRefreshNonce,
      bumpStudyRefresh,
    }),
    [
      identity,
      loading,
      error,
      resolvedTheme,
      themePref,
      setThemePref,
      setDefaultFocusMinutes,
      setFocusPresets,
      extendActiveFocus,
      refreshIdentity,
      applyUpdatedIdentity,
      focusSession,
      startFocus,
      toggleFocusRunning,
      setFocusMinimized,
      cancelFocus,
      finishFocusAndSave,
      celebrationBadges,
      dismissCelebration,
      pushCelebrationBadges,
      splitNote,
      openSplitNote,
      closeSplitNote,
      paletteOpen,
      unreadCoachCount,
      unreadAnnouncementCount,
      setPortalCounters,
      studyRefreshNonce,
      bumpStudyRefresh,
    ],
  );

  return (
    <StudentPortalContext.Provider value={value}>{children}</StudentPortalContext.Provider>
  );
}

export function useStudentPortal(): StudentPortalContextValue {
  const ctx = useContext(StudentPortalContext);
  if (!ctx) {
    throw new Error('useStudentPortal must be used inside StudentPortalProvider');
  }
  return ctx;
}
