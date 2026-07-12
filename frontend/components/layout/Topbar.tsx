"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import NotificationBell from "@/components/notification/NotificationBell";
import ContextSelector from "@/components/layout/ContextSelector";
import UserAccountDropdown from "@/components/profile/UserAccountDropdown";
import {
  AKADEMIK_MODULE_LABEL,
  akademikBreadcrumbMap,
  akademikCommandPaletteItems,
} from "@/lib/akademik-routes";
import "@/components/profile/profile-portal.css";

interface TopbarProps {
  onMenuClick: () => void;
}

// ─── Breadcrumb Map ───
const breadcrumbMap: Record<string, string> = {
  dashboard: "Dashboard",
  "kurum-yonetimi": "Kurum Yönetimi",
  kurumlar: "Kurumlar",
  "kimlik-cakismalari": "Kimlik Çakışmaları",
  "egitim-tanimlari": "Eğitim Tanımları",
  "egitim-paketleri": "Eğitim Paketleri",
  ...akademikBreadcrumbMap(),
  ogrenciler: "Öğrenciler",
  "yeni-kayit": "Yeni Kayıt",
  personel: "Personel",
  gorevlendirmeler: "Görevlendirmeler",
  admin: "Yönetim",
  coaching: "Koçluk",
  coaches: "Koçlar",
  assignments: "Atamalar",
  meetings: "Görüşmeler",
  goals: "Hedefler",
  risk: "Risk Merkezi",
  predictive: "Tahminsel Skor",
  notifications: "Bildirimler",
  analytics: "Analitikler",
  templates: "PDF Şablonları",
  settings: "Ayarlar",
  odev: "Kaynak Yönetimi",
  kaynaklar: "Eğitim Kaynakları",
  "kaynak-havuzu": "Kitap Atamaları",
  ver: "Ödev Ver",
  kontrol: "Ödev Kontrol",
  paketler: "Ödev Paketleri",
  kutuphane: "Kütüphane",
  salonlar: "Salonlar",
  dolaplar: "Dolaplar",
  atamalar: "Öğrenci Atamaları",
  izinler: "İzinler",
  analitik: "Analitik",
  roles: "Roller",
  ayarlar: "Ayarlar",
  finans: "Finans Tanımları",
  "odeme-yontemleri": "Ödeme Yöntemleri",
  "mali-hesaplar": "Mali Hesaplar",
  "odeme-takip": "Sözleşme/Tahsilat",
};

// ─── Quick Action Items ───
const quickActions = [
  { label: "Yeni Öğrenci Kayıt", href: "/ogrenciler/yeni-kayit", icon: "👨‍🎓" },
  { label: "Ödev Ver", href: "/admin/odev/ver", icon: "📝" },
  { label: "Görüşme Ekle", href: "/admin/coaching/meetings", icon: "🎯" },
  { label: "Kaynak Ekle", href: "/admin/odev/kaynaklar", icon: "📚" },
];

// ─── All navigable items for Command Palette ───
const allMenuItems = [
  { label: "Dashboard", href: "/dashboard", section: "Genel" },
  { label: "Kurum Yönetimi", href: "/kurum-yonetimi/kurumlar", section: "Kurum" },
  { label: "Kimlik Çakışmaları", href: "/kurum-yonetimi/kimlik-cakismalari", section: "Kurum" },
  { label: "Eğitim Tanımları", href: "/egitim-tanimlari", section: "Kurum" },
  { label: "Eğitim Paketleri", href: "/egitim-paketleri", section: "Kurum" },
  { label: AKADEMIK_MODULE_LABEL, href: "/akademik-planlama", section: "Akademik" },
  ...akademikCommandPaletteItems(),
  { label: "Öğrenci Listesi", href: "/ogrenciler", section: "Öğrenci" },
  { label: "Yeni Kayıt", href: "/ogrenciler/yeni-kayit", section: "Öğrenci" },
  { label: "Personel Tanımları", href: "/personel", section: "Personel" },
  { label: "Görevlendirmeler", href: "/personel/gorevlendirmeler", section: "Personel" },
  { label: "Koç Yönetimi", href: "/admin/coaching/coaches", section: "Koçluk" },
  { label: "Koç-Öğrenci Atama", href: "/admin/coaching/assignments", section: "Koçluk" },
  { label: "Görüşmeler", href: "/admin/coaching/meetings", section: "Koçluk" },
  { label: "Hedefler", href: "/admin/coaching/goals", section: "Koçluk" },
  { label: "Risk Merkezi", href: "/admin/coaching/risk", section: "Koçluk" },
  { label: "Tahminsel Skor", href: "/admin/coaching/predictive", section: "Koçluk" },
  { label: "Bildirim Kuralları", href: "/admin/coaching/notifications", section: "Koçluk" },
  { label: "Analitikler", href: "/admin/coaching/analytics", section: "Koçluk" },
  { label: "PDF Şablonları", href: "/admin/coaching/templates", section: "Koçluk" },
  { label: "Koçluk Ayarları", href: "/admin/coaching/settings", section: "Koçluk" },
  { label: "Eğitim Kaynakları", href: "/admin/odev/kaynaklar", section: "Kaynak Yönetimi" },
  { label: "Kitap Atamaları", href: "/admin/odev/kaynak-havuzu", section: "Kaynak Yönetimi" },
  { label: "Ödev Ver", href: "/admin/odev/ver", section: "Kaynak Yönetimi" },
  { label: "Ödev Kontrol", href: "/admin/odev/kontrol", section: "Kaynak Yönetimi" },
  { label: "Ödev Paketleri", href: "/admin/odev/paketler", section: "Kaynak Yönetimi" },
  { label: "Finans Tanımları", href: "/finans", section: "Finans" },
  { label: "Ödeme Yöntemleri", href: "/finans?tab=odeme-yontemleri", section: "Finans" },
  { label: "Mali Hesaplar", href: "/finans?tab=mali-hesaplar", section: "Finans" },
  { label: "Sözleşme/Tahsilat", href: "/odeme-takip", section: "Finans" },
  { label: "Rol Yönetimi", href: "/roles", section: "Genel" },
  { label: "Demo Yönetimi", href: "/ayarlar/demo-yonetimi", section: "Ayarlar" },
  { label: "Yedekleme", href: "/admin/yedekleme", section: "Yedekleme" },
  { label: "Yedek Kaynakları", href: "/admin/yedekleme?tab=resources", section: "Yedekleme" },
  { label: "Yedek Geçmişi", href: "/admin/yedekleme?tab=history", section: "Yedekleme" },
  { label: "Web Sitesi", href: "/website-yonetimi", section: "Ayarlar" },
];

// ─── Breadcrumb Component ───
function Breadcrumb() {
  const pathname = usePathname();

  if (!pathname || pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);
  // Skip "admin" prefix in display
  const displaySegments = segments.filter((s) => s !== "admin");

  if (displaySegments.length === 0) return null;

  return (
    <nav className="topbar-breadcrumb" aria-label="Breadcrumb">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5, flexShrink: 0 }}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
      {displaySegments.map((segment, idx) => {
        const label = breadcrumbMap[segment] || segment.replace(/-/g, " ");
        const isLast = idx === displaySegments.length - 1;
        return (
          <span key={idx} className="breadcrumb-segment">
            <span className="breadcrumb-separator">/</span>
            <span className={`breadcrumb-text ${isLast ? "active" : ""}`}>{label}</span>
          </span>
        );
      })}
      <style jsx>{`
        .topbar-breadcrumb {
          display: flex;
          align-items: center;
          gap: 2px;
          font-size: 12px;
          color: #94a3b8;
          min-width: 0;
          overflow: hidden;
        }
        .breadcrumb-segment {
          display: flex;
          align-items: center;
          gap: 2px;
          min-width: 0;
        }
        .breadcrumb-separator {
          color: #cbd5e1;
          margin: 0 2px;
        }
        .breadcrumb-text {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 120px;
          text-transform: capitalize;
        }
        .breadcrumb-text.active {
          color: #334155;
          font-weight: 500;
        }
        @media (max-width: 768px) {
          .topbar-breadcrumb {
            display: none;
          }
        }
      `}</style>
    </nav>
  );
}

// ─── Command Palette ───
// ─── Arama sonuç tipleri ───
interface SearchStudent {
  id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  tc_kimlik_no: string;
  telefon: string;
  sinif_ad?: string;
  profil_foto?: string | null;
  veli_ad_soyad?: string;
  veli_telefon?: string;
}

interface SearchPersonel {
  id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  tc_kimlik_no: string;
  telefon: string;
  cep_telefon?: string;
  fotograf?: string;
}

function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [students, setStudents] = useState<SearchStudent[]>([]);
  const [personeller, setPersoneller] = useState<SearchPersonel[]>([]);
  const [loading, setLoading] = useState(false);
  const [allYearsCount, setAllYearsCount] = useState(0);
  const [searchingAllYears, setSearchingAllYears] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Sayfa araması (statik)
  const filteredPages = query.trim()
    ? allMenuItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.section.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  // Toplam sonuç listesi: öğrenciler → personel → sayfalar
  const totalResults: Array<
    | { type: "student"; data: SearchStudent }
    | { type: "personel"; data: SearchPersonel }
    | { type: "page"; data: (typeof allMenuItems)[0] }
  > = [
    ...students.map((s) => ({ type: "student" as const, data: s })),
    ...personeller.map((p) => ({ type: "personel" as const, data: p })),
    ...filteredPages.map((p) => ({ type: "page" as const, data: p })),
  ];

  const showQuickActions = !query.trim();

  // Context header'larını oluştur
  const getCtxHeaders = () => {
    const ctxHeaders: Record<string, string> = {};
    const kurumId = typeof window !== "undefined" ? localStorage.getItem("3k_active_kurum") : null;
    const subeId = typeof window !== "undefined" ? localStorage.getItem("3k_active_sube") : null;
    const eyId = typeof window !== "undefined" ? localStorage.getItem("3k_active_egitim_yili") : null;
    if (kurumId) ctxHeaders["X-Kurum-ID"] = kurumId;
    if (subeId) ctxHeaders["X-Sube-ID"] = subeId;
    if (eyId) ctxHeaders["X-EgitimYili-ID"] = eyId;
    return ctxHeaders;
  };

  // Arama fonksiyonu (all_years parametresi opsiyonel)
  const doSearch = useCallback(async (searchText: string, allYears = false) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const q = encodeURIComponent(searchText.trim());
    const ctxHeaders = getCtxHeaders();
    const yearParam = allYears ? "&all_years=1" : "";

    setLoading(true);
    setAllYearsCount(0);

    try {
      const [studentRes, personelRes] = await Promise.allSettled([
        fetch(`/api/ogrenciler/api/list?q=${q}${yearParam}`, {
          credentials: "include",
          headers: ctxHeaders,
          signal: controller.signal,
        }),
        fetch(`/api/personel/api/list?q=${q}`, {
          credentials: "include",
          headers: ctxHeaders,
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted) return;

      // Öğrenci sonuçları
      if (studentRes.status === "fulfilled" && studentRes.value.ok) {
        const data = await studentRes.value.json();
        const ogrenciler = (data.ogrenciler || []).slice(0, 10);
        // Tüm yıllar modunda egitim_yili bilgisini ekle
        if (allYears && data.filter_mode === "tum_yillar") {
          ogrenciler.forEach((o: SearchStudent & { egitim_yili?: string }) => {
            if (o.egitim_yili) o.sinif_ad = `${o.sinif_ad || ''} (${o.egitim_yili})`.trim();
          });
        }
        setStudents(ogrenciler);
        // Geçmiş yıl bilgisi
        if (data.all_years_count !== undefined && data.all_years_count > 0) {
          setAllYearsCount(data.all_years_count);
        }
      } else {
        setStudents([]);
      }

      // Personel sonuçları
      if (personelRes.status === "fulfilled" && personelRes.value.ok) {
        const data = await personelRes.value.json();
        setPersoneller((data.personeller || []).slice(0, 10));
      } else {
        setPersoneller([]);
      }
    } catch {
      if (!controller.signal.aborted) {
        setStudents([]);
        setPersoneller([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // Backend'den öğrenci + personel arama (debounce)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!query.trim() || query.trim().length < 2) {
      setStudents([]);
      setPersoneller([]);
      setAllYearsCount(0);
      setSearchingAllYears(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setSearchingAllYears(false);

    searchTimerRef.current = setTimeout(() => {
      doSearch(query.trim());
    }, 250);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, doSearch]);

  // Geçmiş yıllarda ara
  const handleSearchAllYears = () => {
    setSearchingAllYears(true);
    setAllYearsCount(0);
    doSearch(query.trim(), true);
  };

  // Açıldığında state sıfırla
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setStudents([]);
      setPersoneller([]);
      setAllYearsCount(0);
      setSearchingAllYears(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, students, personeller]);

  // ⌘K global kapatma — ESC fullscreen ile çakışmasın
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    // capture phase ile en önce yakala
    document.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown, true);
  }, [isOpen, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (showQuickActions) {
        setSelectedIndex((prev) => Math.min(prev + 1, allMenuItems.slice(0, 8).length - 1));
      } else {
        setSelectedIndex((prev) => Math.min(prev + 1, totalResults.length - 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showQuickActions) {
        const item = allMenuItems.slice(0, 8)[selectedIndex];
        if (item) { router.push(item.href); onClose(); }
      } else if (totalResults[selectedIndex]) {
        const r = totalResults[selectedIndex];
        if (r.type === "student") router.push(`/ogrenciler/${r.data.id}`);
        else if (r.type === "personel") router.push(`/personel/${r.data.id}`);
        else router.push(r.data.href);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  let flatIdx = 0;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-wrapper">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Öğrenci, personel, TC, veli veya sayfa ara..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="cmd-input"
          />
          {loading && <span className="cmd-spinner" />}
          <kbd className="cmd-kbd">ESC</kbd>
        </div>
        <div className="cmd-results">
          {/* ── Boş sorgu: Hızlı erişim ── */}
          {showQuickActions && (
            <div className="cmd-section">
              <div className="cmd-section-title">Hızlı Erişim</div>
              {allMenuItems.slice(0, 8).map((item, idx) => (
                <button
                  key={item.href}
                  className={`cmd-item ${idx === selectedIndex ? "selected" : ""}`}
                  onClick={() => { router.push(item.href); onClose(); }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="cmd-item-label">{item.label}</span>
                  <span className="cmd-item-section">{item.section}</span>
                  <span className="cmd-item-hint">↵</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Arama sonuçları ── */}
          {!showQuickActions && (
            <>
              {/* Öğrenci sonuçları */}
              {students.length > 0 && (
                <div className="cmd-section">
                  <div className="cmd-section-title">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    Öğrenciler ({students.length}){searchingAllYears ? " — Tüm Yıllar" : ""}
                  </div>
                  {students.map((student) => {
                    const idx = flatIdx++;
                    return (
                      <button
                        key={`s-${student.id}`}
                        className={`cmd-item cmd-item-person ${idx === selectedIndex ? "selected" : ""}`}
                        onClick={() => { router.push(`/ogrenciler/${student.id}`); onClose(); }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div className="cmd-person-avatar cmd-avatar-student">
                          {student.profil_foto
                            ? <img src={student.profil_foto} alt="" className="cmd-person-photo" />
                            : <span>{student.ad?.[0]}{student.soyad?.[0]}</span>
                          }
                        </div>
                        <div className="cmd-person-info">
                          <span className="cmd-person-name">{student.tam_ad}</span>
                          <span className="cmd-person-meta">
                            {student.tc_kimlik_no && <span>TC: {student.tc_kimlik_no}</span>}
                            {student.telefon && <span>{student.telefon}</span>}
                            {student.sinif_ad && <span>Sınıf: {student.sinif_ad}</span>}
                            {student.veli_ad_soyad && <span>Veli: {student.veli_ad_soyad}</span>}
                            {student.veli_telefon && <span>V.Tel: {student.veli_telefon}</span>}
                          </span>
                        </div>
                        <span className="cmd-item-hint">↵</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Personel sonuçları */}
              {personeller.length > 0 && (
                <div className="cmd-section">
                  <div className="cmd-section-title">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                      <line x1="23" y1="11" x2="17" y2="11" />
                    </svg>
                    Personel ({personeller.length})
                  </div>
                  {personeller.map((p) => {
                    const idx = flatIdx++;
                    return (
                      <button
                        key={`p-${p.id}`}
                        className={`cmd-item cmd-item-person ${idx === selectedIndex ? "selected" : ""}`}
                        onClick={() => { router.push(`/personel/${p.id}`); onClose(); }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div className="cmd-person-avatar cmd-avatar-personel">
                          {p.fotograf
                            ? <img src={p.fotograf} alt="" className="cmd-person-photo" />
                            : <span>{p.ad?.[0]}{p.soyad?.[0]}</span>
                          }
                        </div>
                        <div className="cmd-person-info">
                          <span className="cmd-person-name">{p.tam_ad}</span>
                          <span className="cmd-person-meta">
                            {p.tc_kimlik_no && <span>TC: {p.tc_kimlik_no}</span>}
                            {(p.cep_telefon || p.telefon) && <span>{p.cep_telefon || p.telefon}</span>}
                          </span>
                        </div>
                        <span className="cmd-item-hint">↵</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Sayfa sonuçları */}
              {filteredPages.length > 0 && (
                <div className="cmd-section">
                  <div className="cmd-section-title">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                    </svg>
                    Sayfalar ({filteredPages.length})
                  </div>
                  {filteredPages.map((item) => {
                    const idx = flatIdx++;
                    return (
                      <button
                        key={item.href}
                        className={`cmd-item ${idx === selectedIndex ? "selected" : ""}`}
                        onClick={() => { router.push(item.href); onClose(); }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <span className="cmd-item-label">{item.label}</span>
                        <span className="cmd-item-section">{item.section}</span>
                        <span className="cmd-item-hint">↵</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Yükleniyor */}
              {loading && students.length === 0 && personeller.length === 0 && filteredPages.length === 0 && (
                <div className="cmd-empty">
                  <span className="cmd-spinner-large" />
                  <span>Aranıyor...</span>
                </div>
              )}

              {/* Sonuç yok */}
              {!loading && totalResults.length === 0 && query.trim().length >= 2 && !searchingAllYears && (
                <div className="cmd-empty-block">
                  <div className="cmd-empty">Bu eğitim yılında sonuç bulunamadı</div>
                  {allYearsCount > 0 && (
                    <button className="cmd-all-years-btn" onClick={handleSearchAllYears}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                      Geçmiş yıllarda ara ({allYearsCount} sonuç bulundu)
                    </button>
                  )}
                  {allYearsCount === 0 && (
                    <button className="cmd-all-years-btn" onClick={handleSearchAllYears}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                      Tüm yıllarda ara
                    </button>
                  )}
                </div>
              )}

              {/* Tüm yıllarda da bulunamadı */}
              {!loading && totalResults.length === 0 && query.trim().length >= 2 && searchingAllYears && (
                <div className="cmd-empty">Tüm yıllarda sonuç bulunamadı</div>
              )}

              {/* Min karakter */}
              {query.trim().length === 1 && (
                <div className="cmd-empty">En az 2 karakter girin...</div>
              )}
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .cmd-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 15vh;
          z-index: 9999;
          animation: cmdOverlayIn 0.15s ease;
        }
        @keyframes cmdOverlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .cmd-palette {
          width: 580px;
          max-width: 90vw;
          background: white;
          border-radius: 14px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
          overflow: hidden;
          animation: cmdPaletteIn 0.2s ease;
        }
        @keyframes cmdPaletteIn {
          from { opacity: 0; transform: scale(0.96) translateY(-10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .cmd-input-wrapper {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 18px;
          border-bottom: 1px solid #e2e8f0;
        }
        .cmd-input-wrapper svg { color: #94a3b8; flex-shrink: 0; }
        .cmd-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 15px;
          color: #1e293b;
          background: none;
        }
        .cmd-input::placeholder { color: #94a3b8; }
        .cmd-kbd {
          padding: 2px 8px;
          font-size: 10px;
          font-weight: 600;
          color: #64748b;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-family: inherit;
        }
        .cmd-spinner {
          width: 16px; height: 16px;
          border: 2px solid #e2e8f0;
          border-top-color: #0262a7;
          border-radius: 50%;
          animation: cmdSpin 0.6s linear infinite;
          flex-shrink: 0;
        }
        .cmd-spinner-large {
          width: 20px; height: 20px;
          border: 2px solid #e2e8f0;
          border-top-color: #0262a7;
          border-radius: 50%;
          animation: cmdSpin 0.6s linear infinite;
          display: inline-block;
          margin-right: 8px;
        }
        @keyframes cmdSpin { to { transform: rotate(360deg); } }
        .cmd-results {
          max-height: 420px;
          overflow-y: auto;
          padding: 6px;
        }
        .cmd-section { margin-bottom: 4px; }
        .cmd-section-title {
          padding: 10px 12px 4px;
          font-size: 10px;
          font-weight: 700;
          color: #0262a7;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
        }
        .cmd-item {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 9px 12px;
          border: none;
          border-radius: 8px;
          background: none;
          font-size: 13.5px;
          color: #334155;
          cursor: pointer;
          transition: all 0.1s;
          text-align: left;
          gap: 8px;
        }
        .cmd-item:hover,
        .cmd-item.selected {
          background: #f0f7ff;
          color: #0262a7;
        }
        .cmd-item-label {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .cmd-item-section {
          font-size: 11px;
          color: #94a3b8;
          flex-shrink: 0;
        }
        .cmd-item.selected .cmd-item-section { color: #64a4d4; }
        .cmd-item-hint {
          font-size: 12px;
          color: #94a3b8;
          opacity: 0;
          flex-shrink: 0;
          margin-left: auto;
        }
        .cmd-item.selected .cmd-item-hint { opacity: 1; }

        /* Kişi satırı (öğrenci + personel ortak) */
        .cmd-item-person { padding: 8px 12px; gap: 10px; }
        .cmd-person-avatar {
          width: 34px; height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          flex-shrink: 0;
          overflow: hidden;
        }
        .cmd-avatar-student {
          background: linear-gradient(135deg, #e0edff, #c7d9f0);
          color: #0262a7;
        }
        .cmd-avatar-personel {
          background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
          color: #2e7d32;
        }
        .cmd-person-photo {
          width: 100%; height: 100%;
          object-fit: cover;
        }
        .cmd-person-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .cmd-person-name {
          font-size: 13.5px;
          font-weight: 550;
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cmd-item.selected .cmd-person-name { color: #0262a7; }
        .cmd-person-meta {
          display: flex;
          gap: 8px;
          font-size: 11px;
          color: #94a3b8;
          flex-wrap: wrap;
        }
        .cmd-person-meta span { white-space: nowrap; }
        .cmd-empty {
          padding: 30px;
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .cmd-empty-block {
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .cmd-empty-block .cmd-empty {
          padding: 10px;
        }
        .cmd-all-years-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: 1px solid #0262a7;
          border-radius: 8px;
          background: #f0f7ff;
          color: #0262a7;
          font-size: 12.5px;
          font-weight: 550;
          cursor: pointer;
          transition: all 0.15s;
        }
        .cmd-all-years-btn:hover {
          background: #0262a7;
          color: white;
        }
        .cmd-all-years-btn svg { flex-shrink: 0; }
      `}</style>
    </div>
  );
}

// ─── Quick Actions Dropdown ───
function QuickActions() {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="quick-actions-wrapper" ref={ref}>
      <button
        className="quick-actions-btn"
        onClick={() => setShow(!show)}
        title="Hızlı Eylemler"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {show && (
        <div className="quick-actions-menu">
          <div className="quick-actions-header">Hızlı Eylemler</div>
          {quickActions.map((action, idx) => (
            <button
              key={idx}
              className="quick-actions-item"
              onClick={() => { router.push(action.href); setShow(false); }}
            >
              <span className="qa-icon">{action.icon}</span>
              <span className="qa-label">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .quick-actions-wrapper {
          position: relative;
        }
        .quick-actions-btn {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0262a7;
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }
        .quick-actions-btn:hover {
          background: #014d85;
          transform: scale(1.05);
        }
        .quick-actions-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 220px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.14);
          z-index: 1000;
          overflow: hidden;
          animation: ctxFade 0.2s ease;
        }
        .quick-actions-header {
          padding: 10px 14px;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .quick-actions-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 14px;
          border: none;
          background: none;
          font-size: 13px;
          color: #334155;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
        }
        .quick-actions-item:hover {
          background: #f0f7ff;
          color: #0262a7;
        }
        .qa-icon {
          font-size: 16px;
        }
        .qa-label {
          flex: 1;
        }
      `}</style>
    </div>
  );
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { user, logout } = useAuth();
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      <header className="app-topbar">
        <div className="topbar-left">
          <button
            className="sidebar-toggle-btn"
            type="button"
            onClick={onMenuClick}
            aria-label="Toggle Menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          
          {/* Compact Context Selector */}
          <ContextSelector />
        </div>

        <div className="topbar-right">
          {/* Command Palette Trigger */}
          <button
            className="cmd-trigger-btn"
            type="button"
            onClick={() => setShowCommandPalette(true)}
            title="Sayfa Ara (⌘K)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="cmd-trigger-text">Öğrenci veya sayfa ara...</span>
            <kbd className="cmd-trigger-kbd">⌘K</kbd>
          </button>

          {/* Quick Actions */}
          <QuickActions />

          {/* Notification Bell */}
          <NotificationBell />

          <button className="topbar-icon-btn" type="button" aria-label="Mesajlar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <UserAccountDropdown
            user={user}
            profileHref="/admin/profil"
            onLogout={handleLogout}
          />
        </div>

        <style jsx>{`
          .cmd-trigger-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            background: var(--body-bg, #f4f7fa);
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            font-size: 13px;
            color: #94a3b8;
            cursor: pointer;
            transition: all 0.2s;
          }
          .cmd-trigger-btn:hover {
            border-color: #0262a7;
            color: #0262a7;
            background: #f0f7ff;
          }
          .cmd-trigger-btn svg {
            flex-shrink: 0;
          }
          .cmd-trigger-text {
            white-space: nowrap;
          }
          .cmd-trigger-kbd {
            padding: 1px 6px;
            font-size: 10px;
            font-weight: 600;
            color: #94a3b8;
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            font-family: inherit;
          }

          .user-dropdown-wrapper {
            position: relative;
          }

          .user-dropdown-btn {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 12px;
            background: transparent;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s;
          }

          .user-dropdown-btn:hover {
            background: rgba(0, 0, 0, 0.05);
          }

          .avatar {
            width: 34px;
            height: 34px;
            background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            font-weight: 600;
          }

          .user-info {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            line-height: 1.3;
          }

          .user-name {
            font-size: 13px;
            font-weight: 600;
            color: #1e293b;
          }

          .user-role {
            font-size: 11px;
            color: #64748b;
          }

          .dropdown-arrow {
            color: #64748b;
          }

          .user-dropdown-menu {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            min-width: 260px;
            background: white;
            border-radius: 14px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 16px 48px rgba(15, 23, 42, 0.14);
            z-index: 100;
            overflow: hidden;
            padding-bottom: 4px;
          }

          .user-dropdown-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          }

          .avatar-large {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 16px;
            font-weight: 600;
          }

          .user-header-info {
            display: flex;
            flex-direction: column;
          }

          .user-header-name {
            font-size: 14px;
            font-weight: 600;
            color: #1e293b;
          }

          .user-header-email {
            font-size: 12px;
            color: #64748b;
          }

          .user-dropdown-divider {
            height: 1px;
            background: #e2e8f0;
            margin: 0;
          }

          .user-dropdown-item {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            padding: 11px 16px;
            background: none;
            border: none;
            font-size: 13px;
            color: #334155;
            cursor: pointer;
            transition: background 0.15s;
            text-decoration: none;
            box-sizing: border-box;
          }

          .user-dropdown-item:hover {
            background: #f8fafc;
          }

          .user-dropdown-item svg {
            color: #64748b;
          }

          .user-dropdown-item.logout {
            color: #dc2626;
          }

          .user-dropdown-item.logout svg {
            color: #dc2626;
          }

          .user-dropdown-item.logout:hover {
            background: #fef2f2;
          }

          @media (max-width: 768px) {
            .user-info {
              display: none;
            }
            
            .dropdown-arrow {
              display: none;
            }

            .cmd-trigger-btn {
              display: none;
            }
          }

          @media (max-width: 1100px) {
            .cmd-trigger-text {
              display: none;
            }
            .cmd-trigger-kbd {
              display: none;
            }
          }
        `}</style>
      </header>

      {/* Command Palette Portal */}
      <CommandPalette 
        isOpen={showCommandPalette} 
        onClose={() => setShowCommandPalette(false)} 
      />
    </>
  );
}
