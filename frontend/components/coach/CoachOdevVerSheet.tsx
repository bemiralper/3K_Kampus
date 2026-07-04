'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import KutuphaneConfirmModal from '@/components/kutuphane/KutuphaneConfirmModal';
import CoachActionSheet from '@/components/coach/CoachActionSheet';
import { AssignmentStep, ReviewStep } from '@/app/admin/odev/ver/components';
import type {
  Student,
  StudentResource,
  BookDetails,
  Content,
  Topic,
  Unit,
  SelectedContent,
  ContentTaskHistory,
} from '@/app/admin/odev/ver/types';
import {
  fetchOgrenciList,
  fetchStudentResourcesByStudent,
  fetchContentTaskHistory,
  fetchBookStructure,
  createAssignment,
  type AssignmentCreatePayload,
} from '@/lib/resources-api';

const STEPS = [
  { id: 1, label: 'İçerik', icon: '📚' },
  { id: 2, label: 'Gönder', icon: '📋' },
];

function generateWeeklyTitle(): string {
  const now = new Date();
  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ];
  const month = months[now.getMonth()];
  const day = now.getDate();
  const weekNum = Math.ceil(day / 7);
  return `${month} Ayı ${weekNum}. Hafta Ödevi`;
}

function getDefaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

function getPhotoUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return path;
}

interface CoachOdevVerSheetProps {
  studentId: number;
  studentName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CoachOdevVerSheet({
  studentId,
  studentName,
  onClose,
  onSuccess,
}: CoachOdevVerSheetProps) {
  const { user } = useAuth();
  const coachName = user ? `${user.first_name} ${user.last_name}` : '';

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [resources, setResources] = useState<StudentResource[]>([]);
  const [selectedResource, setSelectedResource] = useState<StudentResource | null>(null);
  const [bookDetails, setBookDetails] = useState<BookDetails | null>(null);
  const [cart, setCart] = useState<SelectedContent[]>([]);
  const [contentNotes, setContentNotes] = useState<Record<number, string>>({});
  const [resLoading, setResLoading] = useState(false);
  const [bookLoading, setBookLoading] = useState(false);
  const [taskHistory, setTaskHistory] = useState<ContentTaskHistory>({});

  const [title, setTitle] = useState(generateWeeklyTitle());
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(getDefaultDueDate());
  const [priority, setPriority] = useState('MEDIUM');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    (async () => {
      try {
        const result = await fetchOgrenciList();
        if (result.success && result.data) {
          const student = (result.data as Student[]).find((s) => s.id === studentId);
          if (student) {
            setSelectedStudent(student);
            setResLoading(true);
            const [resResult, histResult] = await Promise.all([
              fetchStudentResourcesByStudent(studentId),
              fetchContentTaskHistory(studentId),
            ]);
            if (resResult.success && resResult.data) {
              setResources(resResult.data as StudentResource[]);
            }
            if (histResult.success && histResult.data) {
              setTaskHistory(histResult.data as ContentTaskHistory);
            }
            setResLoading(false);
          }
        }
      } catch {
        flash('Öğrenci verileri yüklenemedi');
      }
    })();
  }, [studentId]);

  const fetchBook = async (bookId: number) => {
    setBookLoading(true);
    try {
      const result = await fetchBookStructure(bookId);
      if (result.success && result.data) {
        setBookDetails(result.data as BookDetails);
      }
    } catch {
      flash('Kitap yapısı yüklenemedi');
    }
    setBookLoading(false);
  };

  const pickResource = (r: StudentResource) => {
    setSelectedResource(r);
    fetchBook(r.resource_book);
  };

  const addContent = useCallback(
    (c: Content, t: Topic, u: Unit) => {
      if (!bookDetails || !selectedResource) return;
      if (cart.some((x) => x.id === c.id)) return;
      const item: SelectedContent = {
        id: c.id,
        contentId: c.id,
        contentName: c.name || c.ad,
        contentType: c.content_type,
        topicId: t.id,
        topicName: t.name || t.ad,
        unitId: u.id,
        unitName: u.name || u.ad,
        bookId: bookDetails.id,
        bookName: bookDetails.name || bookDetails.ad,
        lessonId: selectedResource.lesson,
        lessonName: selectedResource.lesson_name,
        questionCount: c.question_count,
        pageCount: c.page_count,
        startPage: c.start_page || c.page_start,
        endPage: c.end_page || c.page_end,
      };
      setCart((prev) => [...prev, item]);
    },
    [bookDetails, selectedResource, cart]
  );

  const removeContent = (id: number) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
    setContentNotes((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  };

  const toggleContent = useCallback(
    (c: Content, t: Topic, u: Unit) => {
      if (cart.some((x) => x.id === c.id)) removeContent(c.id);
      else addContent(c, t, u);
    },
    [cart, addContent]
  );

  const selectAllUnit = useCallback(
    (unit: Unit) => {
      if (!bookDetails || !selectedResource) return;
      const newItems: SelectedContent[] = [];
      unit.topics?.forEach((t: Topic) =>
        t.contents?.forEach((c: Content) => {
          const h = taskHistory[c.id];
          if (h?.completion_status === 'DONE') return;
          if (!cart.some((x) => x.id === c.id)) {
            newItems.push({
              id: c.id,
              contentId: c.id,
              contentName: c.name || c.ad,
              contentType: c.content_type,
              topicId: t.id,
              topicName: t.name || t.ad,
              unitId: unit.id,
              unitName: unit.name || unit.ad,
              bookId: bookDetails.id,
              bookName: bookDetails.name || bookDetails.ad,
              lessonId: selectedResource.lesson,
              lessonName: selectedResource.lesson_name,
              questionCount: c.question_count,
              pageCount: c.page_count,
              startPage: c.start_page || c.page_start,
              endPage: c.end_page || c.page_end,
            });
          }
        })
      );
      if (newItems.length) {
        setCart((prev) => [...prev, ...newItems]);
        flash(`${newItems.length} içerik eklendi`);
      }
    },
    [bookDetails, selectedResource, cart, taskHistory]
  );

  const selectAllTopic = useCallback(
    (topic: Topic, unit: Unit) => {
      if (!bookDetails || !selectedResource) return;
      const newItems: SelectedContent[] = [];
      topic.contents?.forEach((c: Content) => {
        const h = taskHistory[c.id];
        if (h?.completion_status === 'DONE') return;
        if (!cart.some((x) => x.id === c.id)) {
          newItems.push({
            id: c.id,
            contentId: c.id,
            contentName: c.name || c.ad,
            contentType: c.content_type,
            topicId: topic.id,
            topicName: topic.name || topic.ad,
            unitId: unit.id,
            unitName: unit.name || unit.ad,
            bookId: bookDetails.id,
            bookName: bookDetails.name || bookDetails.ad,
            lessonId: selectedResource.lesson,
            lessonName: selectedResource.lesson_name,
            questionCount: c.question_count,
            pageCount: c.page_count,
            startPage: c.start_page || c.page_start,
            endPage: c.end_page || c.page_end,
          });
        }
      });
      if (newItems.length) {
        setCart((prev) => [...prev, ...newItems]);
        flash(`${newItems.length} içerik eklendi`);
      }
    },
    [bookDetails, selectedResource, cart, taskHistory]
  );

  const clearCart = () => {
    setCart([]);
    setContentNotes({});
  };

  const isDirty = useMemo(
    () => cart.length > 0 || notes.trim().length > 0 || title !== generateWeeklyTitle(),
    [cart.length, notes, title]
  );

  const tryClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  const handleSave = async (status: 'PUBLISHED' | 'DRAFT') => {
    if (!selectedStudent || cart.length === 0) return;
    setSaving(true);
    const backendStatus: AssignmentCreatePayload['status'] =
      status === 'PUBLISHED' ? 'ASSIGNED' : status;
    try {
      const grouped: Record<string, SelectedContent[]> = {};
      cart.forEach((c) => {
        const k = String(c.bookId);
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push(c);
      });
      const lessons = Object.entries(grouped).map(([bookId, contents]) => {
        const first = contents[0];
        return {
          resource_book: parseInt(bookId, 10),
          topic_name: first.topicName,
          content_mode: 'TOPIC',
          notes: '',
          tasks: contents.map((c) => {
            const hist = taskHistory[c.contentId];
            const isCompletion =
              hist?.completion_status === 'PARTIAL' || hist?.completion_status === 'NOT_DONE';
            return {
              task_type:
                c.contentType === 'TEST_SET'
                  ? 'SOLVE_TEST'
                  : c.contentType === 'PAGE_RANGE'
                    ? 'SOLVE_PDF'
                    : c.contentType === 'VIDEO'
                      ? 'WATCH_VIDEO'
                      : 'REVIEW_TOPIC',
              title: c.contentName,
              description: contentNotes[c.id] || '',
              content_id: c.contentId,
              question_count: c.questionCount || null,
              page_count:
                c.pageCount ||
                (c.startPage && c.endPage ? c.endPage - c.startPage + 1 : null),
              is_required: true,
              is_completion_task: isCompletion,
              previous_task_completion_percent: isCompletion
                ? (hist?.task_completion_percent ?? 0)
                : null,
              previous_assignment_title: isCompletion ? (hist?.assignment_title ?? '') : '',
            };
          }),
        };
      });

      const body: AssignmentCreatePayload = {
        student: selectedStudent.id,
        title: title || generateWeeklyTitle(),
        description: notes,
        priority,
        due_date: dueDate || getDefaultDueDate(),
        status: backendStatus,
        lessons,
      };

      const result = await createAssignment(body);
      if (result.success) {
        onSuccess?.();
        onClose();
      } else {
        flash('Ödev kaydedilemedi');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
      flash('Ödev kaydedilemedi: ' + msg);
    }
    setSaving(false);
  };

  const canGoToStep = (step: number): boolean => {
    if (step === 1) return true;
    if (step === 2) return cart.length > 0;
    return false;
  };

  const goToStep = (step: number) => {
    if (canGoToStep(step)) setCurrentStep(step);
  };

  const isContentSelected = (id: number) => cart.some((c) => c.id === id);

  const footer = (
    <>
      {currentStep > 1 && (
        <button
          type="button"
          className="coach-btn coach-btn-secondary"
          onClick={() => setCurrentStep(currentStep - 1)}
        >
          ← Geri
        </button>
      )}
      {currentStep < 2 ? (
        <button
          type="button"
          className="coach-btn coach-btn-primary"
          disabled={!canGoToStep(2)}
          onClick={() => goToStep(2)}
        >
          İleri →
        </button>
      ) : (
        <>
          <button
            type="button"
            className="coach-btn coach-btn-secondary"
            disabled={saving}
            onClick={() => handleSave('DRAFT')}
          >
            Taslak
          </button>
          <button
            type="button"
            className="coach-btn coach-btn-primary"
            disabled={saving || cart.length === 0}
            onClick={() => handleSave('PUBLISHED')}
          >
            {saving ? 'Gönderiliyor…' : 'Gönder'}
          </button>
        </>
      )}
    </>
  );

  return (
    <>
      <CoachActionSheet
        title="Ödev Ver"
        subtitle="Öğrenciye ödev içeriği seçin ve gönderin"
        studentName={studentName}
        onClose={tryClose}
        size="full"
        footer={footer}
      >
        {toast && (
          <div className="coach-sheet-toast" role="status">
            {toast}
          </div>
        )}

        <div className="coach-sheet-steps">
          {STEPS.map((step) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            const canGo = canGoToStep(step.id);
            return (
              <button
                key={step.id}
                type="button"
                className={`coach-sheet-step${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}`}
                disabled={!canGo}
                onClick={() => goToStep(step.id)}
              >
                <span>{isCompleted ? '✓' : step.icon}</span>
                {step.label}
              </button>
            );
          })}
        </div>

        {currentStep === 1 && selectedStudent && (
          <AssignmentStep
            resources={resources}
            selectedResource={selectedResource}
            bookDetails={bookDetails}
            cart={cart}
            contentNotes={contentNotes}
            resLoading={resLoading}
            bookLoading={bookLoading}
            taskHistory={taskHistory}
            onPickResource={pickResource}
            onToggleContent={toggleContent}
            onSelectAllUnit={selectAllUnit}
            onSelectAllTopic={selectAllTopic}
            onRemoveContent={removeContent}
            onClearCart={clearCart}
            onNoteChange={(id: number, v: string) =>
              setContentNotes((p) => ({ ...p, [id]: v }))
            }
            isSelected={isContentSelected}
          />
        )}

        {currentStep === 2 && selectedStudent && (
          <ReviewStep
            student={selectedStudent}
            selectedStudents={[selectedStudent]}
            cart={cart}
            contentNotes={contentNotes}
            title={title}
            notes={notes}
            dueDate={dueDate}
            priority={priority}
            coachName={coachName}
            saving={saving}
            taskHistory={taskHistory}
            onTitleChange={setTitle}
            onNotesChange={setNotes}
            onDueDateChange={setDueDate}
            onPriorityChange={setPriority}
            onRemove={removeContent}
            onSave={handleSave}
            onPrint={() => undefined}
            getPhotoUrl={getPhotoUrl}
          />
        )}
      </CoachActionSheet>

      <KutuphaneConfirmModal
        open={showDiscardConfirm}
        title="Ödevden çık"
        message="Seçtiğiniz içerikler kaybolabilir. Çıkmak istediğinize emin misiniz?"
        confirmLabel="Çık"
        cancelLabel="Devam et"
        tone="warning"
        onConfirm={() => {
          setShowDiscardConfirm(false);
          onClose();
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </>
  );
}
