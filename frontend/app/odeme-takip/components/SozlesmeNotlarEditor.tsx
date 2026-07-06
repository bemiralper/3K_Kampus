'use client';

import { SozlesmeNot, createEmptyNote } from '@/lib/sozlesme-notlar';

interface SozlesmeNotlarEditorProps {
  notes: SozlesmeNot[];
  onChange: (notes: SozlesmeNot[]) => void;
  disabled?: boolean;
}

export default function SozlesmeNotlarEditor({ notes, onChange, disabled }: SozlesmeNotlarEditorProps) {
  const updateNote = (id: string, patch: Partial<SozlesmeNot>) => {
    onChange(notes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const removeNote = (id: string) => {
    onChange(notes.filter((n) => n.id !== id));
  };

  const addNote = () => {
    onChange([...notes, createEmptyNote()]);
  };

  return (
    <div className="sozlesme-notlar-editor">
      {notes.length === 0 && (
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
          Henüz not eklenmedi. Her not için ayrı görünürlük tanımlayabilirsiniz.
        </p>
      )}

      {notes.map((note, index) => (
        <div
          key={note.id}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13, color: '#334155' }}>Not {index + 1}</strong>
            {!disabled && notes.length > 0 && (
              <button
                type="button"
                onClick={() => removeNote(note.id)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Kaldır
              </button>
            )}
          </div>
          <textarea
            value={note.text}
            disabled={disabled}
            onChange={(e) => updateNote(note.id, { text: e.target.value })}
            rows={2}
            placeholder="Not metni..."
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: 14,
              resize: 'vertical',
              marginBottom: 8,
            }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', cursor: disabled ? 'default' : 'pointer' }}>
            <input
              type="checkbox"
              checked={note.veli_ile_paylas}
              disabled={disabled}
              onChange={(e) => updateNote(note.id, { veli_ile_paylas: e.target.checked })}
            />
            {note.veli_ile_paylas ? 'Veli ile paylaş' : 'Sadece kurum içi'}
          </label>
        </div>
      ))}

      {!disabled && (
        <button
          type="button"
          onClick={addNote}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px dashed #94a3b8',
            background: 'white',
            color: '#475569',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          + Not Ekle
        </button>
      )}
    </div>
  );
}
