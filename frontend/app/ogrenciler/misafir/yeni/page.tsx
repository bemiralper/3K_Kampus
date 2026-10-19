"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiGet, apiPost, apiPostForm, getContextHeaders, resolveApiUrl } from "@/lib/api";
import { downloadBlob } from "@/lib/download-file";
import "../../ogrenci-list.css";
import "../misafir.css";

type SessionOpt = {
  id: number;
  name: string;
  session_date: string | null;
  schedule_preference_display: string;
};

type ExamOpt = {
  id: number;
  name: string;
  exam_date: string | null;
  exam_type: string;
  sessions: SessionOpt[];
};

type SeviyeOpt = { id: number; ad: string; kod: string };

type PreviewRow = {
  index: number;
  ad: string;
  soyad: string;
  tc_kimlik_no: string;
  telefon: string;
  sinif_seviyesi_id: number | null;
  sinif_seviyesi: string;
  status: string;
  message: string;
  girilen_ad: string;
  girilen_soyad: string;
};

const STATUS_LABEL: Record<string, string> = {
  yeni: "Yeni kayıt",
  mevcut_misafir: "Mevcut misafir",
  kayitli_ogrenci: "Kayıtlı öğrenci",
  zaten_sinavda: "Zaten sınavda",
  hata: "Hata",
};

const SAVABLE = new Set(["yeni", "mevcut_misafir", "kayitli_ogrenci"]);

function formatDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("tr-TR");
}

function toPayload(rows: PreviewRow[]) {
  return rows.map((row) => ({
    ad: row.status === "yeni" ? (row.girilen_ad || row.ad) : row.ad,
    soyad: row.status === "yeni" ? (row.girilen_soyad || row.soyad) : row.soyad,
    tc_kimlik_no: row.tc_kimlik_no,
    telefon: row.telefon,
    sinif_seviyesi_id: row.sinif_seviyesi_id,
  }));
}

export default function GunuBirlikKayitPage() {
  const search = useSearchParams();
  const presetExam = search.get("exam") || "";
  const [exams, setExams] = useState<ExamOpt[]>([]);
  const [seviyeler, setSeviyeler] = useState<SeviyeOpt[]>([]);
  const [examId, setExamId] = useState(presetExam);
  const [sessionId, setSessionId] = useState("");
  const [ad, setAd] = useState("");
  const [soyad, setSoyad] = useState("");
  const [tc, setTc] = useState("");
  const [telefon, setTelefon] = useState("");
  const [seviyeId, setSeviyeId] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const exam = exams.find((item) => String(item.id) === examId) || null;
  const needsSession = (exam?.sessions.length || 0) > 1;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiGet<{ sinavlar: ExamOpt[]; seviyeler: SeviyeOpt[] }>(
        "/api/ogrenci-kayit/gunu-birlik/secenekler/",
      );
      if (cancelled) return;
      if (!res.success || !res.data) {
        setError(res.error || "Sınav listesi alınamadı.");
      } else {
        setExams(res.data.sinavlar || []);
        setSeviyeler(res.data.seviyeler || []);
        const wanted = presetExam && (res.data.sinavlar || []).some((s) => String(s.id) === presetExam)
          ? presetExam
          : String(res.data.sinavlar?.[0]?.id || "");
        setExamId(wanted);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [presetExam]);

  useEffect(() => {
    setSessionId("");
    setRows([]);
    setSaved(false);
  }, [examId]);

  const sessionPayload = needsSession && sessionId ? Number(sessionId) : undefined;

  const preview = useCallback(async (ogrenciler: ReturnType<typeof toPayload>) => {
    const res = await apiPost<{ rows: PreviewRow[]; error?: string }>(
      "/api/ogrenci-kayit/gunu-birlik/",
      {
        exam_id: Number(examId),
        exam_session_id: sessionPayload,
        commit: false,
        ogrenciler,
      },
    );
    if (!res.success || !res.data?.rows) {
      throw new Error(res.error || "Önizleme alınamadı.");
    }
    return res.data.rows;
  }, [examId, sessionPayload]);

  const guardExam = () => {
    if (!examId) {
      setError("Sınav seçin.");
      return false;
    }
    if (needsSession && !sessionId) {
      setError("Bu sınavın birden fazla oturumu var. Oturum seçin.");
      return false;
    }
    setError("");
    return true;
  };

  const addOne = async () => {
    if (!guardExam()) return;
    setBusy("add");
    setSaved(false);
    try {
      const next = await preview([
        ...toPayload(rows),
        {
          ad: ad.trim(),
          soyad: soyad.trim(),
          tc_kimlik_no: tc.trim(),
          telefon: telefon.trim(),
          sinif_seviyesi_id: seviyeId ? Number(seviyeId) : null,
        },
      ]);
      setRows(next);
      setAd("");
      setSoyad("");
      setTc("");
      setTelefon("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Önizleme alınamadı.");
    } finally {
      setBusy("");
    }
  };

  const onExcel = async (file: File | null) => {
    if (!file || !guardExam()) return;
    setBusy("excel");
    setSaved(false);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("exam_id", examId);
      if (sessionPayload) form.append("exam_session_id", String(sessionPayload));
      const res = await apiPostForm<{ rows: PreviewRow[] }>(
        "/api/ogrenci-kayit/gunu-birlik/excel/",
        form,
      );
      if (!res.success || !res.data?.rows) {
        throw new Error(res.error || "Excel okunamadı.");
      }
      const merged = rows.length
        ? await preview([...toPayload(rows), ...toPayload(res.data.rows)])
        : res.data.rows;
      setRows(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Excel okunamadı.");
    } finally {
      setBusy("");
    }
  };

  const downloadTemplate = async () => {
    setError("");
    const res = await fetch(resolveApiUrl("/api/ogrenci-kayit/gunu-birlik/sablon/"), {
      credentials: "include",
      headers: getContextHeaders(),
    });
    if (!res.ok) {
      setError("Şablon indirilemedi.");
      return;
    }
    downloadBlob(await res.blob(), "gunu-birlik-kayit.xlsx");
  };

  const save = async () => {
    if (!guardExam() || rows.length === 0) return;
    setBusy("save");
    setError("");
    const res = await apiPost<{ rows: PreviewRow[] }>(
      "/api/ogrenci-kayit/gunu-birlik/",
      {
        exam_id: Number(examId),
        exam_session_id: sessionPayload,
        commit: true,
        ogrenciler: toPayload(rows),
      },
    );
    if (!res.success || !res.data?.rows) {
      setError(res.error || "Kayıt yazılamadı.");
    } else {
      setRows(res.data.rows);
      setSaved(true);
    }
    setBusy("");
  };

  const savable = useMemo(() => rows.filter((row) => SAVABLE.has(row.status)).length, [rows]);

  return (
    <div className="ogl-page">
      <div className="ogl-head">
        <div className="ogl-head-main">
          <div className="ogl-crumbs">
            <Link href="/ogrenciler/misafir">Misafir Öğrenciler</Link>
            <span>/</span>
            <span>Günü birlik kayıt</span>
          </div>
          <h1 className="ogl-title">Günü birlik kayıt</h1>
          <p className="ogl-subtitle">
            Ad, soyad, TC, telefon ve sınıf seviyesi yeter. Sözleşme açılmaz. Kayıt yalnız seçilen sınava düşer.
          </p>
        </div>
      </div>

      {error && <p className="gb-error">{error}</p>}

      <div className="gb-form">
        <div className="gb-field gb-field--wide">
          <label htmlFor="gb-exam">Sınav</label>
          <select
            id="gb-exam"
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            disabled={loading}
          >
            <option value="">{loading ? "Yükleniyor…" : "Sınav seçin"}</option>
            {exams.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}{item.exam_date ? ` · ${formatDate(item.exam_date)}` : ""} · {item.exam_type}
              </option>
            ))}
          </select>
        </div>
        {needsSession && (
          <div className="gb-field gb-field--wide">
            <label htmlFor="gb-session">Oturum</label>
            <select id="gb-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">Oturum seçin</option>
              {exam?.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.session_date ? ` · ${formatDate(session.session_date)}` : ""}
                  {session.schedule_preference_display ? ` · ${session.schedule_preference_display}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="gb-field">
          <label htmlFor="gb-ad">Ad</label>
          <input id="gb-ad" value={ad} onChange={(e) => setAd(e.target.value)} />
        </div>
        <div className="gb-field">
          <label htmlFor="gb-soyad">Soyad</label>
          <input id="gb-soyad" value={soyad} onChange={(e) => setSoyad(e.target.value)} />
        </div>
        <div className="gb-field">
          <label htmlFor="gb-tc">TC</label>
          <input id="gb-tc" inputMode="numeric" maxLength={11} value={tc} onChange={(e) => setTc(e.target.value)} />
        </div>
        <div className="gb-field">
          <label htmlFor="gb-tel">Telefon</label>
          <input id="gb-tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
        </div>
        <div className="gb-field gb-field--wide">
          <label htmlFor="gb-seviye">Sınıf seviyesi</label>
          <select id="gb-seviye" value={seviyeId} onChange={(e) => setSeviyeId(e.target.value)}>
            <option value="">Seviye seçin</option>
            {seviyeler.map((seviye) => (
              <option key={seviye.id} value={seviye.id}>{seviye.ad}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="gb-actions">
        <button type="button" className="ogl-btn ogl-btn--soft" onClick={addOne} disabled={busy !== ""}>
          Listeye ekle
        </button>
        <button type="button" className="ogl-btn ogl-btn--ghost" onClick={downloadTemplate}>Şablon indir</button>
        <label className="ogl-btn ogl-btn--ghost">
          Excel yükle
          <input
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              e.target.value = "";
              onExcel(file);
            }}
          />
        </label>
        <button
          type="button"
          className="ogl-btn ogl-btn--primary"
          onClick={save}
          disabled={busy !== "" || savable === 0}
        >
          {busy === "save" ? "Kaydediliyor…" : `Kaydet${savable ? ` (${savable})` : ""}`}
        </button>
        {saved && <p className="gb-note">Kayıt işlendi. Hatalı satırlar listede duruyor.</p>}
      </div>

      {rows.length > 0 && (
        <div className="ogrenci-table-wrap">
          <table className="table-modern ogrenci-desktop-table">
            <thead>
              <tr>
                <th>Ad soyad</th>
                <th>TC</th>
                <th>Telefon</th>
                <th>Seviye</th>
                <th>Durum</th>
                <th>Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.index}-${row.tc_kimlik_no}`}>
                  <td>{row.ad} {row.soyad}</td>
                  <td>{row.tc_kimlik_no}</td>
                  <td>{row.telefon || "—"}</td>
                  <td>{row.sinif_seviyesi || "—"}</td>
                  <td><span className={`gb-badge gb-badge--${row.status}`}>{STATUS_LABEL[row.status] || row.status}</span></td>
                  <td>{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
