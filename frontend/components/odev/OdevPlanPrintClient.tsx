"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAssignmentDetail, type ManualAssignment } from "@/lib/resources-api";
import OdevPlanDocument from "@/components/odev/OdevPlanDocument";
import {
  buildPlanGroupsFromAssignment,
  countPlanItems,
} from "@/components/odev/odevPlanTypes";

interface OdevPlanPrintClientProps {
  printToken: string;
  assignmentIdOverride: string;
}

function formatTrDate(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function OdevPlanPrintClient({
  printToken,
  assignmentIdOverride,
}: OdevPlanPrintClientProps) {
  const [assignment, setAssignment] = useState<ManualAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAssignmentDetail(Number(assignmentIdOverride), { printToken });
      if (!res.success || !res.data) {
        throw new Error((res as { error?: string }).error || "Ödev planı yüklenemedi");
      }
      setAssignment(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  }, [assignmentIdOverride, printToken]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  useEffect(() => {
    if (assignment && !loading && !error) {
      document.body.setAttribute("data-pdf-ready", "true");
    }
  }, [assignment, loading, error]);

  const cartGroups = useMemo(
    () => (assignment ? buildPlanGroupsFromAssignment(assignment) : []),
    [assignment],
  );

  const itemCount = useMemo(() => countPlanItems(cartGroups), [cartGroups]);
  const totalQ = useMemo(
    () => cartGroups.reduce((s, g) => s + g.totalQuestions, 0),
    [cartGroups],
  );
  const totalP = useMemo(
    () => cartGroups.reduce((s, g) => s + g.totalPages, 0),
    [cartGroups],
  );

  if (loading) {
    return <div style={{ padding: 24, fontFamily: "Poppins, sans-serif" }}>Ödev planı yükleniyor…</div>;
  }
  if (error || !assignment) {
    return <div style={{ padding: 24, fontFamily: "Poppins, sans-serif", color: "#dc2626" }}>{error || "Plan bulunamadı"}</div>;
  }

  const ext = assignment as ManualAssignment & {
    student_info?: { profil_foto?: string };
    coach_notes?: string;
    assigned_date?: string;
  };

  const assignedDateStr = formatTrDate(ext.assigned_date) || formatTrDate(new Date().toISOString());
  const dueDateStr = formatTrDate(assignment.due_date);
  const notes = ext.coach_notes || assignment.description || "";
  const studentPhoto = ext.student_info?.profil_foto;

  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <OdevPlanDocument
        studentName={assignment.student_name}
        studentPhoto={studentPhoto}
        coachName={assignment.coach_name || "—"}
        title={assignment.title}
        notes={notes}
        assignedDateStr={assignedDateStr}
        dueDateStr={dueDateStr}
        documentRef={`ÖCP-${assignment.id}`}
        cartGroups={cartGroups}
        itemCount={itemCount}
        totalQuestions={totalQ}
        totalPages={totalP}
      />
    </div>
  );
}
