'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  areRemindersSnoozed,
  markReminderNotifiedThisSession,
  snoozeReminders,
  wasReminderNotifiedThisSession,
} from '@/lib/coach-students-prefs';
import { COACH_MEETING_FOLLOWUP_DAYS } from '@/lib/coach-constants';

interface CoachReminderBannerProps {
  userId: number;
  needsMeetingCount: number;
  overdueStudentCount: number;
  onFilterNeedsMeeting: () => void;
  onFilterOverdue: () => void;
}

export default function CoachReminderBanner({
  userId,
  needsMeetingCount,
  overdueStudentCount,
  onFilterNeedsMeeting,
  onFilterOverdue,
}: CoachReminderBannerProps) {
  const [hidden, setHidden] = useState(true);
  const total = needsMeetingCount + overdueStudentCount;

  useEffect(() => {
    setHidden(areRemindersSnoozed(userId) || total === 0);
  }, [userId, total]);

  useEffect(() => {
    if (hidden || total === 0 || wasReminderNotifiedThisSession()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const parts: string[] = [];
    if (needsMeetingCount > 0) parts.push(`${needsMeetingCount} öğrenci görüşme bekliyor`);
    if (overdueStudentCount > 0) parts.push(`${overdueStudentCount} öğrencide geciken ödev var`);

    new Notification('3K Koç — Takip hatırlatması', {
      body: parts.join(' · '),
      tag: 'coach-reminder',
    });
    markReminderNotifiedThisSession();
  }, [hidden, needsMeetingCount, overdueStudentCount, total]);

  const requestNotifyPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    await Notification.requestPermission();
  }, []);

  const handleSnooze = () => {
    snoozeReminders(userId, 24);
    setHidden(true);
  };

  if (hidden || total === 0) return null;

  return (
    <section className="coach-reminder-banner" aria-live="polite">
      <div className="coach-reminder-icon" aria-hidden>
        🔔
      </div>
      <div className="coach-reminder-body">
        <strong>Takip hatırlatması</strong>
        <p>
          {needsMeetingCount > 0 && (
            <button type="button" className="coach-reminder-link" onClick={onFilterNeedsMeeting}>
              {needsMeetingCount} öğrenci {COACH_MEETING_FOLLOWUP_DAYS}+ gündür görüşülmedi
            </button>
          )}
          {needsMeetingCount > 0 && overdueStudentCount > 0 && ' · '}
          {overdueStudentCount > 0 && (
            <button type="button" className="coach-reminder-link" onClick={onFilterOverdue}>
              {overdueStudentCount} öğrencide geciken ödev
            </button>
          )}
        </p>
      </div>
      <div className="coach-reminder-actions">
        {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
          <button type="button" className="coach-reminder-btn" onClick={requestNotifyPermission}>
            Bildirim aç
          </button>
        )}
        <button type="button" className="coach-reminder-btn" onClick={handleSnooze}>
          24s ertele
        </button>
      </div>
    </section>
  );
}
