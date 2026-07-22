/** Çerez Politikası — yapılandırılmış içerik */

import { buildYasalNav, type YasalMetinMeta, type YasalSection } from '@/lib/yasal-metin-types';

export const CEREZ_META: YasalMetinMeta = {
  brand: '3K KAMPÜS',
  title: 'Çerez Politikası',
  lastUpdated: '01 / 07 / 2026',
  intro:
    '3K Kampüs internet sitesinde kullanılan çerezler, benzer teknolojiler ve tercih yönetimine ilişkin bilgilendirme metnidir.',
};

export const CEREZ_SECTIONS: YasalSection[] = [
  {
    id: 'cerez-nedir',
    number: 1,
    title: 'Çerez Nedir?',
    paragraphs: [
      'Çerezler; ziyaret ettiğiniz internet sitesi tarafından tarayıcınıza kaydedilen küçük metin dosyalarıdır.',
      'Site performansının iyileştirilmesi, oturum yönetimi, güvenlik ve kullanıcı deneyiminin geliştirilmesi amacıyla kullanılabilir.',
    ],
  },
  {
    id: 'kullanim-amaclari',
    number: 2,
    title: 'Çerezleri Kullanım Amaçlarımız',
    paragraphs: ['3K Kampüs internet sitesinde çerezler aşağıdaki amaçlarla kullanılabilir:'],
    bullets: [
      'Oturum ve giriş güvenliğinin sağlanması',
      'Site tercihlerinin hatırlanması',
      'Sayfa performansının ölçülmesi',
      'Hata ve güvenlik olaylarının tespiti',
      'İstatistiksel analiz (ör. Google Analytics 4)',
      'İletişim formlarının güvenli çalışması',
    ],
  },
  {
    id: 'cerez-turleri',
    number: 3,
    title: 'Kullanılan Çerez Türleri',
    categories: [
      {
        title: 'Zorunlu Çerezler',
        items: [
          'Oturum çerezleri',
          'Güvenlik (CSRF) çerezleri',
          'Giriş durumu çerezleri',
        ],
        note: 'Site ve panelin temel işlevleri için gereklidir; devre dışı bırakılamayabilir.',
      },
      {
        title: 'Analitik Çerezler',
        items: [
          'Google Analytics 4 (GA4)',
          'Sayfa görüntüleme istatistikleri',
          'Trafik kaynağı analizi',
        ],
        note: 'Entegrasyonlar panelinden yapılandırılır; yalnızca ölçüm kimliği tanımlandığında devreye girer.',
      },
      {
        title: 'İşlevsel Çerezler',
        items: [
          'Dil ve görünüm tercihleri',
          'Form alanı hatırlama',
        ],
      },
    ],
  },
  {
    id: 'ucuncu-taraf',
    number: 4,
    title: 'Üçüncü Taraf Çerezleri',
    paragraphs: [
      'Analitik veya pazarlama entegrasyonları kullanıldığında ilgili hizmet sağlayıcıların çerezleri devreye girebilir.',
      'Bu çerezlerin kullanımı, ilgili sağlayıcının gizlilik politikasına tabidir.',
    ],
  },
  {
    id: 'yonetim',
    number: 5,
    title: 'Çerez Tercihlerinin Yönetimi',
    paragraphs: [
      'Tarayıcı ayarlarınızdan çerezleri silebilir veya engelleyebilirsiniz. Zorunlu çerezlerin kapatılması site ve panel işlevlerini kısıtlayabilir.',
      'GA4 ölçüm kimliği Web Sitesi yönetimi → Entegrasyonlar bölümünden yönetilir.',
    ],
  },
  {
    id: 'saklama',
    number: 6,
    title: 'Saklama Süreleri',
    paragraphs: [
      'Oturum çerezleri tarayıcı kapatıldığında silinir.',
      'Kalıcı çerezler, amaçlarına göre belirli bir süre cihazınızda saklanabilir.',
      'Analitik çerezlerin saklama süreleri ilgili sağlayıcı ayarlarına bağlıdır.',
    ],
  },
  {
    id: 'kvkk-baglanti',
    number: 7,
    title: 'Kişisel Veriler',
    paragraphs: [
      'Çerezler aracılığıyla elde edilen veriler, KVKK ve Gizlilik Politikası kapsamında işlenir.',
    ],
    inlineLinks: [
      {
        text: 'Ayrıntılı bilgi için Gizlilik Politikası sayfasını inceleyebilirsiniz.',
        href: '/yasal/gizlilik',
        label: 'Gizlilik Politikası',
      },
    ],
  },
  {
    id: 'guncelleme',
    number: 8,
    title: 'Politika Güncellemeleri',
    paragraphs: [
      '3K Kampüs, teknolojik gelişmeler veya mevzuat değişiklikleri doğrultusunda bu Çerez Politikası\'nı güncelleyebilir.',
      'Güncel sürüm internet sitesinde yayımlandığı tarihten itibaren geçerlidir.',
    ],
  },
];

export const CEREZ_NAV = buildYasalNav(CEREZ_SECTIONS);
