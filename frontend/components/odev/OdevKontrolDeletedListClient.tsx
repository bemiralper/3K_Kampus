"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchDeletedAssignments, restoreAssignment, type DeletedAssignmentRow } from "@/lib/resources-api";

const formatDatetime = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function OdevKontrolDeletedListClient() {
  const [rows, setRows] = useState<DeletedAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDeletedAssignments();
      if (result.success !== false) {
        const data = result.data;
        setRows(Array.isArray(data) ? data : []);
      } else {
        setError(result.error || "Liste yüklenemedi");
      }
    } catch {
      setError("Liste yüklenirken hata oluştu");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (row: DeletedAssignmentRow) => {
    if (!confirm(`"${row.title}" (${row.student_name}) ödevini geri yüklemek istediğinize emin misiniz?`)) return;
    setRestoringId(row.id);
    try {
      const result = await restoreAssignment(row.id);
      if (result.success) {
        flash("✅ Ödev geri yüklendi");
        setRows((prev) => prev.filter((r) => r.id !== row.id));
      } else {
        flash("❌ " + (result.error || "Geri yükleme başarısız"));
      }
    } catch {
      flash("❌ Geri yükleme başarısız");
    }
    setRestoringId(null);
  };

  return (
    <div className="ok-root">
      {toast && <div className="ok-toast">{toast}</div>}
      <header className="ok-page-header">
        <div className="ok-page-header-text">
          <h1>Silinen Ödevler</h1>
          <p>Soft-delete ile arşivlenen ödevler ve silme sebepleri</p>
        </div>
        <div className="ok-header-actions">
          <Link href="/admin/odev/kontrol" className="ok-btn-secondary">
            ← Ödev Kontrol
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="ok-loading">Yükleniyor...</div>
      ) : error ? (
        <div className="ok-empty">
          <h3>Hata</h3>
          <p>{error}</p>
          <button type="button" className="ok-btn-primary" style={{ marginTop: 12 }} onClick={load}>
            Tekrar Dene
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="ok-empty">
          <h3>Silinen ödev yok</h3>
          <p>Henüz arşivlenmiş ödev bulunmuyor.</p>
        </div>
      ) : (
        <div className="ok-table-wrap">
          <table className="ok-table">
            <thead>
              <tr>
                <th>Öğrenci</th>
                <th>Ödev</th>
                <th>Koç</th>
                <th>Silen</th>
                <th>Silinme</th>
                <th>Sebep</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.student_name}</td>
                  <td>{row.title}</td>
                  <td>{row.coach_name || "—"}</td>
                  <td>{row.deleted_by_name || "—"}</td>
                  <td>{formatDatetime(row.deleted_at)}</td>
                  <td className="reason-cell">{row.deletion_reason}</td>
                  <td>
                    <button
                      type="button"
                      className="ok-btn-secondary"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      disabled={restoringId === row.id}
                      onClick={() => handleRestore(row)}
                    >
                      {restoringId === row.id ? "Geri yükleniyor..." : "↩️ Geri Al"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
