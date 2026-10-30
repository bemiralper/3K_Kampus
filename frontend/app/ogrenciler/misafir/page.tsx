"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiDelete, apiGet, apiPost, getContextHeaders } from "@/lib/api";
import { useOgrenciPath } from "@/components/ogrenci/OgrenciPathProvider";
import { downloadPdfBlob } from "@/lib/download-file";
import "../ogrenci-list.css";
import "./misafir.css";

type Oturum = {
  id: number;
  name: string;
  session_date: string | null;
};

type Sinav = {
  id: number;
  name: string;
  exam_date: string | null;
  sinif_seviyesi: string;
  acik?: boolean;
  session_id?: number | null;
  session_name?: string;
  sessions?: Oturum[];
};

type DenemeOgrenci = {
  id: number;
  ad: string;
  soyad: string;
  tc_kimlik_no: string;
  telefon: string;
  ogrenci_no?: string;
  sinif_seviyesi_id?: number | null;
  sinif_seviyesi?: string;
  kayit_turu?: string;
  kurum_kaydi?: boolean;
  deneme_sayisi?: number;
  created_at: string | null;
  sinavlar: Sinav[];
};

type SecenekSinav = {
  id: number;
  name: string;
  exam_date: string | null;
  exam_type?: string;
  sessions: Oturum[];
};

type OdemeYontemi = {
  id: number;
  ad: string;
  tip: string;
  mali_hesap_id: number | null;
};

type MaliHesapSecenek = {
  id: number;
  ad: string;
  tip: string;
};

type KayitForm = {
  row: DenemeOgrenci;
  exams: SecenekSinav[];
  examId: string;
  sessionId: string;
  ucret: string;
  odemeYontemiId: string;
  maliHesapId: string;
  odemeYontemleri: OdemeYontemi[];
  maliHesaplar: MaliHesapSecenek[];
  loading: boolean;
  error: string;
};

type SecimIslem = "belge" | "oturum" | "iptal";

type Secim = {
  islem: SecimIslem;
  ogrenci: DenemeOgrenci;
  error: string;
};

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR");
}

function initials(ad: string, soyad: string) {
  return `${ad.charAt(0)}${soyad.charAt(0)}`.toUpperCase();
}

export default function DenemeOgrencileriPage() {
  const { href: ogrenciHref, listHref } = useOgrenciPath();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<DenemeOgrenci[]>([]);
  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [note, setNote] = useState("");
  const [oturum, setOturum] = useState<{ ogrenci: DenemeOgrenci; sinav: Sinav; sessionId: string } | null>(null);
  const [iptal, setIptal] = useState<{ ogrenci: DenemeOgrenci; sinav: Sinav } | null>(null);
  const [kayit, setKayit] = useState<KayitForm | null>(null);
  const [secim, setSecim] = useState<Secim | null>(null);
  const [pasif, setPasif] = useState<DenemeOgrenci | null>(null);
  const [pasifError, setPasifError] = useState("");
  const [pasifBusy, setPasifBusy] = useState(false);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError("");
    const res = await apiGet<{ ogrenciler: DenemeOgrenci[] }>(
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
    setLoading(true);
    const timer = window.setTimeout(() => { load(q); }, 250);
    return () => window.clearTimeout(timer);
  }, [q, load]);

  const downloadBelge = async (ogrenci: DenemeOgrenci, sinav: Sinav) => {
    const key = `belge-${ogrenci.id}-${sinav.id}`;
    setBusyKey(key);
    setNote("");
    try {
      const response = await fetch(
        `/api/ogrenci-kayit/gunu-birlik/giris-belgesi/?exam_id=${sinav.id}&ogrenci_id=${ogrenci.id}`,
        { credentials: "include", headers: getContextHeaders() },
      );
      if (!response.ok) {
        let detail = "Sınav belgesi alınamadı.";
        try {
          const body = await response.json();
          detail = body.detail || body.error || detail;
        } catch {
          // PDF dışı gövde olmayabilir.
        }
        throw new Error(detail);
      }
      const blob = await response.blob();
      const ad = `${ogrenci.ad} ${ogrenci.soyad}`.trim().replace(/\s+/g, "-") || String(ogrenci.id);
      await downloadPdfBlob(blob, `${ad}-sinav-giris-belgesi.pdf`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Sınav belgesi indirilemedi.");
    } finally {
      setBusyKey("");
    }
  };

  const applyIslem = async (body: Record<string, unknown>) => {
    const res = await apiPost<{ ok?: boolean; seat_detail?: string; detail?: string }>(
      "/api/ogrenci-kayit/gunu-birlik/sinav/",
      body,
    );
    if (!res.success) {
      throw new Error(res.error || "İşlem yapılamadı.");
    }
    return res.data;
  };

  const confirmOturum = async () => {
    if (!oturum) return;
    setBusyKey(`oturum-${oturum.ogrenci.id}-${oturum.sinav.id}`);
    setNote("");
    try {
      const data = await applyIslem({
        islem: "oturum",
        ogrenci_id: oturum.ogrenci.id,
        exam_id: oturum.sinav.id,
        exam_session_id: Number(oturum.sessionId),
      });
      setOturum(null);
      if (data?.seat_detail) setNote(data.seat_detail);
      await load(q);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Oturum değiştirilemedi.");
    } finally {
      setBusyKey("");
    }
  };

  const openKayit = async (row: DenemeOgrenci) => {
    setKayit({
      row,
      exams: [],
      examId: "",
      sessionId: "",
      ucret: "",
      odemeYontemiId: "",
      maliHesapId: "",
      odemeYontemleri: [],
      maliHesaplar: [],
      loading: true,
      error: row.sinif_seviyesi_id ? "" : "Sınıf seviyesi bulunamadı.",
    });
    const seviye = row.sinif_seviyesi_id ? `?sinif_seviyesi=${row.sinif_seviyesi_id}` : "";
    const [examsRes, ucretRes] = await Promise.all([
      apiGet<{
        sinavlar: SecenekSinav[];
        odeme_yontemleri?: OdemeYontemi[];
        mali_hesaplar?: MaliHesapSecenek[];
      }>(`/api/ogrenci-kayit/gunu-birlik/secenekler/${seviye}`),
      row.tc_kimlik_no
        ? apiGet<{ tutar: number | null }>(
            `/api/ogrenci-kayit/gunu-birlik/ucret/?tc=${encodeURIComponent(row.tc_kimlik_no)}`,
          )
        : Promise.resolve({ success: true as const, data: { tutar: null } }),
    ]);
    const exams = examsRes.success && examsRes.data ? examsRes.data.sinavlar || [] : [];
    const tutar = ucretRes.success && ucretRes.data?.tutar != null ? String(ucretRes.data.tutar) : "";
    setKayit((current) => {
      if (!current || current.row.id !== row.id) return current;
      return {
        ...current,
        exams,
        ucret: tutar,
        odemeYontemleri: examsRes.success && examsRes.data ? examsRes.data.odeme_yontemleri || [] : [],
        maliHesaplar: examsRes.success && examsRes.data ? examsRes.data.mali_hesaplar || [] : [],
        loading: false,
        error: examsRes.success ? current.error : examsRes.error || "Denemeler alınamadı.",
      };
    });
  };

  const selectKayitExam = (examId: string) => {
    setKayit((current) => {
      if (!current) return current;
      const exam = current.exams.find((item) => String(item.id) === examId);
      const only = exam && exam.sessions.length === 1 ? String(exam.sessions[0].id) : "";
      return { ...current, examId, sessionId: only, error: "" };
    });
  };

  const confirmKayit = async () => {
    if (!kayit) return;
    const exam = kayit.exams.find((item) => String(item.id) === kayit.examId);
    if (!exam) {
      setKayit({ ...kayit, error: "Deneme seçin." });
      return;
    }
    if (exam.sessions.length > 1 && !kayit.sessionId) {
      setKayit({ ...kayit, error: "Oturum seçin." });
      return;
    }
    const ucret = kayit.ucret.trim();
    if (ucret && !/^\d+$/.test(ucret.replace(/\./g, ""))) {
      setKayit({ ...kayit, error: "Deneme ücreti tam sayı olmalıdır." });
      return;
    }
    const tutar = ucret ? Number(ucret.replace(/\./g, "")) : 0;
    if (tutar > 0 && !kayit.odemeYontemiId) {
      setKayit({ ...kayit, error: "Ödeme şekli seçin." });
      return;
    }
    if (tutar > 0 && !kayit.maliHesapId) {
      setKayit({ ...kayit, error: "Mali hesap seçin." });
      return;
    }
    setBusyKey(`kayit-${kayit.row.id}`);
    setNote("");
    try {
      const data = await applyIslem({
        islem: "kayit",
        ogrenci_id: kayit.row.id,
        exam_id: exam.id,
        exam_session_id: kayit.sessionId ? Number(kayit.sessionId) : null,
        deneme_ucreti: ucret,
        odeme_yontemi_id: tutar > 0 ? Number(kayit.odemeYontemiId) : null,
        mali_hesap_id: tutar > 0 ? Number(kayit.maliHesapId) : null,
      });
      const ad = `${kayit.row.ad} ${kayit.row.soyad}`.trim();
      setKayit(null);
      setNote(data?.seat_detail || `${ad}, ${exam.name} sınavına kaydedildi.`);
      await load(q);
    } catch (err) {
      setKayit((current) => current && ({
        ...current,
        error: err instanceof Error ? err.message : "Denemeye kaydedilemedi.",
      }));
    } finally {
      setBusyKey("");
    }
  };

  const openSecim = (islem: SecimIslem, ogrenci: DenemeOgrenci) => {
    setNote("");
    setSecim({
      islem,
      ogrenci,
      error: ogrenci.sinavlar.length ? "" : "Bu öğrencinin kayıtlı denemesi yok.",
    });
  };

  const chooseSecim = async (sinav: Sinav) => {
    if (!secim) return;
    if (secim.islem === "belge") {
      setSecim(null);
      await downloadBelge(secim.ogrenci, sinav);
      return;
    }
    if (!sinav.acik) {
      setSecim({ ...secim, error: "Tarihi geçmiş denemede bu işlem yapılamaz." });
      return;
    }
    if (secim.islem === "oturum") {
      const diger = (sinav.sessions || []).filter((item) => item.id !== sinav.session_id);
      if (diger.length === 0) {
        setSecim({ ...secim, error: "Bu denemede değiştirilecek başka oturum yok." });
        return;
      }
      setSecim(null);
      setOturum({ ogrenci: secim.ogrenci, sinav, sessionId: String(diger[0].id) });
      return;
    }
    setSecim(null);
    setIptal({ ogrenci: secim.ogrenci, sinav });
  };

  const confirmPasif = async () => {
    if (!pasif) return;
    setPasifBusy(true);
    setPasifError("");
    const res = await apiDelete<{ code?: string; sozlesme_no?: string }>(`/ogrenciler/api/${pasif.id}/delete/`);
    setPasifBusy(false);
    if (!res.success) {
      const data = res.data;
      setPasifError(
        data?.code === "AKTIF_SOZLESME"
          ? `Bu öğrencinin aktif sözleşmesi var${data.sozlesme_no ? ` (${data.sozlesme_no})` : ""}. Önce sözleşmeyi iptal edin.`
          : res.error || "Pasife alınamadı.",
      );
      return;
    }
    setPasif(null);
    await load(q);
  };

  const confirmIptal = async () => {
    if (!iptal) return;
    setBusyKey(`iptal-${iptal.ogrenci.id}-${iptal.sinav.id}`);
    setNote("");
    try {
      await applyIslem({
        islem: "iptal",
        ogrenci_id: iptal.ogrenci.id,
        exam_id: iptal.sinav.id,
      });
      setIptal(null);
      await load(q);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Kayıt iptal edilemedi.");
    } finally {
      setBusyKey("");
    }
  };

  const colors = ["blue", "green", "purple", "orange", "teal", "pink"];

  return (
    <div className="section ogl-page deneme-page">
      <header className="ogl-head">
        <div className="ogl-head-main">
          <nav className="ogl-crumbs" aria-label="Sayfa yolu">
            <Link href={listHref}>Öğrenciler</Link>
            <span aria-hidden>/</span>
            <span aria-current="page">Deneme Öğrencileri</span>
          </nav>
          <h1 className="ogl-title">Deneme Öğrencileri</h1>
          <p className="ogl-subtitle">
            Denemeye kaydı açılan öğrenciler. Kuruma kayıt olunca öğrenci listesine de geçer.
          </p>
        </div>
        <div className="ogl-head-actions">
          <Link href={ogrenciHref("misafir/yeni")} className="ogl-btn ogl-btn--primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Tek deneme kayıt
          </Link>
        </div>
      </header>

      {error && (
        <div className="ogl-notice ogl-notice--error" role="alert">
          <span>{error}</span>
        </div>
      )}
      {note && (
        <div className="ogl-notice" role="status">
          <span>{note}</span>
        </div>
      )}

      <div className="ogrenci-list-card">
        <div className="ogrenci-list-card-header">
          <div className={`ogrenci-search-shell${loading ? " is-searching" : ""}`}>
            <span className="ogrenci-search-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </span>
            <input
              className="ogrenci-search-input"
              value={q}
              placeholder="Ad, soyad, numara veya TC ile ara"
              aria-label="Deneme öğrencisi ara"
              onChange={(event) => setQ(event.target.value)}
            />
            {q && (
              <button type="button" className="ogrenci-search-btn clear" aria-label="Aramayı temizle" onClick={() => setQ("")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <span className="deneme-count">{loading ? "…" : `${rows.length} öğrenci`}</span>
        </div>

        {loading ? (
          <div className="ogrenci-empty"><p>Yükleniyor…</p></div>
        ) : rows.length === 0 ? (
          <div className="ogrenci-empty">
            <div className="ogrenci-empty-visual" aria-hidden>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h4>{q.trim() ? "Aramanızla eşleşen öğrenci yok" : "Deneme öğrencisi yok"}</h4>
            <p>{q.trim() ? "Farklı bir ad veya TC deneyin." : "Tek deneme kayıt ile ilk öğrenciyi ekleyin."}</p>
          </div>
        ) : (
          <>
            <div className="ogrenci-mobile-list">
              {rows.map((row, index) => (
                <div key={row.id} className="ogrenci-mobile-card">
                  <div className="ogrenci-mobile-card-top">
                    <div className={`avatar-circle small ${colors[index % colors.length]}`}>{initials(row.ad, row.soyad)}</div>
                    <div className="ogrenci-mobile-card-info">
                      <Link href={ogrenciHref(String(row.id))} className="ogrenci-mobile-name">{row.ad} {row.soyad}</Link>
                      <span className="ogrenci-mobile-meta">
                        {row.ogrenci_no ? `No: ${row.ogrenci_no}` : "No yok"}
                        {row.sinif_seviyesi ? ` · ${row.sinif_seviyesi}` : ""}
                        {` · ${row.deneme_sayisi ?? row.sinavlar.length} deneme`}
                        {row.telefon ? ` · ${row.telefon}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="ogrenci-mobile-card-actions">
                    <DenemeIslemMenu
                      row={row}
                      variant="button"
                      onKayit={() => openKayit(row)}
                      onBelge={() => openSecim("belge", row)}
                      onDuzenle={() => openSecim("oturum", row)}
                      onSil={() => openSecim("iptal", row)}
                    />
                    <Link href={ogrenciHref(String(row.id))} className="ogl-btn ogl-btn--soft ogl-btn--sm">Detay</Link>
                    <button
                      type="button"
                      className="ogl-btn ogl-btn--ghost ogl-btn--sm ogl-btn--danger-text"
                      onClick={() => { setPasifError(""); setPasif(row); }}
                    >
                      Pasife al
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="ogrenci-table-wrap">
              <table className="table-modern ogrenci-desktop-table">
                <thead>
                  <tr>
                    <th>Öğrenci bilgisi</th>
                    <th>Telefon</th>
                    <th>Sınıf seviyesi</th>
                    <th>Deneme</th>
                    <th style={{ width: 148 }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id}>
                      <td>
                        <StudentCell row={row} color={colors[index % colors.length]} />
                      </td>
                      <td><span className="date-text">{row.telefon || "—"}</span></td>
                      <td>
                        {row.sinif_seviyesi ? (
                          <span className="ogl-tag ogl-tag--level">{row.sinif_seviyesi}</span>
                        ) : (
                          <span className="ogrenci-kalem-empty">—</span>
                        )}
                      </td>
                      <td><span className="date-text">{row.deneme_sayisi ?? row.sinavlar.length}</span></td>
                      <td>
                        <RowActions
                          row={row}
                          onKayit={() => openKayit(row)}
                          onBelge={() => openSecim("belge", row)}
                          onDuzenle={() => openSecim("oturum", row)}
                          onSil={() => openSecim("iptal", row)}
                          onPasif={() => { setPasifError(""); setPasif(row); }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {kayit && (
        <div className="ogl-dialog-overlay" role="presentation" onClick={() => !busyKey && setKayit(null)}>
          <div className="ogl-dialog deneme-kayit-dialog" role="dialog" aria-modal="true" aria-labelledby="deneme-kayit-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="deneme-kayit-title" className="deneme-dialog-title">Denemeye kaydet</h3>
            <p className="deneme-dialog-text">{kayit.row.ad} {kayit.row.soyad}</p>
            <label className="deneme-field">
              <span>Deneme</span>
              <select
                className="deneme-select"
                value={kayit.examId}
                disabled={kayit.loading}
                onChange={(event) => selectKayitExam(event.target.value)}
              >
                <option value="">{kayit.loading ? "Yükleniyor…" : "Seçiniz"}</option>
                {kayit.exams.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.exam_date ? ` · ${formatDate(item.exam_date)}` : ""}
                    {item.exam_type ? ` (${item.exam_type})` : ""}
                  </option>
                ))}
              </select>
            </label>
            {(kayit.exams.find((item) => String(item.id) === kayit.examId)?.sessions.length || 0) > 1 && (
              <label className="deneme-field">
                <span>Oturum</span>
                <select
                  className="deneme-select"
                  value={kayit.sessionId}
                  onChange={(event) => setKayit({ ...kayit, sessionId: event.target.value, error: "" })}
                >
                  <option value="">Seçiniz</option>
                  {kayit.exams
                    .find((item) => String(item.id) === kayit.examId)
                    ?.sessions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}{item.session_date ? ` · ${formatDate(item.session_date)}` : ""}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="deneme-field">
              <span>Deneme ücreti (TL)</span>
              <input
                className="deneme-select"
                inputMode="numeric"
                value={kayit.ucret}
                placeholder="Ücret alınmayacaksa boş bırakın"
                onChange={(event) => setKayit({
                  ...kayit,
                  ucret: event.target.value.replace(/[^\d]/g, ""),
                  error: "",
                })}
              />
            </label>
            {Number(kayit.ucret.replace(/\./g, "")) > 0 && (
              <>
                <label className="deneme-field">
                  <span>Ödeme şekli</span>
                  <select
                    className="deneme-select"
                    value={kayit.odemeYontemiId}
                    onChange={(event) => {
                      const id = event.target.value;
                      const yontem = kayit.odemeYontemleri.find((item) => String(item.id) === id);
                      setKayit({
                        ...kayit,
                        odemeYontemiId: id,
                        maliHesapId: yontem?.mali_hesap_id ? String(yontem.mali_hesap_id) : kayit.maliHesapId,
                        error: "",
                      });
                    }}
                  >
                    <option value="">Seçiniz</option>
                    {kayit.odemeYontemleri.map((item) => (
                      <option key={item.id} value={item.id}>{item.ad}</option>
                    ))}
                  </select>
                </label>
                <label className="deneme-field">
                  <span>Mali hesap</span>
                  <select
                    className="deneme-select"
                    value={kayit.maliHesapId}
                    onChange={(event) => setKayit({ ...kayit, maliHesapId: event.target.value, error: "" })}
                  >
                    <option value="">Seçiniz</option>
                    {kayit.maliHesaplar.map((item) => (
                      <option key={item.id} value={item.id}>{item.ad}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {!kayit.loading && kayit.exams.length === 0 && !kayit.error && (
              <p className="deneme-dialog-text">Bu sınıf seviyesi için tarihi gelmemiş deneme yok.</p>
            )}
            {kayit.error && <p className="ogl-dialog-error" role="alert">{kayit.error}</p>}
            <div className="deneme-dialog-actions">
              <button type="button" className="ogl-btn ogl-btn--ghost" disabled={Boolean(busyKey)} onClick={() => setKayit(null)}>Vazgeç</button>
              <button type="button" className="ogl-btn ogl-btn--primary" disabled={Boolean(busyKey) || kayit.loading} onClick={confirmKayit}>
                {busyKey.startsWith("kayit-") ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {secim && (
        <div className="ogl-dialog-overlay" role="presentation" onClick={() => !busyKey && setSecim(null)}>
          <div className="ogl-dialog deneme-kayit-dialog" role="dialog" aria-modal="true" aria-labelledby="deneme-secim-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="deneme-secim-title" className="deneme-dialog-title">
              {secim.islem === "belge" ? "Giriş belgesi" : secim.islem === "oturum" ? "Oturum değiştir" : "Kaydı iptal et"}
            </h3>
            <p className="deneme-dialog-text">
              {secim.ogrenci.ad} {secim.ogrenci.soyad}
              {secim.ogrenci.sinavlar.length ? ". İşlem yapılacak denemeyi seçin." : ""}
            </p>
            {secim.ogrenci.sinavlar.length > 0 && (
              <div className="deneme-pick-list">
                {secim.ogrenci.sinavlar.map((sinav) => (
                  <button
                    key={sinav.id}
                    type="button"
                    className="deneme-pick"
                    disabled={Boolean(busyKey)}
                    onClick={() => chooseSecim(sinav)}
                  >
                    <span className="deneme-pick-name">{sinav.name}</span>
                    <span className="deneme-pick-meta">
                      {formatDate(sinav.exam_date)}
                      {sinav.session_name ? ` · ${sinav.session_name}` : ""}
                      {sinav.sinif_seviyesi ? ` · ${sinav.sinif_seviyesi}` : ""}
                      {!sinav.acik ? " · tarihi geçti" : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {secim.error && <p className="ogl-dialog-error" role="alert">{secim.error}</p>}
            <div className="deneme-dialog-actions">
              <button type="button" className="ogl-btn ogl-btn--ghost" disabled={Boolean(busyKey)} onClick={() => setSecim(null)}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}

      {oturum && (
        <div className="ogl-dialog-overlay" role="presentation" onClick={() => setOturum(null)}>
          <div className="ogl-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3 className="deneme-dialog-title">Oturum değiştir</h3>
            <p className="deneme-dialog-text">{oturum.ogrenci.ad} {oturum.ogrenci.soyad} · {oturum.sinav.name}</p>
            <select
              className="deneme-select"
              value={oturum.sessionId}
              onChange={(event) => setOturum({ ...oturum, sessionId: event.target.value })}
            >
              {(oturum.sinav.sessions || [])
                .filter((item) => item.id !== oturum.sinav.session_id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.session_date ? ` · ${formatDate(item.session_date)}` : ""}
                  </option>
                ))}
            </select>
            <div className="deneme-dialog-actions">
              <button type="button" className="ogl-btn ogl-btn--ghost" onClick={() => setOturum(null)}>Vazgeç</button>
              <button type="button" className="ogl-btn ogl-btn--primary" disabled={Boolean(busyKey)} onClick={confirmOturum}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {iptal && (
        <div className="ogl-dialog-overlay" role="presentation" onClick={() => setIptal(null)}>
          <div className="ogl-dialog" role="alertdialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3 className="deneme-dialog-title">Deneme kaydını iptal et</h3>
            <p className="deneme-dialog-text">
              {iptal.ogrenci.ad} {iptal.ogrenci.soyad}, {iptal.sinav.name} sınavından çıkarılacak.
              Bu deneme için alınmış ücret de finans kaydında iptal edilir.
            </p>
            <div className="deneme-dialog-actions">
              <button type="button" className="ogl-btn ogl-btn--ghost" onClick={() => setIptal(null)}>Vazgeç</button>
              <button type="button" className="ogl-btn ogl-btn--danger" disabled={Boolean(busyKey)} onClick={confirmIptal}>İptal et</button>
            </div>
          </div>
        </div>
      )}

      {pasif && (
        <div className="ogl-dialog-overlay" role="presentation" onClick={() => { if (!pasifBusy) { setPasif(null); setPasifError(""); } }}>
          <div className="ogl-dialog" role="alertdialog" aria-modal="true" aria-labelledby="deneme-pasif-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="deneme-pasif-title" className="deneme-dialog-title">Öğrenciyi pasife al</h3>
            <p className="deneme-dialog-text">
              <strong>{pasif.ad} {pasif.soyad}</strong> pasife alınacak.
              Öğrenci listelerden düşer; kaydı ve geçmişi korunur.
            </p>
            {pasifError && <p className="ogl-dialog-error" role="alert">{pasifError}</p>}
            <div className="deneme-dialog-actions">
              <button type="button" className="ogl-btn ogl-btn--ghost" disabled={pasifBusy} onClick={() => { setPasif(null); setPasifError(""); }}>Vazgeç</button>
              <button type="button" className="ogl-btn ogl-btn--danger" disabled={pasifBusy} onClick={confirmPasif}>
                {pasifBusy ? "Pasife alınıyor…" : "Evet, pasife al"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentCell({ row, color }: { row: DenemeOgrenci; color: string }) {
  const { href } = useOgrenciPath();
  return (
    <div className="cell-with-icon">
      <div className={`avatar-circle ${color}`}>{initials(row.ad, row.soyad)}</div>
      <div className="cell-info">
        <div className="cell-primary-row">
          <Link href={href(String(row.id))} className="cell-primary cell-link">{row.ad} {row.soyad}</Link>
          {row.kurum_kaydi && <span className="deneme-chip">Kurum kaydı</span>}
        </div>
        <span className="cell-secondary">
          {row.ogrenci_no ? `No: ${row.ogrenci_no}` : "No yok"}
          {row.tc_kimlik_no ? ` · ${row.tc_kimlik_no}` : ""}
        </span>
      </div>
    </div>
  );
}

function RowActions({
  row,
  onKayit,
  onBelge,
  onDuzenle,
  onSil,
  onPasif,
}: {
  row: DenemeOgrenci;
  onKayit: () => void;
  onBelge: () => void;
  onDuzenle: () => void;
  onSil: () => void;
  onPasif: () => void;
}) {
  const { href } = useOgrenciPath();
  return (
    <div className="row-actions">
      <Link
        href={href(String(row.id))}
        className="row-action-btn"
        title="Görüntüle"
        aria-label={`${row.ad} ${row.soyad} — görüntüle`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </Link>
      <DenemeIslemMenu row={row} onKayit={onKayit} onBelge={onBelge} onDuzenle={onDuzenle} onSil={onSil} />
      <button
        type="button"
        className="row-action-btn danger"
        title="Pasife al"
        aria-label={`${row.ad} ${row.soyad} — pasife al`}
        onClick={onPasif}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      </button>
    </div>
  );
}

type MenuPos = { top: number; left: number; minWidth: number; placement: "bottom" | "top" };

function menuPos(trigger: HTMLElement): MenuPos {
  const rect = trigger.getBoundingClientRect();
  const minWidth = Math.max(rect.width, 220);
  const estimated = 176;
  const spaceBelow = window.innerHeight - rect.bottom - 6;
  const spaceAbove = rect.top - 6;
  const openUp = spaceBelow < estimated && spaceAbove > spaceBelow;
  const top = openUp ? rect.top - 6 : rect.bottom + 6;
  const left = Math.max(8, Math.min(rect.right - minWidth, window.innerWidth - minWidth - 8));
  return { top, left, minWidth, placement: openUp ? "top" : "bottom" };
}

function DenemeIslemMenu({
  row,
  variant = "icon",
  onKayit,
  onBelge,
  onDuzenle,
  onSil,
}: {
  row: DenemeOgrenci;
  variant?: "icon" | "button";
  onKayit: () => void;
  onBelge: () => void;
  onDuzenle: () => void;
  onSil: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const place = useCallback(() => {
    if (btnRef.current) setPos(menuPos(btnRef.current));
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  const pick = (action: () => void) => {
    setOpen(false);
    action();
  };

  const menu = open && pos && mounted
    ? createPortal(
      <div
        ref={menuRef}
        className={`ogrenci-belge-dropdown ogrenci-belge-dropdown--portal ogrenci-belge-dropdown--${pos.placement}`}
        role="menu"
        style={{
          position: "fixed",
          top: pos.placement === "bottom" ? pos.top : undefined,
          bottom: pos.placement === "top" ? window.innerHeight - pos.top : undefined,
          left: pos.left,
          minWidth: pos.minWidth,
          zIndex: 3000,
        }}
      >
        <button type="button" role="menuitem" onClick={() => pick(onKayit)}>Kayıt</button>
        <button type="button" role="menuitem" onClick={() => pick(onBelge)}>Sınav giriş belgesi</button>
        <button type="button" role="menuitem" onClick={() => pick(onDuzenle)}>Sınav düzenleme</button>
        <button type="button" role="menuitem" className="deneme-menu-danger" onClick={() => pick(onSil)}>Sınav silme</button>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={`ogrenci-belge-menu${variant === "button" ? " ogrenci-belge-menu--button" : ""}`} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className={variant === "button" ? "ogl-btn ogl-btn--ghost ogl-btn--sm" : "row-action-btn"}
        title="İşlemler"
        aria-label={`${row.ad} ${row.soyad} — işlemler`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next && btnRef.current) setPos(menuPos(btnRef.current));
            return next;
          });
        }}
      >
        {variant === "button" ? "İşlemler" : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        )}
      </button>
      {menu}
    </div>
  );
}

