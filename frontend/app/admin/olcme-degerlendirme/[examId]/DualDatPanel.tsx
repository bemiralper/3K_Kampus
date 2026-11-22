'use client';

import { useEffect, useState } from 'react';
import { dualDatApi, mappingTemplateApi, uploadApi } from '../../../../components/olcme/api';
import type {
  DATSessionItem, DualDatMapping, DualDatOverride, DualDatPart, DualDatPreview,
  DualDatPreviewRow, DualDatSettings, DualDatUpload, FieldMapping, MappingTemplate,
} from '../../../../components/olcme/types';
import u from './upload.module.css';

const PARTS = ['verbal', 'numeric'] as const;
const LABELS = { verbal: 'Sözel', numeric: 'Sayısal' };
const IDENTITY_FIELDS = [
  { field: 'ad_soyad', label: 'Ad soyad', width: 0 },
  { field: 'ogrenci_no', label: 'Öğrenci numarası', width: 0 },
  { field: 'tc_kimlik', label: 'TC kimlik', width: 0 },
  { field: 'kitapcik_turu', label: 'Kitapçık', width: 0 },
];

const emptyMapping = (): DualDatMapping => ({ field_mappings: [], first_line_is_header: false });

function MappingEditor({ part, file, mapping, onChange, templates, onSave, busy }: {
  part: DualDatPart;
  file: DualDatUpload['files'][DualDatPart];
  mapping: DualDatMapping;
  onChange: (mapping: DualDatMapping) => void;
  templates: MappingTemplate[];
  onSave: (name: string) => void;
  busy: boolean;
}) {
  const [templateName, setTemplateName] = useState('');
  const fields = [
    ...IDENTITY_FIELDS,
    ...file.sections.map(sec => ({ field: `ders_${sec.id}`, label: sec.name, width: sec.width })),
  ];
  const columnCount = Math.max(0, ...file.lines.map(line => line.length));
  const sample = file.lines.slice(mapping.first_line_is_header ? 1 : 0);
  const patchField = (field: typeof fields[number], patch: Partial<FieldMapping>) => {
    const current = mapping.field_mappings.find(item => item.field === field.field);
    const updated = { field: field.field, label: field.label, start: -1, end: 0, ...current, ...patch };
    if (field.width && patch.start !== undefined) updated.end = patch.start + field.width;
    onChange({
      ...mapping,
      field_mappings: [...mapping.field_mappings.filter(item => item.field !== field.field), updated],
    });
  };

  return (
    <fieldset className={u.dualCard} disabled={busy}>
      <legend>{LABELS[part]} sütunları</legend>
      <div className={u.dualActions}>
        <label>Şablon
          <select aria-label={`${LABELS[part]} şablon seçimi`} value="" onChange={event => {
            const template = templates.find(item => item.id === Number(event.target.value));
            if (!template) return;
            const field_mappings = template.mappings.flatMap(item => {
              const field = fields.find(candidate => candidate.field === item.field)
                ?? fields.find(candidate => candidate.label.toLocaleLowerCase('tr') === item.label?.toLocaleLowerCase('tr'));
              return field ? [{ ...item, field: field.field, label: field.label }] : [];
            });
            onChange({ field_mappings, first_line_is_header: template.first_line_is_header });
          }}>
            <option value="">Şablon seçin</option>
            {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label>
        <label>Yeni şablon adı
          <input value={templateName} onChange={event => setTemplateName(event.target.value)} maxLength={100} />
        </label>
        <button type="button" className={u.btnGhost} disabled={!templateName.trim()} onClick={() => onSave(templateName.trim())}>
          Şablonu kaydet
        </button>
      </div>
      <label><input type="checkbox" checked={mapping.first_line_is_header} onChange={event =>
        onChange({ ...mapping, first_line_is_header: event.target.checked })
      } /> İlk satır başlık</label>
      <pre className={u.dualSample} aria-label={`${LABELS[part]} DAT sütun cetveli ve ilk satırlar`}>{[
        Array.from({ length: columnCount }, (_, i) => (i + 1) % 10 === 0 ? String(Math.floor((i + 1) / 10) % 10) : ' ').join(''),
        Array.from({ length: columnCount }, (_, i) => String((i + 1) % 10)).join(''),
        ...sample.slice(0, 5),
      ].join('\n')}</pre>
      <div className={u.dualScroll}>
        <table className={u.dualTable}>
          <thead><tr><th>Alan</th><th>İlk sütun</th><th>Son sütun</th><th>İlk satırdaki değer</th></tr></thead>
          <tbody>
            {fields.map(field => {
              const item = mapping.field_mappings.find(entry => entry.field === field.field);
              const start = item?.start ?? -1;
              const end = item?.end ?? 0;
              return (
                <tr key={field.field}>
                  <th scope="row">{field.label}{field.width ? ` (${field.width} soru)` : ''}</th>
                  <td><input type="number" min={1} max={1000} aria-label={`${LABELS[part]} ${field.label} ilk sütun`}
                    value={start >= 0 ? start + 1 : ''} onChange={event =>
                      patchField(field, { start: event.target.value ? Number(event.target.value) - 1 : -1 })
                    } /></td>
                  <td><input type="number" min={1} max={1000} aria-label={`${LABELS[part]} ${field.label} son sütun`}
                    readOnly={Boolean(field.width)} value={start >= 0 && end > 0 ? end : ''} onChange={event =>
                      patchField(field, { end: Number(event.target.value) })
                    } /></td>
                  <td><code>{start >= 0 && end > start ? sample[0]?.slice(start, end) : ''}</code></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

function ReviewRow({ row, part, students, override, onChange }: {
  row: DualDatPreviewRow;
  part: DualDatPart;
  students: DualDatPreview['students'];
  override?: DualDatOverride;
  onChange: (override: DualDatOverride) => void;
}) {
  const [editing, setEditing] = useState(false);
  const label = `${LABELS[part]} ${row.row}. satır`;
  return (
    <tr>
      <td>{row.row}</td>
      <td>{row.name || row.school_no || '—'}</td>
      <td>{editing ? (
        <select aria-label={`${label} öğrenci`} value={override?.student_id ?? ''} onChange={event =>
          onChange({ ...override, student_id: Number(event.target.value) || undefined })
        }>
          <option value="">Otomatik eşleştirme{row.automatic_student_id ?
            ` · ${students.find(student => student.id === row.automatic_student_id)?.name ?? 'Mevcut sonuç var'}` : ''}</option>
          {students.map(student => <option key={student.id} value={student.id}>
            {[student.name, student.class_name, student.school_no].filter(Boolean).join(' · ')}
          </option>)}
        </select>
      ) : row.student_name || '—'}</td>
      <td>{editing ? (
        <select aria-label={`${label} kitapçık`} value={override?.booklet ?? ''} onChange={event =>
          onChange({ ...override, booklet: (event.target.value || undefined) as DualDatOverride['booklet'] })
        }>
          <option value="">Dosyadaki değer · {row.source_booklet || 'Boş'}</option>
          {['A', 'B', 'C', 'D'].map(booklet => <option key={booklet} value={booklet}>{booklet}</option>)}
        </select>
      ) : row.booklet || '—'}</td>
      <td>{override?.excluded ? 'Hariç tutuldu' : row.issue || (row.excluded ? 'Hariç tutuldu' : 'Eşleşti')}</td>
      <td>
        <button type="button" className={u.btnGhost} aria-expanded={editing} onClick={() => setEditing(!editing)}>
          {editing ? 'Kapat' : 'Düzelt'}
        </button>
        {' '}
        <label><input type="checkbox" checked={override?.excluded ?? row.excluded} onChange={event =>
          onChange({ ...override, excluded: event.target.checked })
        } /> Hariç tut</label>
      </td>
    </tr>
  );
}

export default function DualDatPanel({ examId, sessions, onSaved }: {
  examId: number;
  sessions: DATSessionItem[];
  onSaved: (sessionId: number) => void;
}) {
  const [files, setFiles] = useState<Partial<Record<DualDatPart, File>>>({});
  const [reference, setReference] = useState<File>();
  const [upload, setUpload] = useState<DualDatUpload>();
  const [settings, setSettings] = useState<DualDatSettings>({
    verbal: emptyMapping(), numeric: emptyMapping(), overrides: { verbal: {}, numeric: {} },
  });
  const [templates, setTemplates] = useState<Record<DualDatPart, MappingTemplate[]>>({ verbal: [], numeric: [] });
  const [review, setReview] = useState<DualDatPreview>();
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
    setUpload(data);
    setSettings({
      verbal: data.settings.verbal ?? emptyMapping(),
      numeric: data.settings.numeric ?? emptyMapping(),
      overrides: data.settings.overrides ?? { verbal: {}, numeric: {} },
    });
    setReview(undefined);
    setStale(false);
  };
  const mappingPayload = (part: DualDatPart): DualDatMapping => ({
    ...settings[part],
    field_mappings: settings[part].field_mappings.filter(item => item.start >= 0),
  });
  const payload = () => ({ ...settings, verbal: mappingPayload('verbal'), numeric: mappingPayload('numeric') });
  const confirmToken = !stale ? review?.preview_token : null;

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
      {upload && <>
        <div className={u.dualActions}>
          <strong>{upload.session.original_filename}</strong>
          <button type="button" className={u.btnGhost} disabled={busy} onClick={() => {
            setUpload(undefined);
            setFiles({});
            setReference(undefined);
            setError('');
            setNotice('');
            onSaved(0);
          }}>Yüklemelere dön</button>
        </div>
        {upload.has_booklet_reference && <p>C/D soru karşılıkları yüklendi.</p>}
        <p>Sütunlar 1’den başlar. İlk ve son sütun dahildir.</p>
        {PARTS.map(part => <MappingEditor key={part} part={part} file={upload.files[part]}
          mapping={settings[part]} templates={templates[part]} busy={busy}
          onChange={mapping => {
            setSettings(previous => ({ ...previous, [part]: mapping, overrides: { ...previous.overrides, [part]: {} } }));
            setReview(undefined);
          }}
          onSave={name => void perform(async () => {
            const mapping = mappingPayload(part);
            if (!mapping.field_mappings.length || mapping.field_mappings.some(item => item.end <= item.start)) {
              throw new Error('Şablonu kaydetmeden önce sütun aralıklarını tamamlayın.');
            }
            const created = await mappingTemplateApi.create({
              name, exam_type: 'LGS', source_part: part, mappings: mapping.field_mappings,
              first_line_is_header: mapping.first_line_is_header,
              student_id_field: mapping.field_mappings.some(item => item.field === 'tc_kimlik') ? 'tc_kimlik' : 'ogrenci_no',
            });
            setTemplates(previous => ({ ...previous, [part]: [...previous[part], created] }));
            setNotice(`${LABELS[part]} sütun şablonu kaydedildi.`);
          })} />)}
        <div className={u.dualActions}>
          <button type="button" className={u.btnPrimary} disabled={busy} onClick={() => void perform(async () => {
            setReview(await dualDatApi.preview(examId, upload.session.id, payload()));
            setStale(false);
          })}>{review ? 'Önizlemeyi güncelle' : 'Eşleşmeleri önizle'}</button>
          {stale && <span>Düzeltmeler için önizlemeyi güncelleyin.</span>}
        </div>
        {review && <fieldset className={u.dualCard} disabled={busy}>
          <legend>Öğrenci eşleşmeleri</legend>
          {review.scoring_error && <div className={u.alertErr} role="alert">{review.scoring_error}</div>}
          <p>{review.pair_count} öğrenci kayda hazır · {review.unresolved_count} satır incelenmeli · {PARTS.reduce((count, part) =>
            count + review.rows[part].filter(row => row.excluded).length, 0
          )} satır hariç</p>
          <p>Eksik veya mükerrer kayıtları düzeltin ya da ilgili satırları tek tek hariç tutun. Kitapçık değerini optikten doğrulayın.</p>
          {PARTS.map(part => (
            <details key={part} open>
              <summary>{LABELS[part]} · {review.rows[part].length} satır</summary>
              <div className={u.dualScroll}>
                <table className={u.dualTable}>
                  <thead><tr><th>Satır</th><th>Optikteki bilgi</th><th>Öğrenci</th><th>Kitapçık</th><th>Durum</th><th>İşlem</th></tr></thead>
                  <tbody>{review.rows[part].map(row => (
                    <ReviewRow key={row.row} row={row} part={part} students={review.students}
                      override={settings.overrides[part][row.row]} onChange={override => {
                        setSettings(previous => ({
                          ...previous,
                          overrides: { ...previous.overrides, [part]: { ...previous.overrides[part], [row.row]: override } },
                        }));
                        setStale(true);
                      }} />
                  ))}</tbody>
                </table>
              </div>
            </details>
          ))}
          <button type="button" className={u.btnPrimary} disabled={!confirmToken} onClick={() => {
            if (confirmToken && window.confirm(`${review.pair_count} öğrencinin birleşik sonucu kaydedilsin mi?`)) {
              void perform(async () => {
                const saved = await dualDatApi.confirm(examId, upload.session.id, payload(), confirmToken);
                onSaved(saved.session.id);
              });
            }
          }}>Birleşik sonuçları kaydet</button>
        </fieldset>}
      </>}
    </div>
  );
}
