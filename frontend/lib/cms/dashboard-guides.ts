/** Dashboard sağlık ve SEO uyarıları — kullanıcıya gösterilecek açıklamalar */

export type HealthKey = 'sitemap_ok' | 'robots_custom' | 'favicon_ok' | 'ga4_ok';

export const HEALTH_ITEMS: Record<
  HealthKey,
  {
    label: string;
    okTitle: string;
    missingTitle: string;
    meaning: string;
    howTo: string;
    goTo: 'seo' | 'integrations' | 'theme' | 'pages';
    goLabel: string;
  }
> = {
  sitemap_ok: {
    label: 'Sitemap',
    okTitle: 'Sitemap hazır',
    missingTitle: 'Sitemap eksik',
    meaning:
      'Arama motorlarının sitenizdeki sayfaları keşfetmesi için XML sitemap gerekir. Yayında ve “sitemap’e dahil” en az bir sayfa olmalıdır.',
    howTo:
      'Sayfalar bölümünden en az bir sayfayı Yayınla durumuna alın ve SEO ayarlarında “Sitemap dahil” işaretli olsun (varsayılan açıktır).',
    goTo: 'pages',
    goLabel: 'Sayfalara git',
  },
  robots_custom: {
    label: 'robots.txt',
    okTitle: 'Özel robots.txt var',
    missingTitle: 'Özel robots.txt yok',
    meaning:
      'robots.txt arama motorlarına hangi adreslerin taranabileceğini söyler. Özel tanım yoksa sistem güvenli bir varsayılan kullanır; bu kritik bir hata değildir.',
    howTo:
      'Entegrasyonlar → robots.txt alanını düzenleyin (veya paneldaki “Eksikleri doldur” ile varsayılanı ekleyip sonra değiştirin).',
    goTo: 'integrations',
    goLabel: 'Entegrasyonlara git',
  },
  favicon_ok: {
    label: 'Favicon',
    okTitle: 'Favicon tanımlı',
    missingTitle: 'Favicon eksik',
    meaning:
      'Tarayıcı sekmesinde görünen küçük ikon. Marka görünürlüğü ve profesyonel izlenim için önerilir.',
    howTo:
      'Tema sekmesinde Favicon URL alanına bir .ico/.png adresi yazın (Medya’dan yükleyip URL’yi kopyalayabilirsiniz).',
    goTo: 'theme',
    goLabel: 'Temaya git',
  },
  ga4_ok: {
    label: 'Google Analytics',
    okTitle: 'GA4 bağlı',
    missingTitle: 'GA4 eksik',
    meaning:
      'Ziyaretçi ve sayfa trafiğini ölçmek için Google Analytics 4 ölçüm kimliği (G-…) gerekir. Bağlı değilse istatistik toplanmaz.',
    howTo:
      'Google Analytics’te bir GA4 mülkü oluşturun → Yönetici → Veri akışları → Ölçüm kimliği (G-XXXX). Entegrasyonlar sekmesine yapıştırıp kaydedin, sonra “GA4 Test” ile doğrulayın.',
    goTo: 'integrations',
    goLabel: 'Entegrasyonlara git',
  },
};

export const SEO_CODE_HELP: Record<
  string,
  { title: string; meaning: string; howTo: string }
> = {
  page_missing_meta_title: {
    title: 'Meta başlık eksik',
    meaning: 'Google sonuçlarında görünen başlık. Yoksa arama motoru rastgele bir metin seçebilir.',
    howTo: 'İlgili sayfayı Page Builder’da açın → SEO / Meta Title alanını 30–60 karakter doldurun.',
  },
  page_missing_meta_description: {
    title: 'Meta açıklama eksik',
    meaning: 'Arama sonucundaki kısa özet metin. Tıklanma oranını doğrudan etkiler.',
    howTo: 'Sayfa SEO ayarlarında Meta Description’ı 70–160 karakter yazın.',
  },
  missing_canonical: {
    title: 'Canonical URL eksik',
    meaning: 'Aynı içeriğin tek “asıl” adresini belirtir; yinelenen içerik cezasına karşı korunur.',
    howTo: 'Sayfa SEO’sunda Canonical alanına tam URL yazın (örn. https://site.com/hakkimizda). Anasayfa için zorunlu değildir.',
  },
  duplicate_title: {
    title: 'Yinelenen meta başlık',
    meaning: 'Birden fazla sayfa aynı başlığı kullanıyor; Google sayfaları ayırt etmekte zorlanır.',
    howTo: 'Her sayfaya benzersiz Meta Title verin.',
  },
  duplicate_description: {
    title: 'Yinelenen meta açıklama',
    meaning: 'Aynı açıklama birden fazla sayfada tekrarlanıyor.',
    howTo: 'Her sayfanın Meta Description’ını özgün yazın.',
  },
  media_missing_alt: {
    title: 'Görsellerde alt text yok',
    meaning: 'Erişilebilirlik ve görsel SEO için her görselin alternatif metni olmalıdır.',
    howTo: 'Medya kütüphanesinde görselleri açıp Alt Text alanını doldurun; Page Builder’daki görsel bloklarında da alt girin.',
  },
  robots_default: {
    title: 'Özel robots.txt yok',
    meaning: 'Sistem varsayılan robots kurallarını kullanıyor. Çoğu kurum için yeterlidir.',
    howTo: 'İsterseniz Entegrasyonlar → robots.txt ile özelleştirin.',
  },
};

/** Site sağlığı kartında zaten gösterilen kodlar — üst banner sayımına dahil edilmez. */
export const SEO_INFO_ONLY_CODES = new Set(['robots_default']);

export function seoWarningSeverity(code?: string, level?: string): 'info' | 'warn' {
  if (level === 'info' || (code && SEO_INFO_ONLY_CODES.has(code))) return 'info';
  return 'warn';
}

export function explainSeoWarning(code?: string, fallbackMessage?: string) {
  if (code && SEO_CODE_HELP[code]) return SEO_CODE_HELP[code];
  return {
    title: fallbackMessage || 'SEO uyarısı',
    meaning: 'Bu uyarı sayfa veya site SEO sağlığını iyileştirmek için listelenmiştir.',
    howTo: 'SEO Merkezi veya ilgili sayfa ayarlarından düzeltin.',
  };
}
