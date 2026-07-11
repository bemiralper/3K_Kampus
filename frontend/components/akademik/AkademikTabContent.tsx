type Props = {
  tabLabel: string;
  groupLabel: string;
};

export default function AkademikTabContent({ tabLabel, groupLabel }: Props) {
  return (
    <div className="akademik-placeholder-card">
      <span className="akademik-placeholder-icon" aria-hidden>
        🚧
      </span>
      <h2>{tabLabel}</h2>
      <p>
        <strong>{tabLabel}</strong> ekranı <strong>{groupLabel}</strong> bölümünde
        yakında aktif edilecek.
      </p>
    </div>
  );
}
