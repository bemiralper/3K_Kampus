'use client';

import { useState } from 'react';
import {
  ArrowUpRight,
  BookmarkCheck,
  BookmarkPlus,
  CheckCircle2,
  ClipboardCheck,
  EyeOff,
  MessageSquareText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { DevelopmentResponse, StudentExamResult, StudyRecommendation } from '@/components/olcme/types';
import {
  buildPrecisionRecommendations,
  numberLabel as n,
  type PrecisionRecommendation,
} from './examAnalyticsModel';
import s from './ExamAnalyticsWorkspace.module.css';

export type CoachActionHandler = (
  item: StudyRecommendation,
  status: 'planned' | 'reviewed' | 'deferred',
  note: string
) => Promise<void>;

export function StudyRecommendationsPanel({
  data,
  exams,
  examType,
  loading,
  error,
  actionError,
  busyKey,
  onAction,
  onOpenInDeep,
  onRetry,
}: {
  data: DevelopmentResponse | null;
  exams: StudentExamResult[];
  examType: string;
  loading: boolean;
  error: string;
  actionError: string;
  busyKey: string | null;
  onAction: CoachActionHandler;
  onOpenInDeep: (subject: string, topic: string) => void;
  onRetry: () => void;
}) {
  const bundle = buildPrecisionRecommendations(data?.agenda?.items, exams, examType);
  const followups = data?.agenda?.followups || [];

  if (loading && !data) {
    return (
      <div className={s.loading} role="status">
        <span />
        Çalışma önerileri hazırlanıyor…
      </div>
    );
  }

  if (error) {
    return (
      <div className={s.error} role="alert">
        <span>{error}</span>
        <button type="button" onClick={onRetry}>
          Yeniden dene
        </button>
      </div>
    );
  }

  return (
    <section className={s.planWorkspace} aria-label="Çalışma önerileri">
      {actionError && (
        <div className={s.error} role="alert">
          <span>{actionError}</span>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className={s.planSummary}>
        <div>
          <span>Nokta atışı öneri</span>
          <b>
            {bundle.priority.length} <small>/ 5</small>
          </b>
        </div>
        <div>
          <span>Plana alınan</span>
          <b>
            {bundle.planned.length} <small>kazanım</small>
          </b>
        </div>
        <div>
          <span>Öncelikli net potansiyeli</span>
          <b>
            {bundle.totalNetPotential > 0 ? `≈ +${n(bundle.totalNetPotential, 2)}` : '—'}{' '}
            {bundle.totalNetPotential > 0 && <small>net/sınav</small>}
          </b>
        </div>
      </div>

      {/* Transparent Zero-False-Positive Filter Banner */}
      <div className={s.criteriaStrip}>
        <ShieldCheck size={16} />
        <span>
          <strong>Nokta atışı kuralı:</strong> Yalnızca puan kapsamındaki derslerde en az 2 sınavda hata yapılan,
          toplam en az 3 soru sorulan ve son sınavlarda devam eden kazanımlar öncelikli öneri olarak sunulur.
        </span>
      </div>

      <div className={s.planGrid}>
        {/* Left Main Column: Precision Recommendations */}
        <div className={s.planMainCol}>
          <div className={s.planSectionHead}>
            <div>
              <h3>Öncelikli çalışma önerileri</h3>
              <span>Tavsiye niteliğindedir; koç onayı olmadan plan veya ödev oluşturulmaz.</span>
            </div>
          </div>

          {!bundle.priority.length ? (
            <div className={s.planEmptyBox}>
              <CheckCircle2 size={22} />
              <div>
                <strong>
                  {bundle.planned.length > 0
                    ? 'Öncelikli önerilerin tamamı değerlendirildi'
                    : 'Seçili sınavlarda tekrarlayan kesin bir eksik bulunmuyor'}
                </strong>
                <p>
                  {exams.length < 2
                    ? 'Nokta atışı öneriler için en az 2 sınav seçilmelidir. Tek sınavdaki hataları aşağıdaki kontrol listesinden inceleyebilirsiniz.'
                    : bundle.planned.length > 0
                      ? 'Plana aldığınız kazanımları sağ panelden takip edebilir, dilerseniz aşağıdaki kontrol listesinden ekleme yapabilirsiniz.'
                      : 'Tek seferlik veya az sorulu hatalar yanlış yönlendirme olmaması için öncelikli öneri listesine alınmadı.'}
                </p>
              </div>
            </div>
          ) : (
            <div className={s.recList}>
              {bundle.priority.map((rec, index) => (
                <RecommendationCard
                  key={rec.item.key}
                  rec={rec}
                  rank={index + 1}
                  busy={busyKey === rec.item.key}
                  onAction={onAction}
                  onOpenInDeep={onOpenInDeep}
                />
              ))}
            </div>
          )}

          {/* Secondary Priority (if > 5) */}
          {bundle.secondary.length > 0 && (
            <details className={s.planDrawer}>
              <summary>
                Diğer tekrarlayan öneriler ({bundle.secondary.length})
              </summary>
              <div className={s.recList}>
                {bundle.secondary.map((rec, index) => (
                  <RecommendationCard
                    key={rec.item.key}
                    rec={rec}
                    rank={index + 6}
                    busy={busyKey === rec.item.key}
                    onAction={onAction}
                    onOpenInDeep={onOpenInDeep}
                  />
                ))}
              </div>
            </details>
          )}

          {/* Optional Watch List (single exam or not asked recently) */}
          {bundle.watch.length > 0 && (
            <details className={s.planDrawer}>
              <summary>
                Kontrol edilebilecek konular — tek sınav veya son sınavlarda çıkmayanlar ({bundle.watch.length})
              </summary>
              <p className={s.drawerHint}>
                Bu kazanımlar henüz tekrarlayan eksik şartını sağlamıyor. Koç gözüyle gerekli görürseniz plana
                alabilir veya not ekleyebilirsiniz.
              </p>
              <div className={s.recList}>
                {bundle.watch.slice(0, 12).map(rec => (
                  <RecommendationCard
                    key={rec.item.key}
                    rec={rec}
                    compact
                    busy={busyKey === rec.item.key}
                    onAction={onAction}
                    onOpenInDeep={onOpenInDeep}
                  />
                ))}
              </div>
            </details>
          )}

          {/* Deferred / Passed items */}
          {bundle.deferred.length > 0 && (
            <details className={s.planDrawer}>
              <summary>Şimdilik geçilenler ({bundle.deferred.length})</summary>
              <div className={s.deferredList}>
                {bundle.deferred.map(rec => (
                  <div key={rec.item.key} className={s.deferredRow}>
                    <div>
                      <strong>
                        {rec.item.subject} · {rec.item.name}
                      </strong>
                      {rec.item.note && <small>Not: {rec.item.note}</small>}
                    </div>
                    <button
                      type="button"
                      className={s.actionGhost}
                      disabled={busyKey === rec.item.key}
                      onClick={() => onAction(rec.item, 'reviewed', rec.item.note || '')}
                    >
                      <RotateCcw size={13} /> Listeye geri al
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Right Sticky Column: Planned Items & Follow-ups */}
        <aside className={s.planSideCol}>
          <div className={s.sideCard}>
            <div className={s.sideCardHead}>
              <h4>
                <ClipboardCheck size={16} /> Plana alınanlar
              </h4>
              <span>{bundle.planned.length}</span>
            </div>
            {!bundle.planned.length ? (
              <p className={s.sideEmpty}>
                Henüz plana alınan bir kazanım yok. Önerilerden veya Derin Analiz ekranından{' '}
                <strong>Plana al</strong> diyerek koç çalışma planınızı oluşturabilirsiniz.
              </p>
            ) : (
              <div className={s.plannedList}>
                {bundle.planned.map(rec => (
                  <PlannedItemCard
                    key={rec.item.key}
                    rec={rec}
                    busy={busyKey === rec.item.key}
                    onAction={onAction}
                    onOpenInDeep={onOpenInDeep}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Next Exam Follow-up Tracker */}
          {followups.length > 0 && (
            <div className={s.sideCard}>
              <div className={s.sideCardHead}>
                <h4>
                  <TrendingUp size={16} /> Sonraki sınav takibi
                </h4>
                <span>{followups.length}</span>
              </div>
              <div className={s.followupList}>
                {followups.map(f => (
                  <div key={f.id} className={s.followupRow}>
                    <div className={s.followupTop}>
                      <span className={s.typePill}>{f.subject}</span>
                      <small>{f.status}</small>
                    </div>
                    <strong>{f.name}</strong>
                    <div className={s.followupCompare}>
                      <span>Önce: {f.before}</span>
                      {f.after && <b className={s.cOk}>Sonra: {f.after}</b>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function RecommendationCard({
  rec,
  rank,
  compact = false,
  busy,
  onAction,
  onOpenInDeep,
}: {
  rec: PrecisionRecommendation;
  rank?: number;
  compact?: boolean;
  busy: boolean;
  onAction: CoachActionHandler;
  onOpenInDeep: (subject: string, topic: string) => void;
}) {
  const { item } = rec;
  const [noteOpen, setNoteOpen] = useState(Boolean(item.note));
  const [draft, setDraft] = useState(item.note || '');
  const [savedFlag, setSavedFlag] = useState(false);

  const saveNote = async () => {
    await onAction(item, item.status === 'planned' ? 'planned' : 'reviewed', draft.trim());
    setSavedFlag(true);
    setTimeout(() => setSavedFlag(false), 2000);
  };

  return (
    <article className={`${s.recCard} ${compact ? s.recCardCompact : ''}`}>
      <div className={s.recTop}>
        <div className={s.recBadges}>
          {rank != null && <span className={s.recRank}>{String(rank).padStart(2, '0')}</span>}
          <span className={s.typePill}>{item.subject}</span>
          {item.topic && item.topic !== item.subject && <span className={s.recTopicLabel}>{item.topic}</span>}
          {rec.isWorsening && <em className={s.recUrgentPill}>Hata arttı</em>}
        </div>
        {rec.netPotentialPerExam >= 0.25 && (
          <span className={s.gainBadge}>≈ +{n(rec.netPotentialPerExam, 2)} net/sınav</span>
        )}
      </div>

      <h4 className={s.recTitle}>{item.name}</h4>

      <p className={s.recWhy}>{rec.whyText}</p>

      <div className={s.recMethod} data-kind={rec.dominance.kind}>
        <Sparkles size={14} />
        <div>
          <b>{rec.dominance.shortLabel}:</b> {rec.studyMethod}
        </div>
      </div>

      {item.questions.length > 0 && (
        <div className={s.questionChips}>
          <span>Son sınav soruları:</span>
          {item.questions.map(q => (
            <em key={`${q.item_id}:${q.n}`} data-result={q.result}>
              #{q.n} {q.result === 'Y' ? 'Y' : 'B'}
            </em>
          ))}
        </div>
      )}

      {noteOpen && (
        <div className={s.noteEditor}>
          <textarea
            rows={2}
            aria-label={`${item.name} için koç notu`}
            placeholder="Koç notu yazın (ör. hafta sonu 2 test + yanlış soru analizi yapılacak)…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={3000}
          />
          <div className={s.noteEditorActions}>
            <button type="button" className={s.actionGhost} disabled={busy} onClick={saveNote}>
              {busy ? 'Kaydediliyor…' : savedFlag ? 'Not kaydedildi ✓' : 'Notu kaydet'}
            </button>
            <button type="button" className={s.textButton} onClick={() => setNoteOpen(false)}>
              Kapat
            </button>
          </div>
        </div>
      )}

      <div className={s.recActions}>
        <button
          type="button"
          className={s.actionPrimary}
          disabled={busy}
          onClick={() => onAction(item, 'planned', draft.trim() || item.note || '')}
        >
          <BookmarkPlus size={14} /> {busy ? 'Kaydediliyor…' : 'Plana al'}
        </button>
        <button
          type="button"
          className={s.actionGhost}
          aria-expanded={noteOpen}
          onClick={() => setNoteOpen(v => !v)}
        >
          <MessageSquareText size={13} /> {item.note ? 'Notu düzenle' : 'Koç notu'}
        </button>
        <button
          type="button"
          className={s.actionGhost}
          disabled={busy}
          onClick={() => onAction(item, 'deferred', draft.trim() || item.note || '')}
        >
          <EyeOff size={13} /> Şimdilik geç
        </button>
        {item.topic && (
          <button
            type="button"
            className={s.recInspectLink}
            onClick={() => onOpenInDeep(item.subject, item.topic)}
          >
            Derin Analiz <ArrowUpRight size={13} />
          </button>
        )}
      </div>
    </article>
  );
}

function PlannedItemCard({
  rec,
  busy,
  onAction,
  onOpenInDeep,
}: {
  rec: PrecisionRecommendation;
  busy: boolean;
  onAction: CoachActionHandler;
  onOpenInDeep: (subject: string, topic: string) => void;
}) {
  const { item } = rec;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.note || '');

  const saveNote = async () => {
    await onAction(item, 'planned', draft.trim());
    setEditing(false);
  };

  return (
    <div className={s.plannedCard}>
      <div className={s.plannedHead}>
        <span className={s.typePill}>{item.subject}</span>
        <span className={s.plannedBadge}>
          <BookmarkCheck size={12} /> Planda
        </span>
      </div>
      <button
        type="button"
        className={s.plannedTitleBtn}
        onClick={() => item.topic && onOpenInDeep(item.subject, item.topic)}
      >
        {item.name}
      </button>
      <small className={s.plannedMeta}>
        {rec.totalLoss} soru kaybı · ≈ +{n(rec.netPotentialPerExam, 2)} net/sınav
      </small>

      {editing ? (
        <div className={s.noteEditor}>
          <textarea
            rows={2}
            aria-label="Koç notunu düzenle"
            placeholder="Koç notu ekleyin…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={3000}
          />
          <div className={s.noteEditorActions}>
            <button type="button" className={s.actionPrimary} disabled={busy} onClick={saveNote}>
              {busy ? '…' : 'Kaydet'}
            </button>
            <button type="button" className={s.textButton} onClick={() => setEditing(false)}>
              İptal
            </button>
          </div>
        </div>
      ) : (
        item.note && <p className={s.savedNoteBox}>{item.note}</p>
      )}

      <div className={s.plannedActions}>
        {!editing && (
          <button
            type="button"
            className={s.textButton}
            onClick={() => {
              setDraft(item.note || '');
              setEditing(true);
            }}
          >
            {item.note ? 'Notu düzenle' : 'Not ekle'}
          </button>
        )}
        <button
          type="button"
          className={s.mutedActionLink}
          disabled={busy}
          onClick={() => onAction(item, 'reviewed', item.note || '')}
        >
          Plandan çıkar
        </button>
      </div>
    </div>
  );
}

/** Compact coach action bar shown inside expanded outcomes in Derin Analiz (no homework conversion). */
export function OutcomeCoachActionBar({
  item,
  busy,
  onAction,
}: {
  item: StudyRecommendation;
  busy: boolean;
  onAction: CoachActionHandler;
}) {
  const isPlanned = item.status === 'planned';
  const [noteOpen, setNoteOpen] = useState(Boolean(item.note));
  const [draft, setDraft] = useState(item.note || '');
  const [savedFlag, setSavedFlag] = useState(false);

  const handleSaveNote = async () => {
    await onAction(item, isPlanned ? 'planned' : 'reviewed', draft.trim());
    setSavedFlag(true);
    setTimeout(() => setSavedFlag(false), 2000);
  };

  return (
    <div className={s.outcomeActionBox}>
      <div className={s.outcomeActionRow}>
        <button
          type="button"
          className={isPlanned ? s.plannedToggleActive : s.plannedToggle}
          disabled={busy}
          onClick={() => onAction(item, isPlanned ? 'reviewed' : 'planned', draft.trim() || item.note || '')}
        >
          {isPlanned ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
          <span>{busy ? 'Kaydediliyor…' : isPlanned ? 'Plana alındı' : 'Plana al'}</span>
        </button>
        <button
          type="button"
          className={s.actionGhost}
          aria-expanded={noteOpen}
          onClick={() => setNoteOpen(v => !v)}
        >
          <MessageSquareText size={13} />
          <span>{item.note ? 'Koç notu (var)' : 'Koç notu'}</span>
        </button>
      </div>

      {noteOpen && (
        <div className={s.noteEditor}>
          <textarea
            rows={2}
            aria-label={`${item.name} koç notu`}
            placeholder="Bu kazanım için koç notu yazın…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={3000}
          />
          <div className={s.noteEditorActions}>
            <button type="button" className={s.actionGhost} disabled={busy} onClick={handleSaveNote}>
              {busy ? 'Kaydediliyor…' : savedFlag ? 'Not kaydedildi ✓' : 'Notu kaydet'}
            </button>
            <button type="button" className={s.textButton} onClick={() => setNoteOpen(false)}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
