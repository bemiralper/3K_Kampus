/** Ortak tab / sayfa lazy-load iskeleti */
export default function TabPanelLoading({ label = "Yükleniyor..." }: { label?: string }) {
  return (
    <div className="empty-state" style={{ padding: "48px 20px" }}>
      <div className="empty-state-icon">
        <svg className="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <h4>{label}</h4>
    </div>
  );
}
