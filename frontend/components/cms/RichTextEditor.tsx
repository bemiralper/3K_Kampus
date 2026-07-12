'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

const FONT_SIZES: { label: string; value: string }[] = [
  { label: 'Küçük', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Orta', value: '4' },
  { label: 'Büyük', value: '5' },
  { label: 'Çok büyük', value: '6' },
];

const BLOCK_FORMATS: { label: string; value: string }[] = [
  { label: 'Paragraf', value: 'p' },
  { label: 'Başlık 2', value: 'h2' },
  { label: 'Başlık 3', value: 'h3' },
  { label: 'Alıntı', value: 'blockquote' },
];

/**
 * Bağımlılıksız zengin metin editörü (contentEditable + execCommand).
 * Kalın/italik/altı çizili, başlık, yazı boyutu, renk, liste, bağlantı, görsel,
 * ve HTML kaynak modu destekler.
 */
export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [showSource, setShowSource] = useState(false);
  const [source, setSource] = useState(value);
  const [color, setColor] = useState('#0f172a');

  // Dışarıdan gelen değeri, editör odakta değilken senkronla
  useEffect(() => {
    if (showSource) return;
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== (value || '')) {
      el.innerHTML = value || '';
    }
  }, [value, showSource]);

  const emit = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const applyBlock = (tag: string) => {
    if (!tag) return;
    exec('formatBlock', tag === 'p' ? 'p' : `<${tag}>`);
  };

  const addLink = () => {
    const url = window.prompt('Bağlantı adresi (https://…)');
    if (url) exec('createLink', url);
  };

  const addImage = () => {
    const url = window.prompt('Görsel adresi (https://… .jpg/.png)');
    if (url) exec('insertImage', url);
  };

  const toggleSource = () => {
    if (showSource) {
      // Kaynaktan editöre dön
      if (ref.current) ref.current.innerHTML = source;
      onChange(source);
      setShowSource(false);
    } else {
      setSource(ref.current?.innerHTML ?? value ?? '');
      setShowSource(true);
    }
  };

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <select
          className="rte-select"
          defaultValue=""
          onChange={(e) => { applyBlock(e.target.value); e.target.value = ''; }}
          title="Paragraf / başlık"
          disabled={showSource}
        >
          <option value="" disabled>Biçim</option>
          {BLOCK_FORMATS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>

        <select
          className="rte-select"
          defaultValue=""
          onChange={(e) => { exec('fontSize', e.target.value); e.target.value = ''; }}
          title="Yazı boyutu"
          disabled={showSource}
        >
          <option value="" disabled>Boyut</option>
          {FONT_SIZES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <span className="rte-divider" />

        <button type="button" className="rte-btn" onClick={() => exec('bold')} title="Kalın" disabled={showSource}><b>B</b></button>
        <button type="button" className="rte-btn" onClick={() => exec('italic')} title="İtalik" disabled={showSource}><i>I</i></button>
        <button type="button" className="rte-btn" onClick={() => exec('underline')} title="Altı çizili" disabled={showSource}><u>U</u></button>

        <span className="rte-divider" />

        <label className="rte-btn rte-color" title="Yazı rengi">
          <span style={{ color }}>A</span>
          <input
            type="color"
            value={color}
            onChange={(e) => { setColor(e.target.value); exec('foreColor', e.target.value); }}
            disabled={showSource}
          />
        </label>

        <span className="rte-divider" />

        <button type="button" className="rte-btn" onClick={() => exec('insertUnorderedList')} title="Madde listesi" disabled={showSource}>•≡</button>
        <button type="button" className="rte-btn" onClick={() => exec('insertOrderedList')} title="Numaralı liste" disabled={showSource}>1.≡</button>
        <button type="button" className="rte-btn" onClick={addLink} title="Bağlantı ekle" disabled={showSource}>🔗</button>
        <button type="button" className="rte-btn" onClick={addImage} title="Görsel ekle" disabled={showSource}>🖼</button>
        <button type="button" className="rte-btn" onClick={() => exec('removeFormat')} title="Biçimi temizle" disabled={showSource}>⌫</button>

        <span className="rte-spacer" />

        <button
          type="button"
          className={`rte-btn rte-source ${showSource ? 'is-active' : ''}`}
          onClick={toggleSource}
          title="HTML kaynağı"
        >
          &lt;/&gt; HTML
        </button>
      </div>

      {showSource ? (
        <textarea
          className="rte-source-area"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <div
          ref={ref}
          className="rte-content"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder || 'İçeriğinizi buraya yazın…'}
          onInput={emit}
          onBlur={emit}
        />
      )}

      <style jsx>{`
        .rte {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          background: #fff;
        }
        .rte-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px;
          padding: 6px 8px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
        .rte-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 30px;
          height: 30px;
          padding: 0 7px;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          color: #334155;
          font-size: 13px;
          cursor: pointer;
        }
        .rte-btn:hover:not(:disabled) {
          background: #e2e8f0;
        }
        .rte-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .rte-btn.is-active {
          background: #0262a7;
          color: #fff;
        }
        .rte-select {
          height: 30px;
          border: 1px solid #e2e8f0;
          border-radius: 7px;
          background: #fff;
          font-size: 12px;
          padding: 0 6px;
          cursor: pointer;
        }
        .rte-color {
          position: relative;
          font-weight: 700;
        }
        .rte-color input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }
        .rte-divider {
          width: 1px;
          height: 20px;
          background: #e2e8f0;
          margin: 0 2px;
        }
        .rte-spacer {
          flex: 1;
        }
        .rte-source {
          font-family: ui-monospace, monospace;
          font-size: 12px;
        }
        .rte-content {
          min-height: 220px;
          max-height: 480px;
          overflow-y: auto;
          padding: 14px 16px;
          font-size: 14px;
          line-height: 1.7;
          color: #0f172a;
          outline: none;
        }
        .rte-content:empty::before {
          content: attr(data-placeholder);
          color: #94a3b8;
        }
        .rte-content :global(h2) { font-size: 1.4em; font-weight: 800; margin: 0.6em 0 0.3em; }
        .rte-content :global(h3) { font-size: 1.15em; font-weight: 700; margin: 0.6em 0 0.3em; }
        .rte-content :global(blockquote) {
          margin: 0.6em 0;
          padding: 0.4em 1em;
          border-left: 3px solid #0262a7;
          color: #475569;
          background: #f8fafc;
        }
        .rte-content :global(img) { max-width: 100%; border-radius: 8px; }
        .rte-content :global(a) { color: #0262a7; text-decoration: underline; }
        .rte-content :global(ul),
        .rte-content :global(ol) { padding-left: 1.5em; margin: 0.4em 0; }
        .rte-source-area {
          width: 100%;
          min-height: 240px;
          padding: 14px 16px;
          border: none;
          outline: none;
          font-family: ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.6;
          resize: vertical;
        }
      `}</style>
    </div>
  );
}
