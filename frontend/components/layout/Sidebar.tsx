"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { fetchKontrolBadge } from "@/lib/resources-api";
import KurumLogo from "@/components/branding/KurumLogo";
import { useSubmenuOrderMap } from "@/hooks/useMenuOrder";
import { akademikSidebarChildren } from "@/lib/akademik-routes";
import { ADMIN_KUTUPHANE_BASE, kutuphaneSidebarChildren } from "@/lib/kutuphane-routes";
import { useAuth } from "@/lib/contexts/AuthContext";
import { PermissionChecks } from "@/app/roles/role.permissions";

// İkon tanımları
const icons = {
  dashboard: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  building: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
    </svg>
  ),
  settings: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  shield: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  users: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  userPlus: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  ),
  book: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  package: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  calendar: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <rect x="7" y="14" width="3" height="3" rx="0.5" />
      <rect x="14" y="14" width="3" height="3" rx="0.5" />
    </svg>
  ),
  coaching: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="5" />
      <path d="M3 21v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
      <path d="M12 14v3" />
      <path d="M10 19h4" />
    </svg>
  ),
  homework: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  ),
  assessment: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
      <line x1="9" y1="12" x2="9" y2="12" />
    </svg>
  ),
  chevronDown: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  wallet: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="1" y="6" width="22" height="15" rx="2" />
      <path d="M1 10h22" />
      <path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <circle cx="18" cy="15" r="1.5" />
    </svg>
  ),
  message: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  database: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    </svg>
  ),
  pin: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  ),
};

// Menü yapısı
interface SubMenuItem {
  label: string;
  href: string;
  group?: string; // Koçluk gruplama için
  badge?: number; // Badge desteği
}

interface MenuItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  emoji: string; // Emoji prefix
  id: string; // Pin/favori sistemi için
  children?: SubMenuItem[];
  badge?: number;
  /** Boş/undefined = herkes; aksi halde kullanıcının bunlardan birine sahip olması gerekir */
  requiredPermissions?: string[];
}

const ODEV_KONTROL_HREF = "/admin/odev/kontrol";

const navItems: MenuItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    emoji: "",
    href: "/dashboard",
    icon: icons.dashboard,
  },
  {
    id: "kurum",
    label: "Kurum",
    emoji: "",
    icon: icons.settings,
    children: [
      { label: "Kurum Yönetimi", href: "/kurum-yonetimi/kurumlar" },
      { label: "Okullar", href: "/kurum-yonetimi/okullar" },
      { label: "Kimlik Çakışmaları", href: "/kurum-yonetimi/kimlik-cakismalari" },
      { label: "Eğitim Tanımları", href: "/egitim-tanimlari" },
      { label: "Eğitim Paketleri", href: "/egitim-paketleri" },
    ],
  },
  {
    id: "akademik",
    label: "Akademik Operasyon",
    emoji: "📚",
    icon: icons.calendar,
    children: akademikSidebarChildren(),
  },
  {
    id: "ogrenci",
    label: "Öğrenciler",
    emoji: "",
    icon: icons.users,
    children: [
      { label: "Öğrenci Listesi", href: "/ogrenciler" },
      { label: "Yeni Kayıt", href: "/ogrenciler/yeni-kayit" },
    ],
  },
  {
    id: "personel",
    label: "Personel",
    emoji: "",
    icon: icons.userPlus,
    children: [
      { label: "Personel Tanımları", href: "/personel" },
      { label: "Görevlendirmeler", href: "/personel/gorevlendirmeler" },
      { label: "Sözleşmeler", href: "/admin/personel/sozlesmeler" },
    ],
  },
  {
    id: "kocluk",
    label: "Koçluk",
    emoji: "",
    icon: icons.coaching,
    children: [
      // Yönetim grubu
      { label: "Koç Yönetimi", href: "/admin/coaching/coaches", group: "Yönetim" },
      { label: "Koç-Öğrenci Atama", href: "/admin/coaching/assignments", group: "Yönetim" },
      // Takip grubu
      { label: "Çalışma Programı", href: "/admin/coaching/study-program", group: "Takip" },
      { label: "Görüşmeler", href: "/admin/coaching/meetings", group: "Takip" },
      { label: "Hedefler", href: "/admin/coaching/goals", group: "Takip" },
      { label: "Risk Merkezi", href: "/admin/coaching/risk", group: "Takip" },
      // Analiz grubu
      { label: "Tahminsel Skor", href: "/admin/coaching/predictive", group: "Analiz" },
      { label: "Analitikler", href: "/admin/coaching/analytics", group: "Analiz" },
      // Ayarlar grubu
      { label: "Bildirim Kuralları", href: "/admin/coaching/notifications", group: "Ayarlar" },
      { label: "PDF Şablonları", href: "/admin/coaching/templates", group: "Ayarlar" },
      { label: "Koçluk Ayarları", href: "/admin/coaching/settings", group: "Ayarlar" },
    ],
  },
  {
    id: "odev",
    label: "Kaynak Yönetimi",
    emoji: "",
    icon: icons.homework,
    children: [
      { label: "Eğitim Kaynakları", href: "/admin/odev/kaynaklar" },
      { label: "Kitap Atamaları", href: "/admin/odev/kaynak-havuzu" },
      { label: "Ödev Ver", href: "/admin/odev/ver", group: "Ödev Takibi" },
      { label: "Ödev Kontrol", href: "/admin/odev/kontrol", group: "Ödev Takibi" },
      { label: "Ödev Paketleri", href: "/admin/odev/paketler", group: "Ödev Takibi" },
    ],
  },
  {
    id: "olcme",
    label: "Ölçme & Değerlendirme",
    emoji: "",
    icon: icons.assessment,
    children: [
      { label: "Sınav Listesi", href: "/admin/olcme-degerlendirme", group: "Sınavlar" },
      { label: "Yeni Sınav Oluştur", href: "/admin/olcme-degerlendirme/yeni", group: "Sınavlar" },
      { label: "Sonuç Analizi", href: "/admin/olcme-degerlendirme/analiz", group: "Analiz" },
      { label: "Karşılaştırma", href: "/admin/olcme-degerlendirme/karsilastirma", group: "Analiz" },
      { label: "Konu & Kazanımlar", href: "/admin/olcme-degerlendirme/kazanimlar", group: "Tanımlar" },
    ],
  },
  {
    id: "kutuphane",
    label: "Kütüphane",
    emoji: "",
    icon: icons.book,
    children: kutuphaneSidebarChildren(ADMIN_KUTUPHANE_BASE),
  },
  {
    id: "takvim",
    label: "Takvim",
    emoji: "",
    icon: icons.calendar,
    children: [
      { label: "Genel Takvim", href: "/admin/takvim/genel" },
      { label: "Görevler", href: "/admin/gorevler" },
      { label: "Performans Analitiği", href: "/admin/gorevler/analitik" },
      { label: "Tekrarlayan Görevler", href: "/admin/gorevler/tekrar" },
      { label: "Görev Takvimi", href: "/admin/gorevler/takvim" },
      { label: "Salon Planlama", href: "/admin/takvim/salon-planlama" },
      { label: "Etkinlik Türleri", href: "/admin/takvim/etkinlik-turleri" },
      { label: "Hatırlatma Ayarları", href: "/admin/takvim/hatirlatma-ayarlari" },
      { label: "Bildirimler", href: "/admin/takvim/bildirimler" },
      { label: "Bildirim Tercihleri", href: "/admin/takvim/bildirim-tercihleri" },
    ],
  },
  {
    id: "finans",
    label: "Finans",
    emoji: "",
    icon: icons.wallet,
    children: [
      { label: "Dashboard", href: "/finans" },
      { label: "Çek / Senet", href: "/finans/cek-senet-v2" },
      { label: "Virman", href: "/finans/virman" },
      { label: "Raporlar", href: "/finans/tahsilat-raporlar" },
      { label: "Sözleşme/Tahsilat", href: "/odeme-takip" },
      { label: "Gelir İşlemleri", href: "/finans/gelir-v2" },
      { label: "Gider İşlemleri", href: "/finans/gider-v2" },
      { label: "Cari Hesaplar", href: "/finans/cari-hesaplar-v2" },
      { label: "Finansman Tanımları", href: "/finans/gelir-gider-v2/tanimlar" },
    ],
  },
  {
    id: "iletisim",
    label: "İletişim",
    emoji: "",
    icon: icons.message,
    children: [
      { label: "Toplu Gönderim", href: "/admin/iletisim/toplu-gonder" },
      { label: "Mesajlar", href: "/admin/iletisim/mesajlar" },
      { label: "Kampanyalar", href: "/admin/iletisim/kampanyalar" },
      { label: "Mesaj Şablonları", href: "/admin/iletisim/sablonlar" },
      { label: "Finans Şablonları", href: "/admin/iletisim/sablonlar?category=odeme_gecikme" },
      { label: "Veli / Genel Şablonlar", href: "/admin/iletisim/sablonlar?category=genel" },
      { label: "Ödev Şablonları", href: "/admin/iletisim/sablonlar?category=haftalik_odev" },
      { label: "WhatsApp Ayarları", href: "/admin/iletisim/ayarlar" },
    ],
  },
  {
    id: "roller",
    label: "Roller",
    emoji: "",
    href: "/roles",
    icon: icons.shield,
  },
  {
    id: "sistem-yonetimi",
    label: "Sistem Yönetimi",
    emoji: "",
    icon: icons.shield,
    requiredPermissions: ["sistem_yonetimi.read", "sistem_yonetimi.manage", "sistem.admin"],
    children: [
      { label: "Genel Durum", href: "/admin/sistem-yonetimi?tab=overview" },
      { label: "Sistem Sağlığı", href: "/admin/sistem-yonetimi?tab=health" },
      { label: "Servisler", href: "/admin/sistem-yonetimi?tab=services" },
      { label: "Log Merkezi", href: "/admin/sistem-yonetimi?tab=logs" },
      { label: "Hata Merkezi", href: "/admin/sistem-yonetimi?tab=errors" },
      { label: "Arka Plan Görevleri", href: "/admin/sistem-yonetimi?tab=jobs" },
      { label: "Audit Log", href: "/admin/sistem-yonetimi?tab=audit" },
      { label: "Performans", href: "/admin/sistem-yonetimi?tab=performance" },
      { label: "Depolama", href: "/admin/sistem-yonetimi?tab=storage" },
      { label: "Günlükler", href: "/admin/sistem-yonetimi?tab=timeline" },
      { label: "Ayarlar", href: "/admin/sistem-yonetimi?tab=settings" },
    ],
  },
  {
    id: "yedekleme",
    label: "Yedekleme",
    emoji: "",
    icon: icons.settings,
    children: [
      { label: "Genel Durum", href: "/admin/yedekleme?tab=dashboard" },
      { label: "Manuel Yedek", href: "/admin/yedekleme?tab=manual" },
      { label: "Otomatik Yedekleme", href: "/admin/yedekleme?tab=schedule" },
      { label: "Kaynaklar", href: "/admin/yedekleme?tab=resources" },
      { label: "Yedek Geçmişi", href: "/admin/yedekleme?tab=history" },
      { label: "Geri Yükleme", href: "/admin/yedekleme?tab=restore" },
      { label: "Günlükler", href: "/admin/yedekleme?tab=logs" },
      { label: "Ayarlar", href: "/admin/yedekleme?tab=settings" },
    ],
  },
  {
    id: "ayarlar",
    label: "Ayarlar",
    emoji: "",
    icon: icons.building,
    children: [
      { label: "Demo Yönetimi", href: "/ayarlar/demo-yonetimi" },
      { label: "Kurumsal Site", href: "/website-yonetimi" },
    ],
  },
];

// ─── Pinned Items Hook (localStorage) ───
function usePinnedItems() {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-pinned");
    if (saved) {
      try { setPinnedIds(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      localStorage.setItem("sidebar-pinned", JSON.stringify(next));
      return next;
    });
  };

  return { pinnedIds, togglePin };
}

// ─── Menu Order Hook (localStorage, drag & drop) ───
function useMenuOrder(defaultItems: MenuItem[]) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    defaultItems.map((i) => i.id)
  );

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-menu-order");
    if (saved) {
      try {
        const parsed: string[] = JSON.parse(saved);
        // Validate: keep only ids that exist, append new ones at end
        const allIds = defaultItems.map((i) => i.id);
        const valid = parsed.filter((id) => allIds.includes(id));
        const missing = allIds.filter((id) => !valid.includes(id));
        if (valid.length > 0) setOrderedIds([...valid, ...missing]);
      } catch { /* ignore */ }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reorder = (fromId: string, toId: string, position: "before" | "after") => {
    setOrderedIds((prev) => {
      const next = prev.filter((id) => id !== fromId);
      const targetIdx = next.indexOf(toId);
      if (targetIdx === -1) return prev;
      const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
      next.splice(insertIdx, 0, fromId);
      localStorage.setItem("sidebar-menu-order", JSON.stringify(next));
      return next;
    });
  };

  const getOrdered = (items: MenuItem[]): MenuItem[] => {
    const map = new Map(items.map((i) => [i.id, i]));
    const result: MenuItem[] = [];
    for (const id of orderedIds) {
      const item = map.get(id);
      if (item) result.push(item);
    }
    // Append any items not in orderedIds (safety)
    for (const item of items) {
      if (!result.find((r) => r.id === item.id)) result.push(item);
    }
    return result;
  };

  return { reorder, getOrdered };
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const userPermissions = user?.permissions || [];
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [searchQuery, setSearchQuery] = useState("");
  const navItemRefs = useRef<{ [key: string]: HTMLLIElement | null }>({});
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const enterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { pinnedIds, togglePin } = usePinnedItems();
  const { reorder, getOrdered } = useMenuOrder(navItems);

  const visibleNavItems = useMemo(() => {
    return navItems.filter((item) => {
      if (!item.requiredPermissions?.length) return true;
      return PermissionChecks.hasAnyPermission(userPermissions, item.requiredPermissions);
    });
  }, [userPermissions]);

  const submenuParents = useMemo(
    () =>
      visibleNavItems
        .filter((i) => i.children?.length)
        .map((i) => ({ id: i.id, childIds: i.children!.map((c) => c.href) })),
    [visibleNavItems],
  );
  const { reorderSubmenu, getOrderedChildren } = useSubmenuOrderMap(
    "sidebar-submenu-order",
    submenuParents,
  );

  // Drag & Drop state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<"before" | "after">("after");
  const [subDrag, setSubDrag] = useState<{ parentId: string; href: string } | null>(null);
  const [subDragOver, setSubDragOver] = useState<{ parentId: string; href: string } | null>(null);
  const [subDragPosition, setSubDragPosition] = useState<"before" | "after">("after");
  const [kontrolBadgeCount, setKontrolBadgeCount] = useState(0);

  const loadKontrolBadge = useCallback(async () => {
    const response = await fetchKontrolBadge();
    if (response.success && response.data) {
      setKontrolBadgeCount(response.data.count);
    }
  }, []);

  useEffect(() => {
    loadKontrolBadge();
    const interval = setInterval(loadKontrolBadge, 60_000);
    return () => clearInterval(interval);
  }, [pathname, loadKontrolBadge]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
    };
  }, []);

  // Sidebar açıldığında sadece aktif menüyü aç, diğerlerini kapat
  useEffect(() => {
    if (isOpen) {
      const activeParent = visibleNavItems.find(
        (item) =>
          item.children &&
          item.children.some(
            (child) => pathname === child.href || pathname?.startsWith(child.href + "/")
          )
      );
      setExpandedMenus(activeParent ? [activeParent.id] : []);
    }
  }, [isOpen, pathname, visibleNavItems]);

  // Filter items by search (with custom order)
  const filteredNavItems = useMemo(() => {
    const ordered = getOrdered(visibleNavItems);
    if (!searchQuery.trim()) return ordered;
    const q = searchQuery.toLowerCase();
    return ordered.filter((item) => {
      if (item.label.toLowerCase().includes(q) || item.emoji.includes(q)) return true;
      if (item.children) {
        return item.children.some((child) => child.label.toLowerCase().includes(q));
      }
      return false;
    });
  }, [searchQuery, getOrdered, visibleNavItems]);

  // Pinned items
  const pinnedItems = useMemo(() => {
    return visibleNavItems.filter((item) => pinnedIds.includes(item.id));
  }, [pinnedIds, visibleNavItems]);

  // Accordion toggle
  const toggleSubmenu = (id: string) => {
    if (expandedMenus.includes(id)) {
      setExpandedMenus([]);
    } else {
      setExpandedMenus([id]);
    }
  };

  // ─── Drag & Drop Handlers ───
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    // Timeout so the dragging class applies after browser snapshot
    requestAnimationFrame(() => {
      const el = navItemRefs.current[navItems.find(i => i.id === id)?.label || ""];
      if (el) el.classList.add("dragging");
    });
  };

  const handleDragEnd = () => {
    // Remove all drag classes
    Object.values(navItemRefs.current).forEach((el) => {
      if (el) {
        el.classList.remove("dragging", "drag-over-top", "drag-over-bottom");
      }
    });
    if (dragId && dragOverId && dragId !== dragOverId) {
      reorder(dragId, dragOverId, dragPosition);
    }
    setDragId(null);
    setDragOverId(null);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id === dragId) return;

    const el = navItemRefs.current[navItems.find(i => i.id === id)?.label || ""];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? "before" : "after";

    // Clear all drag-over classes
    Object.values(navItemRefs.current).forEach((ref) => {
      if (ref) ref.classList.remove("drag-over-top", "drag-over-bottom");
    });

    el.classList.add(pos === "before" ? "drag-over-top" : "drag-over-bottom");
    setDragOverId(id);
    setDragPosition(pos);
  };

  const handleDragLeave = (e: React.DragEvent, id: string) => {
    const el = navItemRefs.current[navItems.find(i => i.id === id)?.label || ""];
    if (el) {
      el.classList.remove("drag-over-top", "drag-over-bottom");
    }
  };

  // Aktif menü kontrolü
  const isMenuActive = (item: MenuItem): boolean => {
    if (item.href) {
      return pathname === item.href || pathname?.startsWith(item.href + "/");
    }
    if (item.children) {
      return item.children.some(
        (child) => pathname === child.href || pathname?.startsWith(child.href + "/")
      );
    }
    return false;
  };

  const isSubmenuActive = (href: string): boolean => {
    if (pathname === href) return true;
    if (pathname?.startsWith(href + "/")) return true;
    return false;
  };

  // Hover handler - tooltip
  const handleMouseEnter = (label: string) => {
    if (isOpen) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);

    enterTimeoutRef.current = setTimeout(() => {
      const element = navItemRefs.current[label];
      if (element) {
        const rect = element.getBoundingClientRect();
        const menuItem = navItems.find((item) => item.label === label);
        const childCount = menuItem?.children?.length || 0;
        const estimatedTooltipHeight = 50 + childCount * 50 + 20;
        const viewportHeight = window.innerHeight;
        let topPosition = rect.top;
        const bottomOverflow = rect.top + estimatedTooltipHeight - viewportHeight;
        if (bottomOverflow > 0) {
          topPosition = Math.max(10, rect.top - bottomOverflow - 10);
        }
        setTooltipStyle({
          top: topPosition,
          left: 82,
          maxHeight: viewportHeight - 20,
        });
        setHoveredMenu(label);
      }
    }, 150);
  };

  const handleMouseLeave = () => {
    if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredMenu(null);
    }, 200);
  };

  const handleTooltipMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  const handleTooltipMouseLeave = () => {
    setHoveredMenu(null);
  };

  // Group children by group field (for Koçluk)
  const getChildBadge = (child: SubMenuItem): number | undefined => {
    if (child.href === ODEV_KONTROL_HREF) {
      return kontrolBadgeCount > 0 ? kontrolBadgeCount : undefined;
    }
    return child.badge;
  };

  const renderSubmenuItems = (item: MenuItem) => {
    if (!item.children) return null;
    const orderedChildren = getOrderedChildren(item.id, item.children);
    const hasGroups = orderedChildren.some((c) => c.group);

    const renderSubLink = (child: SubMenuItem) => {
      const badge = getChildBadge(child);
      const isSubOver =
        subDragOver?.parentId === item.id &&
        subDragOver.href === child.href &&
        subDrag?.href !== child.href;
      return (
        <li
          className={`submenu-item${isSubOver ? ` drag-over-${subDragPosition}` : ""}${subDrag?.parentId === item.id && subDrag.href === child.href ? " is-dragging" : ""}`}
          key={child.href}
          draggable={isOpen && !searchQuery}
          onDragStart={(e) => {
            e.stopPropagation();
            setSubDrag({ parentId: item.id, href: child.href });
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            if (
              subDrag &&
              subDragOver &&
              subDrag.parentId === subDragOver.parentId &&
              subDrag.href !== subDragOver.href
            ) {
              reorderSubmenu(subDrag.parentId, subDrag.href, subDragOver.href, subDragPosition);
            }
            setSubDrag(null);
            setSubDragOver(null);
          }}
          onDragOver={(e) => {
            if (!isOpen || !subDrag || subDrag.parentId !== item.id || subDrag.href === child.href) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setSubDragPosition(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
            setSubDragOver({ parentId: item.id, href: child.href });
          }}
        >
          <Link
            href={child.href}
            className={`submenu-link ${isSubmenuActive(child.href) ? "active" : ""}`}
          >
            <span className="submenu-dot" />
            <span className="submenu-label">{child.label}</span>
            {badge && badge > 0 && <span className="submenu-badge">{badge}</span>}
          </Link>
        </li>
      );
    };

    if (!hasGroups) {
      return orderedChildren.map(renderSubLink);
    }

    // Grouped submenu — sıralı children'ı grupla
    const groups: Record<string, SubMenuItem[]> = {};
    orderedChildren.forEach((child) => {
      const g = child.group || "Diğer";
      if (!groups[g]) groups[g] = [];
      groups[g].push(child);
    });

    return Object.entries(groups).map(([groupName, children]) => (
      <li key={groupName} className="submenu-group">
        <div className="submenu-group-title">{groupName}</div>
        {children.map(renderSubLink)}
      </li>
    ));
  };

  const renderNavItem = (item: MenuItem, idx: number) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.includes(item.id);
    const isActive = isMenuActive(item);
    const isPinned = pinnedIds.includes(item.id);

    return (
      <li
        className={`nav-item ${hasChildren ? "has-submenu" : ""} ${isExpanded ? "expanded" : ""} ${isActive ? "active" : ""}`}
        key={item.id}
        style={{ '--i': idx } as React.CSSProperties}
        ref={(el) => {
          navItemRefs.current[item.label] = el;
        }}
        draggable={isOpen && !searchQuery}
        onDragStart={(e) => handleDragStart(e, item.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, item.id)}
        onDragLeave={(e) => handleDragLeave(e, item.id)}
      >
        {hasChildren ? (
          <>
            <div className="nav-link-row">
              <button
                className={`nav-link ${isActive ? "active" : ""}`}
                onClick={() => isOpen && toggleSubmenu(item.id)}
                onMouseEnter={() => handleMouseEnter(item.label)}
                onMouseLeave={handleMouseLeave}
                title={item.label}
              >
                <span className="nav-icon" data-icon={item.id}>{item.icon}</span>
                <span className="nav-label">
                  {item.label}
                </span>
                <span className={`nav-arrow ${isExpanded ? "rotated" : ""}`}>
                  {icons.chevronDown}
                </span>
              </button>
              {isOpen && (
                <button
                  className={`pin-btn ${isPinned ? "pinned" : ""}`}
                  onClick={(e) => { e.stopPropagation(); togglePin(item.id); }}
                  title={isPinned ? "Sabitliği kaldır" : "Menüyü sabitle"}
                >
                  {icons.pin}
                </button>
              )}
            </div>

            <ul className={`submenu ${isExpanded ? "open" : ""}`}>
              {renderSubmenuItems(item)}
            </ul>
          </>
        ) : (
          <>
            <div className="nav-link-row">
              <Link
                href={item.href || "#"}
                className={`nav-link ${isActive ? "active" : ""}`}
                title={item.label}
                onMouseEnter={() => handleMouseEnter(item.label)}
                onMouseLeave={handleMouseLeave}
              >
                <span className="nav-icon" data-icon={item.id}>{item.icon}</span>
                <span className="nav-label">
                  {item.label}
                </span>
              </Link>
              {isOpen && (
                <button
                  className={`pin-btn ${isPinned ? "pinned" : ""}`}
                  onClick={(e) => { e.stopPropagation(); togglePin(item.id); }}
                  title={isPinned ? "Sabitliği kaldır" : "Menüyü sabitle"}
                >
                  {icons.pin}
                </button>
              )}
            </div>
            <span className={`tooltip ${hoveredMenu === item.label ? "visible" : ""}`}>
              {item.label}
            </span>
          </>
        )}
      </li>
    );
  };

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`} id="sidebar">
      <div className="sidebar-header">
        <KurumLogo variant="app" width={40} height={40} />
      </div>

      {/* Sidebar Search - only when open */}
      {isOpen && (
        <div className="sidebar-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Menüde ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sidebar-search-input"
          />
          {searchQuery && (
            <button
              className="sidebar-search-clear"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>
      )}

      <nav className="sidebar-nav">
        {/* Pinned Section */}
        {isOpen && pinnedItems.length > 0 && !searchQuery && (
          <div className="pinned-section">
            <div className="pinned-header">📌 Sabitlenmiş</div>
            <ul className="nav-list pinned-list">
              {pinnedItems.map((item, idx) => (
                <li key={idx} className={`nav-item pinned-item ${isMenuActive(item) ? "active" : ""}`}>
                  <Link
                    href={item.href || (item.children?.[0]?.href || "#")}
                    className={`nav-link ${isMenuActive(item) ? "active" : ""}`}
                  >
                    <span className="nav-icon" data-icon={item.id}>{item.icon}</span>
                    <span className="nav-label">
                      {item.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="pinned-divider" />
          </div>
        )}

        {/* Main Nav */}
        <ul className="nav-list">
          {filteredNavItems.map((item, idx) => renderNavItem(item, idx))}
        </ul>
      </nav>

      {/* Floating Submenu Tooltip */}
      {!isOpen && hoveredMenu && (
        <div
          className="submenu-tooltip visible"
          style={tooltipStyle}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <div className="submenu-tooltip-header">{hoveredMenu}</div>
          {visibleNavItems
            .find((item) => item.label === hoveredMenu)
            ?.children?.map((child, childIdx) => {
              const badge = child.href === ODEV_KONTROL_HREF ? kontrolBadgeCount : child.badge;
              return (
              <Link
                href={child.href}
                className={`submenu-tooltip-item ${isSubmenuActive(child.href) ? "active" : ""}`}
                key={childIdx}
                onClick={() => setHoveredMenu(null)}
              >
                {child.label}
                {badge && badge > 0 ? ` (${badge})` : ""}
              </Link>
              );
            })}
        </div>
      )}
    </aside>
  );
}
