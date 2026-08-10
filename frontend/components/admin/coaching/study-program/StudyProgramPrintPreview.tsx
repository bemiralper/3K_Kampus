'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { WeeklyProgram } from '@/lib/study-program-api';
import { useVectorPrint } from '@/lib/useVectorPrint';
import StudyProgramDocument from './StudyProgramDocument';
import StudyProgramNotifySendModal from './StudyProgramNotifySendModal';

interface StudyProgramPrintPreviewProps {
  program: WeeklyProgram;
  onClose: () => void;
}

export default function StudyProgramPrintPreview({ program, onClose }: StudyProgramPrintPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showNotify, setShowNotify] = useState(false);
  const [sendToast, setSendToast] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const { print: printVector } = useVectorPrint({
    title: `Çalışma Programı - ${program.student_name}`,
    orientation: 'portrait',
    marginMm: '6mm 6mm',
    externalRef: printRef as React.RefObject<HTMLDivElement>,
  });

  const handlePDF = useCallback(async () => {
    setPdfBusy(true);
    try {
      await printVector();
    } finally {
      setPdfBusy(false);
    }
  }, [printVector]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 20,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          maxWidth: 840,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          marginBottom: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 24px',
            borderBottom: '1px solid #e4e9f2',
            position: 'sticky',
            top: 0,
            background: '#fff',
            zIndex: 1,
            borderRadius: '16px 16px 0 0',
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#172b4c' }}>
            Yazdırma Önizleme
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handlePDF}
              disabled={pdfBusy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: pdfBusy ? '#93c5fd' : '#0061a6',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: pdfBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {pdfBusy ? '⏳ Hazırlanıyor...' : '🖨️ PDF Önizle'}
            </button>
            <button
              type="button"
              onClick={handlePDF}
              disabled={pdfBusy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #0061a6',
                background: '#fff',
                color: '#0061a6',
                fontSize: 12,
                fontWeight: 600,
                cursor: pdfBusy ? 'not-allowed' : 'pointer',
              }}
            >
              ⬇️ İndir
            </button>
            <button
              type="button"
              onClick={() => setShowNotify(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #25d366',
                background: '#ecfdf5',
                color: '#047857',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              WhatsApp ile gönder
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #e4e9f2',
                background: '#fff',
                color: '#8c98a4',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <StudyProgramDocument ref={printRef} program={program} />
      </div>

      {sendToast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 4000,
          background: '#059669', color: '#fff', padding: '10px 16px',
          borderRadius: 8, fontSize: 13, fontWeight: 600,
        }}>
          {sendToast}
        </div>
      )}

      {showNotify && (
        <StudyProgramNotifySendModal
          programId={program.id}
          studentName={program.student_name}
          onClose={() => setShowNotify(false)}
          onSent={(sent) => {
            setShowNotify(false);
            setSendToast(`${sent} kişiye WhatsApp ile gönderildi`);
            setTimeout(() => setSendToast(null), 4000);
          }}
        />
      )}
    </div>
  );
}
