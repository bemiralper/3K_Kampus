'use client';

import type { SubjectItem } from './types';
import t from './section-tree.module.css';

export function subjectLabel(subject: Pick<SubjectItem, 'name' | 'display_name' | 'code'>): string {
  return subject.display_name || subject.name || subject.code;
}

function normalizeSubjectKey(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

/** Şablon adı → müfredattaki gerçek ad / kod. */
const SUBJECT_ALIASES: Record<string, string[]> = {
  'din kültürü': [
    'din kültürü ve ahlak bilgisi',
    'din kültürü ve ahlâk bilgisi',
    'dkab',
    'dinkul_tyt',
    'dinkul_lgs',
    'dinkul',
  ],
  'din kültürü ve ahlak bilgisi': ['din kültürü', 'dkab'],
  'din kültürü ve ahlâk bilgisi': ['din kültürü', 'dkab'],
  'felsefe (seçmeli)': ['felsefe'],
  'felsefe seçmeli': ['felsefe'],
  'ilave felsefe': ['felsefe'],
};

function subjectKeys(subject: SubjectItem): string[] {
  return [subject.name, subject.display_name, subject.code]
    .map(value => normalizeSubjectKey(value || ''))
    .filter(Boolean);
}

export function matchSubjectId(subjects: SubjectItem[], name: string): number | null {
  const needle = normalizeSubjectKey(name);
  if (!needle) return null;

  const exact = subjects.find(subject => subjectKeys(subject).includes(needle));
  if (exact) return exact.id;

  const stripped = normalizeSubjectKey(name.replace(/[()]/g, ' '));
  const aliases = [
    ...(SUBJECT_ALIASES[needle] || []),
    ...(stripped !== needle ? (SUBJECT_ALIASES[stripped] || []) : []),
  ];
  for (const alias of aliases) {
    const key = normalizeSubjectKey(alias);
    const hit = subjects.find(subject => subjectKeys(subject).includes(key));
    if (hit) return hit.id;
  }

  // "Din Kültürü" → "Din Kültürü ve Ahlak Bilgisi"
  const prefixed = subjects.find(subject =>
    subjectKeys(subject).some(label => label.startsWith(`${needle} ve `) || label.startsWith(`${needle} `)),
  );
  return prefixed?.id ?? null;
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
