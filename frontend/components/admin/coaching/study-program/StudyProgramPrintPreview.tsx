'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { ProgramBlock, WeeklyProgram } from '@/lib/study-program-api';
import { downloadStudyProgramPdf } from '@/lib/study-program-api';
import { useVectorPrint } from '@/lib/useVectorPrint';
import StudyProgramDocument from './StudyProgramDocument';
import StudyProgramNotifySendModal from './StudyProgramNotifySendModal';

interface StudyProgramPrintPreviewProps {
  program: WeeklyProgram;
  onClose: () => void;
  onEditBlock: (block: ProgramBlock) => void;
  onSaveNote: (note: string) => Promise<boolean>;
}

export default function StudyProgramPrintPreview({
  program,
  onClose,
  onEditBlock,
  onSaveNote,
}: StudyProgramPrintPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [note, setNote] = useState(program.coach_note || '');
  const [noteSaving, setNoteSaving] = useState(false);
  const [showNotify, setShowNotify] = useState(false);
  const [sendToast, setSendToast] = useState<string | null>(null);
  const noteDirty = note !== (program.coach_note || '');

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

  useEffect(() => {
    setNote(program.coach_note || '');
  }, [program.id]);

  const savedNote = program.coach_note || '';
  const previewProgram = note === savedNote ? program : { ...program, coach_note: note };

  const persistNote = useCallback(async () => {
    if (note === savedNote) return true;
    return onSaveNote(note);
  }, [note, onSaveNote, savedNote]);

  const handlePrint = useCallback(async () => {
    setPrintBusy(true);
    try {
      await printVector();
    } finally {
      setPrintBusy(false);
    }
  }, [printVector]);

  const handleDownload = useCallback(async () => {
    setDownloadBusy(true);
    setSendToast(null);
    try {
      const saved = await persistNote();
      if (!saved) throw new Error('Koç notu kaydedilemedi');
      const safeName = (program.student_name || 'ogrenci').replace(/\s+/g, '-');
      await downloadStudyProgramPdf(program.id, `calisma-programi-${safeName}.pdf`);
      setSendToast('PDF indirildi');
      setTimeout(() => setSendToast(null), 3000);
    } catch (err) {
      setSendToast(err instanceof Error ? err.message : 'PDF indirilemedi');
      setTimeout(() => setSendToast(null), 4000);
    } finally {
      setDownloadBusy(false);
    }
  }, [persistNote, program.id, program.student_name]);

  const handleSave = useCallback(async () => {
    setNoteSaving(true);
    try {
      const ok = await onSaveNote(note);
      setSendToast(ok ? (noteDirty ? 'Program kaydedildi' : 'Program zaten kayıtlı') : 'Kaydedilemedi');
      setTimeout(() => setSendToast(null), 3000);
    } finally {
      setNoteSaving(false);
    }
  }, [note, noteDirty, onSaveNote]);

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
            Program önizleme
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={noteSaving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: noteSaving ? '#94a3b8' : '#0f172a',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: noteSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {noteSaving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={printBusy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#334155',
                fontSize: 12,
                fontWeight: 600,
                cursor: printBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {printBusy ? 'Hazırlanıyor…' : '🖨️ Yazdır'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloadBusy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: downloadBusy ? '#93c5fd' : '#0061a6',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: downloadBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {downloadBusy ? 'İndiriliyor…' : 'İndir'}
            </button>
            <button
              type="button"
              onClick={async () => {
                const saved = await persistNote();
                if (!saved) {
                  setSendToast('Koç notu kaydedilemedi');
                  setTimeout(() => setSendToast(null), 3000);
                  return;
                }
                setShowNotify(true);
              }}
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

        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '10px 24px',
          borderBottom: '1px solid #e4e9f2',
          background: '#f8fafc',
        }}>
          <label htmlFor="preview-week-note" style={{ fontSize: 12, fontWeight: 700, color: '#334155', flexShrink: 0 }}>
            Koç notu
          </label>
          <input
            id="preview-week-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="PDF ve WhatsApp belgesinde görünen haftalık not"
            style={{
              flex: 1,
              minWidth: 0,
              height: 34,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: 13,
            }}
          />
        </div>

        <StudyProgramDocument ref={printRef} program={previewProgram} onEditBlock={onEditBlock} />
      </div>

      {sendToast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 4000,
          background: /indirilemedi|Kaydedilemedi/i.test(sendToast) ? '#b45309' : '#059669',
          color: '#fff', padding: '10px 16px',
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
