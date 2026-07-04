// ═══════════════════════════════════════════════════════════════
// Koçluk Görüşme Yönetimi — TypeScript Types
// ═══════════════════════════════════════════════════════════════

/* ─── Enum / Constant Types ───────────────────────────────── */

export const GORUSME_TURLERI = [
  { value: "ogrenci", label: "Öğrenci Görüşmesi", icon: "👤", color: "bg-blue-100 text-blue-700" },
  { value: "veli", label: "Veli Görüşmesi", icon: "👨‍👩‍👧", color: "bg-purple-100 text-purple-700" },
  { value: "ic_degerlendirme", label: "Koç İç Değerlendirme", icon: "📋", color: "bg-slate-100 text-slate-700" },
  { value: "motivasyon", label: "Motivasyon Görüşmesi", icon: "🔥", color: "bg-orange-100 text-orange-700" },
  { value: "akademik_analiz", label: "Akademik Analiz", icon: "📊", color: "bg-emerald-100 text-emerald-700" },
  { value: "disiplin", label: "Disiplin Görüşmesi", icon: "⚠️", color: "bg-red-100 text-red-700" },
  { value: "diger", label: "Diğer", icon: "💬", color: "bg-gray-100 text-gray-600" },
] as const;

export const GORUSME_DURUMLARI = [
  { value: "planlandi", label: "Planlandı", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  { value: "tamamlandi", label: "Tamamlandı", color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  { value: "iptal", label: "İptal Edildi", color: "bg-red-100 text-red-700", dot: "bg-red-500" },
  { value: "ertelendi", label: "Ertelendi", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
] as const;

export const GORUSME_YONTEMLERI = [
  { value: "yuz_yuze", label: "Yüz Yüze", icon: "🤝" },
  { value: "telefon", label: "Telefon", icon: "📞" },
  { value: "online", label: "Online", icon: "💻" },
] as const;

export const ONCELIK_SEVIYELERI = [
  { value: "acil", label: "Acil", color: "bg-red-100 text-red-700", dot: "bg-red-500" },
  { value: "normal", label: "Normal", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  { value: "rutin", label: "Rutin Takip", color: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
] as const;

export const AKSIYON_SORUMLULARI = [
  { value: "ogrenci", label: "Öğrenci" },
  { value: "koc", label: "Koç" },
  { value: "veli", label: "Veli" },
  { value: "idare", label: "İdare" },
] as const;

/* ─── Interfaces ──────────────────────────────────────────── */

export interface GorusmeAksiyon {
  id: number;
  gorusme: number;
  aciklama: string;
  sorumlu: string;
  sorumlu_display: string;
  deadline: string | null;
  tamamlandi: boolean;
  tamamlanma_tarihi: string | null;
  created_at: string;
}

export interface GorusmeKatilimci {
  id: number;
  gorusme: number;
  ad_soyad: string;
  rol: string;
  rol_display: string;
  personel: number | null;
}

export interface GorusmeDosya {
  id: number;
  gorusme: number;
  dosya: string;
  aciklama: string;
  created_at: string;
}

export interface GorusmeHatirlatma {
  id: number;
  gorusme: number;
  hatirlatma_tarihi: string;
  mesaj: string;
  tip: string;
  tip_display: string;
  gonderildi: boolean;
  created_at: string;
}

export interface GorusmeKaydiListItem {
  id: number;
  ogrenci: number;
  ogrenci_adi: string;
  koc: number;
  koc_adi: string;
  gorusme_turu: string;
  gorusme_turu_display: string;
  diger_tur_aciklama: string;
  durum: string;
  durum_display: string;
  yontem: string;
  yontem_display: string;
  oncelik: string;
  oncelik_display: string;
  gorusme_tarihi: string;
  gorusme_saati: string | null;
  sure_dakika: number | null;
  konu: string;
  motivasyon_skoru: number | null;
  akademik_ozguven_skoru: number | null;
  stres_seviyesi: number | null;
  etiketler: string[];
  veli_ile_paylasilsin: boolean;
  sonraki_gorusme_tarihi: string | null;
  aksiyon_sayisi: number;
  tamamlanan_aksiyon: number;
  created_at: string;
}

export interface GorusmeKaydiDetail extends GorusmeKaydiListItem {
  notlar: string;
  veli_ozet: string;
  veli_paylasim_tarihi: string | null;
  aksiyonlar: GorusmeAksiyon[];
  katilimcilar: GorusmeKatilimci[];
  hatirlatmalar: GorusmeHatirlatma[];
  dosyalar: GorusmeDosya[];
  olusturan_adi: string | null;
  updated_at: string;
}

export interface GorusmeOzet {
  toplam: number;
  planlanan: number;
  tamamlanan: number;
  iptal: number;
  ertelenen: number;
  bu_hafta: number;
}

export interface GorusmeCreatePayload {
  kurum_id: number;
  ogrenci_id: number;
  koc_id: number;
  gorusme_turu: string;
  diger_tur_aciklama?: string;
  durum?: string;
  yontem?: string;
  oncelik?: string;
  gorusme_tarihi: string;
  gorusme_saati?: string | null;
  sure_dakika?: number | null;
  konu: string;
  notlar?: string;
  motivasyon_skoru?: number | null;
  akademik_ozguven_skoru?: number | null;
  stres_seviyesi?: number | null;
  etiketler?: string[];
  veli_ile_paylasilsin?: boolean;
  veli_ozet?: string;
  sonraki_gorusme_tarihi?: string | null;
  send_whatsapp_reminder?: boolean;
  aksiyonlar?: { aciklama: string; sorumlu?: string; deadline?: string | null }[];
  hatirlatmalar?: { hatirlatma_tarihi: string; mesaj: string; tip?: string }[];
}

export interface AtanmisOgrenci {
  id: number;
  ad: string;
  soyad: string;
  is_primary: boolean;
}

export interface KullaniciBilgi {
  is_admin: boolean;
  is_coach: boolean;
  coach_profile_id: number | null;
  coach_full_name: string | null;
  assigned_students: AtanmisOgrenci[];
}
