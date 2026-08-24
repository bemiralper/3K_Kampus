"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ensureClassPeriodAttendance,
  fetchClassPeriodStudentAttendance,
  fetchCoachPeriodAttendanceContext,
  previewClassAttendanceNotify,
  saveClassPeriodStudentAttendance,
  sendClassAttendanceNotify,
  type AttendanceRosterRow,
  type ClassAttendanceNotifyRecipient,
  type ClassPeriodSession,
  type CoachPeriodAttendanceContext,
} from "@/lib/academic-api";
import "./coach-class-yoklama.css";

const STATUS_OPTS: { value: AttendanceRosterRow["status"]; label: string }[] = [
  { value: "PRESENT", label: "Var" },
  { value: "LATE", label: "Geç" },
  { value: "ABSENT", label: "Yok" },
  { value: "EXCUSED", label: "İzin" },
];

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

function nowHm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function CoachClassYoklamaClient() {
  const [ctx, setCtx] = useState<CoachPeriodAttendanceContext | null>(null);
  const [termId, setTermId] = useState<number | null>(null);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO);
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
  const [noteOpen, setNoteOpen] = useState<number | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const boot = useCallback(async () => {
    setBooting(true);
    setError("");
    try {
      const data = await fetchCoachPeriodAttendanceContext();
      setCtx(data);
      setTermId((p) => p ?? data.active_term_id ?? data.terms[0]?.id ?? null);
      setClassroomId((p) => p ?? data.classrooms[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sınıf listesi yüklenemedi");
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  const loadSessions = useCallback(async () => {
    if (!termId || !classroomId) {
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
      setSessionId((prev) => (prev && next.some((s) => s.id === prev) ? prev : next[0]?.id ?? null));
    } catch (e) {
      setSessions([]);
      setSessionId(null);
      setInfo(e instanceof Error ? e.message : "Günlük yoklama açılamadı.");
    } finally {
      setLoading(false);
    }
  }, [classroomId, date, termId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadRoster = useCallback(async () => {
    if (!sessionId) {
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
  }, [sessionId]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const patchRow = (studentId: number, patch: Partial<AttendanceRosterRow>) => {
    setRoster((prev) => prev.map((r) => (r.student_id === studentId ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const setStatus = (row: AttendanceRosterRow, status: AttendanceRosterRow["status"]) => {
    const label = STATUS_OPTS.find((o) => o.value === status)?.label || status;
    patchRow(row.student_id, {
      status,
      status_display: label,
      late_time: status === "LATE" ? row.late_time || nowHm() : null,
    });
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, excused: 0 };
    roster.forEach((r) => {
      if (r.status === "PRESENT") c.present += 1;
      else if (r.status === "LATE") c.late += 1;
      else if (r.status === "ABSENT") c.absent += 1;
      else if (r.status === "EXCUSED") c.excused += 1;
    });
    return c;
  }, [roster]);

  const selected = sessions.find((s) => s.id === sessionId);
  const notifyEligible = roster.some((r) => r.status === "ABSENT" || r.status === "LATE");
  const classrooms = ctx?.classrooms || [];

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
          <p className="cyc-kicker">Günlük sınıf yoklaması</p>
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
                {selected ? `${selected.period_label} yoklaması` : "Sabah / öğleden sonra"}
              </p>
            </div>
            <button type="button" className="cyc-today-btn" onClick={() => setDate(todayISO())}>
              Bugün
            </button>
            <button type="button" className="cyc-date-nav" aria-label="Sonraki gün" onClick={() => setDate((d) => shiftISO(d, 1))}>
              ›
            </button>
          </div>

          {(ctx?.terms.length || 0) > 1 ? (
            <div className="cyc-period-row" style={{ marginTop: 12 }}>
              {ctx?.terms.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`cyc-period${termId === t.id ? " is-active" : ""}`}
                  onClick={() => setTermId(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          ) : null}

          {classrooms.length > 0 ? (
            <div className="cyc-class-scroll" role="tablist" aria-label="Sınıflar">
              {classrooms.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`cyc-chip${classroomId === c.id ? " is-active" : ""}`}
                  onClick={() => setClassroomId(c.id)}
                >
                  {c.ad}
                  <span className="cyc-chip-meta">{c.ogrenci_sayisi}</span>
                </button>
              ))}
            </div>
          ) : null}

          {sessions.length > 0 ? (
            <div className="cyc-period-row" role="tablist" aria-label="Periyot">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`cyc-period${sessionId === s.id ? " is-active" : ""}`}
                  onClick={() => setSessionId(s.id)}
                >
                  {s.period_label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {error ? <div className="cyc-error">{error}</div> : null}
      {toast ? <div className="cyc-error" style={{ color: "#047857" }}>{toast}</div> : null}

      {!classrooms.length ? (
        <div className="cyc-empty">
          <h3>Atanmış sınıf yok</h3>
          <p>Günlük yoklama için birincil koç atamanızdaki öğrencilerin sınıfları listelenir.</p>
        </div>
      ) : loading && !sessions.length ? (
        <div className="cyc-loading">Program kontrol ediliyor…</div>
      ) : !sessionId ? (
        <div className="cyc-empty">
          <h3>Bu gün yoklama kapalı</h3>
          <p>{info || "Seçilen sınıfta bugün sabah veya öğleden sonra ders yok."}</p>
        </div>
      ) : (
        <>
          <div className="cyc-stats" aria-label="Özet">
            <span className="cyc-stat is-ok"><b>{counts.present}</b> Var</span>
            <span className="cyc-stat is-late"><b>{counts.late}</b> Geç</span>
            <span className="cyc-stat is-absent"><b>{counts.absent}</b> Yok</span>
            <span className="cyc-stat"><b>{counts.excused}</b> İzin</span>
          </div>

          {roster.length === 0 ? (
            <div className="cyc-empty">
              <h3>Sınıfta öğrenci yok</h3>
              <p>Bu sınıfa dönem içinde yerleşmiş aktif öğrenci bulunmuyor.</p>
            </div>
          ) : (
            <div className="cyc-list">
              {roster.map((row) => (
                <article
                  key={row.student_id}
                  className={`cyc-row${row.status === "LATE" || noteOpen === row.student_id ? " is-open" : ""}`}
                >
                  <div className="cyc-row-main">
                    <span className="cyc-avatar" aria-hidden>
                      {initials(row.student_name)}
                    </span>
                    <div className="cyc-name-col">
                      <div className="cyc-name">{row.student_name}</div>
                      <button
                        type="button"
                        className={`cyc-note-btn${row.note ? " has-note" : ""}`}
                        onClick={() => setNoteOpen((id) => (id === row.student_id ? null : row.student_id))}
                      >
                        {row.note ? "Not var" : "Not"}
                      </button>
                    </div>
                    <div className="cyc-status-row" role="group" aria-label={`${row.student_name} yoklama`}>
                      {STATUS_OPTS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`cyc-status${row.status === opt.value ? ` is-${opt.value}` : ""}`}
                          onClick={() => setStatus(row, opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {row.status === "LATE" ? (
                    <div className="cyc-late-row">
                      <label htmlFor={`late-${row.student_id}`}>Saat</label>
                      <input
                        id={`late-${row.student_id}`}
                        type="time"
                        value={row.late_time || ""}
                        onChange={(e) => patchRow(row.student_id, { late_time: e.target.value })}
                      />
                    </div>
                  ) : null}
                  {noteOpen === row.student_id ? (
                    <input
                      className="cyc-note-input"
                      value={row.note || ""}
                      placeholder="Opsiyonel not"
                      onChange={(e) => patchRow(row.student_id, { note: e.target.value })}
                    />
                  ) : null}
                </article>
              ))}
            </div>
          )}

          <div className="cyc-bar">
            <button type="button" className="coach-btn coach-btn-secondary" onClick={markAllPresent}>
              Tümü var
            </button>
            <button
              type="button"
              className="coach-btn coach-btn-ghost"
              disabled={!notifyEligible || dirty}
              onClick={() => setNotifyOpen(true)}
            >
              Bildir
            </button>
            <button
              type="button"
              className="coach-btn coach-btn-primary"
              disabled={!dirty || saving}
              onClick={save}
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </>
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
          WhatsApp ile gelmedi / geç kalanlar
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
          {recipients.map((r, i) => (
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
