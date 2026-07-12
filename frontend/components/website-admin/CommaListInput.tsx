'use client';

import { useEffect, useRef, useState } from 'react';
import { WamInput } from './WamField';

type Props = {
  label: string;
  hint?: string;
  full?: boolean;
  placeholder?: string;
  value: string[];
  onChange: (items: string[]) => void;
};

/** Virgülle ayrılmış liste — yazarken virgül kaybolmaz; blur'da parse edilir. */
export default function CommaListInput({ label, hint, full, placeholder, value, onChange }: Props) {
  const [text, setText] = useState(() => value.join(', '));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value.join(', '));
  }, [value]);

  const commit = () => {
    const parsed = text.split(',').map((s) => s.trim()).filter(Boolean);
    onChange(parsed);
    setText(parsed.join(', '));
  };

  return (
    <WamInput
      label={label}
      hint={hint}
      full={full}
      placeholder={placeholder}
      value={text}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}
