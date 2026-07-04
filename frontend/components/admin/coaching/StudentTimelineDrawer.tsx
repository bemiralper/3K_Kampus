'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchStudentTimeline, type StudentTimeline } from '@/lib/coaching-api';

interface StudentTimelineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: number | null;
}

// Risk Level Badge
function RiskBadge({ level, score }: { level: string; score: number }) {
  const colorMap: Record<string, { bg: string; text: string; label: string }> = {
    HIGH: { bg: '#fef2f2', text: '#dc2626', label: 'Yüksek Risk' },
    MEDIUM: { bg: '#fefce8', text: '#ca8a04', label: 'Orta Risk' },
    LOW: { bg: '#f0fdf4', text: '#16a34a', label: 'Düşük Risk' },
  };

  const style = colorMap[level] || colorMap.LOW;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: style.bg,
        borderRadius: '8px',
      }}
    >
      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          backgroundColor: style.text,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '16px',
        }}
      >
        {score}
      </div>
      <div>
        <div style={{ fontWeight: 600, color: style.text }}>{style.label}</div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>Risk Skoru: {score}/100</div>
      </div>
    </div>
  );
}

// Event Type Icon
function EventTypeIcon({ type }: { type: string }) {
  const icons: Record<string, { icon: string; color: string }> = {
    MEETING: { icon: '📞', color: '#3b82f6' },
    FOLLOWUP: { icon: '🔄', color: '#8b5cf6' },
    NOTE: { icon: '📝', color: '#6b7280' },
    PLAN: { icon: '📋', color: '#22c55e' },
    RISK: { icon: '⚠️', color: '#ef4444' },
  };

  const config = icons[type] || { icon: '📌', color: '#6b7280' };

  return (
    <div
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        backgroundColor: `${config.color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
        flexShrink: 0,
      }}
    >
      {config.icon}
    </div>
  );
}

// Status Badge
function StatusBadge({ status, display }: { status: string; display: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    PENDING: { bg: '#fef3c7', text: '#d97706' },
    COMPLETED: { bg: '#dcfce7', text: '#16a34a' },
    CANCELLED: { bg: '#fee2e2', text: '#dc2626' },
    IN_PROGRESS: { bg: '#dbeafe', text: '#2563eb' },
  };

  const style = colors[status] || colors.PENDING;

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: '4px',
        backgroundColor: style.bg,
        color: style.text,
        fontSize: '11px',
        fontWeight: 500,
      }}
    >
      {display}
    </span>
  );
}

// Timeline Item
function TimelineItem({
  event,
  isLast,
}: {
  event: StudentTimeline['timeline'][0];
  isLast: boolean;
}) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={{ display: 'flex', gap: '12px' }}>
      {/* Timeline Line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <EventTypeIcon type={event.event_type} />
        {!isLast && (
          <div
            style={{
              width: '2px',
              flex: 1,
              backgroundColor: '#e5e7eb',
              minHeight: '20px',
            }}
          />
        )}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          paddingBottom: isLast ? 0 : '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontWeight: 500, color: '#1f2937', fontSize: '14px' }}>
            {event.baslik || event.event_type_display}
          </span>
          <StatusBadge status={event.durum} display={event.durum_display} />
          {event.is_auto && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: '#f3e8ff',
                color: '#9333ea',
                fontSize: '10px',
                fontWeight: 500,
              }}
            >
              🤖 Auto
            </span>
          )}
        </div>

        {event.aciklama && (
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 8px', lineHeight: 1.5 }}>
            {event.aciklama}
          </p>
        )}

        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#9ca3af' }}>
          {event.planned_date && (
            <span>📅 Planlanan: {formatDate(event.planned_date)}</span>
          )}
          {event.completed_date && (
            <span>✅ Tamamlanan: {formatDate(event.completed_date)}</span>
          )}
          {!event.planned_date && !event.completed_date && (
            <span>🕒 Oluşturulma: {formatDate(event.created_at)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StudentTimelineDrawer({
  isOpen,
  onClose,
  studentId,
}: StudentTimelineDrawerProps) {
  const [data, setData] = useState<StudentTimeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!studentId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetchStudentTimeline(studentId);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Timeline yüklenemedi');
      }
    } catch (err) {
      setError('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (isOpen && studentId) {
      loadData();
    }
  }, [isOpen, studentId, loadData]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '480px',
          height: '100%',
          backgroundColor: '#fff',
          boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#fff' }}>
              📚 Coaching Timeline
            </h2>
            {data && (
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                {data.student.ad} {data.student.soyad}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
              <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
              Yükleniyor...
            </div>
          ) : error ? (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '16px',
                color: '#dc2626',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          ) : data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Assignment Info */}
              {data.assignment ? (
                <div
                  style={{
                    backgroundColor: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: '8px',
                    padding: '16px',
                  }}
                >
                  <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Atanmış Koç</div>
                  <div style={{ fontWeight: 600, color: '#0369a1', fontSize: '16px' }}>
                    👨‍🏫 {data.assignment.coach_name}
                  </div>
                  {data.assignment.baslangic_tarihi && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                      Başlangıç: {new Date(data.assignment.baslangic_tarihi).toLocaleDateString('tr-TR')}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: '#fef3c7',
                    border: '1px solid #fde047',
                    borderRadius: '8px',
                    padding: '16px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '8px' }}>👤</div>
                  <div style={{ fontSize: '14px', color: '#92400e' }}>Bu öğrenciye henüz koç atanmamış.</div>
                </div>
              )}

              {/* Risk Info */}
              {data.risk && <RiskBadge level={data.risk.level} score={data.risk.score} />}

              {/* Risk Reasons */}
              {data.risk && data.risk.reasons.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>
                    Risk Nedenleri
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {data.risk.reasons.map((reason, i) => (
                      <span
                        key={i}
                        style={{
                          display: 'inline-block',
                          padding: '6px 10px',
                          backgroundColor: '#fef2f2',
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: '#991b1b',
                        }}
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '16px' }}>
                  Coaching Geçmişi ({data.timeline.length} etkinlik)
                </h3>

                {data.timeline.length === 0 ? (
                  <div
                    style={{
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                      padding: '32px',
                      textAlign: 'center',
                      color: '#6b7280',
                    }}
                  >
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>📭</div>
                    Henüz coaching etkinliği bulunmuyor.
                  </div>
                ) : (
                  <div>
                    {data.timeline.map((event, index) => (
                      <TimelineItem
                        key={event.id}
                        event={event}
                        isLast={index === data.timeline.length - 1}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
