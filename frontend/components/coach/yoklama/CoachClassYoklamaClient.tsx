"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ensureClassPeriodAttendance,
  fetchClassPeriodStudentAttendance,
  fetchCoachPeriodAttendanceContext,
  fetchCoachPeriodDayRoster,
  previewClassAttendanceNotify,
  saveClassPeriodStudentAttendance,
  sendClassAttendanceNotify,
  type AttendanceRosterRow,
  type ClassAttendanceNotifyRecipient,
  type ClassPeriodSession,
  type CoachAttendanceState,
  type CoachDayRoster,
  type CoachPeriodAttendanceContext,
  type CoachPeriodClassroom,
} from "@/lib/academic-api";
import CoachYoklamaStatusList from "./CoachYoklamaStatusList";
import ClassYoklamaConsole from "./ClassYoklamaConsole";
import "./coach-class-yoklama.css";

const STATE_ORDER: Record<CoachAttendanceState, number> = {
  pending: 0,
  partial: 1,
  done: 2,
  no_lesson: 3,
};

const STATE_LABEL: Record<CoachAttendanceState, string> = {
  pending: "Bekliyor",
  partial: "Devam",
  done: "Yapıldı",
  no_lesson: "Ders yok",
};

function isCompleteClass(row: CoachPeriodClassroom) {
  if (row.attendance_state === "done") return true;
  return row.periods.length > 0 && row.periods.every((p) => p.taken);
}

function cardState(row: CoachPeriodClassroom): CoachAttendanceState {
  if (row.attendance_state === "no_lesson") return "no_lesson";
  if (isCompleteClass(row)) return "done";
  if (row.periods.some((p) => p.taken) || row.attendance_state === "partial") return "partial";
  return "pending";
}

function takenPeriodLabel(row: CoachPeriodClassroom) {
  if (isCompleteClass(row)) return "Yapıldı";
  const taken = row.periods.filter((p) => p.taken);
  if (taken.length === 1) return `${taken[0].period_label} alındı`;
  if (taken.length > 1) return "Devam";
  return STATE_LABEL[row.attendance_state];
}

type ListFilter = "action" | "done" | "all";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatLongDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatShortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("tr-TR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function sortClassrooms(rows: CoachPeriodClassroom[]) {
  return [...rows].sort((a, b) => {
    const byState = STATE_ORDER[a.attendance_state] - STATE_ORDER[b.attendance_state];
    if (byState !== 0) return byState;
    return a.ad.localeCompare(b.ad, "tr");
  });
}

function levelLabel(seviye: string) {
  return /sınıf/i.test(seviye) ? seviye : `${seviye}. Sınıf`;
}

function groupClassrooms(rows: CoachPeriodClassroom[]) {
  const terms = [...new Set(rows.map((r) => r.term_name).filter(Boolean))];
  const levels = [...new Set(rows.map((r) => r.seviye).filter(Boolean))];
  const multiTerm = terms.length > 1;
  const multiLevel = levels.length > 1;

  if (multiTerm && multiLevel) {
    const keys = [...new Set(rows.map((r) => `${r.term_name}|||${r.seviye}`))];
    return keys
      .sort((a, b) => a.localeCompare(b, "tr", { numeric: true }))
      .map((key) => {
        const [term, seviye] = key.split("|||");
        return {
          title: `${term} · ${levelLabel(seviye)}`,
          items: sortClassrooms(rows.filter((r) => r.term_name === term && r.seviye === seviye)),
        };
      });
  }
  if (multiTerm) {
    return terms
      .sort((a, b) => a.localeCompare(b, "tr"))
      .map((title) => ({ title, items: sortClassrooms(rows.filter((r) => r.term_name === title)) }));
  }
  if (multiLevel) {
    return levels
      .sort((a, b) => a.localeCompare(b, "tr", { numeric: true }))
      .map((title) => ({
        title: levelLabel(title),
        items: sortClassrooms(rows.filter((r) => r.seviye === title)),
      }));
  }
  return [{ title: "", items: sortClassrooms(rows) }];
}

export default function CoachClassYoklamaClient() {
  const [ctx, setCtx] = useState<CoachPeriodAttendanceContext | null>(null);
  const [view, setView] = useState<"list" | "detail">("list");
  const [pageTab, setPageTab] = useState<"classes" | "status">("classes");
  const [dayRoster, setDayRoster] = useState<CoachDayRoster | null>(null);
  const [dayRosterLoading, setDayRosterLoading] = useState(false);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [termId, setTermId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO);
  const [filter, setFilter] = useState<ListFilter>("action");
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<ClassPeriodSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [info, setInfo] = useState("");
  const [roster, setRoster] = useState<AttendanceRosterRow[]>([]);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [notifyOpen, setNotifyOpen] = useState(false);

  const loadContext = useCallback(async () => {
    const data = await fetchCoachPeriodAttendanceContext(date);
    setCtx(data);
    return data;
  }, [date]);

  const loadDayRoster = useCallback(async () => {
    setDayRosterLoading(true);
    try {
      const data = await fetchCoachPeriodDayRoster(date);
      setDayRoster(data);
      return data;
    } finally {
      setDayRosterLoading(false);
    }
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const first = !ctx;
      if (first) setBooting(true);
      setError("");
      try {
        const data = await loadContext();
        if (!cancelled) setCtx(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Sınıf listesi yüklenemedi");
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // İlk yükleme ve tarih değişince yenile — ctx kasıtlı bağımlılık değil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadContext]);

  useEffect(() => {
    loadDayRoster().catch(() => {
      setDayRoster(null);
    });
  }, [loadDayRoster]);

  const loadSessions = useCallback(async () => {
    if (!termId || !classroomId || view !== "detail") {
      setSessions([]);
      setSessionId(null);
      setInfo("");
      return;
    }
    setLoading(true);
    try {
      const data = await ensureClassPeriodAttendance({
        term_id: termId,
        classroom_id: classroomId,
        date,
      });
      const next = data.sessions || [];
      setSessions(next);
      setInfo(data.info || (next.length === 0 ? "Bu sınıfın seçilen günde dersi yok." : ""));
      setSessionId((prev) => {
        if (prev && next.some((s) => s.id === prev)) return prev;
        return next.find((s) => !s.taken)?.id ?? next[0]?.id ?? null;
      });
    } catch (e) {
      setSessions([]);
      setSessionId(null);
      setInfo(e instanceof Error ? e.message : "Günlük yoklama açılamadı.");
    } finally {
      setLoading(false);
    }
  }, [classroomId, date, termId, view]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadRoster = useCallback(async () => {
    if (!sessionId || view !== "detail") {
      setRoster([]);
      return;
    }
    try {
      const data = await fetchClassPeriodStudentAttendance(sessionId);
      setRoster(data.roster);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Liste yüklenemedi");
      setRoster([]);
    }
  }, [sessionId, view]);

  const refreshLiveLessons = useCallback(async () => {
    if (!sessionId || view !== "detail") return;
    try {
      const data = await fetchClassPeriodStudentAttendance(sessionId);
      setRoster((prev) => prev.map((row) => {
        const next = data.roster.find((item) => item.student_id === row.student_id);
        return next ? { ...row, canli_ders: next.canli_ders } : row;
      }));
    } catch {
      /* ignore */
    }
  }, [sessionId, view]);

  useEffect(() => {
    if (view !== "detail" || !sessionId) return;
    const timer = window.setInterval(() => {
      refreshLiveLessons();
    }, 45000);
    return () => window.clearInterval(timer);
  }, [refreshLiveLessons, sessionId, view]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const patchRow = (studentId: number, patch: Partial<AttendanceRosterRow>) => {
    setRoster((prev) => prev.map((r) => (r.student_id === studentId ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const markAllPresent = () => {
    setRoster((prev) =>
      prev.map((r) => ({
        ...r,
        status: "PRESENT",
        status_display: "Var",
        late_time: null,
      })),
    );
    setDirty(true);
  };

  const save = async () => {
    if (!sessionId) return;
    setSaving(true);
    setError("");
    try {
      const result = await saveClassPeriodStudentAttendance(
        sessionId,
        roster.map((r) => ({
          student_id: r.student_id,
          status: r.status,
          note: r.note,
          late_time: r.status === "LATE" ? r.late_time || null : null,
        })),
      );
      setRoster(result.roster);
      setDirty(false);
      setToast("Yoklama kaydedildi");
      await loadContext();
      await loadSessions();
      await loadDayRoster().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  const classrooms = ctx?.classrooms || [];
  const selectedClass = classrooms.find((c) => c.id === classroomId) || null;
  const selected = sessions.find((s) => s.id === sessionId);
  const notifyEligible = roster.some((r) => r.status === "ABSENT" || r.status === "LATE");

  const summary = useMemo(() => {
    const pending = classrooms.filter((c) => !isCompleteClass(c) && c.attendance_state !== "no_lesson").length;
    const done = classrooms.filter((c) => isCompleteClass(c)).length;
    const idle = classrooms.filter((c) => c.attendance_state === "no_lesson").length;
    return { pending, done, idle, total: classrooms.length };
  }, [classrooms]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    const filtered = classrooms.filter((c) => {
      if (filter === "action" && (isCompleteClass(c) || c.attendance_state === "no_lesson")) return false;
      if (filter === "done" && !isCompleteClass(c)) return false;
      if (q && !`${c.ad} ${c.kod} ${c.seviye}`.toLocaleLowerCase("tr").includes(q)) return false;
      return true;
    });
    return groupClassrooms(filtered);
  }, [classrooms, filter, query]);

  const openClass = (row: CoachPeriodClassroom) => {
    setClassroomId(row.id);
    setTermId(row.term_id ?? ctx?.active_term_id ?? null);
    setSessionId(null);
    setView("detail");
    setError("");
  };

  const backToList = async () => {
    setView("list");
    setClassroomId(null);
    setSessions([]);
    setSessionId(null);
    setRoster([]);
    setDirty(false);
    try {
      await Promise.all([loadContext(), loadDayRoster()]);
    } catch {
      /* liste zaten yüklü */
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (booting) {
    return <div className="cyc-loading">Sınıflar yükleniyor…</div>;
  }

  return (
    <div className="cyc-page">
      <section className="cyc-hero">
        <div className="cyc-hero-inner">
          <div className="cyc-hero-top">
            {view === "detail" ? (
              <button type="button" className="cyc-back" onClick={backToList}>
                ← Sınıflar
              </button>
            ) : (
              <p className="cyc-kicker">Sınıf yoklaması</p>
            )}
            {ctx?.active_year?.yil_str ? (
              <span className="cyc-year-chip">{ctx.active_year.yil_str}</span>
            ) : null}
          </div>
          <div className="cyc-date-row">
            <button type="button" className="cyc-date-nav" aria-label="Önceki gün" onClick={() => setDate((d) => shiftISO(d, -1))}>
              ‹
            </button>
            <div className="cyc-date-main">
              <h2 className="cyc-date-label">
                <span className="cyc-date-long">{formatLongDate(date)}</span>
                <span className="cyc-date-short">{formatShortDate(date)}</span>
              </h2>
              <p className="cyc-date-sub">
                {view === "detail" && selectedClass
                  ? selectedClass.ad
                  : pageTab === "status" && dayRoster
                    ? `${dayRoster.counts.present} var · ${dayRoster.counts.late} geç · ${dayRoster.counts.absent} yok · ${dayRoster.counts.excused} izinli`
                    : `${summary.pending} bekliyor · ${summary.done} yapıldı`}
              </p>
            </div>
            <button type="button" className="cyc-today-btn" onClick={() => setDate(todayISO())}>
              Bugün
            </button>
            <button type="button" className="cyc-date-nav" aria-label="Sonraki gün" onClick={() => setDate((d) => shiftISO(d, 1))}>
              ›
            </button>
          </div>

          {view === "list" ? (
            <div className="cyc-page-tabs" role="tablist" aria-label="Sayfa">
              <button
                type="button"
                className={`cyc-page-tab${pageTab === "classes" ? " is-active" : ""}`}
                onClick={() => setPageTab("classes")}
              >
                Sınıflar
              </button>
              <button
                type="button"
                className={`cyc-page-tab${pageTab === "status" ? " is-active" : ""}`}
                onClick={() => setPageTab("status")}
              >
                Durum listesi
                {dayRoster?.counts.total ? <b>{dayRoster.counts.total}</b> : null}
              </button>
            </div>
          ) : null}

          {view === "detail" && sessions.length > 0 ? (
            <div className="cyc-period-row" role="tablist" aria-label="Periyot">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`cyc-period${sessionId === s.id ? " is-active" : ""}${s.taken ? " is-taken" : ""}`}
                  onClick={() => setSessionId(s.id)}
                >
                  {s.period_label}
                  {s.taken ? " · alındı" : ""}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {error ? <div className="cyc-error">{error}</div> : null}
      {toast ? <div className="cyc-toast">{toast}</div> : null}

      {view === "list" && pageTab === "status" ? (
        <CoachYoklamaStatusList
          data={dayRoster}
          loading={dayRosterLoading}
          dateLabel={formatLongDate(date)}
          onOpenClass={(id) => {
            const row = classrooms.find((c) => c.id === id);
            if (row) openClass(row);
          }}
        />
      ) : view === "list" ? (
        <ListView
          classrooms={classrooms}
          groups={visibleGroups}
          filter={filter}
          query={query}
          summary={summary}
          onFilter={setFilter}
          onQuery={setQuery}
          onOpen={openClass}
        />
      ) : loading && !sessions.length ? (
        <div className="cyc-loading">Program kontrol ediliyor…</div>
      ) : !sessionId ? (
        <div className="cyc-empty">
          <h3>Bu gün yoklama kapalı</h3>
          <p>{info || "Seçilen sınıfta bugün sabah, öğle veya akşam dersi yok."}</p>
        </div>
      ) : (
        <ClassYoklamaConsole
          className={selectedClass?.ad || selected?.sinif_name || "Sınıf"}
          dateLabel={formatLongDate(date)}
          sessions={sessions}
          session={selected || null}
          roster={roster}
          loading={loading}
          saving={saving}
          dirty={dirty}
          onBack={backToList}
          onSelectSession={setSessionId}
          onPatch={patchRow}
          onMarkAllPresent={markAllPresent}
          onSave={save}
          onNotify={() => setNotifyOpen(true)}
          notifyEligible={notifyEligible}
        />
      )}

      {notifyOpen && sessionId ? (
        <CoachNotifySheet
          sourceId={sessionId}
          title={selected ? `${selected.period_label} bildirimi` : "Yoklama bildirimi"}
          onClose={() => setNotifyOpen(false)}
          onSent={(n) => {
            setNotifyOpen(false);
            setToast(`${n} bildirim kuyruğa alındı`);
          }}
        />
      ) : null}
    </div>
  );
}

function ListView({
  classrooms,
  groups,
  filter,
  query,
  summary,
  onFilter,
  onQuery,
  onOpen,
}: {
  classrooms: CoachPeriodClassroom[];
  groups: { title: string; items: CoachPeriodClassroom[] }[];
  filter: ListFilter;
  query: string;
  summary: { pending: number; done: number; idle: number; total: number };
  onFilter: (value: ListFilter) => void;
  onQuery: (value: string) => void;
  onOpen: (row: CoachPeriodClassroom) => void;
}) {
  if (!classrooms.length) {
    return (
      <div className="cyc-empty">
        <h3>Aktif yılda sınıf yok</h3>
        <p>Yalnızca aktif eğitim yılındaki, birincil koç atamanızdaki öğrencilerin sınıfları listelenir.</p>
      </div>
    );
  }

  const visibleCount = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="cyc-board">
      <div className="cyc-board-tools">
        <div className="cyc-filter-row" role="tablist" aria-label="Durum">
          <button type="button" className={`cyc-filter${filter === "action" ? " is-active" : ""}`} onClick={() => onFilter("action")}>
            Yapılacak
            <b>{summary.pending}</b>
          </button>
          <button type="button" className={`cyc-filter${filter === "done" ? " is-active" : ""}`} onClick={() => onFilter("done")}>
            Yapıldı
            <b>{summary.done}</b>
          </button>
          <button type="button" className={`cyc-filter${filter === "all" ? " is-active" : ""}`} onClick={() => onFilter("all")}>
            Tümü
            <b>{summary.total}</b>
          </button>
        </div>
        <input
          className="cyc-search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Sınıf ara"
          aria-label="Sınıf ara"
        />
      </div>

      {visibleCount === 0 ? (
        <div className="cyc-empty">
          <h3>Bu filtrede sınıf yok</h3>
          <p>{filter === "done" ? "Sabah, öğle ve akşam yoklaması tamamlanan sınıf yok." : "Bekleyen yoklama kalmadı."}</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.title || "all"} className="cyc-group">
            {group.title ? <h3 className="cyc-group-title">{group.title}</h3> : null}
            <div className="cyc-cards">
              {group.items.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`cyc-class-card is-${cardState(row)}`}
                  onClick={() => onOpen(row)}
                >
                  <span className={`cyc-state-dot is-${cardState(row)}`} aria-hidden />
                  <span className="cyc-class-main">
                    <strong>{row.ad}</strong>
                    <em>{row.ogrenci_sayisi} öğrenci</em>
                    {row.periods.length ? (
                      <span className="cyc-period-pills">
                        {row.periods.map((p) => (
                          <span
                            key={p.period}
                            className={`cyc-period-pill${p.taken ? " is-taken" : " is-wait"}`}
                          >
                            {p.taken ? `${p.period_label} alındı` : p.period_label}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className={`cyc-state-badge is-${cardState(row)}`}>
                    {takenPeriodLabel(row)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function CoachNotifySheet({
  sourceId,
  title,
  onClose,
  onSent,
}: {
  sourceId: number;
  title: string;
  onClose: () => void;
  onSent: (sent: number) => void;
}) {
  const [sendVeli, setSendVeli] = useState(true);
  const [sendOgrenci, setSendOgrenci] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [oturumAd, setOturumAd] = useState("");
  const [recipients, setRecipients] = useState<ClassAttendanceNotifyRecipient[]>([]);

  const types = useMemo(() => {
    const t: Array<"VELI" | "OGRENCI"> = [];
    if (sendVeli) t.push("VELI");
    if (sendOgrenci) t.push("OGRENCI");
    return t;
  }, [sendOgrenci, sendVeli]);

  useEffect(() => {
    if (!types.length) {
      setRecipients([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await previewClassAttendanceNotify({
          source_type: "PERIOD",
          source_id: sourceId,
          recipient_types: types,
        });
        if (cancelled) return;
        setOturumAd(res.oturum_ad || "");
        setRecipients(res.recipients || []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Önizleme yüklenemedi");
          setRecipients([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceId, types]);

  const pending = recipients.filter((r) => !r.skip_reason && r.recipient_id);
  const listed = [...pending, ...recipients.filter((r) => r.skip_reason || !r.recipient_id)];

  const send = async () => {
    if (!types.length || !pending.length) return;
    setSending(true);
    setError("");
    try {
      const res = await sendClassAttendanceNotify({
        source_type: "PERIOD",
        source_id: sourceId,
        recipient_types: types,
      });
      onSent(res.sent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gönderim başarısız");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button type="button" className="cyc-sheet-backdrop" aria-label="Kapat" onClick={onClose} />
      <div className="cyc-sheet" role="dialog" aria-modal="true">
        <h3>{title}</h3>
        <p className="cyc-sheet-sub">
          {oturumAd ? `${oturumAd} · ` : ""}
          Şu an gelmedi / geç olanlar. Daha önce gönderilenler tekrar gitmez.
        </p>
        <div className="cyc-checks">
          <label>
            <input type="checkbox" checked={sendVeli} onChange={(e) => setSendVeli(e.target.checked)} /> Veli
          </label>
          <label>
            <input type="checkbox" checked={sendOgrenci} onChange={(e) => setSendOgrenci(e.target.checked)} /> Öğrenci
          </label>
        </div>
        {error ? <div className="cyc-error">{error}</div> : null}
        {loading ? <p className="cyc-sheet-sub">Önizleme yükleniyor…</p> : null}
        <div className="cyc-recip">
          {listed.map((r, i) => (
            <div key={`${r.recipient_type}-${r.recipient_id}-${i}`} className={`cyc-recip-item${r.skip_reason ? " is-skip" : ""}`}>
              <div className="cyc-recip-name">
                {r.ogrenci_ad} · {r.recipient_type === "VELI" ? "Veli" : "Öğrenci"}
              </div>
              <div className="cyc-recip-meta">
                {r.telefon || "Telefon yok"}
                {r.skip_reason ? ` · ${r.skip_reason}` : ""}
              </div>
              {r.body ? <p className="cyc-recip-body">{r.body}</p> : null}
            </div>
          ))}
          {!loading && recipients.length === 0 ? (
            <p className="cyc-sheet-sub">Gönderilecek gelmedi / geç kaydı yok.</p>
          ) : null}
        </div>
        <div className="cyc-bar" style={{ position: "static" }}>
          <button type="button" className="coach-btn coach-btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="button"
            className="coach-btn coach-btn-primary"
            disabled={!pending.length || sending}
            onClick={send}
          >
            {sending ? "Gönderiliyor…" : `Gönder (${pending.length})`}
          </button>
        </div>
      </div>
    </>
  );
}
