"use client";

import { useEffect, useRef, useState } from "react";
import { FORMAT_SHORTCUT_HINTS } from "./composer-utils";

const ROWS: Array<{ label: string; hint: string; sample: string }> = [
  { label: "Kalın", hint: FORMAT_SHORTCUT_HINTS.bold, sample: "*metin*" },
  { label: "İtalik", hint: FORMAT_SHORTCUT_HINTS.italic, sample: "_metin_" },
  { label: "Üstü çizili", hint: FORMAT_SHORTCUT_HINTS.strike, sample: "~metin~" },
  { label: "Monospace", hint: FORMAT_SHORTCUT_HINTS.mono, sample: "```metin```" },
];

export default function FormatShortcutHelp() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="comm-shortcut-help" ref={boxRef}>
      <button
        type="button"
        className={`comm-toolbar-btn comm-shortcut-help-btn${open ? " active" : ""}`}
        aria-expanded={open}
        aria-label="Biçim kısayolları"
        title="Biçim kısayolları"
        onClick={() => setOpen((v) => !v)}
      >
        Kısayollar
      </button>
      {open && (
        <div className="comm-shortcut-popover" role="dialog" aria-label="Biçim kısayolları">
          <div className="comm-shortcut-popover-title">Metni seçip uygulayın</div>
          <ul>
            {ROWS.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <code>{row.sample}</code>
                <kbd>{row.hint}</kbd>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
