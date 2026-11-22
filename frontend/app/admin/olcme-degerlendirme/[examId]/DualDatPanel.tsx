'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { dualDatApi, mappingTemplateApi, uploadApi } from '../../../../components/olcme/api';
import type {
  DATSessionItem, DualDatMapping, DualDatOverride, DualDatPart, DualDatPreview,
  DualDatPreviewRow, DualDatSettings, DualDatUpload, FieldMapping, MappingTemplate,
} from '../../../../components/olcme/types';
import DatColumnPreview from './DatColumnPreview';
import s from '../olcme.module.css';
import u from './upload.module.css';

const PARTS = ['verbal', 'numeric'] as const;
const LABELS = { verbal: 'Sözel', numeric: 'Sayısal' };
const COLOR_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#14b8a6', '#e11d48',
];
const IDENTITY_FIELDS = [
  { field: 'ogrenci_no', label: 'Öğrenci No', color: 0 },
  { field: 'tc_kimlik', label: 'TC Kimlik', color: 1, width: 11 },
  { field: 'ad_soyad', label: 'Ad Soyad', color: 2 },
  { field: 'kitapcik_turu', label: 'Kitapçık Türü', color: 3, width: 1 },
];
const IDENTITY_KEYS = new Set(IDENTITY_FIELDS.map(field => field.field));

const emptyMapping = (): DualDatMapping => ({ field_mappings: [], first_line_is_header: false });

function isIdentity(mapping: FieldMapping) {
  return IDENTITY_KEYS.has(mapping.field);
}

function sameRanges(left: FieldMapping[], right: FieldMapping[]) {
  const key = (item: FieldMapping) => `${item.field}:${item.start}:${item.end}`;
  const a = left.map(key).sort();
  const b = right.map(key).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function fileName(filename: string | undefined, part: DualDatPart) {
  const pieces = (filename || '').split(' + ').map(piece => piece.trim()).filter(Boolean);
  if (pieces.length >= 2) return part === 'verbal' ? pieces[0] : pieces.slice(1).join(' + ');
  return pieces[0] || `${LABELS[part]} DAT`;
}

export default function DualDatPanel({ examId, sessions, onSaved }: {
  examId: number;
  sessions: DATSessionItem[];
  onSaved: (sessionId: number) => void;
}) {
  const [files, setFiles] = useState<Partial<Record<DualDatPart, File>>>({});
  const [reference, setReference] = useState<File>();
  const [upload, setUpload] = useState<DualDatUpload>();
  const [identity, setIdentity] = useState<FieldMapping[]>([]);
  const [numericIdentity, setNumericIdentity] = useState<FieldMapping[]>([]);
  const [identitySeparate, setIdentitySeparate] = useState(false);
  const [answers, setAnswers] = useState<Record<DualDatPart, FieldMapping[]>>({ verbal: [], numeric: [] });
  const [headers, setHeaders] = useState<Record<DualDatPart, boolean>>({ verbal: false, numeric: false });
  const [overrides, setOverrides] = useState<DualDatSettings['overrides']>({ verbal: {}, numeric: {} });
  const [templates, setTemplates] = useState<Record<DualDatPart, MappingTemplate[]>>({ verbal: [], numeric: [] });
  const [review, setReview] = useState<DualDatPreview>();
  const [phase, setPhase] = useState<'columns' | 'matches'>('columns');
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activePart, setActivePart] = useState<DualDatPart | null>(null);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [savePart, setSavePart] = useState<DualDatPart | null>(null);
  const [matchFilter, setMatchFilter] = useState<'all' | 'open'>('all');
  const [matchDialog, setMatchDialog] = useState<{ part: DualDatPart; row: DualDatPreviewRow } | null>(null);
  const [matchQuery, setMatchQuery] = useState('');
  const [pickedStudent, setPickedStudent] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; part: DualDatPart } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([mappingTemplateApi.list('LGS', 'verbal'), mappingTemplateApi.list('LGS', 'numeric')])
      .then(([verbal, numeric]) => { if (active) setTemplates({ verbal, numeric }); })
      .catch(() => { if (active) setError('Sütun şablonları yüklenemedi.'); });
    return () => { active = false; };
  }, []);

  const perform = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const open = (data: DualDatUpload) => {
    const verbal = data.settings.verbal?.field_mappings ?? [];
    const numeric = data.settings.numeric?.field_mappings ?? [];
    const verbalIdentity = verbal.filter(isIdentity);
    const numericIdentityRows = numeric.filter(isIdentity);
    const separate = verbalIdentity.length > 0 && numericIdentityRows.length > 0 && !sameRanges(verbalIdentity, numericIdentityRows);
    setUpload(data);
    setIdentity(verbalIdentity.length ? verbalIdentity : numericIdentityRows);
    setNumericIdentity(separate ? numericIdentityRows : verbalIdentity);
    setIdentitySeparate(separate);
    setAnswers({
      verbal: verbal.filter(item => item.field.startsWith('ders_')),
      numeric: numeric.filter(item => item.field.startsWith('ders_')),
    });
    setHeaders({
      verbal: data.settings.verbal?.first_line_is_header ?? false,
      numeric: data.settings.numeric?.first_line_is_header ?? false,
    });
    setOverrides(data.settings.overrides ?? { verbal: {}, numeric: {} });
    setReview(undefined);
    setPhase('columns');
    setStale(false);
    setActivePart(null);
    setSelStart(null);
    setSelEnd(null);
    setCtxMenu(null);
  };

  const identityFor = (part: DualDatPart) => (identitySeparate && part === 'numeric' ? numericIdentity : identity);

  const visibleMappings = (part: DualDatPart) => [...identityFor(part), ...answers[part]];

  const fields = useMemo(() => {
    if (!upload) return [];
    const identityFields = IDENTITY_FIELDS.map(field => ({ ...field, part: 'identity' as const }));
    const numericIdentityFields = identitySeparate
      ? IDENTITY_FIELDS.map(field => ({ ...field, part: 'numeric-identity' as const }))
      : [];
    return [
      ...identityFields,
      ...numericIdentityFields,
      ...PARTS.flatMap(part => upload.files[part].sections.map((section, index) => ({
        field: `ders_${section.id}`,
        label: section.name,
        color: 4 + (part === 'numeric' ? upload.files.verbal.sections.length : 0) + index,
        width: section.width,
        part,
      }))),
    ];
  }, [upload, identitySeparate]);

  const getColorIndex = (field: string) => fields.find(item => item.field === field)?.color ?? 0;

  const mappingPayload = (part: DualDatPart): DualDatMapping => ({
    field_mappings: visibleMappings(part).filter(item => item.start >= 0 && item.end > item.start),
    first_line_is_header: headers[part],
  });

  const payload = () => ({
    verbal: mappingPayload('verbal'),
    numeric: mappingPayload('numeric'),
    overrides,
  });

  const confirmToken = !stale ? review?.preview_token : null;
  const selLo = selStart !== null && selEnd !== null ? Math.min(selStart, selEnd) : null;
  const selHi = selStart !== null && selEnd !== null ? Math.max(selStart, selEnd) : null;
  const selCount = selLo !== null && selHi !== null ? Math.max(selHi - selLo, 1) : 0;

  const clearSelection = () => {
    setActivePart(null);
    setSelStart(null);
    setSelEnd(null);
    setCtxMenu(null);
  };

  const markDirty = () => {
    setReview(undefined);
    setPhase('columns');
    setOverrides({ verbal: {}, numeric: {} });
  };

  const previewMatches = async (nextOverrides = overrides) => {
    if (!upload) return;
    setOverrides(nextOverrides);
    setStale(true);
    setReview(await dualDatApi.preview(examId, upload.session.id, {
      verbal: mappingPayload('verbal'),
      numeric: mappingPayload('numeric'),
      overrides: nextOverrides,
    }));
    setStale(false);
    setPhase('matches');
  };

  const remapAnswers = (part: DualDatPart, mappings: FieldMapping[]) => {
    const sections = upload?.files[part].sections ?? [];
    const byId = new Set(sections.map(section => section.id));
    const byName = new Map(sections.map(section => [section.name.trim().toLocaleLowerCase('tr'), section]));
    return mappings.flatMap(item => {
      if (!item.field.startsWith('ders_')) return [];
      const id = Number(item.field.replace('ders_', ''));
      if (byId.has(id)) return [item];
      const section = byName.get((item.label || '').trim().toLocaleLowerCase('tr'));
      return section ? [{ ...item, field: `ders_${section.id}`, label: section.name }] : [];
    });
  };

  const applyTemplate = (part: DualDatPart, template: MappingTemplate) => {
    const nextIdentity = template.mappings.filter(isIdentity);
    const nextAnswers = remapAnswers(part, template.mappings);
    setAnswers(previous => ({ ...previous, [part]: nextAnswers }));
    if (identitySeparate && part === 'numeric') {
      if (nextIdentity.length) setNumericIdentity(nextIdentity);
    } else if (nextIdentity.length) {
      setIdentity(nextIdentity);
      if (!identitySeparate) setNumericIdentity(nextIdentity);
    }
    setHeaders(previous => ({ ...previous, [part]: template.first_line_is_header }));
    clearSelection();
    markDirty();
    setNotice(`${LABELS[part]} şablonu uygulandı.`);
  };

  const assignOption = (option: (typeof fields)[number]) => {
    if (selLo === null || selHi === null || !activePart) return;
    const field = option.field;
    const onVerbalIdentity = option.part === 'identity' && identitySeparate && activePart !== 'verbal';
    const onNumericIdentity = option.part === 'numeric-identity' && activePart !== 'numeric';
    const onOtherAnswers = option.part !== 'identity' && option.part !== 'numeric-identity' && option.part !== activePart;
    if (onVerbalIdentity || onNumericIdentity || onOtherAnswers) {
      const where = option.part === 'numeric-identity' || option.part === 'numeric' ? 'numeric' : option.part === 'identity' ? 'verbal' : option.part;
      setError(`${option.label} alanı ${LABELS[where]} dosyasında işaretlenir.`);
      setCtxMenu(null);
      return;
    }
    const lo = selLo;
    const hi = lo + Math.max(selHi - lo, 1);
    if ((option.part === 'verbal' || option.part === 'numeric') && option.width && hi - lo !== option.width) {
      setError(`${option.label} tam ${option.width} karakter olmalı. Seçilen aralık ${hi - lo} karakter.`);
      setCtxMenu(null);
      return;
    }
    const label = option.label;
    const clashParts: DualDatPart[] = option.part === 'identity' && !identitySeparate
      ? [...PARTS]
      : [option.part === 'numeric' || option.part === 'numeric-identity' ? 'numeric' : 'verbal'];
    const clashes = clashParts.flatMap(part =>
      visibleMappings(part).filter(item => item.field !== field && lo < item.end && item.start < hi),
    );
    if (clashes[0]) {
      setError(`Seçilen aralık "${clashes[0].label}" alanıyla çakışıyor.`);
      setCtxMenu(null);
      return;
    }
    const next = { field, start: lo, end: hi, label };
    if (option.part === 'identity' || option.part === 'numeric-identity') {
      const write = (rows: FieldMapping[]) => [...rows.filter(item => item.field !== field), next];
      if (option.part === 'numeric-identity') setNumericIdentity(write);
      else {
        setIdentity(write);
        if (!identitySeparate) setNumericIdentity(write);
      }
    } else {
      setAnswers(previous => ({ ...previous, [activePart]: [...previous[activePart].filter(item => item.field !== field), next] }));
    }
    setError('');
    setCtxMenu(null);
    clearSelection();
    markDirty();
  };

  const removeField = (field: string, part: 'identity' | 'numeric-identity' | DualDatPart) => {
    if (part === 'identity') {
      setIdentity(rows => rows.filter(item => item.field !== field));
      if (!identitySeparate) setNumericIdentity(rows => rows.filter(item => item.field !== field));
    } else if (part === 'numeric-identity') {
      setNumericIdentity(rows => rows.filter(item => item.field !== field));
    } else {
      setAnswers(previous => ({ ...previous, [part]: previous[part].filter(item => item.field !== field) }));
    }
    markDirty();
  };

  const rowFor = (option: { field: string; part: 'identity' | 'numeric-identity' | DualDatPart }) => {
    if (option.part === 'identity') return identity.find(item => item.field === option.field);
    if (option.part === 'numeric-identity') return numericIdentity.find(item => item.field === option.field);
    return answers[option.part].find(item => item.field === option.field);
  };

  const widthIssues = fields.flatMap(option => {
    if (!option.width) return [];
    const row = rowFor(option);
    if (!row) return [];
    const got = row.end - row.start;
    return got === option.width ? [] : [{ part: option.part, label: option.label, got, want: option.width }];
  });

  useEffect(() => {
    if (!ctxMenu) return;
    let armed = false;
    const arm = window.setTimeout(() => { armed = true; }, 280);
    const handler = (event: MouseEvent) => {
      if (!armed) return;
      if (ctxMenuRef.current?.contains(event.target as Node)) return;
      setCtxMenu(null);
    };
    document.addEventListener('click', handler);
    document.addEventListener('contextmenu', handler);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener('click', handler);
      document.removeEventListener('contextmenu', handler);
    };
  }, [ctxMenu]);

  useEffect(() => {
    if (!ctxMenu || !ctxMenuRef.current) return;
    const rect = ctxMenuRef.current.getBoundingClientRect();
    const pad = 8;
    let { x, y } = ctxMenu;
    let changed = false;
    if (rect.right > window.innerWidth - pad) { x = window.innerWidth - rect.width - pad; changed = true; }
    if (rect.bottom > window.innerHeight - pad) { y = window.innerHeight - rect.height - pad; changed = true; }
    if (x < pad) { x = pad; changed = true; }
    if (y < pad) { y = pad; changed = true; }
    if (changed) setCtxMenu({ ...ctxMenu, x, y });
  }, [ctxMenu]);

  const contextFields = ctxMenu ? fields.filter(option => {
    if (option.part === ctxMenu.part) return true;
    if (option.part === 'numeric-identity') return ctxMenu.part === 'numeric';
    if (option.part === 'identity') return !identitySeparate || ctxMenu.part === 'verbal';
    return false;
  }) : [];

  return (
    <div className={u.dualPanel}>
      {error && <div className={u.alertErr} role="alert">{error}</div>}
      {notice && <div className={u.alertOk} role="status">{notice}</div>}
      {!upload && (
        <form className={u.dualCard} onSubmit={event => {
          event.preventDefault();
          if (files.verbal && files.numeric) {
            const { verbal, numeric } = files;
            void perform(async () => open(await dualDatApi.upload(examId, verbal, numeric, reference)));
          }
        }}>
          <p className={u.help}>Sözel ve sayısal optik dosyasını ayrı seçin. Sütunları yükledikten sonra satırın üzerinde boyayacaksınız.</p>
          <div className={u.dualActions}>
            {PARTS.map(part => <label key={part}>{LABELS[part]} DAT
              <input type="file" accept=".dat" required disabled={busy} onChange={event =>
                setFiles(previous => ({ ...previous, [part]: event.target.files?.[0] }))
              } />
            </label>)}
            <label>Kitapçık karşılıkları Excel dosyası (C/D için)
              <input type="file" accept=".xlsx" disabled={busy} onChange={event => setReference(event.target.files?.[0])} />
            </label>
            <button type="submit" className={u.btnPrimary} disabled={busy || !files.verbal || !files.numeric}>Dosyaları yükle</button>
          </div>
        </form>
      )}
      {!upload && sessions.some(session => session.is_dual_dat) && (
        <section className={u.dualCard}>
          <h3>İki DAT yüklemeleri</h3>
          <ul className={u.dualSessions}>
            {sessions.filter(session => session.is_dual_dat).map(session => (
              <li key={session.id}>
                <button type="button" className={u.btnGhost} disabled={busy} onClick={() =>
                  void perform(async () => open(await dualDatApi.open(examId, session.id)))
                }>{session.status === 'COMPLETED' ? 'Yeniden işle' : 'Yüklemeyi aç'}</button>
                <span>{session.original_filename} · {session.status_display}</span>
                {session.status !== 'COMPLETED' && <button type="button" className={u.btnGhost} disabled={busy} onClick={() => {
                  if (window.confirm('Bu bekleyen yükleme silinsin mi?')) {
                    void perform(() => uploadApi.deleteSession(examId, session.id).then(() => onSaved(0)));
                  }
                }}>Sil</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {upload && phase === 'columns' && <>
        <section className={u.bar}>
          <div className={u.barMain}>
            <b>Sözel · {fileName(upload.session.original_filename, 'verbal')}</b>
            <span>Sayısal · {fileName(upload.session.original_filename, 'numeric')}</span>
          </div>
          <button type="button" className={u.btnGhost} disabled={busy} onClick={() => {
            setUpload(undefined);
            setFiles({});
            setReference(undefined);
            setError('');
            setNotice('');
            onSaved(0);
          }}>Başka dosya</button>
          <button type="button" className={u.btnPrimary} disabled={busy} onClick={() => void perform(previewMatches)}>
            {busy ? 'Önizleniyor…' : 'Eşleşmeleri önizle'}
          </button>
        </section>

        <div className={u.mapGrid}>
          <section className={u.panel}>
            <header className={u.panelHead}>
              <h3>Alanlar</h3>
              <span>{fields.filter(field => rowFor(field)).length}/{fields.length}</span>
            </header>
            <p className={u.help}>
              {selCount > 0 && activePart
                ? <>{LABELS[activePart]} dosyasında seçili aralık <b>[{selLo}–{selHi! + 1})</b> · {selCount} karakter. Sağ tıklayın veya soldan alanı seçin.</>
                : 'Aralığı sürükleyin, sonra sağ tıklayıp alanı seçin. Ad, numara ve kitapçık bir kez işaretlenir.'}
            </p>
            {selCount > 0 && (
              <div className={u.rangeInputs}>
                <label>Başlangıç
                  <input type="number" min={0} value={selLo ?? ''} onChange={event => {
                    const value = event.target.value === '' ? null : Number(event.target.value);
                    setSelStart(value);
                    if (selEnd === null && value !== null) setSelEnd(value);
                  }} />
                </label>
                <label>Bitiş
                  <input type="number" min={0} value={selHi !== null ? selHi + 1 : ''} onChange={event => {
                    const value = event.target.value === '' ? null : Number(event.target.value) - 1;
                    setSelEnd(value);
                    if (selStart === null && value !== null) setSelStart(Math.max(value, 0));
                  }} />
                </label>
              </div>
            )}
            <div className={u.fieldList}>
              {fields.map((option, index) => {
                const row = rowFor(option);
                const expectedPart: DualDatPart | null = option.part === 'identity'
                  ? (identitySeparate ? 'verbal' : null)
                  : option.part === 'numeric-identity' ? 'numeric' : option.part;
                const wrongFile = expectedPart !== null && activePart !== null && activePart !== expectedPart;
                const issue = widthIssues.find(item => item.label === option.label && item.part === option.part);
                const previous = fields[index - 1];
                const group = option.part === 'identity'
                  ? (index === 0 ? (identitySeparate ? 'Sözel kimlik' : 'Kimlik') : '')
                  : option.part === 'numeric-identity'
                    ? (previous?.part !== 'numeric-identity' ? 'Sayısal kimlik' : '')
                    : (previous?.part !== option.part ? `${LABELS[option.part]} cevapları` : '');
                return (
                  <div key={`${option.part}-${option.field}`}>
                    {group && <p className={u.fieldGroup}>{group}</p>}
                    <div className={row ? (issue ? u.fieldWarn : u.fieldOk) : u.field}>
                      <span className={u.dot} style={{ background: COLOR_PALETTE[option.color % COLOR_PALETTE.length] }} />
                      <button
                        type="button"
                        className={u.fieldName}
                        disabled={selCount === 0 || wrongFile || busy}
                        title={wrongFile && expectedPart ? `${LABELS[expectedPart]} dosyasında işaretleyin` : undefined}
                        onClick={() => assignOption(option)}
                      >
                        {option.label}
                        {option.width ? <small>{option.width}{option.part === 'identity' ? ' karakter' : ' soru'}</small> : null}
                      </button>
                      {row ? (
                        <>
                          <span className={u.range}>[{row.start}–{row.end}){issue && <em> {issue.got}/{issue.want}</em>}</span>
                          <button type="button" className={u.x} aria-label={`${option.label} eşleştirmesini kaldır`} onClick={() =>
                            removeField(option.field, option.part)
                          }>×</button>
                        </>
                      ) : (
                        <span className={u.rangeEmpty}>{selCount && !wrongFile ? 'Ata' : '—'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={u.options}>
              <label className={u.check}>
                <input type="checkbox" checked={identitySeparate} onChange={event => {
                  const separate = event.target.checked;
                  setIdentitySeparate(separate);
                  if (separate) setNumericIdentity(identity);
                  markDirty();
                }} />
                Sayısal dosyada kimlik sütunları farklı
              </label>
            </div>
            {widthIssues.length > 0 && (
              <ul className={u.issues}>
                {widthIssues.map(issue => (
                  <li key={`${issue.part}-${issue.label}`}><b>{issue.label}</b>: {issue.got} karakter seçildi, {issue.want} olmalı.</li>
                ))}
              </ul>
            )}
            <div className={u.templates}>
              {PARTS.map(part => (
                <div key={part}>
                  <p className={u.fieldGroup}>{LABELS[part]} şablonları</p>
                  <div className={u.chips}>
                    {templates[part].length === 0 && <span className={u.muted}>Kayıtlı şablon yok.</span>}
                    {templates[part].map(template => (
                      <span key={template.id} className={u.chip}>
                        <button type="button" disabled={busy} onClick={() => applyTemplate(part, template)}>{template.name}</button>
                        <button type="button" className={u.chipX} aria-label={`${template.name} şablonunu sil`} onClick={() => {
                          if (!window.confirm(`"${template.name}" şablonu silinsin mi?`)) return;
                          void perform(async () => {
                            await mappingTemplateApi.delete(template.id);
                            setTemplates(previous => ({ ...previous, [part]: previous[part].filter(item => item.id !== template.id) }));
                          });
                        }}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {savePart ? (
                <div className={u.saveRow}>
                  <input value={templateName} placeholder={`${LABELS[savePart]} şablon adı`} onChange={event => setTemplateName(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Escape') setSavePart(null);
                    }} autoFocus />
                  <button type="button" className={u.btnPrimary} disabled={busy || !templateName.trim()} onClick={() => {
                    const part = savePart;
                    const name = templateName.trim();
                    void perform(async () => {
                      const mapping = mappingPayload(part);
                      if (!mapping.field_mappings.length) throw new Error('Şablonu kaydetmeden önce en az bir sütun işaretleyin.');
                      const created = await mappingTemplateApi.create({
                        name, exam_type: 'LGS', source_part: part, mappings: mapping.field_mappings,
                        first_line_is_header: mapping.first_line_is_header,
                        student_id_field: mapping.field_mappings.some(item => item.field === 'tc_kimlik') ? 'tc_kimlik' : 'ogrenci_no',
                      });
                      setTemplates(previous => ({ ...previous, [part]: [...previous[part], created] }));
                      setTemplateName('');
                      setSavePart(null);
                      setNotice(`${LABELS[part]} sütun şablonu kaydedildi.`);
                    });
                  }}>Kaydet</button>
                  <button type="button" className={u.btnGhost} onClick={() => { setSavePart(null); setTemplateName(''); }}>Vazgeç</button>
                </div>
              ) : (
                <div className={u.dualActions}>
                  {PARTS.map(part => (
                    <button key={part} type="button" className={u.linkBtn} onClick={() => { setSavePart(part); setTemplateName(''); }}>
                      {LABELS[part]} eşleştirmesini kaydet
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className={u.dualPreviews}>
            {PARTS.map(part => (
              <section key={part} className={`${u.panel} ${u.previewPanel}`} aria-label={`${LABELS[part]} DAT önizlemesi`}>
                <header className={u.panelHead}>
                  <h3>{LABELS[part]} <small>{fileName(upload.session.original_filename, part)}</small></h3>
                  <label className={u.check}>
                    <input type="checkbox" checked={headers[part]} onChange={event => {
                      setHeaders(previous => ({ ...previous, [part]: event.target.checked }));
                      markDirty();
                    }} />
                    İlk satır başlık
                  </label>
                </header>
                <DatColumnPreview
                  lines={upload.files[part].lines}
                  mappings={visibleMappings(part)}
                  getColorIndex={getColorIndex}
                  selStart={activePart === part ? selStart : null}
                  selEnd={activePart === part ? selEnd : null}
                  maxHeight={560}
                  onContextMenu={event => {
                    if (activePart !== part || selStart === null || selEnd === null) return;
                    const pad = 8;
                    let x = event.clientX;
                    let y = event.clientY;
                    if (x + 280 > window.innerWidth - pad) x = window.innerWidth - 288;
                    if (y + 420 > window.innerHeight - pad) y = window.innerHeight - 428;
                    setCtxMenu({ x: Math.max(pad, x), y: Math.max(pad, y), part });
                  }}
                  onRange={(start, end) => {
                    setCtxMenu(null);
                    setActivePart(part);
                    setSelStart(start);
                    setSelEnd(end);
                    setError('');
                  }}
                />
              </section>
            ))}
          </div>
        </div>
      </>}
      {upload && phase === 'matches' && review && (() => {
        const lines = PARTS.flatMap(part => review.rows[part].map(row => ({ part, row })));
        const readyRow = (part: DualDatPart, row: DualDatPreviewRow) => {
          const excluded = overrides[part][row.row]?.excluded ?? row.excluded;
          return !excluded && !row.issue && (Boolean(row.student_id) || Boolean(row.unregistered));
        };
        const matchedLines = lines.filter(item => readyRow(item.part, item.row));
        const guestCount = lines.filter(item => item.part === 'verbal' && item.row.unregistered && readyRow(item.part, item.row)).length;
        const openLines = lines.filter(item => !matchedLines.includes(item));
        const visible = matchFilter === 'open' ? openLines : lines;
        const matchPct = lines.length ? Math.round((matchedLines.length / lines.length) * 100) : 0;
        const sameName = (left: string, right: string) =>
          left.trim().toLocaleLowerCase('tr') !== '' && left.trim().toLocaleLowerCase('tr') === right.trim().toLocaleLowerCase('tr');
        const patch = (part: DualDatPart, rowNumber: number, override: DualDatOverride, also?: { part: DualDatPart; row: number; override: DualDatOverride }) => {
          const next = {
            ...overrides,
            [part]: { ...overrides[part], [rowNumber]: override },
            ...(also ? { [also.part]: { ...overrides[also.part], [also.row]: also.override } } : {}),
          };
          void perform(() => previewMatches(next));
        };
        const mateOf = (part: DualDatPart, row: DualDatPreviewRow) => {
          const otherPart: DualDatPart = part === 'verbal' ? 'numeric' : 'verbal';
          const others = review.rows[otherPart];
          const byStudent = row.student_id ? others.filter(item => item.student_id === row.student_id) : [];
          const byName = others.filter(item => sameName(item.name, row.name));
          const mate = byStudent.length === 1 ? byStudent[0] : byName.length === 1 ? byName[0] : undefined;
          return mate ? { part: otherPart, row: mate } : undefined;
        };
        const patchPair = (part: DualDatPart, row: DualDatPreviewRow, change: DualDatOverride) => {
          const mate = mateOf(part, row);
          patch(part, row.row, { ...overrides[part][row.row], ...change }, mate ? {
            part: mate.part,
            row: mate.row.row,
            override: { ...overrides[mate.part][mate.row.row], ...change },
          } : undefined);
        };
        const dialogStudents = review.students.filter(student => {
          const query = matchQuery.trim().toLocaleLowerCase('tr');
          if (!query) return true;
          return [student.name, student.school_no, student.class_name].join(' ').toLocaleLowerCase('tr').includes(query);
        });
        return <>
          <section className={u.bar}>
            <div className={u.summary}>
              <p className={u.count}>
                <b>{matchedLines.length}</b>/{lines.length} satır eşleşti
                <span>{review.pair_count} öğrenci kayda hazır{review.unresolved_count ? ` · ${review.unresolved_count} satır incelenmeli` : ''}</span>
              </p>
              <div className={u.meter} aria-hidden><i style={{ width: `${matchPct}%` }} /></div>
            </div>
            <div className={u.barActions}>
              <button type="button" className={u.btnGhost} disabled={busy} onClick={() => setPhase('columns')}>Alanlara dön</button>
              <button type="button" className={u.btnGhost} disabled={busy} onClick={() => void perform(previewMatches)}>
                {busy ? 'Önizleniyor…' : 'Önizlemeyi güncelle'}
              </button>
              <button type="button" className={u.btnPrimary} disabled={!confirmToken || busy} onClick={() => {
                if (confirmToken && window.confirm(`${review.pair_count} öğrencinin birleşik sonucu kaydedilsin mi?`)) {
                  void perform(async () => {
                    const saved = await dualDatApi.confirm(examId, upload.session.id, payload(), confirmToken);
                    onSaved(saved.session.id);
                  });
                }
              }}>Birleşik sonuçları kaydet</button>
            </div>
          </section>
          {review.scoring_error && <div className={u.alertErr} role="alert">{review.scoring_error}</div>}
          {stale && <p className={u.hint}>Düzeltmeler kayda geçsin diye önizlemeyi güncelleyin.</p>}
          {guestCount > 0 && !stale && (
            <p className={u.hint}>{guestCount} öğrencinin sistemde kaydı yok. İki optiği aynı adla durduğu için sonuç listesine adıyla yazılır.</p>
          )}
          {openLines.length > 0 && !stale && (
            <p className={u.hint}>Eşleşmeyen satırlar karneye yazılmaz. Öğrenciyi eşleştirin ya da satırı hariç tutun.</p>
          )}
          <section className={u.panel}>
            <div className={u.filters} role="group" aria-label="Süzgeç">
              <button type="button" className={matchFilter === 'all' ? u.filterOn : u.filter} onClick={() => setMatchFilter('all')}>
                Tümü <b>{lines.length}</b>
              </button>
              {openLines.length > 0 && (
                <button type="button" className={matchFilter === 'open' ? u.filterOn : u.filter} onClick={() => setMatchFilter('open')}>
                  Eşleşmeyen <b>{openLines.length}</b>
                </button>
              )}
            </div>
            <div className={u.tableWrap}>
              <table className={u.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Optik kayıt</th>
                    <th>Öğrenci</th>
                    <th aria-label="İşlem" />
                    <th style={{ textAlign: 'center' }}>Kitapçık</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ part, row }) => {
                    const override = overrides[part][row.row];
                    const excluded = override?.excluded ?? row.excluded;
                    const matched = Boolean(row.student_id) && !row.issue && !excluded;
                    const unregistered = Boolean(row.unregistered) && !row.issue && !excluded;
                    const booklet = override?.booklet ?? row.booklet ?? '';
                    return (
                      <tr key={`${part}-${row.row}`} className={matched || unregistered ? undefined : u.rowOpen}>
                        <td className={u.dim}>{row.row}</td>
                        <td>
                          <div className={u.name}>{row.name || '—'}</div>
                          <div className={u.meta}>{LABELS[part]}{row.school_no ? ` · No ${row.school_no}` : ''}</div>
                        </td>
                        <td>
                          {excluded ? <span className={u.pillWait}>Hariç tutuldu</span> : matched ? (
                            <>
                              <div className={u.nameOk}>{row.student_name}</div>
                              <div className={u.meta}>İki optik eşleşti</div>
                            </>
                          ) : unregistered ? (
                            <>
                              <div className={u.nameOk}>{row.name}</div>
                              <div className={u.meta}>Kayıtsız · sonuç listesine yazılır</div>
                            </>
                          ) : (
                            <>
                              <span className={u.pillErr}>{row.student_id ? 'İncelenmeli' : 'Bulunamadı'}</span>
                              <div className={u.meta}>{row.issue || row.student_name || 'Öğrenci seçilmedi'}</div>
                            </>
                          )}
                        </td>
                        <td>
                          <div className={u.rowActions}>
                            <button type="button" className={row.student_id ? u.btnSmall : u.btnSmallPrimary} disabled={busy} onClick={() => {
                              setMatchDialog({ part, row });
                              setMatchQuery('');
                              setPickedStudent(override?.student_id ?? row.student_id);
                            }}>{row.student_id ? 'Değiştir' : 'Eşleştir'}</button>
                            <button type="button" className={u.btnSmallDanger} disabled={busy} onClick={() =>
                              patchPair(part, row, { excluded: !excluded })
                            }>{excluded ? 'Geri al' : 'Hariç tut'}</button>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <select
                            className={override?.booklet ? u.booklet : u.bookletAuto}
                            aria-label={`${LABELS[part]} ${row.row}. satır kitapçık`}
                            value={booklet}
                            disabled={busy}
                            onChange={event => patchPair(part, row, {
                              booklet: (event.target.value || undefined) as DualDatOverride['booklet'],
                            })}
                          >
                            {!booklet && <option value="">—</option>}
                            {['A', 'B', 'C', 'D'].map(code => <option key={code} value={code}>{code}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {matchDialog && (
            <div className={u.modal} onClick={() => setMatchDialog(null)}>
              <div className={u.sheet} role="dialog" aria-modal="true" aria-label="Öğrenci eşleştir" onClick={event => event.stopPropagation()}>
                <header className={u.sheetHead}>
                  <h3>
                    {matchDialog.row.name || 'Adsız kayıt'}
                    <small>{LABELS[matchDialog.part]} · satır {matchDialog.row.row}{matchDialog.row.school_no ? ` · No ${matchDialog.row.school_no}` : ''}</small>
                  </h3>
                  <button type="button" className={u.x} onClick={() => setMatchDialog(null)} aria-label="Kapat">×</button>
                </header>
                <div className={u.sheetBody}>
                  {matchDialog.row.student_name && <p className={u.current}>Şu an: <b>{matchDialog.row.student_name}</b></p>}
                  <input className={u.search} type="search" placeholder="Ad, soyad, numara veya sınıf" value={matchQuery} onChange={event => setMatchQuery(event.target.value)} autoFocus />
                  <div className={u.candidates}>
                    {dialogStudents.length === 0 && <p className={u.muted}>Öğrenci bulunamadı.</p>}
                    {dialogStudents.map(student => (
                      <button key={student.id} type="button" className={pickedStudent === student.id ? u.candOn : u.cand} onClick={() => setPickedStudent(student.id)}>
                        <span>
                          <b>{student.name}</b>
                          <small>{[student.class_name, student.school_no && `No ${student.school_no}`].filter(Boolean).join(' · ')}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <footer className={u.sheetFoot}>
                  <button type="button" className={u.btnGhost} onClick={() => setMatchDialog(null)}>Vazgeç</button>
                  <button type="button" className={u.btnPrimary} disabled={!pickedStudent} onClick={() => {
                    if (!pickedStudent) return;
                    patchPair(matchDialog.part, matchDialog.row, { student_id: pickedStudent, excluded: false });
                    setMatchDialog(null);
                  }}>Eşleştir</button>
                </footer>
              </div>
            </div>
          )}
        </>;
      })()}
      {ctxMenu && (
        <div ref={ctxMenuRef} className={s.ctxMenu} style={{ left: ctxMenu.x, top: ctxMenu.y, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
          onClick={event => event.stopPropagation()}>
          <div className={s.ctxMenuTitle}>{LABELS[ctxMenu.part]} · alan seçin [{selLo}–{(selHi ?? 0) + 1}) · {selCount} karakter</div>
          {contextFields.map((option, index) => {
            const row = rowFor(option);
            const previous = contextFields[index - 1];
            const group = option.part === 'identity'
              ? (index === 0 ? (identitySeparate ? 'Sözel kimlik' : 'Kimlik') : '')
              : option.part === 'numeric-identity'
                ? (previous?.part !== 'numeric-identity' ? 'Sayısal kimlik' : '')
                : (previous?.part !== option.part ? `${LABELS[option.part]} cevapları` : '');
            return (
              <span key={`${option.part}-${option.field}`}>
                {group && <div className={s.ctxMenuGroupLabel}>{group}</div>}
                <button
                  type="button"
                  className={`${s.ctxMenuItem} ${row ? s.ctxMenuItemDisabled : ''}`}
                  disabled={Boolean(row) || busy}
                  onClick={() => { if (!row) assignOption(option); }}
                >
                  <span className={s.ctxMenuDot} style={{ background: row ? '#c0c8d0' : COLOR_PALETTE[option.color % COLOR_PALETTE.length] }} />
                  <span style={{ flex: 1 }}>
                    {option.label}
                    {option.width ? <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>({option.width}{option.part === 'identity' || option.part === 'numeric-identity' ? ' karakter' : ' soru'})</span> : null}
                  </span>
                  {row && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>[{row.start}–{row.end})</span>}
                </button>
              </span>
            );
          })}
          <div className={s.ctxMenuSep} />
          <button type="button" className={s.ctxMenuItem} onClick={() => setCtxMenu(null)} style={{ color: 'var(--text-secondary)' }}>
            Vazgeç
          </button>
        </div>
      )}
    </div>
  );
}
