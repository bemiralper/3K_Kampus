"use client";

import { useMemo, useState, type CSSProperties } from "react";
import AttendanceNotifyPanel, { NotificationStatusChips, NotificationColumnLegend } from "./AttendanceNotifyPanel";
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

type DrawerTab = "yoklama" | "bildirim";

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
  overlayStyle: CSSProperties;
  modalBoxStyle: (width: number) => CSSProperties;
  modalHeaderStyle: CSSProperties;
  modalFooterStyle: CSSProperties;
  closeBtnStyle: CSSProperties;
  saveBtnStyle: CSSProperties;
  thStyle: CSSProperties;
  tdStyle: CSSProperties;
  attendanceStatusLabels: Record<string, StatusLabelInfo>;
  Badge: React.ComponentType<{ label: string; color: string; bg: string; border?: string }>;
  EmptyState: React.ComponentType<{ icon: string; title: string; description?: string }>;
}

const STATUS_ORDER: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "NOT_AT_DESK"];

function StatusChips({
  durum,
  izinli,
  editable,
  labels,
  onSelect,
}: {
  durum: AttendanceStatus;
  izinli?: boolean;
  editable: boolean;
  labels: Record<string, StatusLabelInfo>;
  onSelect: (s: AttendanceStatus) => void;
}) {
  if (izinli) {
    const info = labels.EXCUSED;
    return (
      <span
        className="yok-status-chip selected"
        style={{ backgroundColor: info.bg, color: info.color, borderColor: info.color, cursor: "default" }}
      >
        {info.label}
      </span>
    );
  }

  return (
    <div className="yok-status-chips">
      {STATUS_ORDER.map((key) => {
        const info = labels[key];
        if (!info) return null;
        const selected = durum === key;
        return (
          <button
            key={key}
            type="button"
            disabled={!editable}
            className={`yok-status-chip${selected ? " selected" : ""}`}
            style={{
              backgroundColor: info.bg,
              color: info.color,
              borderColor: selected ? info.color : `${info.color}40`,
            }}
            onClick={() => editable && onSelect(key)}
          >
            {info.label}
          </button>
        );
      })}
    </div>
  );
}

function TimeFields({
  record,
  editable,
  showExit,
  onUpdate,
}: {
  record: AttendanceRecord;
  editable: boolean;
  showExit: boolean;
  onUpdate: (field: string, value: string) => void;
}) {
  const hasGiris = record.durum === "LATE";
  if (!hasGiris && !showExit) return null;

  return (
    <div className="yok-time-row">
      {hasGiris && (
        <label className="yok-time-field">
          Giriş
          {editable ? (
            <input
              type="time"
              className="giris"
              value={record.giris_saati || ""}
              onChange={(e) => onUpdate("giris_saati", e.target.value)}
            />
          ) : (
            <strong style={{ color: "#d97706" }}>{record.giris_saati || "—"}</strong>
          )}
        </label>
      )}
      {showExit && (
        <label className="yok-time-field">
          Çıkış
          {editable ? (
            <input
              type="time"
              className="cikis"
              value={record.cikis_saati || ""}
              onChange={(e) => onUpdate("cikis_saati", e.target.value)}
            />
          ) : (
            <strong style={{ color: "#2563eb" }}>{record.cikis_saati || "—"}</strong>
          )}
        </label>
      )}
    </div>
  );
}

export default function YoklamaSessionDrawer({
  session,
  records,
  loading,
  saving,
  sortBy,
  onSortByChange,
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
  overlayStyle,
  modalBoxStyle,
  modalHeaderStyle,
  modalFooterStyle,
  closeBtnStyle,
  saveBtnStyle,
  thStyle,
  tdStyle,
  attendanceStatusLabels,
  Badge,
  EmptyState,
}: YoklamaSessionDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>("yoklama");

  const sorted = useMemo(() => [...records].sort((a, b) => {
    if (sortBy === "desk") {
      const nA = parseInt(a.masa_no || "") || 0;
      const nB = parseInt(b.masa_no || "") || 0;
      if (nA !== nB) return nA - nB;
      return (a.masa_no || "").localeCompare(b.masa_no || "", "tr");
    }
    return (a.ogrenci_adi || "").localeCompare(b.ogrenci_adi || "", "tr");
  }), [records, sortBy]);

  const stats = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.durum === "PRESENT").length;
    const absent = records.filter((r) => r.durum === "ABSENT").length;
    const late = records.filter((r) => r.durum === "LATE").length;
    const excused = records.filter((r) => r.izinli_mi || r.durum === "EXCUSED").length;
    const marked = records.filter((r) => r.durum !== "PRESENT" || r.cikis_saati || r.notlar).length;
    const pct = total > 0 ? Math.round((marked / total) * 100) : 0;
    return { total, present, absent, late, excused, marked, pct };
  }, [records]);

  const showExitField = (durum: AttendanceStatus) =>
    durum === "PRESENT" || durum === "LATE" || durum === "NOT_AT_DESK";

  const editable = session.durum === "OPEN";

  const renderRecordRow = (r: AttendanceRecord, idx: number) => {
    const sInfo = attendanceStatusLabels[r.durum] || attendanceStatusLabels.ABSENT;
    const canEdit = editable && !r.izinli_mi;

    return (
      <tr key={r.id || idx} className={r.izinli_mi ? "yok-row-izinli" : undefined}>
        <td style={{ ...tdStyle, fontSize: "11px", color: "#9ca3af", textAlign: "center" }}>{idx + 1}</td>
        <td style={tdStyle}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: r.masa_no ? "#374151" : "#d1d5db" }}>
            {r.masa_no ? `🪑 ${r.masa_no}` : "—"}
          </span>
        </td>
        <td style={tdStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontWeight: 500, fontSize: "13px" }}>{r.ogrenci_adi || `#${r.ogrenci_id}`}</span>
            {r.izinli_mi && <Badge label="İZİNLİ" color="#4338ca" bg="#e0e7ff" />}
          </div>
        </td>
        <td style={{ ...tdStyle, minWidth: 280 }}>
          {canEdit ? (
            <>
              <StatusChips
                durum={r.durum}
                labels={attendanceStatusLabels}
                editable
                onSelect={(s) => onUpdateRecord(r.id, "durum", s)}
              />
              <TimeFields
                record={r}
                editable
                showExit={showExitField(r.durum)}
                onUpdate={(f, v) => onUpdateRecord(r.id, f, v)}
              />
            </>
          ) : (
            <>
              <Badge label={sInfo.label} color={sInfo.color} bg={sInfo.bg} />
              <TimeFields
                record={r}
                editable={false}
                showExit={showExitField(r.durum) && !!r.cikis_saati}
                onUpdate={() => {}}
              />
            </>
          )}
        </td>
        <td style={tdStyle}>
          {canEdit ? (
            <input
              className="yok-note-input"
              value={r.notlar || ""}
              onChange={(e) => onUpdateRecord(r.id, "notlar", e.target.value)}
              placeholder="Not..."
            />
          ) : (
            <span style={{ fontSize: "12px", color: "#6b7280" }}>{r.notlar || "—"}</span>
          )}
        </td>
        <td style={tdStyle}>
          <NotificationStatusChips ogrenciId={r.ogrenci_id} status={notifyStatus} />
        </td>
      </tr>
    );
  };

  const renderRecordCard = (r: AttendanceRecord, idx: number) => {
    const canEdit = editable && !r.izinli_mi;

    return (
      <div key={r.id || idx} className={`yok-att-card${r.izinli_mi ? " izinli" : ""}`}>
        <div className="yok-att-card-head">
          <div>
            <div className="yok-att-card-name">
              {r.ogrenci_adi || `#${r.ogrenci_id}`}
              {r.izinli_mi && (
                <span style={{ marginLeft: 6 }}>
                  <Badge label="İZİNLİ" color="#4338ca" bg="#e0e7ff" />
                </span>
              )}
            </div>
            <div className="yok-att-card-desk">{r.masa_no ? `Masa ${r.masa_no}` : "Masa atanmamış"}</div>
          </div>
          <span className="yok-att-card-num">#{idx + 1}</span>
        </div>
        <StatusChips
          durum={r.durum}
          izinli={r.izinli_mi}
          labels={attendanceStatusLabels}
          editable={canEdit}
          onSelect={(s) => onUpdateRecord(r.id, "durum", s)}
        />
        <TimeFields
          record={r}
          editable={canEdit}
          showExit={showExitField(r.durum)}
          onUpdate={(f, v) => onUpdateRecord(r.id, f, v)}
        />
        {canEdit ? (
          <input
            className="yok-note-input"
            style={{ marginTop: 8 }}
            value={r.notlar || ""}
            onChange={(e) => onUpdateRecord(r.id, "notlar", e.target.value)}
            placeholder="Not ekle..."
          />
        ) : r.notlar ? (
          <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>{r.notlar}</div>
        ) : null}
      </div>
    );
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        style={{ ...modalBoxStyle(920), maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...modalHeaderStyle, flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: "17px", fontWeight: 700, margin: 0 }}>
              {session.oturum_adi || "Yoklama"}
              {session.ders_no != null && (
                <span style={{ marginLeft: 8, fontSize: "13px", color: "#6366f1" }}>
                  {session.ders_no}. Ders
                </span>
              )}
            </h3>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: 4 }}>
              {new Date(session.tarih).toLocaleDateString("tr-TR")} ·{" "}
              {session.yoklama_tipi === "LESSON" ? "Ders bazlı" : "Periyot bazlı"}
              {session.durum === "OPEN" ? " · Açık" : " · Kapalı"}
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        <div className="yok-drawer-tabs">
          <button
            type="button"
            className={`yok-drawer-tab${tab === "yoklama" ? " active" : ""}`}
            onClick={() => setTab("yoklama")}
          >
            Yoklama
          </button>
          <button
            type="button"
            className={`yok-drawer-tab${tab === "bildirim" ? " active" : ""}`}
            onClick={() => setTab("bildirim")}
          >
            Veli bildirimi
            {(notifyStatus?.summary?.ABSENT?.pending ?? 0) +
              (notifyStatus?.summary?.LATE?.pending ?? 0) +
              (notifyStatus?.summary?.EXIT?.pending ?? 0) > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, color: "#d97706" }}>•</span>
            )}
          </button>
        </div>

        {pendingBanner && tab === "yoklama" && (
          <div className="yok-pending-banner">
            <p>
              {pendingBanner.count} öğrenci için <strong>{pendingBanner.label}</strong> mesajı hazır —
              <strong> henüz gönderilmedi</strong>.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="yok-notify-btn secondary" onClick={onPreviewPending}>
                Önizle ve gönder
              </button>
              <button type="button" className="yok-notify-btn ghost" onClick={onDismissPending}>
                Daha sonra
              </button>
            </div>
          </div>
        )}

        {tab === "bildirim" ? (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <AttendanceNotifyPanel
              status={notifyStatus}
              config={notifyConfig}
              templatesBasePath={templatesBasePath}
              onNotify={(event) => onNotify(event)}
              onOpenSettings={onOpenSettings}
            />
          </div>
        ) : (
          <>
            {editable && records.length > 0 && (
              <div className="yok-progress-bar">
                <div className="yok-progress-stats">
                  <span><strong>{stats.marked}</strong> / {stats.total} işaretlendi</span>
                  <span><strong style={{ color: "#059669" }}>{stats.present}</strong> var</span>
                  <span><strong style={{ color: "#dc2626" }}>{stats.absent}</strong> yok</span>
                  <span><strong style={{ color: "#d97706" }}>{stats.late}</strong> geç</span>
                  {stats.excused > 0 && (
                    <span><strong style={{ color: "#6366f1" }}>{stats.excused}</strong> izinli</span>
                  )}
                </div>
                <div className="yok-progress-track">
                  <div className="yok-progress-fill" style={{ width: `${stats.pct}%` }} />
                </div>
              </div>
            )}

            {editable && (
              <div className="yok-bulk-bar">
                <span>Tümünü işaretle:</span>
                {Object.entries(attendanceStatusLabels).map(([key, val]) => (
                  <button
                    key={key}
                    type="button"
                    className="yok-bulk-btn"
                    style={{ backgroundColor: val.bg, color: val.color }}
                    onClick={() => onSetAllStatus(key as AttendanceStatus)}
                  >
                    {val.label}
                  </button>
                ))}
              </div>
            )}

            <div className="yok-sort-bar">
              <span style={{ fontSize: "11px", color: "#6b7280" }}>Sırala:</span>
              {(["desk", "student"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`yok-sort-btn${sortBy === s ? " active" : ""}`}
                  onClick={() => onSortByChange(s)}
                >
                  {s === "desk" ? "Masa" : "Öğrenci"}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#6b7280" }}>Yükleniyor...</div>
            ) : records.length === 0 ? (
              <EmptyState icon="📋" title="Yoklama kaydı bulunamadı" />
            ) : (
              <>
                <div className="yok-att-table-wrap">
                  <table className="yok-att-table">
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 30 }}>#</th>
                        <th style={thStyle}>Masa</th>
                        <th style={thStyle}>Öğrenci</th>
                        <th style={{ ...thStyle, minWidth: 280 }}>Durum</th>
                        <th style={thStyle}>Not</th>
                        <th style={{ ...thStyle, width: 88 }}>
                          WhatsApp <NotificationColumnLegend />
                        </th>
                      </tr>
                    </thead>
                    <tbody>{sorted.map(renderRecordRow)}</tbody>
                  </table>
                </div>
                <div className="yok-att-cards">{sorted.map(renderRecordCard)}</div>
              </>
            )}
          </>
        )}

        <div style={{ ...modalFooterStyle, justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: "12px", color: "#6b7280" }}>
            {records.length} öğrenci
            {records.length > 0 && (
              <>
                {" "}
                · {stats.present} var · {stats.absent} yok · {stats.late} geç
                · {records.filter((r) => r.cikis_saati).length} çıkış
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {session.durum === "CLOSED" && (
              <button type="button" onClick={onReopenSession} style={{ ...saveBtnStyle, backgroundColor: "#059669" }}>
                Tekrar Aç
              </button>
            )}
            {session.durum === "OPEN" && (
              <>
                <button type="button" onClick={onCloseSession} style={{ ...saveBtnStyle, backgroundColor: "#d97706" }}>
                  Kapat
                </button>
                <button type="button" onClick={onSave} disabled={saving} style={{
                  ...saveBtnStyle, backgroundColor: "#059669", opacity: saving ? 0.5 : 1,
                }}>
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
