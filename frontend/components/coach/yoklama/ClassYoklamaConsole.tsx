"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type AttendanceRosterRow,
  type ClassPeriodSession,
  type LiveLessonInfo,
} from "@/lib/academic-api";
import "@/components/kutuphane/yoklama/yoklama-drawer.css";

const STATUS_ORDER: AttendanceRosterRow["status"][] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];
const STATUS_KEYS: Record<string, AttendanceRosterRow["status"]> = {
  "1": "PRESENT",
  "2": "LATE",
  "3": "ABSENT",
  "4": "EXCUSED",
};
const STATUS_LABEL: Record<AttendanceRosterRow["status"], string> = {
  PRESENT: "Var",
  LATE: "Geç",
  ABSENT: "Yok",
  EXCUSED: "İzin",
};

function telHref(phone?: string | null) {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts[1]?.[0] || "")).toLocaleUpperCase("tr");
}

function liveLessonLine(info?: LiveLessonInfo | null) {
  if (!info?.derste) return "";
  return [info.ders_turu_label, info.ders_adi, info.saat, info.yer].filter(Boolean).join(" · ");
}

export default function ClassYoklamaConsole({
  className,
  dateLabel,
  sessions,
  session,
  roster,
  loading,
  saving,
  dirty,
  onBack,
  onSelectSession,
  onPatch,
  onMarkAllPresent,
  onSave,
  onNotify,
  notifyEligible,
}: {
  className: string;
  dateLabel: string;
  sessions: ClassPeriodSession[];
  session: ClassPeriodSession | null;
  roster: AttendanceRosterRow[];
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  onBack: () => void;
  onSelectSession: (id: number) => void;
  onPatch: (studentId: number, patch: Partial<AttendanceRosterRow>) => void;
  onMarkAllPresent: () => void;
  onSave: () => void;
  onNotify: () => void;
  notifyEligible: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const navList = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    const rows = [...roster].sort((a, b) => a.student_name.localeCompare(b.student_name, "tr"));
    if (!q) return rows;
    return rows.filter((r) => r.student_name.toLocaleLowerCase("tr").includes(q));
  }, [query, roster]);

  const active = roster.find((r) => r.student_id === activeId) || navList[0] || null;

  useEffect(() => {
    if (!activeId && navList[0]) setActiveId(navList[0].student_id);
  }, [activeId, navList]);

  useEffect(() => {
    if (photoOpen && !active?.profil_foto) setPhotoOpen(false);
  }, [photoOpen, active?.profil_foto]);

  const openStudent = (id: number) => {
    setActiveId(id);
    if (isNarrow) setSheetOpen(true);
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (photoOpen) {
          setPhotoOpen(false);
          return;
        }
        if (isNarrow && sheetOpen) {
          setSheetOpen(false);
          return;
        }
        onBack();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        onSave();
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const status = STATUS_KEYS[e.key];
      if (status && active) {
        onPatch(active.student_id, {
          status,
          status_display: STATUS_LABEL[status],
          late_time: status === "LATE" ? active.late_time || nowHm() : null,
        });
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        const i = navList.findIndex((r) => r.student_id === active?.student_id);
        const next = navList[Math.min(navList.length - 1, i + 1)];
        if (next) setActiveId(next.student_id);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        const i = navList.findIndex((r) => r.student_id === active?.student_id);
        const next = navList[Math.max(0, i - 1)];
        if (next) setActiveId(next.student_id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [active, isNarrow, navList, onBack, onPatch, onSave, photoOpen, sheetOpen]);

  const stats = useMemo(() => ({
    present: roster.filter((r) => r.status === "PRESENT").length,
    late: roster.filter((r) => r.status === "LATE").length,
    absent: roster.filter((r) => r.status === "ABSENT").length,
    excused: roster.filter((r) => r.izinli_mi || r.status === "EXCUSED").length,
  }), [roster]);

  const call = active ? telHref(active.veli_telefon) : null;

  return (
    <div className="yc-root" role="dialog" aria-modal="true" aria-labelledby="yc-title">
      <header className="yc-top">
        <div>
          <p className="yc-kicker">{session?.period_label || "Periyot"} · {session?.taken ? "Alındı" : "Canlı"}</p>
          <h1 className="yc-title" id="yc-title">{className}</h1>
          <div className="yc-sub">
            {dateLabel} · {roster.length} öğrenci
            <span className="yc-sub-hint"> · oklarla gez, 1–4 ile işaretle</span>
          </div>
          {sessions.length > 1 ? (
            <div className="yc-periods" role="tablist" aria-label="Periyot">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`yc-period${session?.id === s.id ? " is-on" : ""}${s.taken ? " is-taken" : ""}`}
                  onClick={() => onSelectSession(s.id)}
                >
                  {s.period_label}{s.taken ? " · alındı" : ""}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="yc-meters">
          <div className="yc-meter is-present"><b>{stats.present}</b><span>Var</span></div>
          <div className="yc-meter is-late"><b>{stats.late}</b><span>Geç</span></div>
          <div className="yc-meter is-absent"><b>{stats.absent}</b><span>Yok</span></div>
          <div className="yc-meter"><b>{stats.excused}</b><span>İzin</span></div>
        </div>
      </header>

      <div className="yc-stage">
        <section className="yc-floor">
          <div className="yc-floor-head">
            <label className="yc-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" />
              </svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İsim ara" />
            </label>
          </div>
          {loading ? (
            <div className="yc-inspect-empty">Liste yükleniyor…</div>
          ) : (
            <>
              <div className="yc-mosaic">
                {navList.map((r) => (
                  <button
                    key={r.student_id}
                    type="button"
                    className={`yc-tile is-${r.status}${r.canli_ders?.derste ? " is-live" : ""}${active?.student_id === r.student_id ? " is-on" : ""}`}
                    onClick={() => openStudent(r.student_id)}
                  >
                    <div className="yc-tile-top">
                      <em>{r.izinli_mi ? "İzinli" : "Öğrenci"}</em>
                      <span className="yc-dot" />
                    </div>
                    <strong>{r.student_name}</strong>
                    <span className="yc-tag">{STATUS_LABEL[r.status]}</span>
                    {r.canli_ders?.derste && <span className="yc-live">Derste</span>}
                  </button>
                ))}
              </div>
              {!roster.length && <div className="yc-inspect-empty">Bu sınıfta öğrenci yok.</div>}
            </>
          )}
        </section>

        {isNarrow && sheetOpen && <div className="yc-scrim" onClick={() => setSheetOpen(false)} />}
        <aside className={`yc-inspect${isNarrow ? " as-sheet" : ""}${isNarrow && sheetOpen ? " is-open" : ""}`}>
          {isNarrow && (
            <button type="button" className="yc-sheet-grip" onClick={() => setSheetOpen(false)} aria-label="Kapat">
              <i />
            </button>
          )}
          {!active ? (
            <div className="yc-inspect-empty">Soldan bir öğrenci seç.</div>
          ) : (
            <>
              <div className="yc-inspect-head">
                <div className="yc-who">
                  {active.profil_foto ? (
                    <button
                      type="button"
                      className="yc-face-btn"
                      onClick={() => setPhotoOpen(true)}
                      aria-label="Fotoğrafı büyüt"
                    >
                      <img className="yc-face" src={active.profil_foto} alt="" />
                    </button>
                  ) : (
                    <span className="yc-face is-fallback">{initials(active.student_name)}</span>
                  )}
                  <div className="yc-who-text">
                    <div className="yc-desk-no">{className}</div>
                    <h2>{active.student_name}</h2>
                    {active.izinli_mi && <span className="yc-izin">{active.izin_sebep || "İzinli"}</span>}
                    {active.canli_ders?.derste && (
                      <div className="yc-live-box" role="status">
                        <b>Şu anda derste</b>
                        <span>{liveLessonLine(active.canli_ders)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="yc-stepper">
                  <button
                    type="button"
                    aria-label="Önceki"
                    onClick={() => {
                      const i = navList.findIndex((r) => r.student_id === active.student_id);
                      const prev = navList[Math.max(0, i - 1)];
                      if (prev) setActiveId(prev.student_id);
                    }}
                  >‹</button>
                  <button
                    type="button"
                    aria-label="Sonraki"
                    onClick={() => {
                      const i = navList.findIndex((r) => r.student_id === active.student_id);
                      const next = navList[Math.min(navList.length - 1, i + 1)];
                      if (next) setActiveId(next.student_id);
                    }}
                  >›</button>
                </div>
              </div>
              <div className="yc-keys is-quad">
                {STATUS_ORDER.map((key, index) => (
                  <button
                    key={key}
                    type="button"
                    className={`yc-key${active.status === key ? ` on-${key}` : ""}`}
                    onClick={() => onPatch(active.student_id, {
                      status: key,
                      status_display: STATUS_LABEL[key],
                      late_time: key === "LATE" ? active.late_time || nowHm() : null,
                    })}
                  >
                    <small>{index + 1}</small>
                    <b>{STATUS_LABEL[key]}</b>
                  </button>
                ))}
              </div>
              <div className="yc-side">
                {call ? (
                  <a className="yc-veli" href={call}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 5c0 8.3 6.7 15 15 15a2 2 0 002-2v-2.3a1 1 0 00-.8-1l-3.2-.7a1 1 0 00-1 .4l-.9 1.2a12 12 0 01-5-5l1.2-.9a1 1 0 00.4-1L11 6.8a1 1 0 00-1-.8H6a2 2 0 00-2 2z" />
                    </svg>
                    <span>
                      <em>Veliyi ara</em>
                      <b>{active.veli_ad || active.veli_telefon}</b>
                    </span>
                  </a>
                ) : (
                  <span className="yc-veli is-empty">
                    <em>Veli telefonu yok</em>
                  </span>
                )}
              </div>
              {active.status === "LATE" && (
                <div className="yc-times">
                  <label>
                    Geliş
                    <input
                      type="time"
                      value={active.late_time || ""}
                      onChange={(e) => onPatch(active.student_id, { late_time: e.target.value })}
                    />
                  </label>
                </div>
              )}
              <textarea
                className="yc-note"
                value={active.note || ""}
                onChange={(e) => onPatch(active.student_id, { note: e.target.value })}
                placeholder="Not"
              />
            </>
          )}
        </aside>
      </div>

      <footer className="yc-dock">
        <div className="yc-dock-left">
          <button type="button" className="yc-btn plain" onClick={onBack}>Çık</button>
          <button
            type="button"
            className="yc-btn plain"
            disabled={!notifyEligible || dirty}
            onClick={onNotify}
          >
            <span className="yc-label-full">Veli bildirimi</span>
            <span className="yc-label-short">Bildirim</span>
          </button>
          <button type="button" className="yc-btn good" onClick={onMarkAllPresent}>
            Hepsi var
          </button>
        </div>
        <div className="yc-dock-right">
          <button type="button" className="yc-btn save" onClick={onSave} disabled={!dirty || saving}>
            {saving ? "Kaydediliyor" : "Kaydet"}
          </button>
        </div>
      </footer>

      {photoOpen && active?.profil_foto && (
        <div
          className="yc-photo"
          role="dialog"
          aria-modal="true"
          aria-label={`${active.student_name} fotoğrafı`}
          onClick={() => setPhotoOpen(false)}
        >
          <button type="button" className="yc-photo-close" onClick={() => setPhotoOpen(false)} aria-label="Kapat">
            ×
          </button>
          <img src={active.profil_foto} alt={active.student_name} onClick={(e) => e.stopPropagation()} />
          <p>{active.student_name}</p>
        </div>
      )}
    </div>
  );
}

function nowHm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
