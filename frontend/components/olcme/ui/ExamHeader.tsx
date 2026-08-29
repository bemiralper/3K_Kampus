'use client';

/**
 * Sınav detay başlığı.
 *
 * Eski yapıda başlık (hero-header) ve sayı kutuları (quick-stats) ayrı iki blok
 * hâlindeydi; sayılar sınavın hangi aşamada olduğunu göstermiyordu. Burada üçü
 * birleşti: kimlik + durum hattı + metrikler. Durum hattı sınavın yaşam
 * döngüsünü (taslak → cevap anahtarı → sonuç → tamamlandı) gösterir ve
 * tıklanınca ilgili sekmeyi açar.
 */
import { EXAM_STATUS, EXAM_TYPES } from '../types';
import type { ExamDetail, ExamStatusValue } from '../types';
import Icon from './Icon';
import type { IconName } from './Icon';
import s from './examHeader.module.css';

/** Durum hattı adımları — EXAM_STATUS sırasıyla birebir aynı. */
const STEPS: { value: ExamStatusValue; label: string; tab: string; icon: IconName }[] = [
  { value: 'DRAFT',            label: 'Taslak',          tab: 'genel',          icon: 'edit' },
  { value: 'ANSWER_KEY_READY', label: 'Cevap Anahtarı',  tab: 'cevap-anahtari', icon: 'answerKey' },
  { value: 'RESULTS_UPLOADED', label: 'Sonuç Yüklendi',  tab: 'yukle',          icon: 'upload' },
  { value: 'COMPLETED',        label: 'Tamamlandı',      tab: 'analiz',         icon: 'check' },
];

const labelOf = (list: readonly { readonly value: string; readonly label: string }[], v: string) =>
  list.find(x => x.value === v)?.label ?? v;

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : null;

/** Oturum tarihleri varsa onları, yoksa sınav tarihini gösterir. */
function dateSummary(exam: ExamDetail): string | null {
  const fromSessions = (exam.exam_sessions ?? [])
    .map(ss => ss.session_date)
    .filter((d): d is string => !!d)
    .sort();
  if (fromSessions.length > 0) {
    const unique = [...new Set(fromSessions.map(d => fmtDate(d)!))];
    return unique.length > 2 ? `${unique[0]} +${unique.length - 1}` : unique.join(' · ');
  }
  return fmtDate(exam.exam_date);
}

interface Props {
  exam: ExamDetail;
  busy?: boolean;
  onBack: () => void;
  onTabChange: (tab: string) => void;
  onToggleLock: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

export default function ExamHeader({
  exam, busy = false, onBack, onTabChange, onToggleLock, onCopy, onDelete,
}: Props) {
  const currentStep = STEPS.findIndex(st => st.value === exam.status);
  const dates = dateSummary(exam);
  const unmatched = exam.unmatched_count ?? 0;

  return (
    <header className={s.header}>
      <div className={s.top}>
        <nav className={s.breadcrumb} aria-label="Konum">
          <button type="button" className={s.crumbLink} onClick={onBack}>Sınav Yönetimi</button>
          <Icon name="chevronRight" size={13} />
          <span className={s.crumbCurrent}>{exam.name}</span>
        </nav>

        <div className={s.titleRow}>
          <div className={s.titleBlock}>
            <span className={s.titleIcon}>
              <Icon name="exam" size={23} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 className={s.title}>{exam.name}</h1>
              <div className={s.metaRow}>
                <span className={s.metaItem}>
                  <Icon name="document" size={13} />
                  {labelOf(EXAM_TYPES, exam.exam_type)}
                </span>
                {dates && (
                  <span className={s.metaItem}>
                    <Icon name="calendar" size={13} />
                    {dates}
                  </span>
                )}
                {exam.duration_minutes && (
                  <span className={s.metaItem}>
                    <Icon name="clock" size={13} />
                    {exam.duration_minutes} dk
                  </span>
                )}
                {exam.linked_tyt_exam_name && (
                  <span className={s.metaItem}>
                    <Icon name="link" size={13} />
                    {exam.linked_tyt_exam_name}
                  </span>
                )}
                {exam.is_locked && (
                  <span className={s.lockTag}>
                    <Icon name="lock" size={12} />
                    Kilitli
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className={s.actions}>
            <button
              type="button"
              className={s.action}
              onClick={onToggleLock}
              disabled={busy}
              title={exam.is_locked
                ? 'Kilidi açarak puanlama ayarlarını yeniden düzenleyebilirsiniz.'
                : 'Kilitlendiğinde puanlama ayarları değiştirilemez.'}
            >
              <Icon name={exam.is_locked ? 'unlock' : 'lock'} size={15} />
              <span className={s.actionLabel}>{exam.is_locked ? 'Kilidi Aç' : 'Kilitle'}</span>
            </button>
            <button
              type="button"
              className={s.action}
              onClick={onCopy}
              disabled={busy}
              title="Bu sınavın ayarlarını ve bölümlerini yeni bir sınava kopyalar."
            >
              <Icon name="copy" size={15} />
              <span className={s.actionLabel}>Kopyala</span>
            </button>
            <button
              type="button"
              className={`${s.action} ${s.actionDanger}`}
              onClick={onDelete}
              disabled={busy}
              title="Sınavı listeden kaldırır; öğrenci cevapları korunur."
            >
              <Icon name="trash" size={15} />
              <span className={s.actionLabel}>Kaldır</span>
            </button>
          </div>
        </div>
      </div>

      {/* Durum hattı — hangi aşamada olduğunu ve sıradaki adımı gösterir */}
      <ol className={s.pipeline} aria-label="Sınav aşaması">
        {STEPS.map((step, i) => {
          const done = i < currentStep;
          const current = i === currentStep;
          return (
            <li key={step.value} style={{ display: 'contents' }}>
              <button
                type="button"
                className={`${s.step} ${done ? s.stepDone : ''}`}
                onClick={() => onTabChange(step.tab)}
                aria-current={current ? 'step' : undefined}
                title={`${labelOf(EXAM_STATUS, step.value)} — ilgili sekmeyi aç`}
              >
                <span className={`${s.dot} ${done ? s.dotDone : ''} ${current ? s.dotCurrent : ''}`}>
                  {(done || current) && <Icon name={done ? 'check' : step.icon} size={11} strokeWidth={3} />}
                </span>
                <span className={`${s.stepLabel} ${current ? s.stepLabelActive : ''}`}>
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Şube burada gösterilmez: kullanıcı zaten aktif şube bağlamını kendisi seçiyor. */}
      <div className={s.metrics}>
        <Metric icon="document" label="Soru" value={exam.total_questions ?? 0} />
        <Metric icon="layers" label="Bölüm" value={exam.section_count ?? 0} />
        <Metric icon="calendar" label="Oturum" value={exam.session_count ?? 0} />
        <Metric
          icon="users"
          label={unmatched > 0 ? `${unmatched} eşleşmedi` : 'Eşleşen öğrenci'}
          labelWarn={unmatched > 0}
          value={exam.matched_count ?? 0}
          unit={exam.answer_count ? `/ ${exam.answer_count}` : undefined}
        />
      </div>
    </header>
  );
}

function Metric({ icon, label, value, unit, labelWarn }: {
  icon: IconName;
  label: string;
  value: number | string;
  unit?: string;
  labelWarn?: boolean;
}) {
  return (
    <div className={s.metric}>
      <span className={s.metricValue}>
        {value}
        {unit && <span className={s.metricUnit}>{unit}</span>}
      </span>
      <span className={`${s.metricLabel} ${labelWarn ? s.metricWarn : ''}`}>
        <Icon name={icon} size={12} />
        {label}
      </span>
    </div>
  );
}
