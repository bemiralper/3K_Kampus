'use client';

import type { SubjectItem } from './types';
import t from './section-tree.module.css';

export function subjectLabel(subject: Pick<SubjectItem, 'name' | 'display_name' | 'code'>): string {
  return subject.display_name || subject.name || subject.code;
}

export function matchSubjectId(subjects: SubjectItem[], name: string): number | null {
  const needle = name.trim().toLocaleLowerCase('tr-TR');
  if (!needle) return null;
  const hit = subjects.find(s =>
    [s.name, s.display_name, s.code].some(v => (v || '').toLocaleLowerCase('tr-TR') === needle),
  );
  return hit?.id ?? null;
}

type SubjectPickerProps = {
  subjects: SubjectItem[];
  value: number | null;
  onChange: (subjectId: number | null, subject?: SubjectItem) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

export default function SubjectPicker({
  subjects,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = 'Müfredattan seç…',
  ariaLabel = 'Müfredat dersi',
  disabled,
}: SubjectPickerProps) {
  return (
    <select
      className={t.subjectSelect}
      value={value ?? ''}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={e => {
        const raw = e.target.value;
        if (!raw) {
          onChange(null);
          return;
        }
        const id = Number(raw);
        onChange(id, subjects.find(s => s.id === id));
      }}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {subjects.map(subject => (
        <option key={subject.id} value={subject.id}>{subjectLabel(subject)}</option>
      ))}
    </select>
  );
}
