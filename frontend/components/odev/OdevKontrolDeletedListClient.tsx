"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchDeletedAssignments, type DeletedAssignmentRow } from "@/lib/resources-api";
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

  return (
    <div className="ok-root">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
