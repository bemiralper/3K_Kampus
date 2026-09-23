'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, Modal, Spin, message } from 'antd';
import type { ClassLessonPlanClassroom } from '@/lib/academic-api';
import {
  previewScheduleNotify,
  previewTeacherScheduleNotify,
  sendScheduleNotify,
  sendTeacherScheduleNotify,
  type ScheduleNotifyClassPreview,
  type ScheduleNotifyRecipient,
  type TeacherScheduleNotifyPreview,
} from '@/lib/schedule-notify-api';

type Mode = 'class' | 'teacher';

type Props = {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  termId: number | null;
  currentClassroomId?: number | null;
  classrooms?: ClassLessonPlanClassroom[];
  teacherId?: number | null;
  teacherIds?: number[];
  teacherName?: string;
};

const EMPTY_CLASSROOMS: ClassLessonPlanClassroom[] = [];

export default function GoruntulemeNotifyModal({
  open,
  onClose,
  mode,
  termId,
  currentClassroomId,
  classrooms = EMPTY_CLASSROOMS,
  teacherId,
  teacherIds,
  teacherName,
}: Props) {
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [sendVeli, setSendVeli] = useState(true);
  const [sendOgrenci, setSendOgrenci] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<ScheduleNotifyClassPreview[] | null>(null);
  const [teacherPreview, setTeacherPreview] = useState<TeacherScheduleNotifyPreview[] | null>(null);
  const [excludedStudents, setExcludedStudents] = useState<Set<number>>(new Set());
  const [excludedVeliler, setExcludedVeliler] = useState<Set<number>>(new Set());
  const [excludedTeachers, setExcludedTeachers] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'compose' | 'running' | 'done'>('compose');
  const [outcomes, setOutcomes] = useState<ScheduleNotifyRecipient[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [resultFilter, setResultFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const stopRef = useRef(false);

  const allTeacherIds = useMemo(() => {
    if (teacherIds?.length) return teacherIds;
    return teacherId ? [teacherId] : [];
  }, [teacherId, teacherIds]);

  const classroomOptions = useMemo(
    () => classrooms.map((c) => ({ id: c.id, label: `${c.ad}${c.alan_ad ? ` · ${c.alan_ad}` : ''}` })),
    [classrooms],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedClassIds(currentClassroomId ? [currentClassroomId] : classrooms.map((c) => c.id));
    setSendVeli(true);
    setSendOgrenci(true);
    setPreview(null);
    setTeacherPreview(null);
    setExcludedStudents(new Set());
    setExcludedVeliler(new Set());
    setExcludedTeachers(new Set());
    setQuery('');
    setError(null);
    setStep('compose');
    setOutcomes([]);
    setProgress({ done: 0, total: 0, label: '' });
    setResultFilter('all');
    stopRef.current = false;
  }, [open, currentClassroomId, classrooms]);

  useEffect(() => {
    if (!open || !termId) return;
    if (mode === 'teacher' && !allTeacherIds.length) return;
    if (mode === 'class' && !selectedClassIds.length) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        if (mode === 'teacher') {
          const res = await previewTeacherScheduleNotify({
            term_id: termId,
            teacher_ids: allTeacherIds,
          });
          if (cancelled) return;
          setTeacherPreview(res.teachers);
          setExcludedTeachers(new Set(res.teachers.filter((t) => !t.default_selected).map((t) => t.teacher_id)));
        } else {
          const res = await previewScheduleNotify({
            term_id: termId,
            sinif_ids: selectedClassIds,
          });
          if (cancelled) return;
          setPreview(res.classes);
          setExcludedStudents(new Set());
          setExcludedVeliler(new Set());
        }
      } catch (err) {
        if (cancelled) return;
        setPreview(null);
        setTeacherPreview(null);
        setError(err instanceof Error ? err.message : 'Liste alınamadı');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, termId, mode, selectedClassIds, allTeacherIds]);

  const toggleSet = (setter: (fn: (prev: Set<number>) => Set<number>) => void, id: number) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleClass = (id: number) => {
    setSelectedClassIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const pushOutcomes = (rows: ScheduleNotifyRecipient[]) => {
    setOutcomes((prev) => [...prev, ...rows]);
  };

  const runSend = async () => {
    if (!termId) return;
    setError(null);
    stopRef.current = false;

    if (mode === 'teacher') {
      const include = (teacherPreview || []).filter(
        (t) => !excludedTeachers.has(t.teacher_id) && !t.empty_grid && t.has_phone,
      );
      if (!include.length) {
        message.warning('Gönderilecek öğretmen yok.');
        return;
      }
      const batchId = crypto.randomUUID();
      setSending(true);
      setStep('running');
      setOutcomes([]);
      setProgress({ done: 0, total: include.length, label: include[0].teacher_name });
      let finishedTeachers = 0;
      for (let i = 0; i < include.length; i += 1) {
        if (stopRef.current) break;
        const teacher = include[i];
        setProgress({ done: i, total: include.length, label: teacher.teacher_name });
        try {
          const res = await sendTeacherScheduleNotify({
            term_id: termId,
            teacher_ids: [teacher.teacher_id],
            include_teacher_ids: [teacher.teacher_id],
            batch_id: batchId,
          });
          const row = res.results[0];
          pushOutcomes(
            row?.recipients?.length
              ? row.recipients
              : [{
                kind: 'ogretmen',
                id: teacher.teacher_id,
                name: teacher.teacher_name,
                phone: teacher.phone,
                status: row?.status === 'sent' ? 'sent' : 'failed',
                error: row?.errors?.[0] || '',
                sinif_ad: '',
              }],
          );
        } catch (err) {
          pushOutcomes([{
            kind: 'ogretmen',
            id: teacher.teacher_id,
            name: teacher.teacher_name,
            phone: teacher.phone,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Gönderim başarısız',
            sinif_ad: '',
          }]);
        }
        finishedTeachers = i + 1;
      }
      setProgress({ done: finishedTeachers, total: include.length, label: '' });
      setStep('done');
      setSending(false);
      return;
    }

    if (!sendVeli && !sendOgrenci) {
      message.warning('Öğrenci veya veli seçin.');
      return;
    }
    if (!preview?.length) {
      message.warning('Gönderilecek sınıf yok.');
      return;
    }
    const selected = new Set(selectedClassIds);
    const toSend = preview.filter((c) => selected.has(c.sinif_id) && !c.empty_grid);
    if (!toSend.length) {
      message.warning(
        preview.some((c) => selected.has(c.sinif_id) && c.empty_grid)
          ? 'Seçili sınıfın ders programı boş.'
          : 'Gönderilecek sınıf yok.',
      );
      return;
    }
    const sendTo: Array<'veli' | 'ogrenci'> = [];
    if (sendVeli) sendTo.push('veli');
    if (sendOgrenci) sendTo.push('ogrenci');
    const batchId = crypto.randomUUID();
    setSending(true);
    setStep('running');
    setOutcomes([]);
    setProgress({ done: 0, total: toSend.length, label: toSend[0].sinif_ad });
    let finishedClasses = 0;
    for (let i = 0; i < toSend.length; i += 1) {
      if (stopRef.current) break;
      finishedClasses = i + 1;
      const cls = toSend[i];
      setProgress({ done: i, total: toSend.length, label: cls.sinif_ad });
      const includeStudents = sendOgrenci
        ? (cls.students || []).filter((s) => s.has_phone && !excludedStudents.has(s.id)).map((s) => s.id)
        : [];
      const includeVeliler = sendVeli
        ? (cls.veliler || []).filter((v) => v.has_phone && !excludedVeliler.has(v.id)).map((v) => v.id)
        : [];
      if ((sendOgrenci && !includeStudents.length) && (sendVeli && !includeVeliler.length)) {
        pushOutcomes([{
          kind: 'sinif',
          id: cls.sinif_id,
          name: cls.sinif_ad,
          phone: '',
          status: 'skipped',
          error: 'Seçili alıcı yok',
          sinif_ad: cls.sinif_ad,
        }]);
        continue;
      }
      if (sendOgrenci && !sendVeli && !includeStudents.length) {
        pushOutcomes([{
          kind: 'sinif',
          id: cls.sinif_id,
          name: cls.sinif_ad,
          phone: '',
          status: 'skipped',
          error: 'Seçili öğrenci yok',
          sinif_ad: cls.sinif_ad,
        }]);
        continue;
      }
      if (sendVeli && !sendOgrenci && !includeVeliler.length) {
        pushOutcomes([{
          kind: 'sinif',
          id: cls.sinif_id,
          name: cls.sinif_ad,
          phone: '',
          status: 'skipped',
          error: 'Seçili veli yok',
          sinif_ad: cls.sinif_ad,
        }]);
        continue;
      }
      try {
        const res = await sendScheduleNotify({
          term_id: termId,
          sinif_ids: [cls.sinif_id],
          force_unchanged_ids: cls.has_changes ? [] : [cls.sinif_id],
          send_to: sendTo,
          include_ogrenci_ids: sendOgrenci ? includeStudents : undefined,
          include_veli_ids: sendVeli ? includeVeliler : undefined,
          batch_id: batchId,
        });
        const row = res.results[0];
        pushOutcomes(
          row?.recipients?.length
            ? row.recipients
            : [{
              kind: 'sinif',
              id: cls.sinif_id,
              name: cls.sinif_ad,
              phone: '',
              status: row?.status === 'sent' || row?.status === 'partial' ? 'sent' : 'failed',
              error: row?.errors?.[0] || row?.reason || '',
              sinif_ad: cls.sinif_ad,
            }],
        );
      } catch (err) {
        pushOutcomes([{
          kind: 'sinif',
          id: cls.sinif_id,
          name: cls.sinif_ad,
          phone: '',
          status: 'failed',
          error: err instanceof Error ? err.message : 'Gönderim başarısız',
          sinif_ad: cls.sinif_ad,
        }]);
      }
    }
    setProgress({ done: finishedClasses, total: toSend.length, label: '' });
    setStep('done');
    setSending(false);
  };

  const q = query.trim().toLocaleLowerCase('tr');
  const awaitingPreview = Boolean(
    open
      && !error
      && (loading || (mode === 'teacher' ? !teacherPreview : !preview)),
  );

  const teacherRows = (teacherPreview || [])
    .filter((t) => !q || t.teacher_name.toLocaleLowerCase('tr').includes(q) || t.phone.includes(q))
    .sort((a, b) => {
      if (teacherId && a.teacher_id === teacherId) return -1;
      if (teacherId && b.teacher_id === teacherId) return 1;
      return a.teacher_name.localeCompare(b.teacher_name, 'tr');
    });

  const selectedTeacherCount = (teacherPreview || []).filter(
    (t) => !excludedTeachers.has(t.teacher_id) && !t.empty_grid && t.has_phone,
  ).length;
  const unavailableTeacherIds = useMemo(
    () => new Set(
      (teacherPreview || [])
        .filter((t) => t.empty_grid || !t.has_phone)
        .map((t) => t.teacher_id),
    ),
    [teacherPreview],
  );

  const selectedStudentCount = (preview || []).flatMap((c) => c.students || []).filter(
    (s) => s.has_phone && !excludedStudents.has(s.id),
  ).length;
  const selectedVeliCount = (preview || []).flatMap((c) => c.veliler || []).filter(
    (v) => v.has_phone && !excludedVeliler.has(v.id),
  ).length;

  const title = step === 'running'
    ? 'Gönderiliyor'
    : step === 'done'
      ? 'Gönderim sonucu'
      : mode === 'teacher'
        ? (teacherName ? `${teacherName} · WhatsApp` : 'WhatsApp ile gönder')
        : 'WhatsApp ile gönder';

  const sentCount = outcomes.filter((row) => row.status === 'sent').length;
  const failedCount = outcomes.filter((row) => row.status === 'failed').length;
  const skippedCount = outcomes.filter((row) => row.status === 'skipped').length;
  const visibleOutcomes = outcomes.filter((row) => {
    if (resultFilter === 'sent') return row.status === 'sent';
    if (resultFilter === 'failed') return row.status === 'failed';
    return true;
  });
  const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const roleLabel = (kind: ScheduleNotifyRecipient['kind']) => {
    if (kind === 'veli') return 'Veli';
    if (kind === 'ogrenci') return 'Öğrenci';
    if (kind === 'ogretmen') return 'Öğretmen';
    return 'Sınıf';
  };
  const statusLabel = (status: ScheduleNotifyRecipient['status']) => {
    if (status === 'sent') return 'Gitti';
    if (status === 'failed') return 'Gitmedi';
    return 'Atlandı';
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      width={680}
      destroyOnClose
      centered
      maskClosable={step !== 'running'}
      footer={
        step === 'running' ? [
          <Button key="stop" onClick={() => { stopRef.current = true; }}>
            Kalanı durdur
          </Button>,
        ] : step === 'done' ? [
          <Button key="close" type="primary" onClick={onClose}>
            Kapat
          </Button>,
        ] : [
          <Button key="cancel" onClick={onClose}>
            Vazgeç
          </Button>,
          <Button
            key="send"
            type="primary"
            onClick={runSend}
            loading={sending}
            disabled={awaitingPreview || (mode === 'teacher' ? !teacherPreview?.length : !preview?.length)}
          >
            Gönder
          </Button>,
        ]
      }
    >
      <div className="gv-wa">
        {step !== 'compose' ? (
          <div className="gv-wa-progress">
            <div className="gv-wa-progress-top">
              <strong>
                {step === 'running'
                  ? (progress.label ? `${progress.label} gönderiliyor` : 'Hazırlanıyor')
                  : `${sentCount} gitti${failedCount ? ` · ${failedCount} gitmedi` : ''}${skippedCount ? ` · ${skippedCount} atlandı` : ''}`}
              </strong>
              <span>{step === 'done' ? progress.total : progress.done} / {progress.total}</span>
            </div>
            <div className="gv-wa-bar" aria-hidden>
              <i style={{ width: `${step === 'done' && progress.done >= progress.total ? 100 : progressPct}%` }} />
            </div>
            {step === 'done' ? (
              <div className="gv-wa-pills">
                <button type="button" className={`gv-wa-pill${resultFilter === 'all' ? ' is-on' : ''}`} onClick={() => setResultFilter('all')}>
                  Tümü
                </button>
                <button type="button" className={`gv-wa-pill${resultFilter === 'sent' ? ' is-on' : ''}`} onClick={() => setResultFilter('sent')}>
                  Gidenler
                </button>
                <button type="button" className={`gv-wa-pill${resultFilter === 'failed' ? ' is-on' : ''}`} onClick={() => setResultFilter('failed')}>
                  Gitmeyenler
                </button>
              </div>
            ) : null}
            <div className="gv-wa-list">
              {(step === 'done' ? visibleOutcomes : outcomes).length ? (
                (step === 'done' ? visibleOutcomes : outcomes).map((row, index) => (
                  <div key={`${row.kind}-${row.id}-${index}`} className="gv-wa-row is-result">
                    <span>
                      <strong>{row.name}</strong>
                      <small>
                        {roleLabel(row.kind)}
                        {row.sinif_ad && row.kind !== 'sinif' ? ` · ${row.sinif_ad}` : ''}
                        {row.error ? ` · ${row.error}` : ''}
                      </small>
                    </span>
                    <em className={`gv-wa-badge is-${row.status}`}>{statusLabel(row.status)}</em>
                  </div>
                ))
              ) : (
                <div className="gv-wa-empty">{step === 'running' ? 'İlk program hazırlanıyor…' : 'Kayıt yok'}</div>
              )}
            </div>
          </div>
        ) : null}

        {step === 'compose' && mode === 'class' && (
          <>
            <div className="gv-wa-audience">
              <p>Kime gönderilsin</p>
              <div className="gv-wa-audience-grid">
                <button
                  type="button"
                  className={`gv-wa-audience-card${sendOgrenci ? ' is-on' : ''}`}
                  onClick={() => setSendOgrenci((v) => !v)}
                >
                  <strong>Öğrenciler</strong>
                  <span>{sendOgrenci ? `${selectedStudentCount} kişi` : 'Kapalı'}</span>
                </button>
                <button
                  type="button"
                  className={`gv-wa-audience-card${sendVeli ? ' is-on' : ''}`}
                  onClick={() => setSendVeli((v) => !v)}
                >
                  <strong>Veliler</strong>
                  <span>{sendVeli ? `${selectedVeliCount} kişi` : 'Kapalı'}</span>
                </button>
              </div>
            </div>
            <div className="gv-wa-chips">
              <button
                type="button"
                className={`gv-wa-chip${selectedClassIds.length === classroomOptions.length && classroomOptions.length ? ' is-on' : ''}`}
                onClick={() =>
                  setSelectedClassIds(
                    selectedClassIds.length === classroomOptions.length ? [] : classroomOptions.map((c) => c.id),
                  )
                }
              >
                Tümü
              </button>
              {classroomOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`gv-wa-chip${selectedClassIds.includes(c.id) ? ' is-on' : ''}`}
                  onClick={() => toggleClass(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'compose' && mode === 'teacher' && (
          <div className="gv-wa-pills">
            <button
              type="button"
              className="gv-wa-pill"
              onClick={() => setExcludedTeachers(new Set(unavailableTeacherIds))}
              disabled={!teacherPreview?.length}
            >
              Tümünü seç
            </button>
            <button
              type="button"
              className="gv-wa-pill"
              onClick={() => setExcludedTeachers(new Set((teacherPreview || []).map((t) => t.teacher_id)))}
              disabled={!teacherPreview?.length}
            >
              Seçimi temizle
            </button>
          </div>
        )}

        {step === 'compose' && (
        <Input
          className="gv-wa-search"
          allowClear
          placeholder={mode === 'teacher' ? 'Öğretmen ara' : 'Alıcı ara'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        )}

        {error ? <div className="gv-banner gv-banner--warn">{error}</div> : null}

        {step === 'compose' && awaitingPreview ? (
          <div className="gv-wa-wait">
            <Spin />
            <strong>Alıcılar hazırlanıyor</strong>
            <span>Programı gönderilebilecek kişiler kontrol ediliyor.</span>
          </div>
        ) : null}

        {step === 'compose' && !awaitingPreview && mode === 'teacher' ? (
          <div className="gv-wa-list">
            {teacherRows.length ? (
              teacherRows.map((t) => {
                const off = excludedTeachers.has(t.teacher_id) || t.empty_grid || !t.has_phone;
                return (
                  <label key={t.teacher_id} className={`gv-wa-row${off ? ' is-off' : ''}`}>
                    <Checkbox
                      checked={!excludedTeachers.has(t.teacher_id)}
                      disabled={t.empty_grid || !t.has_phone}
                      onChange={() => toggleSet(setExcludedTeachers, t.teacher_id)}
                    />
                    <span>
                      <strong>{t.teacher_name}</strong>
                      <small>{t.has_phone ? t.phone : 'telefon yok'}{t.warning ? ` · ${t.warning}` : ''}</small>
                    </span>
                    <em className="gv-wa-badge">{t.filled_count} ders</em>
                  </label>
                );
              })
            ) : (
              <div className="gv-wa-empty">Öğretmen bulunamadı</div>
            )}
          </div>
        ) : null}

        {step === 'compose' && !awaitingPreview && mode === 'class' && preview ? (
          <div className="gv-wa-list">
            {preview.map((c) => {
              const students = (c.students || []).filter((s) => !q || s.name.toLocaleLowerCase('tr').includes(q));
              const veliler = (c.veliler || []).filter(
                (v) =>
                  !q ||
                  v.name.toLocaleLowerCase('tr').includes(q) ||
                  v.ogrenci_ad.toLocaleLowerCase('tr').includes(q),
              );
              const showClass = !q || students.length > 0 || veliler.length > 0 || c.sinif_ad.toLocaleLowerCase('tr').includes(q);
              if (!showClass) return null;
              return (
                <div key={c.sinif_id}>
                  <div className="gv-wa-section">
                    {c.sinif_ad}
                    {c.empty_grid
                      ? ` · ${c.warning || 'Ders programı boş'}`
                      : !c.has_changes
                        ? ' · Son gönderimden beri değişiklik yok, yine de gönderilir'
                        : ''}
                  </div>
                  {sendOgrenci &&
                    students.map((s) => (
                      <label key={s.id} className={`gv-wa-row${!s.has_phone || excludedStudents.has(s.id) ? ' is-off' : ''}`}>
                        <Checkbox
                          checked={!excludedStudents.has(s.id)}
                          disabled={!s.has_phone}
                          onChange={() => toggleSet(setExcludedStudents, s.id)}
                        />
                        <span>
                          <strong>{s.name}</strong>
                          <small>{s.has_phone ? s.phone : 'telefon yok'}</small>
                        </span>
                        <em className="gv-wa-badge">Öğrenci</em>
                      </label>
                    ))}
                  {sendVeli &&
                    veliler.map((v) => (
                      <label
                        key={`${v.id}-${v.ogrenci_id}`}
                        className={`gv-wa-row${!v.has_phone || excludedVeliler.has(v.id) ? ' is-off' : ''}`}
                      >
                        <Checkbox
                          checked={!excludedVeliler.has(v.id)}
                          disabled={!v.has_phone}
                          onChange={() => toggleSet(setExcludedVeliler, v.id)}
                        />
                        <span>
                          <strong>{v.name}</strong>
                          <small>
                            {v.ogrenci_ad}
                            {v.has_phone ? ` · ${v.phone}` : ' · telefon yok'}
                          </small>
                        </span>
                        <em className="gv-wa-badge">Veli</em>
                      </label>
                    ))}
                </div>
              );
            })}
          </div>
        ) : null}

        {step === 'compose' && !awaitingPreview && (
          <div className="gv-wa-foot">
            {mode === 'teacher' ? (
              <span>{selectedTeacherCount} öğretmen seçili</span>
            ) : (
              <span>
                {sendOgrenci ? `${selectedStudentCount} öğrenci` : ''}
                {sendOgrenci && sendVeli ? ' · ' : ''}
                {sendVeli ? `${selectedVeliCount} veli` : ''}
              </span>
            )}
            <span>PDF eklenecek</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
