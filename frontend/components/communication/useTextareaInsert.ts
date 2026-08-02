"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { insertAtCursor } from "./composer-utils";

/**
 * Metin alanının son imleç konumunu hatırlar; alan odaktan çıksa bile
 * (ör. değişken çipine tıklanınca) eklemeyi o konuma yapar.
 * Alana hiç dokunulmadıysa metnin sonuna ekler.
 */
export function useTextareaInsert() {
  const [node, setNode] = useState<HTMLTextAreaElement | null>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (!node) return;
    const remember = () => {
      selection.current = { start: node.selectionStart, end: node.selectionEnd };
    };
    const events = ["select", "click", "keyup", "input", "focus"];
    events.forEach((evt) => node.addEventListener(evt, remember));
    return () => events.forEach((evt) => node.removeEventListener(evt, remember));
  }, [node]);

  const insert = useCallback(
    (current: string, token: string) => {
      const sel = selection.current;
      const start = Math.min(sel ? sel.start : current.length, current.length);
      const end = Math.min(sel ? sel.end : current.length, current.length);
      const result = insertAtCursor(current, start, end, token);
      selection.current = { start: result.cursor, end: result.cursor };
      requestAnimationFrame(() => {
        node?.focus();
        node?.setSelectionRange(result.cursor, result.cursor);
      });
      return result.text;
    },
    [node],
  );

  return { setNode, insert };
}
