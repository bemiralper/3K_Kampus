"use client";

import {
  SozlesmeNot,
  SozlesmeNotTip,
  createEmptyNote,
  formatNoteDate,
} from "@/lib/sozlesme-notlar";

interface SozlesmeNotlarEditorProps {
  notes: SozlesmeNot[];
  onChange: (notes: SozlesmeNot[]) => void;
  disabled?: boolean;
  /** Yeni not eklerken varsayılan tip */
  defaultTip?: SozlesmeNotTip;
  createdByName?: string;
  /** true: tahsilat görüşmesi odaklı (söz tarihi vb. öne çıkar) */
  odemeOdakli?: boolean;
  /** true: veli paylaşımı yok; her not kurum içi */
  kurumIciOnly?: boolean;
}

export default function SozlesmeNotlarEditor({
  notes,
  onChange,
  disabled,
  defaultTip = "odeme_gorusmesi",
  createdByName,
  odemeOdakli = false,
  kurumIciOnly = false,
}: SozlesmeNotlarEditorProps) {
  const updateNote = (id: string, patch: Partial<SozlesmeNot>) => {
    onChange(
      notes.map((n) =>
        n.id === id
          ? {
              ...n,
              ...patch,
              ...(kurumIciOnly ? { veli_ile_paylas: false } : {}),
            }
          : n,
      ),
    );
  };

  const removeNote = (id: string) => {
    onChange(notes.filter((n) => n.id !== id));
  };

  const addNote = () => {
    const note = createEmptyNote({ tip: defaultTip, created_by_name: createdByName });
    if (kurumIciOnly) note.veli_ile_paylas = false;
    onChange([...notes, note]);
  };

  return (
    <div className="sozlesme-notlar-editor">
      {notes.length === 0 && (
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px" }}>
          {odemeOdakli
            ? "Henüz tahsilat görüşmesi notu yok. Veli ile konuşulan ödeme sözlerini ve tarihleri buraya ekleyin (yalnızca kurum içi)."
            : "Henüz not eklenmedi."}
        </p>
      )}

      {notes.map((note, index) => (
        <div
          key={note.id}
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
            background: note.tip === "odeme_gorusmesi" ? "#fffbeb" : "#f8fafc",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <strong style={{ fontSize: 13, color: "#334155" }}>
                {note.tip === "odeme_gorusmesi" ? "Ödeme görüşmesi" : "Not"} {index + 1}
              </strong>
              {(note.created_at || note.created_by_name) && (
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  {[formatNoteDate(note.created_at), note.created_by_name].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={() => removeNote(note.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#ef4444",
                  cursor: "pointer",
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
            placeholder={
              odemeOdakli || note.tip === "odeme_gorusmesi"
                ? "Örn: Veli ile görüşüldü, 20 Ağustos’ta EFT ile ödeyecekler…"
                : "Not metni..."
            }
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 14,
              resize: "vertical",
              marginBottom: 8,
            }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: kurumIciOnly ? 0 : 8,
            }}
          >
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                Söz verilen ödeme tarihi
              </label>
              <input
                type="date"
                disabled={disabled}
                value={note.soz_verilen_tarih || ""}
                onChange={(e) =>
                  updateNote(note.id, {
                    soz_verilen_tarih: e.target.value || null,
                    tip: note.tip || "odeme_gorusmesi",
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 13,
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                Tip
              </label>
              <select
                disabled={disabled}
                value={note.tip || "genel"}
                onChange={(e) =>
                  updateNote(note.id, { tip: e.target.value as SozlesmeNotTip })
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 13,
                }}
              >
                <option value="odeme_gorusmesi">Ödeme görüşmesi</option>
                <option value="genel">Genel not</option>
              </select>
            </div>
          </div>
          {!kurumIciOnly && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "#475569",
                cursor: disabled ? "default" : "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={note.veli_ile_paylas}
                disabled={disabled}
                onChange={(e) => updateNote(note.id, { veli_ile_paylas: e.target.checked })}
              />
              {note.veli_ile_paylas ? "Veli ile paylaş (PDF’de görünür)" : "Sadece kurum içi"}
            </label>
          )}
          {kurumIciOnly && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
              Kurum içi — veli/PDF’de görünmez
            </div>
          )}
        </div>
      ))}

      {!disabled && (
        <button
          type="button"
          onClick={addNote}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px dashed #0262a7",
            background: "#eff6ff",
            color: "#0262a7",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            width: "100%",
          }}
        >
          + Başka not ekle
        </button>
      )}
    </div>
  );
}
