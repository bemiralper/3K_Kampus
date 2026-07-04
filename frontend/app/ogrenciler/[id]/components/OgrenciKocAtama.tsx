"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { canManageCoachAssignment } from "@/lib/auth-routes";
import {
  assignmentCoachName,
  changeCoach,
  createAssignment,
  fetchActiveCoachForStudent,
  fetchCoaches,
  type Assignment,
  type Coach,
} from "@/lib/coaching-api";
import type { ApiResponse } from "@/lib/api";

function coachingActionError(res: ApiResponse<unknown>, fallback: string): string {
  if (typeof res.error === "string" && res.error.trim() && res.error !== "Doğrulama hatası") {
    return res.error;
  }
  if (res.errors && typeof res.errors === "object") {
    for (const value of Object.values(res.errors as Record<string, unknown>)) {
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
      if (typeof value === "string") return value;
    }
  }
  return fallback;
}

interface OgrenciKocAtamaProps {
  studentId: number;
  studentName: string;
}

export default function OgrenciKocAtama({ studentId, studentName }: OgrenciKocAtamaProps) {
  const { user, isLoading: authLoading } = useAuth();
  const canManage = canManageCoachAssignment(user);

  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAssignment = useCallback(async () => {
    const res = await fetchActiveCoachForStudent(studentId);
    if (res.success) {
      setActiveAssignment(res.data ?? null);
      return true;
    }
    setActiveAssignment(null);
    setError(res.error || "Koç bilgisi yüklenemedi");
    return false;
  }, [studentId]);

  const loadCoaches = useCallback(async () => {
    const res = await fetchCoaches({ is_active: true, is_coach: true });
    if (res.success && res.data) {
      setCoaches(res.data);
      return;
    }
    setCoaches([]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadAssignment();
        if (!cancelled && canManage && !authLoading) {
          await loadCoaches();
        }
      } catch {
        if (!cancelled) setError("Koç bilgisi yüklenemedi");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadAssignment, loadCoaches, canManage, authLoading]);

  const handleAssign = async () => {
    if (!selectedCoachId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const coachId = Number(selectedCoachId);

      if (activeAssignment) {
        if (activeAssignment.coach_id === coachId) {
          setError("Seçilen koç zaten atanmış.");
          return;
        }
        const res = await changeCoach({
          student_id: studentId,
          new_coach_id: coachId,
        });
        if (res.success) {
          setSuccess(res.message || "Koç değiştirildi. Önceki koçun kayıtları korundu.");
          await loadAssignment();
          setSelectedCoachId("");
        } else {
          setError(coachingActionError(res, "Koç değiştirilemedi."));
        }
        return;
      }

      const res = await createAssignment({
        coach: coachId,
        student: studentId,
        is_primary: true,
      });

      if (res.success) {
        setSuccess(res.message || "Koç atandı.");
        await loadAssignment();
        setSelectedCoachId("");
        return;
      }

      const errMsg = coachingActionError(res, "Koç atanamadı.");
      const alreadyHasCoach =
        errMsg.includes("zaten aktif bir birincil koçu") ||
        (res.errors &&
          typeof res.errors === "object" &&
          JSON.stringify(res.errors).includes("birincil koçu"));

      if (alreadyHasCoach) {
        await loadAssignment();
        const changeRes = await changeCoach({
          student_id: studentId,
          new_coach_id: coachId,
        });
        if (changeRes.success) {
          setSuccess(changeRes.message || "Koç güncellendi.");
          await loadAssignment();
          setSelectedCoachId("");
          return;
        }
        setError(coachingActionError(changeRes, "Koç değiştirilemedi."));
        return;
      }

      setError(errMsg);
    } catch {
      setError("Bir hata oluştu.");
    } finally {
      setSubmitting(false);
    }
  };

  const coachName = assignmentCoachName(activeAssignment);

  const selectableCoaches = coaches.filter(c => {
    if (activeAssignment && c.id === activeAssignment.coach_id) return false;
    return true;
  });

  const selectedCoach = coaches.find(c => c.id === selectedCoachId);
  const canSubmitSelection = !!selectedCoach && selectedCoach.available_capacity > 0;

  return (
    <div
      className="student-coach-section"
      style={{
        marginTop: "14px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        width: "100%",
      }}
    >
      <span
        style={{
          fontSize: "9px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.8px",
          color: "#64748b",
        }}
      >
        Koç
      </span>

      {loading ? (
        <span style={{ fontSize: "12px", color: "#94a3b8" }}>Yükleniyor...</span>
      ) : activeAssignment ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 14px",
            borderRadius: "20px",
            fontSize: "13px",
            fontWeight: 600,
            background: "#f0fdf4",
            color: "#166534",
            border: "1px solid rgba(34, 197, 94, 0.25)",
          }}
        >
          <span aria-hidden>🎯</span>
          {coachName}
        </div>
      ) : (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 14px",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: 500,
            background: "#f8fafc",
            color: "#64748b",
            border: "1px dashed #cbd5e1",
          }}
        >
          Koç atanmamış
        </div>
      )}

      {canManage && !loading && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "6px",
            width: "100%",
            maxWidth: "240px",
            marginTop: "4px",
          }}
        >
          <select
            value={selectedCoachId}
            onChange={e => setSelectedCoachId(e.target.value ? Number(e.target.value) : "")}
            disabled={submitting || selectableCoaches.length === 0}
            style={{
              width: "100%",
              padding: "7px 10px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              fontSize: "12px",
              background: "#fff",
            }}
          >
            <option value="">
              {activeAssignment ? "Yeni koç seç..." : "Koç seç..."}
            </option>
            {selectableCoaches.map(coach => {
              const hasCapacity = coach.available_capacity > 0;
              return (
                <option
                  key={coach.id}
                  value={coach.id}
                  disabled={!hasCapacity}
                >
                  {coach.teacher_full_name}
                  {hasCapacity
                    ? ` (müsait: ${coach.available_capacity})`
                    : " (kapasite dolu)"}
                </option>
              );
            })}
          </select>

          {selectableCoaches.length === 0 && (
            <span style={{ fontSize: "11px", color: "#92400e", textAlign: "center" }}>
              {coaches.length === 0
                ? "Sistemde aktif koç bulunamadı."
                : activeAssignment
                  ? "Değiştirilebilecek başka koç yok."
                  : "Atanabilecek koç bulunamadı."}
            </span>
          )}

          <button
            type="button"
            onClick={handleAssign}
            disabled={submitting || !canSubmitSelection}
            style={{
              padding: "7px 12px",
              borderRadius: "8px",
              border: "none",
              fontSize: "12px",
              fontWeight: 600,
              cursor: submitting || !canSubmitSelection ? "not-allowed" : "pointer",
              background: submitting || !canSubmitSelection ? "#cbd5e1" : "#3b82f6",
              color: "#fff",
            }}
          >
            {submitting
              ? "Kaydediliyor..."
              : activeAssignment
                ? "Koçu Değiştir"
                : "Koç Ata"}
          </button>
        </div>
      )}

      {error && (
        <span style={{ fontSize: "11px", color: "#dc2626", textAlign: "center" }}>{error}</span>
      )}
      {success && (
        <span style={{ fontSize: "11px", color: "#059669", textAlign: "center" }}>{success}</span>
      )}

      {canManage && activeAssignment && (
        <span
          style={{
            fontSize: "10px",
            color: "#64748b",
            textAlign: "center",
            lineHeight: 1.4,
            maxWidth: "240px",
          }}
        >
          Koç değiştirmek için yukarıdan yeni koç seçip <strong>Koçu Değiştir</strong>{" "}
          butonuna basın. Önceki koçun ödev ve görüşme kayıtları silinmez.
        </span>
      )}
    </div>
  );
}
