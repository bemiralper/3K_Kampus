/** Ödev plan / sonuç PDF ortak meta sütun kutusu */

export function MetaCol({
  label,
  value,
  minWidth = 38,
  valueColor = "#334155",
  borderColor = "#e2e8f0",
  background = "#fff",
}: {
  label: string;
  value: string;
  minWidth?: number;
  valueColor?: string;
  borderColor?: string;
  background?: string;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minWidth,
      padding: "3px 8px",
      border: `1px solid ${borderColor}`,
      borderRadius: 4,
      background,
      lineHeight: 1.15,
    }}>
      <span style={{
        fontSize: 7,
        fontWeight: 600,
        color: "#94a3b8",
        textTransform: "uppercase",
        letterSpacing: 0.3,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 11,
        fontWeight: 700,
        color: valueColor,
        marginTop: 1,
      }}>
        {value}
      </span>
    </div>
  );
}

/** Kaynak content_type veya kayıtlı task_type */
export function assignmentTypeLabel(t: string): string {
  switch (t) {
    case "TEST_SET":
    case "SOLVE_TEST":
    case "SOLVE_EXAM":
      return "Test";
    case "PAGE_RANGE":
    case "SOLVE_PDF":
      return "PDF";
    case "VIDEO":
    case "WATCH_VIDEO":
      return "Video";
    case "REVIEW_TOPIC":
      return "Konu";
    case "ANALYZE_MISTAKES":
      return "Analiz";
    case "TAKE_NOTES":
      return "Not";
    case "CUSTOM":
      return "Özel";
    default:
      return "Görev";
  }
}
