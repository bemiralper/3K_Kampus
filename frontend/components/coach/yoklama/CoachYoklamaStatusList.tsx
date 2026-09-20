"use client";

import { useMemo, useState } from "react";
import type { CoachDayRoster, CoachDayRosterRow, CoachDayRosterStatus } from "@/lib/academic-api";
import { exportYoklamaStatusList, type YoklamaExportFormat } from "@/lib/yoklama-status-export";

const STATUS_OPTS: { value: CoachDayRosterStatus; label: string; hint: string; countKey: keyof CoachDayRoster["counts"] }[] = [
  { value: "PRESENT", label: "Var", hint: "Geldi", countKey: "present" },
  { value: "LATE", label: "Geç", hint: "Geç geldi", countKey: "late" },
  { value: "ABSENT", label: "Yok", hint: "Gelmedi", countKey: "absent" },
  { value: "EXCUSED", label: "İzinli", hint: "İzinli", countKey: "excused" },
];

const FORMAT_CARDS: { value: YoklamaExportFormat; title: string; desc: string }[] = [
  { value: "pdf", title: "PDF", desc: "Yazdırılabilir rapor" },
  { value: "xlsx", title: "Excel", desc: "Tablo olarak aç" },
  { value: "csv", title: "CSV", desc: "Düz metin" },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function toggleValue<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function groupRows(rows: CoachDayRosterRow[]) {
  const map = new Map<string, CoachDayRosterRow[]>();
  rows.forEach((row) => {
    const key = row.classroom_ad || "Sınıf";
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr"));
}

function filterRows(
  rows: CoachDayRosterRow[],
  statuses: CoachDayRosterStatus[],
  classroomIds: number[],
  period: "all" | "MORNING" | "AFTERNOON",
  query: string,
) {
  const q = query.trim().toLocaleLowerCase("tr");
  return rows.filter((r) => {
    if (statuses.length && !statuses.includes(r.status)) return false;
    if (classroomIds.length && !classroomIds.includes(r.classroom_id)) return false;
    if (period !== "all" && r.period !== period) return false;
    if (q && !`${r.student_name} ${r.classroom_ad}`.toLocaleLowerCase("tr").includes(q)) return false;
    return true;
  });
}

export default function CoachYoklamaStatusList({
  data,
  loading,
  dateLabel,
  onOpenClass,
}: {
  data: CoachDayRoster | null;
  loading: boolean;
  dateLabel: string;
  onOpenClass: (classroomId: number) => void;
}) {
  const [statuses, setStatuses] = useState<CoachDayRosterStatus[]>([]);
  const [period, setPeriod] = useState<"all" | "MORNING" | "AFTERNOON">("all");
  const [classroomIds, setClassroomIds] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [format, setFormat] = useState<YoklamaExportFormat>("pdf");
  const [exportStatuses, setExportStatuses] = useState<CoachDayRosterStatus[]>([]);
  const [exportClassroomIds, setExportClassroomIds] = useState<number[]>([]);
  const [exportPeriod, setExportPeriod] = useState<"all" | "MORNING" | "AFTERNOON">("all");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const allRows = data?.rows || [];
  const rows = useMemo(
    () => filterRows(allRows, statuses, classroomIds, period, query),
    [allRows, classroomIds, period, query, statuses],
  );
  const exportRows = useMemo(
    () => filterRows(allRows, exportStatuses, exportClassroomIds, exportPeriod, ""),
    [allRows, exportClassroomIds, exportPeriod, exportStatuses],
  );
  const groups = useMemo(() => groupRows(rows), [rows]);
  const counts = data?.counts || { present: 0, late: 0, absent: 0, excused: 0, total: 0 };

  const openExport = () => {
    setExportStatuses(statuses);
    setExportClassroomIds(classroomIds);
    setExportPeriod(period);
    setFormat("pdf");
    setExportError("");
    setExportOpen(true);
  };

  const runExport = async () => {
    if (!data || !exportRows.length) return;
    setExporting(true);
    setExportError("");
    try {
      const exportClassLabel = exportClassroomIds.length
        ? exportClassroomIds.map((id) => data.classrooms.find((c) => c.id === id)?.ad).filter(Boolean).join(", ")
        : "Tüm sınıflar";
      const exportStatusLabel = exportStatuses.length
        ? exportStatuses.map((s) => STATUS_OPTS.find((o) => o.value === s)?.label).filter(Boolean).join(", ")
        : "Tüm durumlar";
      await exportYoklamaStatusList({
        rows: exportRows,
        date: data.date,
        dateLabel,
        filterSummary: [
          exportStatusLabel,
          exportPeriod === "all" ? null : exportPeriod === "MORNING" ? "Sabah" : "Öğleden sonra",
          exportClassLabel,
        ]
          .filter(Boolean)
          .join(" · "),
        format,
        statuses: exportStatuses,
        classroomIds: exportClassroomIds,
        period: exportPeriod,
      });
      setExportOpen(false);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Dışa aktarma başarısız");
    } finally {
      setExporting(false);
    }
  };

  if (loading && !data) {
    return <div className="cyc-loading">Durum listesi yükleniyor…</div>;
  }

  return (
    <div className="cys">
      <div className="cys-head">
        <div>
          <h3>Gelme durumu</h3>
          <p>{counts.total ? `${rows.length} / ${counts.total} kayıt · ${dateLabel}` : "Bu gün henüz yoklama kaydı yok"}</p>
        </div>
        <button type="button" className="cys-download" disabled={!counts.total} onClick={openExport}>
          İndir
        </button>
      </div>

      <div className="cys-stats" role="group" aria-label="Gelme durumu">
        <button
          type="button"
          className={`cys-stat is-all${!statuses.length ? " is-active" : ""}`}
          onClick={() => setStatuses([])}
        >
          <b>{counts.total}</b>
          <span>Tümü</span>
        </button>
        {STATUS_OPTS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`cys-stat is-${opt.value}${statuses.includes(opt.value) ? " is-active" : ""}`}
            onClick={() => setStatuses((prev) => toggleValue(prev, opt.value))}
          >
            <b>{counts[opt.countKey]}</b>
            <span>{opt.label}</span>
            <em>{opt.hint}</em>
          </button>
        ))}
      </div>
      <p className="cys-hint">Var, yok, geç veya izinliden birini ya da birkaçını seçin.</p>

      <div className="cys-filters">
        <select
          className="cyc-select"
          value={period}
          onChange={(e) => setPeriod(e.target.value as typeof period)}
          aria-label="Periyot"
        >
          <option value="all">Tüm periyotlar</option>
          <option value="MORNING">Sabah</option>
          <option value="AFTERNOON">Öğleden sonra</option>
        </select>
        <input
          className="cyc-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Öğrenci veya sınıf ara"
          aria-label="Öğrenci ara"
        />
      </div>

      {(data?.classrooms.length || 0) > 0 ? (
        <div className="cys-class-block">
          <strong>Sınıflar</strong>
          <div className="cys-picks" role="group" aria-label="Sınıf">
            <button
              type="button"
              className={`cys-pick${!classroomIds.length ? " is-active" : ""}`}
              onClick={() => setClassroomIds([])}
            >
              Tüm sınıflar
            </button>
            {(data?.classrooms || []).map((c) => (
              <button
                key={c.id}
                type="button"
                className={`cys-pick${classroomIds.includes(c.id) ? " is-active" : ""}`}
                onClick={() => setClassroomIds((prev) => toggleValue(prev, c.id))}
              >
                {c.ad}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!counts.total ? (
        <div className="cyc-empty">
          <h3>Bu gün kayıt yok</h3>
          <p>Yoklaması alınan öğrencilerin geldi / gelmedi / geç / izinli durumları burada listelenir.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="cyc-empty">
          <h3>Bu filtrede kayıt yok</h3>
          <p>Gelme durumu, periyot veya sınıf filtresini değiştirin.</p>
        </div>
      ) : (
        <div className="cys-groups">
          {groups.map(([title, items]) => (
            <section key={title} className="cys-group">
              <div className="cys-group-head">
                <h4>{title}</h4>
                <span>{items.length}</span>
              </div>
              <div className="cys-list">
                {items.map((row) => (
                  <button
                    key={row.record_id}
                    type="button"
                    className={`cys-row is-${row.status}`}
                    onClick={() => onOpenClass(row.classroom_id)}
                  >
                    <span className="cyc-avatar" aria-hidden>
                      {initials(row.student_name)}
                    </span>
                    <span className="cys-row-main">
                      <strong>{row.student_name}</strong>
                      <em>
                        {row.period_label}
                        {row.late_time ? ` · ${row.late_time}` : ""}
                        {row.note ? ` · ${row.note}` : ""}
                      </em>
                    </span>
                    <span className={`cys-chip is-${row.status}`}>{row.status_display}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {exportOpen ? (
        <>
          <button type="button" className="cyc-sheet-backdrop" aria-label="Kapat" onClick={() => setExportOpen(false)} />
          <div className="cyc-sheet cys-export-sheet" role="dialog" aria-modal="true">
            <h3>Durum listesini indir</h3>
            <p className="cyc-sheet-sub">{dateLabel} · {exportRows.length} kayıt</p>

            <div className="cys-export-block">
              <strong>Format</strong>
              <div className="cys-formats">
                {FORMAT_CARDS.map((card) => (
                  <button
                    key={card.value}
                    type="button"
                    className={`cys-format${format === card.value ? " is-active" : ""}`}
                    onClick={() => setFormat(card.value)}
                  >
                    <em>{card.title}</em>
                    <span>{card.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="cys-export-block">
              <strong>Gelme durumu</strong>
              <div className="cys-picks">
                <button
                  type="button"
                  className={`cys-pick${!exportStatuses.length ? " is-active" : ""}`}
                  onClick={() => setExportStatuses([])}
                >
                  Tümü
                </button>
                {STATUS_OPTS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`cys-pick is-${opt.value}${exportStatuses.includes(opt.value) ? " is-active" : ""}`}
                    onClick={() => setExportStatuses((prev) => toggleValue(prev, opt.value))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="cys-export-block">
              <strong>Periyot</strong>
              <div className="cys-picks">
                {[
                  { value: "all" as const, label: "Tümü" },
                  { value: "MORNING" as const, label: "Sabah" },
                  { value: "AFTERNOON" as const, label: "Öğleden sonra" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`cys-pick${exportPeriod === opt.value ? " is-active" : ""}`}
                    onClick={() => setExportPeriod(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="cys-export-block">
              <strong>Sınıflar</strong>
              <div className="cys-picks cys-picks-class">
                <button
                  type="button"
                  className={`cys-pick cys-pick-wide${!exportClassroomIds.length ? " is-active" : ""}`}
                  onClick={() => setExportClassroomIds([])}
                >
                  Tüm sınıflar
                </button>
                {(data?.classrooms || []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`cys-pick cys-pick-wide${exportClassroomIds.includes(c.id) ? " is-active" : ""}`}
                    onClick={() => setExportClassroomIds((prev) => toggleValue(prev, c.id))}
                  >
                    {c.ad}
                  </button>
                ))}
              </div>
            </div>

            {exportError ? <div className="cyc-error">{exportError}</div> : null}

            <div className="cyc-bar" style={{ position: "static" }}>
              <button type="button" className="coach-btn coach-btn-secondary" onClick={() => setExportOpen(false)}>
                Vazgeç
              </button>
              <button
                type="button"
                className="coach-btn coach-btn-primary"
                disabled={!exportRows.length || exporting}
                onClick={runExport}
              >
                {exporting ? "Hazırlanıyor…" : `İndir (${exportRows.length})`}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
