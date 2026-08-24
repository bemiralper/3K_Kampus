/** Özel ders yoklama / telafi WhatsApp taslakları (katalog ile aynı metin). */

export const OZEL_DERS_EVENT_BY_DURUM: Record<string, string> = {
  OGRETMEN_GELMEDI: "ozel_ders.ogretmen_gelmedi",
  OGRENCI_GELMEDI: "ozel_ders.ogrenci_gelmedi",
  IPTAL: "ozel_ders.iptal",
  ISLENDI: "ozel_ders.islendi",
  ONLINE: "ozel_ders.islendi",
};

export const OZEL_DERS_WHATSAPP_TEMPLATES: Record<
  string,
  { title: string; body: string; eventKey: string }
> = {
  "ozel_ders.ogretmen_gelmedi": {
    title: "Özel Ders Bilgilendirmesi",
    eventKey: "ozel_ders.ogretmen_gelmedi",
    body:
      "Değerli Velimiz,\n\n" +
      "{{ogrenci_ad}} öğrencimizin *{{ders_tarihi}} tarihinde saat {{ders_saati}}’te {{ders_adi}} özel dersi*, öğretmenimizin katılım sağlayamaması nedeniyle yapılamamıştır.\n\n" +
      "{{telafi_notu}}\n\n" +
      "Anlayışınız için teşekkür ederiz.",
  },
  "ozel_ders.ogrenci_gelmedi": {
    title: "Özel Ders Bilgilendirmesi",
    eventKey: "ozel_ders.ogrenci_gelmedi",
    body:
      "Değerli Velimiz,\n\n" +
      "{{ogrenci_ad}} öğrencimizin *{{ders_tarihi}} tarihinde saat {{ders_saati}}’te {{ders_adi}} özel dersine katılım sağlanamamıştır.*\n\n" +
      "{{telafi_notu}}\n\n" +
      "Bilginize sunarız.",
  },
  "ozel_ders.iptal": {
    title: "Özel Ders İptal Bilgilendirmesi",
    eventKey: "ozel_ders.iptal",
    body:
      "Değerli Velimiz,\n\n" +
      "{{ogrenci_ad}} öğrencimizin *{{ders_tarihi}} tarihinde saat {{ders_saati}}’te yapılması planlanan {{ders_adi}} özel dersi* iptal edilmiştir.\n\n" +
      "*İptal nedeni:* {{sebep}}\n\n" +
      "Ek bilgi: {{ek_bilgi}}\n\n" +
      "Bilginize sunar, anlayışınız için teşekkür ederiz.",
  },
  "ozel_ders.telafi_planlandi": {
    title: "Özel Ders Telafi Bilgilendirmesi",
    eventKey: "ozel_ders.telafi_planlandi",
    body:
      "Değerli Velimiz,\n\n" +
      "{{ogrenci_ad}} öğrencimizin *{{ders_tarihi}} tarihinde saat {{ders_saati}}’te yapılamayan {{ders_adi}} özel dersinin telafisi planlanmıştır.*\n\n" +
      "*Telafi Tarihi:* {{telafi_tarihi}}\n" +
      "*Telafi Saati:* {{telafi_saati}}\n\n" +
      "Ek bilgi: {{ek_bilgi}}\n\n" +
      "Bilginize sunar, öğrencimize verimli bir ders dileriz.",
  },
  "ozel_ders.islendi": {
    title: "Özel Ders Bilgilendirmesi",
    eventKey: "ozel_ders.islendi",
    body:
      "Değerli Velimiz,\n\n" +
      "{{ogrenci_ad}} öğrencimizin *{{ders_tarihi}} tarihinde saat {{ders_saati}}’te {{ders_adi}} özel dersi gerçekleştirilmiştir.*\n\n" +
      "Bilginize sunarız.",
  },
};

const DAY_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const MONTH_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function formatOzelDersTarihi(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return `${d} ${MONTH_TR[m - 1] || ""} ${y} ${DAY_TR[date.getDay()] || ""}`.trim();
}

export function formatOzelDersSaati(raw: string | null | undefined): string {
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${match[1].padStart(2, "0")}.${match[2]}`;
}

export const TELAFI_NOTU_BY_EVENT: Record<string, string> = {
  "ozel_ders.ogretmen_gelmedi":
    "Dersin *telafisi yapılacaktır.* Telafi tarihi ve saati kesinleştiğinde tarafınıza ayrıca bilgi verilecektir.",
  "ozel_ders.ogrenci_gelmedi":
    "Ders *telafi edilecektir.* Telafi tarihi ve saati kesinleştiğinde tarafınıza ayrıca bilgi verilecektir.",
};

export type OzelDersPreviewContext = {
  ogrenci_ad?: string;
  ders_tarihi?: string;
  ders_saati?: string;
  ders_adi?: string;
  ogretmen_ad?: string;
  sebep?: string;
  ek_bilgi?: string;
  telafi_notu?: string;
  telafi_tarihi?: string;
  telafi_saati?: string;
};

export function telafiNotuForPreview(eventKey: string, telafiDurumu?: string): string {
  if (eventKey === "ozel_ders.ogretmen_gelmedi") {
    return TELAFI_NOTU_BY_EVENT[eventKey] || "";
  }
  if (telafiDurumu === "BEKLENIYOR") {
    return TELAFI_NOTU_BY_EVENT[eventKey] || "";
  }
  return "";
}

export function resolveOzelDersTemplate(
  body: string,
  ctx: OzelDersPreviewContext,
): string {
  let resolved = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = ctx[key as keyof OzelDersPreviewContext];
    return value == null || value === "" ? "" : String(value);
  });
  if (!(ctx.ek_bilgi || "").trim()) {
    resolved = resolved.replace(/\nEk bilgi:\s*/g, "\n");
  }
  return resolved.replace(/\n{3,}/g, "\n\n").trim();
}
