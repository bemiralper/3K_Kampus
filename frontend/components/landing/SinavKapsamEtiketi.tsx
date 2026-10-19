type SinavKapsamEtiketiProps = {
  kapsam: string;
  compact?: boolean;
};

export default function SinavKapsamEtiketi({ kapsam, compact = false }: SinavKapsamEtiketiProps) {
  const yerel = kapsam === 'yerel';
  const label = yerel ? 'Yerel' : compact ? 'TR Geneli' : 'Türkiye Geneli';

  return (
    <span className={`stk-scope ${yerel ? 'stk-scope--yerel' : 'stk-scope--tr'}`} title={yerel ? 'Yerel sınav' : 'Türkiye geneli sınav'}>
      {yerel ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
        </svg>
      )}
      {label}
    </span>
  );
}
