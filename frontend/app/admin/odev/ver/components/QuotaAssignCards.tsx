'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LastQuotaDefault } from '@/lib/resources-api';
import type { StudentResource, SelectedContent, RoutineQuotaKind } from '../types';
import { quotaTopicId, routineQuotaKindOf } from '../types';
import K3ModePicker from '@/components/odev/K3ModePicker';
import { k3TopicKey, type K3Mode, type TopicK3Map } from '@/lib/k3-mode';

const PRESETS = [10, 15, 20, 25, 30];

const KIND_META: Record<RoutineQuotaKind, { label: string; icon: string; accent: string; bg: string }> = {
  PARAGRAF: { label: 'Paragraf', icon: '📄', accent: '#0369a1', bg: 'rgba(3,105,161,0.06)' },
  PROBLEM: { label: 'Problem', icon: '🔢', accent: '#b45309', bg: 'rgba(180,83,9,0.06)' },
};

function bookLabel(book: StudentResource) {
  return book.publisher ? `${book.resource_name}` : book.resource_name;
}

function QuotaKindCard({
  kind,
  books,
  lastDefault,
  cartItem,
  topicK3,
  onTopicK3Change,
  onAdd,
  onRemove,
}: {
  kind: RoutineQuotaKind;
  books: StudentResource[];
  lastDefault: LastQuotaDefault | null;
  cartItem?: SelectedContent;
  topicK3: TopicK3Map;
  onTopicK3Change?: (bookId: number, topicId: number, mode: K3Mode | null, targetMinutes: number | null) => void;
  onAdd: (resource: StudentResource, daily: number) => void;
  onRemove: (id: number) => void;
}) {
  const meta = KIND_META[kind];
  const [bookId, setBookId] = useState('');
  const [daily, setDaily] = useState('20');

  useEffect(() => {
    if (cartItem) {
      setBookId(String(cartItem.bookId));
      setDaily(String(cartItem.dailyQuestionCount || Math.max(1, Math.round((cartItem.questionCount || 7) / 7))));
      return;
    }
    const preferred = lastDefault?.resource_book
      && books.some((b) => b.resource_book === lastDefault.resource_book)
      ? lastDefault.resource_book
      : books[0]?.resource_book;
    setBookId(preferred ? String(preferred) : '');
    setDaily(String(lastDefault?.daily_question_count || 20));
  }, [kind, lastDefault, cartItem, books]);

  const dailyNum = Math.max(0, parseInt(daily, 10) || 0);
  const weekly = dailyNum * 7;
  const selected = books.find((b) => String(b.resource_book) === bookId);
  const inCart = Boolean(cartItem);
  const topicId = quotaTopicId(kind);
  const activeBookId = selected?.resource_book || cartItem?.bookId || 0;
  const k3Rec = activeBookId
    ? topicK3[k3TopicKey(activeBookId, topicId)]
    : undefined;
  const k3Mode = k3Rec?.mode || cartItem?.k3Mode || null;
  const k3Minutes = k3Rec?.targetMinutes ?? cartItem?.k3TargetMinutes ?? null;

  return (
    <div
      className="odev-quota-card"
      style={{ borderColor: inCart ? meta.accent : 'var(--border-color)', background: meta.bg }}
    >
      <div className="odev-quota-card-head">
        <div>
          <div className="odev-quota-card-title">
            <span>{meta.icon}</span> {meta.label}
          </div>
          <div className="odev-quota-card-sub">
            {lastDefault
              ? `Son ödev: ${lastDefault.daily_question_count} günlük / ${lastDefault.weekly_question_count} haftalık`
              : 'İstediğiniz hafta ekleyin — zorunlu değil'}
          </div>
        </div>
        <div className="odev-quota-card-tools">
          {onTopicK3Change && books.length > 0 && activeBookId > 0 && (
            <K3ModePicker
              value={k3Mode}
              targetMinutes={k3Minutes}
              onChange={(mode, minutes) => onTopicK3Change(activeBookId, topicId, mode, minutes)}
            />
          )}
          {inCart && <span className="odev-quota-chip">Sepette</span>}
        </div>
      </div>

      {books.length === 0 ? (
        <p className="odev-quota-empty">
          Öğrenciye atanmış {meta.label.toLocaleLowerCase('tr')} kitabı yok. Önce kaynak havuzundan atayın.
        </p>
      ) : (
        <>
          <label className="odev-quota-label">Kitap / yayınevi</label>
          <select
            className="odev-quota-select"
            value={bookId}
            onChange={(e) => {
              const nextId = e.target.value;
              const prevId = bookId;
              setBookId(nextId);
              if (!onTopicK3Change || !prevId || !nextId || prevId === nextId) return;
              const prev = topicK3[k3TopicKey(Number(prevId), topicId)];
              const next = topicK3[k3TopicKey(Number(nextId), topicId)];
              if (prev?.mode && !next?.mode) {
                onTopicK3Change(Number(nextId), topicId, prev.mode, prev.targetMinutes ?? null);
              }
            }}
          >
            {books.map((book) => (
              <option key={book.resource_book} value={book.resource_book}>
                {bookLabel(book)}
              </option>
            ))}
          </select>

          <label className="odev-quota-label">Günlük soru</label>
          <div className="odev-quota-stepper">
            <button
              type="button"
              className="odev-quota-step"
              onClick={() => setDaily(String(Math.max(1, dailyNum - 5)))}
            >
              −
            </button>
            <input
              type="number"
              min={1}
              className="odev-quota-input"
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
            />
            <button
              type="button"
              className="odev-quota-step"
              onClick={() => setDaily(String(dailyNum + 5))}
            >
              +
            </button>
            <div className="odev-quota-weekly">
              Haftalık <strong>{weekly}</strong>
            </div>
          </div>

          <div className="odev-quota-presets">
            {PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                className={`odev-quota-preset${dailyNum === n ? ' is-active' : ''}`}
                onClick={() => setDaily(String(n))}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="odev-quota-actions">
            <button
              type="button"
              className="odev-quota-add"
              style={{ background: meta.accent }}
              disabled={!selected || dailyNum < 1}
              onClick={() => selected && onAdd(selected, dailyNum)}
            >
              {inCart ? 'Güncelle' : 'Ödeve ekle'}
            </button>
            {inCart && cartItem && (
              <button type="button" className="odev-quota-remove" onClick={() => onRemove(cartItem.id)}>
                Çıkar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function QuotaAssignCards({
  resources,
  cart,
  lastDefaults,
  topicK3 = {},
  onTopicK3Change,
  onAdd,
  onRemove,
}: {
  resources: StudentResource[];
  cart: SelectedContent[];
  lastDefaults: Partial<Record<RoutineQuotaKind, LastQuotaDefault | null>>;
  topicK3?: TopicK3Map;
  onTopicK3Change?: (bookId: number, topicId: number, mode: K3Mode | null, targetMinutes: number | null) => void;
  onAdd: (resource: StudentResource, daily: number) => void;
  onRemove: (id: number) => void;
}) {
  const byKind = useMemo(() => {
    const groups: Record<RoutineQuotaKind, StudentResource[]> = { PARAGRAF: [], PROBLEM: [] };
    for (const r of resources) {
      const kind = routineQuotaKindOf(r);
      if (kind) groups[kind].push(r);
    }
    return groups;
  }, [resources]);

  return (
    <div className="odev-quota-row">
      {(['PARAGRAF', 'PROBLEM'] as RoutineQuotaKind[]).map((kind) => (
        <QuotaKindCard
          key={kind}
          kind={kind}
          books={byKind[kind]}
          lastDefault={lastDefaults[kind] || null}
          cartItem={cart.find((c) => c.quotaKind === kind)}
          topicK3={topicK3}
          onTopicK3Change={onTopicK3Change}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
