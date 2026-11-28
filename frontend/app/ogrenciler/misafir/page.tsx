"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiGet, apiPost, getContextHeaders } from "@/lib/api";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useKurum } from "@/lib/contexts/KurumContext";
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
  participant_id: number;
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
  aktif_mi?: boolean;
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

type BelgeModalState = {
  ogrenci: DenemeOgrenci;
  examId: number;
  examName: string;
  sessionName?: string;
  participantId?: number | null;
  seatDetail?: string;
};

type ExcelRow = {
  ad: string;
  soyad: string;
  sinif: string;
  sinif_seviyesi_id: number | null;
  tc_kimlik_no: string;
  telefon: string;
  status: string;
  detail: string;
  ogrenci_id: number | null;
};

type ExcelOzet = {
  toplam: number;
  yeni: number;
  mevcut_misafir: number;
  kayitli_ogrenci: number;
  zaten_sinavda: number;
  hata: number;
};

type ExcelModalState = {
  exams: SecenekSinav[];
  examId: string;
  sessionId: string;
  loadingExams: boolean;
  uploading: boolean;
  committing: boolean;
  fileName: string;
  rows: ExcelRow[];
  ozet: ExcelOzet | null;
  error: string;
};

const EXCEL_STATUS_LABELS: Record<string, string> = {
  yeni: "Yeni kayıt",
  mevcut_misafir: "Mevcut deneme",
  kayitli_ogrenci: "Kurum öğrencisi",
  zaten_sinavda: "Zaten sınavda",
  hata: "Hatalı",
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
  return (
    <Suspense
      fallback={
        <div className="section ogl-page deneme-page">
          <div className="ogrenci-list-card">
            <div className="ogrenci-empty"><p>Yükleniyor…</p></div>
          </div>
        </div>
      }
    >
      <DenemeOgrencileriContent />
    </Suspense>
  );
}

function DenemeOgrencileriContent() {
  const { href: ogrenciHref, listHref } = useOgrenciPath();
  const { user } = useAuth();
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<DenemeOgrenci[]>([]);
  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [durumFilter, setDurumFilter] = useState<"aktif" | "pasif">("aktif");
  const [counts, setCounts] = useState<{ aktif?: number; pasif?: number }>({});
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

  const [belgeModal, setBelgeModal] = useState<BelgeModalState | null>(null);
  const [belgeBusy, setBelgeBusy] = useState<null | "download" | "print" | "whatsapp">(null);
  const [belgeNote, setBelgeNote] = useState("");
  const [belgeOgrenci, setBelgeOgrenci] = useState(true);
  const [belgeVeli, setBelgeVeli] = useState(false);

  const [excelModal, setExcelModal] = useState<ExcelModalState | null>(null);

  const { canWrite, canDeactivate, canReactivate } = useMemo(() => {
    if (!user) {
      return { canWrite: true, canDeactivate: true, canReactivate: true };
    }
    const isAdminLike = Boolean(
      user.is_superuser ||
        user.is_staff ||
        user.role_code === "super_admin" ||
        user.role_code === "kurum_yoneticisi" ||
        user.role_code === "muhasebe",
    );
    if (isAdminLike) {
      return { canWrite: true, canDeactivate: true, canReactivate: true };
    }
    const perms = new Set(user.permissions || []);
    return {
      canWrite:
        perms.has("ogrenci.write") ||
        perms.has("ogrenci.manage") ||
        perms.has("olcme.write") ||
        perms.has("olcme.manage"),
      canDeactivate: perms.has("ogrenci.delete") || perms.has("ogrenci.manage"),
      canReactivate:
        perms.has("ogrenci.write") ||
        perms.has("ogrenci.delete") ||
        perms.has("ogrenci.manage"),
    };
  }, [user]);

  const loadVersion = useRef(0);

  const load = useCallback(async (query: string, durum: "aktif" | "pasif" = "aktif") => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (durum !== "aktif") params.set("durum", durum);
    const qs = params.toString();
    const res = await apiGet<{
      ogrenciler: DenemeOgrenci[];
      aktif_count?: number;
      pasif_count?: number;
    }>(`/api/ogrenci-kayit/gunu-birlik/${qs ? `?${qs}` : ""}`);
    if (version !== loadVersion.current) return;
    if (!res.success || !res.data) {
      setError(res.error || "Liste alınamadı.");
      setRows([]);
    } else {
      setRows(res.data.ogrenciler || []);
      if (res.data.aktif_count != null || res.data.pasif_count != null) {
        setCounts({
          aktif: res.data.aktif_count,
          pasif: res.data.pasif_count,
        });
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const invalidate = () => { ++loadVersion.current; };
    setLoading(true);
    const timer = window.setTimeout(() => { load(q, durumFilter); }, 250);
    return () => {
      window.clearTimeout(timer);
      invalidate();
    };
  }, [q, durumFilter, activeKurum?.id, activeSube?.id, activeEgitimYili?.id, load]);

  const fetchBelgeBlob = async (target: BelgeModalState) => {
    const qs = new URLSearchParams({
      exam_id: String(target.examId),
      ogrenci_id: String(target.ogrenci.id),
    });
    if (target.participantId) {
      qs.set("participant_id", String(target.participantId));
    }
    const response = await fetch(
      `/api/ogrenci-kayit/gunu-birlik/giris-belgesi/?${qs.toString()}`,
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
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const fallbackName =
      `${target.ogrenci.ad} ${target.ogrenci.soyad}`.trim().replace(/\s+/g, "-") ||
      String(target.ogrenci.id);
    return {
      blob,
      filename: match?.[1] || `${fallbackName}-sinav-giris-belgesi.pdf`,
    };
  };

  const openBelgeModal = (
    ogrenci: DenemeOgrenci,
    examId: number,
    examName: string,
    options?: { sessionName?: string; participantId?: number | null; seatDetail?: string },
  ) => {
    setBelgeNote("");
    setBelgeOgrenci(true);
    setBelgeVeli(false);
    setBelgeModal({
      ogrenci,
      examId,
      examName,
      sessionName: options?.sessionName,
      participantId: options?.participantId ?? null,
      seatDetail: options?.seatDetail,
    });
  };

  const handleBelgeDownload = async () => {
    if (!belgeModal) return;
    setBelgeBusy("download");
    setBelgeNote("");
    try {
      const { blob, filename } = await fetchBelgeBlob(belgeModal);
      await downloadPdfBlob(blob, filename);
    } catch (err) {
      setBelgeNote(err instanceof Error ? err.message : "Sınav belgesi indirilemedi.");
    } finally {
      setBelgeBusy(null);
    }
  };

  const handleBelgePrint = async () => {
    if (!belgeModal) return;
    setBelgeBusy("print");
    setBelgeNote("");
    try {
      const { blob } = await fetchBelgeBlob(belgeModal);
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      };
      document.body.appendChild(iframe);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setBelgeNote(err instanceof Error ? err.message : "Sınav belgesi yazdırılamadı.");
    } finally {
      setBelgeBusy(null);
    }
  };

  const handleBelgeWhatsapp = async () => {
    if (!belgeModal) return;
    const alicilar = [
      ...(belgeOgrenci ? ["ogrenci"] : []),
      ...(belgeVeli ? ["veli"] : []),
    ];
    if (alicilar.length === 0) {
      setBelgeNote("Öğrenci veya veli seçin.");
      return;
    }
    setBelgeBusy("whatsapp");
    setBelgeNote("");
    try {
      const res = await apiPost<{ sent?: number; detail?: string }>(
        "/api/ogrenci-kayit/gunu-birlik/giris-belgesi/whatsapp/",
        {
          exam_id: belgeModal.examId,
          ogrenci_id: belgeModal.ogrenci.id,
          ...(belgeModal.participantId ? { participant_id: belgeModal.participantId } : {}),
          alicilar,
        },
      );
      if (!res.success) {
        throw new Error(res.error || "WhatsApp gönderimi başarısız.");
      }
      setBelgeNote(res.data?.detail || "Sınav giriş belgesi WhatsApp kuyruğuna eklendi.");
    } catch (err) {
      setBelgeNote(err instanceof Error ? err.message : "WhatsApp gönderimi yapılamadı.");
    } finally {
      setBelgeBusy(null);
    }
  };

  const applyIslem = async (body: Record<string, unknown>) => {
    const res = await apiPost<{
      ok?: boolean;
      exam_id?: number;
      sinav_adi?: string;
      participant_id?: number | null;
      seat_detail?: string;
      detail?: string;
    }>("/api/ogrenci-kayit/gunu-birlik/sinav/", body);
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
        participant_id: oturum.sinav.participant_id,
        exam_session_id: Number(oturum.sessionId),
      });
      setOturum(null);
      if (data?.seat_detail) setNote(data.seat_detail);
      await load(q, durumFilter);
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
    const yontemler = examsRes.success && examsRes.data ? examsRes.data.odeme_yontemleri || [] : [];
    const hesaplar = examsRes.success && examsRes.data ? examsRes.data.mali_hesaplar || [] : [];
    const defaultYontem = yontemler[0];
    setKayit((current) => {
      if (!current || current.row.id !== row.id) return current;
      return {
        ...current,
        exams,
        ucret: tutar,
        odemeYontemleri: yontemler,
        maliHesaplar: hesaplar,
        odemeYontemiId: defaultYontem ? String(defaultYontem.id) : "",
        maliHesapId: defaultYontem?.mali_hesap_id
          ? String(defaultYontem.mali_hesap_id)
          : hesaplar[0]
            ? String(hesaplar[0].id)
            : "",
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
      const targetRow = kayit.row;
      const selectedSession = exam.sessions.find((s) => String(s.id) === kayit.sessionId);
      const data = await applyIslem({
        islem: "kayit",
        ogrenci_id: targetRow.id,
        exam_id: exam.id,
        exam_session_id: kayit.sessionId ? Number(kayit.sessionId) : null,
        deneme_ucreti: ucret,
        odeme_yontemi_id: tutar > 0 ? Number(kayit.odemeYontemiId) : null,
        mali_hesap_id: tutar > 0 ? Number(kayit.maliHesapId) : null,
      });
      const ad = `${targetRow.ad} ${targetRow.soyad}`.trim();
      const seatMsg = data?.seat_detail || `${ad}, ${exam.name} sınavına kaydedildi.`;
      setKayit(null);
      setNote(seatMsg);
      await load(q, durumFilter);
      openBelgeModal(targetRow, exam.id, exam.name, {
        sessionName: selectedSession?.name,
        participantId: data?.participant_id ?? null,
        seatDetail: data?.seat_detail || "",
      });
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
    if (islem === "belge" && ogrenci.sinavlar.length === 1) {
      const sinav = ogrenci.sinavlar[0];
      openBelgeModal(ogrenci, sinav.id, sinav.name, {
        sessionName: sinav.session_name,
        participantId: sinav.participant_id,
      });
      return;
    }
    setSecim({
      islem,
      ogrenci,
      error: ogrenci.sinavlar.length ? "" : "Bu öğrencinin kayıtlı denemesi yok.",
    });
  };

  const chooseSecim = async (sinav: Sinav) => {
    if (!secim) return;
    if (secim.islem === "belge") {
      const targetOgrenci = secim.ogrenci;
      setSecim(null);
      openBelgeModal(targetOgrenci, sinav.id, sinav.name, {
        sessionName: sinav.session_name,
        participantId: sinav.participant_id,
      });
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
    const res = await apiPost<{ ok?: boolean; detail?: string }>(
      "/api/ogrenci-kayit/gunu-birlik/durum/",
      { ogrenci_id: pasif.id, aktif_mi: false },
    );
    setPasifBusy(false);
    if (!res.success) {
      setPasifError(res.error || "Pasife alınamadı.");
      return;
    }
    const fullName = `${pasif.ad} ${pasif.soyad}`.trim();
    setPasif(null);
    setNote(`${fullName} pasife alındı.`);
    await load(q, durumFilter);
  };

  const handleAktifeAl = async (row: DenemeOgrenci) => {
    const key = `aktif-${row.id}`;
    setBusyKey(key);
    setNote("");
    try {
      const res = await apiPost<{ ok?: boolean; detail?: string }>(
        "/api/ogrenci-kayit/gunu-birlik/durum/",
        { ogrenci_id: row.id, aktif_mi: true },
      );
      if (!res.success) {
        throw new Error(res.error || "Öğrenci aktife alınamadı.");
      }
      setNote(`${row.ad} ${row.soyad} yeniden aktife alındı.`);
      await load(q, durumFilter);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Öğrenci aktife alınamadı.");
    } finally {
      setBusyKey("");
    }
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
        participant_id: iptal.sinav.participant_id,
      });
      setIptal(null);
      await load(q, durumFilter);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Kayıt iptal edilemedi.");
    } finally {
      setBusyKey("");
    }
  };

  const openExcelModal = async () => {
    setExcelModal({
      exams: [],
      examId: "",
      sessionId: "",
      loadingExams: true,
      uploading: false,
      committing: false,
      fileName: "",
      rows: [],
      ozet: null,
      error: "",
    });
    const res = await apiGet<{ sinavlar: SecenekSinav[] }>(
      "/api/ogrenci-kayit/gunu-birlik/secenekler/",
    );
    setExcelModal((curr) => {
      if (!curr) return curr;
      if (!res.success || !res.data) {
        return {
          ...curr,
          loadingExams: false,
          error: res.error || "Deneme listesi alınamadı.",
        };
      }
      const exams = res.data.sinavlar || [];
      const firstExam = exams[0];
      const autoExamId = exams.length === 1 && firstExam ? String(firstExam.id) : "";
      const autoSessionId =
        autoExamId && firstExam.sessions.length === 1 ? String(firstExam.sessions[0].id) : "";
      return {
        ...curr,
        exams,
        examId: autoExamId,
        sessionId: autoSessionId,
        loadingExams: false,
      };
    });
  };

  const downloadExcelTemplate = async () => {
    try {
      const response = await fetch("/api/ogrenci-kayit/gunu-birlik/sablon/", {
        credentials: "include",
        headers: getContextHeaders(),
      });
      if (!response.ok) throw new Error("Şablon indirilemedi.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gunu-birlik-kayit.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setExcelModal((curr) =>
        curr ? { ...curr, error: err instanceof Error ? err.message : "Şablon indirilemedi." } : curr,
      );
    }
  };

  const handleExcelUpload = async (file: File | null) => {
    if (!file || !excelModal) return;
    const exam = excelModal.exams.find((item) => String(item.id) === excelModal.examId);
    if (!exam) {
      setExcelModal({ ...excelModal, error: "Önce sınav seçin." });
      return;
    }
    if (exam.sessions.length > 1 && !excelModal.sessionId) {
      setExcelModal({ ...excelModal, error: "Önce oturum seçin." });
      return;
    }
    setExcelModal({
      ...excelModal,
      uploading: true,
      fileName: file.name,
      rows: [],
      ozet: null,
      error: "",
    });
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("exam_id", String(exam.id));
      if (excelModal.sessionId) {
        formData.append("exam_session_id", excelModal.sessionId);
      }
      const response = await fetch("/api/ogrenci-kayit/gunu-birlik/excel/", {
        method: "POST",
        credentials: "include",
        headers: getContextHeaders(),
        body: formData,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || body.detail || "Excel dosyası okunamadı.");
      }
      setExcelModal((curr) =>
        curr
          ? {
              ...curr,
              uploading: false,
              rows: body.rows || [],
              ozet: body.ozet || null,
            }
          : curr,
      );
    } catch (err) {
      setExcelModal((curr) =>
        curr
          ? {
              ...curr,
              uploading: false,
              error: err instanceof Error ? err.message : "Excel önizlemesi alınamadı.",
            }
          : curr,
      );
    }
  };

  const confirmExcelCommit = async () => {
    if (!excelModal) return;
    const validRows = excelModal.rows.filter(
      (r) => r.status !== "hata" && r.status !== "zaten_sinavda",
    );
    if (validRows.length === 0) {
      setExcelModal({ ...excelModal, error: "Kaydedilecek uygun satır bulunmuyor." });
      return;
    }
    setExcelModal({ ...excelModal, committing: true, error: "" });
    try {
      const res = await apiPost<{ ozet?: ExcelOzet; rows?: ExcelRow[] }>(
        "/api/ogrenci-kayit/gunu-birlik/",
        {
          exam_id: Number(excelModal.examId),
          ...(excelModal.sessionId ? { exam_session_id: Number(excelModal.sessionId) } : {}),
          commit: true,
          ogrenciler: validRows.map((r) => ({
            ad: r.ad,
            soyad: r.soyad,
            sinif: r.sinif,
            sinif_seviyesi_id: r.sinif_seviyesi_id,
            tc_kimlik_no: r.tc_kimlik_no,
            telefon: r.telefon,
          })),
        },
      );
      if (!res.success) {
        throw new Error(res.error || "Toplu kayıt tamamlanamadı.");
      }
      const kaydedilen = (res.data?.rows || validRows).filter((r) => r.status !== "hata").length;
      setExcelModal(null);
      setNote(`Excel ile ${kaydedilen} öğrenci sınava kaydedildi ve boş salon sıralarına yerleştirildi.`);
      await load(q, durumFilter);
    } catch (err) {
      setExcelModal((curr) =>
        curr
          ? {
              ...curr,
              committing: false,
              error: err instanceof Error ? err.message : "Toplu kayıt başarısız.",
            }
          : curr,
      );
    }
  };

  const colors = ["blue", "green", "purple", "orange", "teal", "pink"];
  const pasifAcikSinavSayisi = pasif ? pasif.sinavlar.filter((s) => s.acik).length : 0;

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
        {canWrite && (
          <div className="ogl-head-actions">
            <button
              type="button"
              className="ogl-btn ogl-btn--soft"
              onClick={openExcelModal}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Excel ile toplu kayıt
            </button>
            <Link href={ogrenciHref("misafir/yeni")} className="ogl-btn ogl-btn--primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Tek deneme kayıt
            </Link>
          </div>
        )}
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
              placeholder="Ad, soyad, numara, telefon veya TC ile ara"
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
          <div className="deneme-status-tabs" role="tablist" aria-label="Kayıt durumu filtresi">
            <button
              type="button"
              role="tab"
              aria-selected={durumFilter === "aktif"}
              className={`deneme-status-tab${durumFilter === "aktif" ? " is-active" : ""}`}
              onClick={() => setDurumFilter("aktif")}
            >
              Aktif{counts.aktif != null ? ` (${counts.aktif})` : ""}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={durumFilter === "pasif"}
              className={`deneme-status-tab${durumFilter === "pasif" ? " is-active" : ""}`}
              onClick={() => setDurumFilter("pasif")}
            >
              Pasif{counts.pasif != null ? ` (${counts.pasif})` : ""}
            </button>
          </div>
          <span className="deneme-count">{loading ? "…" : error ? "—" : `${rows.length} öğrenci`}</span>
        </div>

        {loading ? (
          <div className="ogrenci-empty"><p>Yükleniyor…</p></div>
        ) : error ? (
          <div className="ogrenci-empty">
            <h4>Liste yüklenemedi</h4>
            <p>Öğrenciler alınırken bir hata oluştu.</p>
            <button type="button" className="ogl-btn ogl-btn--soft" onClick={() => load(q, durumFilter)}>Tekrar dene</button>
          </div>
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
            <h4>
              {q.trim()
                ? "Aramanızla eşleşen öğrenci yok"
                : durumFilter === "pasif"
                  ? "Pasif deneme öğrencisi yok"
                  : "Deneme öğrencisi yok"}
            </h4>
            <p>
              {q.trim()
                ? "Farklı bir ad, telefon veya TC deneyin."
                : durumFilter === "pasif"
                  ? "Pasife alınan tek deneme öğrencileri burada listelenir."
                  : "Tek deneme kayıt ile ilk öğrenciyi ekleyin."}
            </p>
          </div>
        ) : (
          <>
            <div className="ogrenci-mobile-list">
              {rows.map((row, index) => {
                const isPassive = row.aktif_mi === false || durumFilter === "pasif";
                return (
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
                        canWrite={canWrite && !isPassive && !row.kurum_kaydi}
                        onKayit={() => openKayit(row)}
                        onBelge={() => openSecim("belge", row)}
                        onDuzenle={() => openSecim("oturum", row)}
                        onSil={() => openSecim("iptal", row)}
                      />
                      <Link href={ogrenciHref(String(row.id))} className="ogl-btn ogl-btn--soft ogl-btn--sm">Detay</Link>
                      {isPassive ? (
                        canReactivate && (
                          <button
                            type="button"
                            className="ogl-btn ogl-btn--soft ogl-btn--sm"
                            disabled={busyKey === `aktif-${row.id}`}
                            onClick={() => handleAktifeAl(row)}
                          >
                            {busyKey === `aktif-${row.id}` ? "Alınıyor…" : "Aktife al"}
                          </button>
                        )
                      ) : (
                        canDeactivate && !row.kurum_kaydi && (
                          <button
                            type="button"
                            className="ogl-btn ogl-btn--ghost ogl-btn--sm ogl-btn--danger-text"
                            onClick={() => { setPasifError(""); setPasif(row); }}
                          >
                            Pasife al
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="ogrenci-table-wrap">
              <table className="table-modern ogrenci-desktop-table">
                <thead>
                  <tr>
                    <th>Öğrenci bilgisi</th>
                    <th>Telefon</th>
                    <th>Sınıf seviyesi</th>
                    <th>Deneme</th>
                    <th style={{ width: 164 }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const isPassive = row.aktif_mi === false || durumFilter === "pasif";
                    return (
                      <tr key={row.id}>
                        <td>
                          <StudentCell row={row} color={colors[index % colors.length]} isPassive={isPassive} />
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
                            isPassive={isPassive}
                            canWrite={canWrite && !isPassive && !row.kurum_kaydi}
                            canDeactivate={canDeactivate && !isPassive && !row.kurum_kaydi}
                            canReactivate={canReactivate && isPassive}
                            reactivateBusy={busyKey === `aktif-${row.id}`}
                            onKayit={() => openKayit(row)}
                            onBelge={() => openSecim("belge", row)}
                            onDuzenle={() => openSecim("oturum", row)}
                            onSil={() => openSecim("iptal", row)}
                            onPasif={() => { setPasifError(""); setPasif(row); }}
                            onAktif={() => handleAktifeAl(row)}
                          />
                        </td>
                      </tr>
                    );
                  })}
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
                    key={sinav.participant_id}
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

      {belgeModal && (
        <div className="ogl-dialog-overlay" role="presentation" onClick={() => !belgeBusy && setBelgeModal(null)}>
          <div className="ogl-dialog deneme-kayit-dialog" role="dialog" aria-modal="true" aria-labelledby="deneme-belge-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="deneme-belge-title" className="deneme-dialog-title">Sınav giriş belgesi</h3>
            <p className="deneme-dialog-text">
              <strong>{belgeModal.ogrenci.ad} {belgeModal.ogrenci.soyad}</strong> · {belgeModal.examName}
              {belgeModal.sessionName ? ` (${belgeModal.sessionName})` : ""}
            </p>
            {belgeModal.seatDetail && (
              <div className="deneme-belge-seat">
                {belgeModal.seatDetail}
              </div>
            )}
            <div className="deneme-belge-buttons">
              <button
                type="button"
                className="ogl-btn ogl-btn--primary"
                disabled={Boolean(belgeBusy)}
                onClick={handleBelgeDownload}
              >
                {belgeBusy === "download" ? "İndiriliyor…" : "PDF İndir"}
              </button>
              <button
                type="button"
                className="ogl-btn ogl-btn--soft"
                disabled={Boolean(belgeBusy)}
                onClick={handleBelgePrint}
              >
                {belgeBusy === "print" ? "Hazırlanıyor…" : "Yazdır"}
              </button>
            </div>

            <div className="deneme-belge-whatsapp">
              <span className="deneme-belge-whatsapp-title">WhatsApp ile gönder</span>
              <div className="deneme-belge-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={belgeOgrenci}
                    onChange={(event) => setBelgeOgrenci(event.target.checked)}
                  />
                  <span>Öğrenci{belgeModal.ogrenci.telefon ? ` (${belgeModal.ogrenci.telefon})` : ""}</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={belgeVeli}
                    onChange={(event) => setBelgeVeli(event.target.checked)}
                  />
                  <span>Veli</span>
                </label>
              </div>
              <button
                type="button"
                className="ogl-btn ogl-btn--soft"
                style={{ width: "100%" }}
                disabled={Boolean(belgeBusy)}
                onClick={handleBelgeWhatsapp}
              >
                {belgeBusy === "whatsapp" ? "Gönderiliyor…" : "WhatsApp ile Gönder"}
              </button>
            </div>

            {belgeNote && <p className="deneme-belge-note" role="status">{belgeNote}</p>}
            <div className="deneme-dialog-actions">
              <button type="button" className="ogl-btn ogl-btn--ghost" disabled={Boolean(belgeBusy)} onClick={() => setBelgeModal(null)}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {excelModal && (
        <div className="ogl-dialog-overlay" role="presentation" onClick={() => !excelModal.uploading && !excelModal.committing && setExcelModal(null)}>
          <div className="ogl-dialog deneme-excel-dialog" role="dialog" aria-modal="true" aria-labelledby="deneme-excel-title" onClick={(event) => event.stopPropagation()}>
            <div className="deneme-excel-head">
              <div>
                <h3 id="deneme-excel-title" className="deneme-dialog-title">Excel ile toplu deneme kaydı</h3>
                <p className="deneme-dialog-text" style={{ marginBottom: 0 }}>
                  Şablon dosyasını doldurup yükleyin; uygun öğrenciler sınava eklenir ve boş sıralara yerleştirilir.
                </p>
              </div>
              <button type="button" className="ogl-btn ogl-btn--soft ogl-btn--sm" onClick={downloadExcelTemplate}>
                Şablon indir (.xlsx)
              </button>
            </div>

            <div className="deneme-excel-controls">
              <label className="deneme-field">
                <span>Deneme sınavı</span>
                <select
                  className="deneme-select"
                  value={excelModal.examId}
                  disabled={excelModal.loadingExams || excelModal.committing}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const ex = excelModal.exams.find((item) => String(item.id) === nextId);
                    setExcelModal({
                      ...excelModal,
                      examId: nextId,
                      sessionId: ex && ex.sessions.length === 1 ? String(ex.sessions[0].id) : "",
                      rows: [],
                      ozet: null,
                      error: "",
                    });
                  }}
                >
                  <option value="">{excelModal.loadingExams ? "Yükleniyor…" : "Seçiniz"}</option>
                  {excelModal.exams.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.exam_date ? ` · ${formatDate(item.exam_date)}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {(excelModal.exams.find((item) => String(item.id) === excelModal.examId)?.sessions.length || 0) > 1 && (
                <label className="deneme-field">
                  <span>Oturum</span>
                  <select
                    className="deneme-select"
                    value={excelModal.sessionId}
                    disabled={excelModal.committing}
                    onChange={(event) =>
                      setExcelModal({
                        ...excelModal,
                        sessionId: event.target.value,
                        rows: [],
                        ozet: null,
                        error: "",
                      })
                    }
                  >
                    <option value="">Seçiniz</option>
                    {excelModal.exams
                      .find((item) => String(item.id) === excelModal.examId)
                      ?.sessions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}{item.session_date ? ` · ${formatDate(item.session_date)}` : ""}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              <label className="deneme-field">
                <span>Excel dosyası (.xlsx)</span>
                <input
                  type="file"
                  accept=".xlsx"
                  className="deneme-select deneme-file-input"
                  disabled={excelModal.uploading || excelModal.committing}
                  onChange={(event) => handleExcelUpload(event.target.files?.[0] || null)}
                />
              </label>
            </div>

            {excelModal.uploading && <p className="gb-note">Excel dosyası analiz ediliyor…</p>}

            {excelModal.ozet && (
              <div className="deneme-excel-summary">
                <span className="gb-badge">Toplam: {excelModal.ozet.toplam}</span>
                <span className="gb-badge gb-badge--yeni">Yeni: {excelModal.ozet.yeni}</span>
                <span className="gb-badge gb-badge--mevcut_misafir">Mevcut deneme: {excelModal.ozet.mevcut_misafir}</span>
                <span className="gb-badge gb-badge--kayitli_ogrenci">Kurum öğrencisi: {excelModal.ozet.kayitli_ogrenci}</span>
                <span className="gb-badge gb-badge--zaten_sinavda">Zaten sınavda: {excelModal.ozet.zaten_sinavda}</span>
                <span className="gb-badge gb-badge--hata">Hatalı: {excelModal.ozet.hata}</span>
              </div>
            )}

            {excelModal.rows.length > 0 && (
              <div className="deneme-excel-table-wrap">
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Öğrenci</th>
                      <th>Sınıf</th>
                      <th>TC / Telefon</th>
                      <th>Durum</th>
                      <th>Açıklama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excelModal.rows.map((r, idx) => (
                      <tr key={idx}>
                        <td>{r.ad} {r.soyad}</td>
                        <td>{r.sinif || "—"}</td>
                        <td>
                          {r.tc_kimlik_no || "—"}
                          {r.telefon ? ` · ${r.telefon}` : ""}
                        </td>
                        <td>
                          <span className={`gb-badge gb-badge--${r.status}`}>
                            {EXCEL_STATUS_LABELS[r.status] || r.status}
                          </span>
                        </td>
                        <td>{r.detail || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {excelModal.error && <p className="ogl-dialog-error" role="alert">{excelModal.error}</p>}
            <div className="deneme-dialog-actions">
              <button
                type="button"
                className="ogl-btn ogl-btn--ghost"
                disabled={excelModal.uploading || excelModal.committing}
                onClick={() => setExcelModal(null)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="ogl-btn ogl-btn--primary"
                disabled={
                  excelModal.uploading ||
                  excelModal.committing ||
                  excelModal.rows.filter((r) => r.status !== "hata" && r.status !== "zaten_sinavda").length === 0
                }
                onClick={confirmExcelCommit}
              >
                {excelModal.committing ? "Kaydediliyor…" : "Kaydı tamamla"}
              </button>
            </div>
          </div>
        </div>
      )}

      {oturum && (
        <div className="ogl-dialog-overlay" role="presentation" onClick={() => !busyKey && setOturum(null)}>
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
              <button type="button" className="ogl-btn ogl-btn--ghost" onClick={() => !busyKey && setOturum(null)}>Vazgeç</button>
              <button type="button" className="ogl-btn ogl-btn--primary" disabled={Boolean(busyKey)} onClick={confirmOturum}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {iptal && (
        <div className="ogl-dialog-overlay" role="presentation" onClick={() => !busyKey && setIptal(null)}>
          <div className="ogl-dialog" role="alertdialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3 className="deneme-dialog-title">Deneme kaydını iptal et</h3>
            <p className="deneme-dialog-text">
              {iptal.ogrenci.ad} {iptal.ogrenci.soyad} için {iptal.sinav.name}
              {iptal.sinav.session_name ? ` · ${iptal.sinav.session_name}` : ""} kaydı iptal edilecek. Bu sınavda başka oturum kaydı kalmazsa deneme ücreti de finans kaydında iptal edilir.
            </p>
            <div className="deneme-dialog-actions">
              <button type="button" className="ogl-btn ogl-btn--ghost" onClick={() => !busyKey && setIptal(null)}>Vazgeç</button>
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
              Öğrenci aktif listeden düşer; geçmiş sonuçları korunur.
              {pasifAcikSinavSayisi > 0 && (
                <> Tarihi gelmemiş <strong>{pasifAcikSinavSayisi}</strong> açık deneme kaydı, salon koltuğu ve varsa deneme ücreti iptal edilecektir.</>
              )}
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

function StudentCell({
  row,
  color,
  isPassive,
}: {
  row: DenemeOgrenci;
  color: string;
  isPassive?: boolean;
}) {
  const { href } = useOgrenciPath();
  return (
    <div className="cell-with-icon">
      <div className={`avatar-circle ${color}`}>{initials(row.ad, row.soyad)}</div>
      <div className="cell-info">
        <div className="cell-primary-row">
          <Link href={href(String(row.id))} className="cell-primary cell-link">{row.ad} {row.soyad}</Link>
          {row.kurum_kaydi && <span className="deneme-chip">Kurum kaydı</span>}
          {isPassive && <span className="deneme-chip deneme-chip--passive">Pasif</span>}
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
  isPassive,
  canWrite,
  canDeactivate,
  canReactivate,
  reactivateBusy,
  onKayit,
  onBelge,
  onDuzenle,
  onSil,
  onPasif,
  onAktif,
}: {
  row: DenemeOgrenci;
  isPassive: boolean;
  canWrite: boolean;
  canDeactivate: boolean;
  canReactivate: boolean;
  reactivateBusy: boolean;
  onKayit: () => void;
  onBelge: () => void;
  onDuzenle: () => void;
  onSil: () => void;
  onPasif: () => void;
  onAktif: () => void;
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
      {(canWrite || row.sinavlar.length > 0) && (
        <DenemeIslemMenu
          row={row}
          canWrite={canWrite}
          onKayit={onKayit}
          onBelge={onBelge}
          onDuzenle={onDuzenle}
          onSil={onSil}
        />
      )}
      {isPassive ? (
        canReactivate && (
          <button
            type="button"
            className="row-action-btn"
            title="Aktife al"
            aria-label={`${row.ad} ${row.soyad} — aktife al`}
            disabled={reactivateBusy}
            onClick={onAktif}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        )
      ) : (
        canDeactivate && (
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
        )
      )}
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
  canWrite = true,
  onKayit,
  onBelge,
  onDuzenle,
  onSil,
}: {
  row: DenemeOgrenci;
  variant?: "icon" | "button";
  canWrite?: boolean;
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

  if (!canWrite && row.sinavlar.length === 0) {
    return null;
  }

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
        {canWrite && (
          <button type="button" role="menuitem" onClick={() => pick(onKayit)}>Kayıt</button>
        )}
        <button type="button" role="menuitem" onClick={() => pick(onBelge)}>Sınav giriş belgesi</button>
        {canWrite && (
          <>
            <button type="button" role="menuitem" onClick={() => pick(onDuzenle)}>Sınav düzenleme</button>
            <button type="button" role="menuitem" className="deneme-menu-danger" onClick={() => pick(onSil)}>Sınav silme</button>
          </>
        )}
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
