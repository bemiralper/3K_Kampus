'use client';

import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import type { SelectedContent, ContentTaskHistory } from '../types';
import { useVectorPrint } from '@/lib/useVectorPrint';
import AssignmentNotifySendModal from '@/components/odev/AssignmentNotifySendModal';
import OdevPlanDocument from '@/components/odev/OdevPlanDocument';
import { buildPlanGroupsFromSelected } from '@/components/odev/odevPlanTypes';
import { formatDateTRLong, formatNowTRLong } from '@/lib/format-date';

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
  /** Kayıt yoksa önce kaydedip WhatsApp modalını açar */
  onRequestSaveAndSend?: () => void | Promise<void>;
  /** WhatsApp gönderim penceresi kapanınca (gönderildi / iptal) */
  onNotifyClose?: () => void;
  sendBusy?: boolean;
  onClose: () => void;
}

export default function PrintPreview({
  studentName, studentPhoto, coachName, title, notes, dueDate, items, contentNotes, taskHistory = {},
  assignmentId, onRequestSaveAndSend, onNotifyClose, sendBusy = false, onClose,
}: PrintPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  /* ─── Escape key ile modal kapat ─── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const todayStr = formatNowTRLong();
  const dueStr = dueDate ? formatDateTRLong(dueDate) : '';

  /* ─── Gruplama: Ders → Kitap → Ünite → Konu → Test ─── */
  const cartGroups = useMemo(
    () => buildPlanGroupsFromSelected(items, contentNotes),
    [items, contentNotes],
  );

  const totalQ = items.reduce((s, c) => s + (c.questionCount || 0), 0);
  const totalP = items.reduce((s, c) => s + (c.pageCount || 0), 0);
  const itemCount = items.length;

  const [pdfBusy, setPdfBusy] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendToast, setSendToast] = useState<string | null>(null);

  const { print: printVector } = useVectorPrint({
    title: `Ödev - ${title || 'plan'} - ${studentName}`,
    orientation: 'portrait',
    marginMm: '6mm 6mm',
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
              type="button"
              onClick={async () => {
                if (assignmentId) {
                  setShowSendModal(true);
                  return;
                }
                if (onRequestSaveAndSend) {
                  await onRequestSaveAndSend();
                  return;
                }
                setSendToast('Önce ödevi kaydedin');
                setTimeout(() => setSendToast(null), 3000);
              }}
              disabled={sendBusy}
              title="Veli ve öğrenciye ödev planı PDF'ini WhatsApp ile gönder"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: '1px solid #6ee7b7',
                background: sendBusy ? '#f1f5f9' : '#ecfdf5',
                color: sendBusy ? '#94a3b8' : '#047857',
                fontSize: 12, fontWeight: 600,
                cursor: sendBusy ? 'not-allowed' : 'pointer',
              }}
            >{sendBusy ? '⏳ Kaydediliyor…' : '📱 WhatsApp Gönder'}</button>
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
          onClose={() => {
            setShowSendModal(false);
            onNotifyClose?.();
          }}
          onSent={(sent) => {
            setSendToast(`${sent} kişiye WhatsApp ile gönderildi`);
            setTimeout(() => setSendToast(null), 4000);
          }}
        />
      )}

    </div>
  );
}
