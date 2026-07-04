'use client';

import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import type { SelectedContent, ContentTaskHistory } from '../types';
import { useVectorPrint } from '@/lib/useVectorPrint';
import AssignmentNotifySendModal from '@/components/odev/AssignmentNotifySendModal';
import OdevPlanDocument from '@/components/odev/OdevPlanDocument';
import type { PlanLessonGroup, PlanContentItemView } from '@/components/odev/odevPlanTypes';

interface PrintPreviewProps {
  studentName: string;
  studentPhoto?: string;
  coachName: string;
  title: string;
  notes: string;
  dueDate: string;
  items: SelectedContent[];
  contentNotes: Record<number, string>;
  taskHistory?: ContentTaskHistory;
  assignmentId?: number;
  onClose: () => void;
}

export default function PrintPreview({
  studentName, studentPhoto, coachName, title, notes, dueDate, items, contentNotes, taskHistory = {}, assignmentId, onClose,
}: PrintPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  /* ─── Escape key ile modal kapat ─── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const todayStr = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const dueStr = dueDate
    ? new Date(dueDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  /* ─── Gruplama: Ders → Kitap → Konu ─── */
  const cartGroups: PlanLessonGroup[] = useMemo(() => {
    const map = new Map<number, PlanLessonGroup>();
    items.forEach(item => {
      if (!map.has(item.lessonId)) {
        map.set(item.lessonId, {
          lessonId: item.lessonId, lessonName: item.lessonName,
          books: [], totalQuestions: 0, totalPages: 0,
        });
      }
      const lesson = map.get(item.lessonId)!;
      lesson.totalQuestions += item.questionCount || 0;
      lesson.totalPages += item.pageCount || 0;

      let bookGrp = lesson.books.find(b => b.bookId === item.bookId);
      if (!bookGrp) {
        bookGrp = { bookId: item.bookId, bookName: item.bookName, topics: [] };
        lesson.books.push(bookGrp);
      }

      let topicGrp = bookGrp.topics.find(t => t.topicId === item.topicId);
      if (!topicGrp) {
        topicGrp = { topicId: item.topicId, topicName: item.topicName, items: [] };
        bookGrp.topics.push(topicGrp);
      }
      const content: PlanContentItemView = {
        id: item.id,
        contentId: item.contentId,
        contentName: item.contentName,
        contentType: item.contentType,
        questionCount: item.questionCount || 0,
        pageCount: item.pageCount || 0,
      };
      topicGrp.items.push({
        content,
        note: contentNotes[item.id] || '',
      });
    });
    return Array.from(map.values());
  }, [items, contentNotes]);

  const totalQ = items.reduce((s, c) => s + (c.questionCount || 0), 0);
  const totalP = items.reduce((s, c) => s + (c.pageCount || 0), 0);
  const itemCount = items.length;

  const [pdfBusy, setPdfBusy] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendToast, setSendToast] = useState<string | null>(null);

  const { print: printVector } = useVectorPrint({
    title: `Ödev - ${title || 'plan'} - ${studentName}`,
    orientation: 'portrait',
    marginMm: '10mm 12mm',
    externalRef: printRef as React.RefObject<HTMLDivElement>,
  });

  const handlePDFA4 = useCallback(async () => {
    setPdfBusy(true);
    try {
      await printVector();
    } finally {
      setPdfBusy(false);
    }
  }, [printVector]);

  const handleDownload = handlePDFA4;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '20px', overflowY: 'auto',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, maxWidth: 840, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', marginBottom: 40,
      }}>
        {/* ── Toolbar ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 24px', borderBottom: '1px solid #e4e9f2',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1, borderRadius: '16px 16px 0 0',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#172b4c' }}>Yazdırma Önizleme</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePDFA4} disabled={pdfBusy} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: pdfBusy ? '#93c5fd' : '#0061a6', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: pdfBusy ? 'not-allowed' : 'pointer',
            }}>{pdfBusy ? '⏳ Hazırlanıyor...' : '🖨️ PDF Önizle'}</button>
            <button onClick={handleDownload} disabled={pdfBusy} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: '1px solid #0061a6',
              background: '#fff', color: '#0061a6', fontSize: 12, fontWeight: 600,
              cursor: pdfBusy ? 'not-allowed' : 'pointer',
            }}>⬇️ İndir</button>
            <button
              onClick={() => assignmentId ? setShowSendModal(true) : setSendToast('Önce ödevi kaydedin')}
              disabled={!assignmentId}
              title={assignmentId ? 'Veli ve öğrenciye WhatsApp ile gönder' : 'Ödev kaydedildikten sonra gönderilebilir'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: '1px solid #6ee7b7',
                background: assignmentId ? '#ecfdf5' : '#f1f5f9',
                color: assignmentId ? '#047857' : '#94a3b8',
                fontSize: 12, fontWeight: 600,
                cursor: assignmentId ? 'pointer' : 'not-allowed',
              }}
            >📱 Gönder</button>
            <button onClick={onClose} style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #e4e9f2',
              background: '#fff', color: '#8c98a4', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            }}>✕</button>
          </div>
        </div>

        <OdevPlanDocument
          ref={printRef}
          studentName={studentName}
          studentPhoto={studentPhoto}
          coachName={coachName}
          title={title}
          notes={notes}
          assignedDateStr={todayStr}
          dueDateStr={dueStr}
          cartGroups={cartGroups}
          itemCount={itemCount}
          totalQuestions={totalQ}
          totalPages={totalP}
          taskHistory={taskHistory}
        />
      </div>

      {sendToast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 4000,
          background: sendToast.includes("kaydedin") ? "#b45309" : "#059669",
          color: "#fff", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
        }}>
          {sendToast}
        </div>
      )}

      {showSendModal && assignmentId && (
        <AssignmentNotifySendModal
          assignmentId={assignmentId}
          notifyType="plan"
          studentName={studentName}
          onClose={() => setShowSendModal(false)}
          onSent={(sent) => {
            setSendToast(`${sent} kişiye WhatsApp ile gönderildi`);
            setTimeout(() => setSendToast(null), 4000);
          }}
        />
      )}

    </div>
  );
}
