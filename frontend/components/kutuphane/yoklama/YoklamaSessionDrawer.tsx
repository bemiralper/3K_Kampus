"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import AttendanceNotifyPanel, { NotificationStatusChips } from "./AttendanceNotifyPanel";
import {
  type AttendanceNotifyConfig,
  type AttendanceNotifyEventType,
  type AttendanceNotifyStatusResponse,
  type AttendancePendingNotification,
  type AttendanceRecord,
  type AttendanceSession,
  type AttendanceStatus,
} from "@/lib/kutuphane-api";
import "./yoklama-notify.css";
import "./yoklama-drawer.css";

type View = "salon" | "bildirim";

interface StatusLabelInfo {
  label: string;
  color: string;
  bg: string;
}

interface YoklamaSessionDrawerProps {
  session: AttendanceSession;
  records: AttendanceRecord[];
  loading: boolean;
  saving: boolean;
  sortBy: "student" | "desk";
  onSortByChange: (v: "student" | "desk") => void;
  onClose: () => void;
  onSave: () => void;
  onCloseSession: () => void;
  onReopenSession: () => void;
  onUpdateRecord: (recordId: string, field: string, value: string) => void;
  onSetAllStatus: (status: AttendanceStatus) => void;
  notifyStatus: AttendanceNotifyStatusResponse | null;
  notifyConfig: AttendanceNotifyConfig | null;
  onNotify: (event: AttendanceNotifyEventType, ogrenciIds?: number[]) => void;
  onOpenSettings: () => void;
  pendingBanner: AttendancePendingNotification | null;
  onDismissPending: () => void;
  onPreviewPending: () => void;
  templatesBasePath?: string;
  overlayStyle?: CSSProperties;
  modalBoxStyle?: (width: number) => CSSProperties;
  modalHeaderStyle?: CSSProperties;
  modalFooterStyle?: CSSProperties;
  closeBtnStyle?: CSSProperties;
  saveBtnStyle?: CSSProperties;
  thStyle?: CSSProperties;
  tdStyle?: CSSProperties;
  attendanceStatusLabels: Record<string, StatusLabelInfo>;
  Badge?: React.ComponentType<{ label: string; color: string; bg: string; border?: string }>;
  EmptyState?: React.ComponentType<{ icon: string; title: string; description?: string }>;
}

const STATUS_ORDER: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "NOT_AT_DESK"];
const STATUS_KEYS: Record<string, AttendanceStatus> = {
  "1": "PRESENT",
  "2": "ABSENT",
  "3": "LATE",
  "4": "EXCUSED",
  "5": "NOT_AT_DESK",
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

function deskSort(a: AttendanceRecord, b: AttendanceRecord) {
  const nA = parseInt(a.masa_no || "", 10);
  const nB = parseInt(b.masa_no || "", 10);
  if (!Number.isNaN(nA) && !Number.isNaN(nB) && nA !== nB) return nA - nB;
  return (a.masa_no || a.ogrenci_adi || "").localeCompare(b.masa_no || b.ogrenci_adi || "", "tr");
}

function liveLessonLine(info?: AttendanceRecord["canli_ders"]) {
  if (!info?.derste) return "";
  return [info.ders_turu_label, info.ders_adi, info.saat, info.yer].filter(Boolean).join(" · ");
}

export default function YoklamaSessionDrawer({
  session,
  records,
  loading,
  saving,
  onClose,
  onSave,
  onCloseSession,
  onReopenSession,
  onUpdateRecord,
  onSetAllStatus,
  notifyStatus,
  notifyConfig,
  onNotify,
  onOpenSettings,
  pendingBanner,
  onDismissPending,
  onPreviewPending,
  templatesBasePath,
  attendanceStatusLabels,
}: YoklamaSessionDrawerProps) {
  const [view, setView] = useState<View>("salon");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const editable = session.durum === "OPEN";

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const openStudent = (id: string) => {
    setActiveId(id);
    if (isNarrow) setSheetOpen(true);
  };

  const seated = useMemo(
    () => records.filter((r) => r.masa_no).sort(deskSort),
    [records],
  );
  const standing = useMemo(
    () => records.filter((r) => !r.masa_no).sort((a, b) => (a.ogrenci_adi || "").localeCompare(b.ogrenci_adi || "", "tr")),
    [records],
  );

  const filteredSeated = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return seated;
    return seated.filter((r) =>
      (r.ogrenci_adi || "").toLocaleLowerCase("tr").includes(q) ||
      (r.masa_no || "").toLocaleLowerCase("tr").includes(q),
    );
  }, [seated, query]);

  const filteredStanding = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return standing;
    return standing.filter((r) => (r.ogrenci_adi || "").toLocaleLowerCase("tr").includes(q));
  }, [standing, query]);

  const navList = useMemo(
    () => [...filteredSeated, ...filteredStanding],
    [filteredSeated, filteredStanding],
  );

  const active = records.find((r) => r.id === activeId) || navList[0] || null;

  useEffect(() => {
    if (!activeId && navList[0]) setActiveId(navList[0].id);
  }, [activeId, navList]);

  useEffect(() => {
    if (photoOpen && !active?.profil_foto) setPhotoOpen(false);
  }, [photoOpen, active?.profil_foto]);

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
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (editable) onSave();
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const status = STATUS_KEYS[e.key];
      if (status && active && editable) {
        onUpdateRecord(active.id, "durum", status);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        const i = navList.findIndex((r) => r.id === active?.id);
        const next = navList[Math.min(navList.length - 1, i + 1)];
        if (next) setActiveId(next.id);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        const i = navList.findIndex((r) => r.id === active?.id);
        const next = navList[Math.max(0, i - 1)];
        if (next) setActiveId(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [active, editable, isNarrow, navList, onClose, onSave, onUpdateRecord, photoOpen, sheetOpen]);

  const stats = useMemo(() => ({
    present: records.filter((r) => r.durum === "PRESENT").length,
    absent: records.filter((r) => r.durum === "ABSENT").length,
    late: records.filter((r) => r.durum === "LATE").length,
    excused: records.filter((r) => r.izinli_mi || r.durum === "EXCUSED").length,
  }), [records]);

  const dateLabel = new Date(session.tarih).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
  });
  const pendingCount =
    (notifyStatus?.summary?.ABSENT?.pending ?? 0) +
    (notifyStatus?.summary?.LATE?.pending ?? 0) +
    (notifyStatus?.summary?.EXIT?.pending ?? 0);

  const showExit = active && (active.durum === "PRESENT" || active.durum === "LATE" || active.durum === "NOT_AT_DESK");
  const call = active ? telHref(active.veli_telefon) : null;

  return (
    <div className="yc-root" role="dialog" aria-modal="true" aria-labelledby="yc-title">
      <header className="yc-top">
        <div>
          <p className="yc-kicker">
            {session.yoklama_tipi === "LESSON" ? "Ders" : "Periyot"}
            {session.ders_no != null ? ` ${session.ders_no}` : ""} · {editable ? "Canlı" : "Kapalı"}
          </p>
          <h1 className="yc-title" id="yc-title">{session.oturum_adi || "Yoklama"}</h1>
          <div className="yc-sub">
            {dateLabel} · {records.length} öğrenci
            <span className="yc-sub-hint"> · oklarla gez, 1–5 ile işaretle</span>
          </div>
        </div>
        <div className="yc-meters">
          <div className="yc-meter is-present"><b>{stats.present}</b><span>Var</span></div>
          <div className="yc-meter is-absent"><b>{stats.absent}</b><span>Yok</span></div>
          <div className="yc-meter is-late"><b>{stats.late}</b><span>Geç</span></div>
          <div className="yc-meter"><b>{stats.excused}</b><span>İzin</span></div>
        </div>
      </header>

      {view === "bildirim" ? (
        <div className="yc-panel">
          {pendingBanner && (
            <div className="yc-dock" style={{ marginBottom: 16, borderRadius: 16 }}>
              <span>{pendingBanner.count} öğrenci · {pendingBanner.label} bekliyor</span>
              <div className="yc-dock-right">
                <button type="button" className="yc-btn plain" onClick={onPreviewPending}>Önizle</button>
                <button type="button" className="yc-btn plain" onClick={onDismissPending}>Sonra</button>
              </div>
            </div>
          )}
          <AttendanceNotifyPanel
            status={notifyStatus}
            config={notifyConfig}
            templatesBasePath={templatesBasePath}
            onNotify={(event) => onNotify(event)}
            onOpenSettings={onOpenSettings}
          />
        </div>
      ) : (
        <div className="yc-stage">
          <section className="yc-floor">
            <div className="yc-floor-head">
              <label className="yc-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" />
                </svg>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İsim veya masa" />
              </label>
            </div>
            {loading ? (
              <div className="yc-inspect-empty">Salon yükleniyor…</div>
            ) : (
              <>
                <div className="yc-mosaic">
                  {filteredSeated.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`yc-tile is-${r.durum}${r.canli_ders?.derste ? " is-live" : ""}${active?.id === r.id ? " is-on" : ""}`}
                      onClick={() => openStudent(r.id)}
                    >
                      <div className="yc-tile-top">
                        <em>Masa {r.masa_no}</em>
                        <span className="yc-dot" />
                      </div>
                      <strong>{r.ogrenci_adi || `#${r.ogrenci_id}`}</strong>
                      <span className="yc-tag">{attendanceStatusLabels[r.durum]?.label}</span>
                      {r.canli_ders?.derste && <span className="yc-live">Derste</span>}
                    </button>
                  ))}
                </div>
                {filteredStanding.length > 0 && (
                  <div className="yc-walk">
                    <h4>Masa atanmamış</h4>
                    <div className="yc-walk-row">
                      {filteredStanding.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className={`yc-chip is-${r.durum}${r.canli_ders?.derste ? " is-live" : ""}${active?.id === r.id ? " is-on" : ""}`}
                          onClick={() => openStudent(r.id)}
                        >
                          <b>{r.ogrenci_adi || `#${r.ogrenci_id}`}</b>
                          <span>{attendanceStatusLabels[r.durum]?.label}</span>
                          {r.canli_ders?.derste && <i className="yc-live">Derste</i>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!records.length && <div className="yc-inspect-empty">Bu oturumda öğrenci yok.</div>}
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
              <div className="yc-inspect-empty">Soldan bir masa seç.</div>
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
                      <span className="yc-face is-fallback">{initials(active.ogrenci_adi || "")}</span>
                    )}
                    <div className="yc-who-text">
                      <div className="yc-desk-no">{active.masa_no ? `Masa ${active.masa_no}` : "Masasız"}</div>
                      <h2>{active.ogrenci_adi || `Öğrenci #${active.ogrenci_id}`}</h2>
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
                        const i = navList.findIndex((r) => r.id === active.id);
                        const prev = navList[Math.max(0, i - 1)];
                        if (prev) setActiveId(prev.id);
                      }}
                    >‹</button>
                    <button
                      type="button"
                      aria-label="Sonraki"
                      onClick={() => {
                        const i = navList.findIndex((r) => r.id === active.id);
                        const next = navList[Math.min(navList.length - 1, i + 1)];
                        if (next) setActiveId(next.id);
                      }}
                    >›</button>
                  </div>
                </div>
                <div className="yc-keys">
                  {STATUS_ORDER.map((key, index) => (
                    <button
                      key={key}
                      type="button"
                      disabled={!editable}
                      className={`yc-key${active.durum === key ? ` on-${key}` : ""}`}
                      onClick={() => onUpdateRecord(active.id, "durum", key)}
                    >
                      <small>{index + 1}</small>
                      <b>{attendanceStatusLabels[key]?.label}</b>
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
                {(active.durum === "LATE" || showExit) && (
                  <div className="yc-times">
                    {active.durum === "LATE" && (
                      <label>
                        Giriş
                        <input
                          type="time"
                          disabled={!editable}
                          value={active.giris_saati || ""}
                          onChange={(e) => onUpdateRecord(active.id, "giris_saati", e.target.value)}
                        />
                      </label>
                    )}
                    {showExit && (
                      <label>
                        Çıkış
                        <input
                          type="time"
                          disabled={!editable}
                          value={active.cikis_saati || ""}
                          onChange={(e) => onUpdateRecord(active.id, "cikis_saati", e.target.value)}
                        />
                      </label>
                    )}
                  </div>
                )}
                <textarea
                  className="yc-note"
                  disabled={!editable}
                  value={active.notlar || ""}
                  onChange={(e) => onUpdateRecord(active.id, "notlar", e.target.value)}
                  placeholder="Not"
                />
                <div className="yc-notify">
                  <NotificationStatusChips ogrenciId={active.ogrenci_id} status={notifyStatus} />
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <footer className="yc-dock">
        <div className="yc-dock-left">
          <button type="button" className="yc-btn plain" onClick={onClose}>Çık</button>
          <button
            type="button"
            className="yc-btn plain"
            onClick={() => setView((v) => (v === "salon" ? "bildirim" : "salon"))}
          >
            {view === "salon" ? (
              <>
                <span className="yc-label-full">Veli bildirimi{pendingCount ? ` · ${pendingCount}` : ""}</span>
                <span className="yc-label-short">Bildirim{pendingCount ? ` · ${pendingCount}` : ""}</span>
              </>
            ) : (
              "← Salon"
            )}
          </button>
          {editable && (
            <button type="button" className="yc-btn good" onClick={() => onSetAllStatus("PRESENT")}>
              Hepsi var
            </button>
          )}
        </div>
        <div className="yc-dock-right">
          {session.durum === "CLOSED" && (
            <button type="button" className="yc-btn good" onClick={onReopenSession}>Tekrar aç</button>
          )}
          {editable && (
            <>
              <button type="button" className="yc-btn warn" onClick={onCloseSession}>
                <span className="yc-label-full">Oturumu kapat</span>
                <span className="yc-label-short">Kapat</span>
              </button>
              <button type="button" className="yc-btn save" onClick={onSave} disabled={saving}>
                {saving ? "Kaydediliyor" : "Kaydet"}
              </button>
            </>
          )}
        </div>
      </footer>

      {photoOpen && active?.profil_foto && (
        <div
          className="yc-photo"
          role="dialog"
          aria-modal="true"
          aria-label={`${active.ogrenci_adi || "Öğrenci"} fotoğrafı`}
          onClick={() => setPhotoOpen(false)}
        >
          <button type="button" className="yc-photo-close" onClick={() => setPhotoOpen(false)} aria-label="Kapat">
            ×
          </button>
          <img
            src={active.profil_foto}
            alt={active.ogrenci_adi || "Öğrenci fotoğrafı"}
            onClick={(e) => e.stopPropagation()}
          />
          <p>{active.ogrenci_adi || `Öğrenci #${active.ogrenci_id}`}</p>
        </div>
      )}
    </div>
  );
}
