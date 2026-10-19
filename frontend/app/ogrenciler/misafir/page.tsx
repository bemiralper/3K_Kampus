"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import "../ogrenci-list.css";
import "./misafir.css";

type Sinav = {
  id: number;
  name: string;
  exam_date: string | null;
  sinif_seviyesi: string;
};

type Misafir = {
  id: number;
  ad: string;
  soyad: string;
  tc_kimlik_no: string;
  telefon: string;
  created_at: string | null;
  sinavlar: Sinav[];
};

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR");
}

export default function MisafirOgrencilerPage() {
  const [rows, setRows] = useState<Misafir[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError("");
    const res = await apiGet<{ ogrenciler: Misafir[] }>(
      `/api/ogrenci-kayit/gunu-birlik/${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
    );
    if (!res.success || !res.data) {
      setError(res.error || "Liste alınamadı.");
      setRows([]);
    } else {
      setRows(res.data.ogrenciler || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { load(q); }, 250);
    return () => window.clearTimeout(timer);
  }, [q, load]);

  return (
    <div className="ogl-page">
      <div className="ogl-head">
        <div className="ogl-head-main">
          <div className="ogl-crumbs">
            <Link href="/ogrenciler">Öğrenciler</Link>
            <span>/</span>
            <span>Misafir Öğrenciler</span>
          </div>
          <h1 className="ogl-title">Misafir Öğrenciler</h1>
          <p className="ogl-subtitle">Günü birlik denemeye gelenler. Ana öğrenci listesinde görünmez.</p>
        </div>
        <div className="ogl-head-actions">
          <Link href="/ogrenciler/misafir/yeni" className="ogl-btn ogl-btn--primary">Günü birlik kayıt</Link>
        </div>
      </div>

      <div className="gb-field" style={{ maxWidth: 320 }}>
        <label htmlFor="misafir-ara">Ara</label>
        <input
          id="misafir-ara"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ad, soyad veya TC"
        />
      </div>

      {error && <p className="gb-error">{error}</p>}

      <div className="ogrenci-table-wrap">
        <table className="table-modern ogrenci-desktop-table">
          <thead>
            <tr>
              <th>Ad soyad</th>
              <th>TC</th>
              <th>Telefon</th>
              <th>Sınavlar</th>
              <th>Kayıt tarihi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}>Yükleniyor…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5}>Günü birlik kayıt yok.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/ogrenciler/${row.id}`}>{row.ad} {row.soyad}</Link>
                </td>
                <td>{row.tc_kimlik_no || "—"}</td>
                <td>{row.telefon || "—"}</td>
                <td>
                  <div className="gb-exams">
                    {row.sinavlar.length === 0 ? "—" : row.sinavlar.map((sinav) => (
                      <span key={sinav.id}>
                        {sinav.name}
                        {sinav.exam_date ? ` · ${formatDate(sinav.exam_date)}` : ""}
                        {sinav.sinif_seviyesi ? ` · ${sinav.sinif_seviyesi}` : ""}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{formatDate(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
