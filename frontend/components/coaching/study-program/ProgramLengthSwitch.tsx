'use client';

import { PROGRAM_DAY_COUNT, PROGRAM_DAY_COUNT_LONG, type ProgramLength } from './programDateUtils';

export default function ProgramLengthSwitch({
  value,
  onChange,
  className = 'sps-length',
}: {
  value: ProgramLength;
  onChange: (length: ProgramLength) => void;
  className?: string;
}) {
  return (
    <div className={className} role="group" aria-label="Program uzunluğu">
      <button
        type="button"
        className={value === PROGRAM_DAY_COUNT ? 'is-on' : undefined}
        aria-pressed={value === PROGRAM_DAY_COUNT}
        onClick={() => onChange(PROGRAM_DAY_COUNT)}
      >
        7 gün
      </button>
      <button
        type="button"
        className={value === PROGRAM_DAY_COUNT_LONG ? 'is-on' : undefined}
        aria-pressed={value === PROGRAM_DAY_COUNT_LONG}
        onClick={() => onChange(PROGRAM_DAY_COUNT_LONG)}
      >
        8 gün
      </button>
    </div>
  );
}
