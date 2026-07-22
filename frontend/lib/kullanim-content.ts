/** Kullanım Koşulları — yapılandırılmış içerik */

import { buildYasalNav, type YasalMetinMeta, type YasalSection } from '@/lib/yasal-metin-types';

export const KULLANIM_META: YasalMetinMeta = {
  brand: '3K KAMPÜS',
  title: 'Kullanım Koşulları',
  lastUpdated: '01 / 07 / 2026',
  intro:
    '3K Kampüs internet sitesi, dijital eğitim platformu ve ilgili hizmetlerin kullanımına ilişkin koşulları düzenler.',
};

export const KULLANIM_SECTIONS: YasalSection[] = [
  {
    id: 'kapsam',
    number: 1,
    title: 'Kapsam',
    paragraphs: [
      'Bu Kullanım Koşulları; 3K Kampüs internet sitesi, öğrenci/veli/öğretmen/koç portalları, yönetim paneli ve buna bağlı dijital hizmetlerin kullanımına ilişkin esasları belirler.',
      'Siteye erişen, hesap oluşturan veya hizmetlerden yararlanan tüm kullanıcılar bu koşulları kabul etmiş sayılır.',
    ],
  },
  {
    id: 'hizmet',
    number: 2,
    title: 'Sunulan Hizmetler',
    paragraphs: ['3K Kampüs dijital altyapısı kapsamında aşağıdaki hizmetler sunulabilir:'],
    bullets: [
      'Eğitim ve kayıt süreçlerinin yönetimi',
      'Akademik takip ve raporlama',
      'Deneme sınavı analizleri',
      'Koçluk ve etüt planlaması',
      'Veli bilgilendirme',
      'Duyuru ve iletişim kanalları',
      'Kütüphane ve kaynak takibi',
    ],
  },
  {
    id: 'uyelik',
    number: 3,
    title: 'Üyelik ve Hesap Güvenliği',
    paragraphs: ['Kullanıcılar;'],
    bullets: [
      'Doğru ve güncel bilgi vermekle',
      'Hesap bilgilerini gizli tutmakla',
      'Şifrelerini üçüncü kişilerle paylaşmamakla',
      'Hesabın yetkisiz kullanımını derhal bildirmekle',
    ],
    afterBullets: ['yükümlüdür. Hesap güvenliğinin sağlanmasından kullanıcı sorumludur.'],
  },
  {
    id: 'kabul-edilebilir-kullanim',
    number: 4,
    title: 'Kabul Edilebilir Kullanım',
    paragraphs: ['Kullanıcılar aşağıdaki eylemlerde bulunamaz:'],
    bullets: [
      'Sisteme yetkisiz erişim girişimi',
      'Başka kullanıcıların hesaplarını kullanma',
      'Zararlı yazılım yükleme veya dağıtma',
      'Hizmetin çalışmasını engelleyecek otomatik istekler gönderme',
      'Telif hakkı ihlali oluşturacak içerik paylaşma',
      'Yanıltıcı, hukuka aykırı veya saldırgan içerik yayınlama',
    ],
  },
  {
    id: 'fikri-mulkiyet',
    number: 5,
    title: 'Fikri Mülkiyet',
    paragraphs: [
      'Site ve platform üzerindeki yazılım, tasarım, logo, metin, görsel ve eğitim materyalleri 3K Kampüs\'e veya lisans verenlerine aittir.',
      'İzinsiz kopyalama, çoğaltma, dağıtma veya ticari kullanım yasaktır.',
    ],
  },
  {
    id: 'sorumluluk',
    number: 6,
    title: 'Sorumluluk Sınırları',
    paragraphs: [
      '3K Kampüs, hizmetlerin kesintisiz ve hatasız sunulması için makul çabayı gösterir; ancak teknik arızalar, bakım çalışmaları veya mücbir sebepler nedeniyle geçici kesintiler yaşanabilir.',
      'Kullanıcının koşullara aykırı kullanımından doğan zararlardan kullanıcı sorumludur.',
    ],
  },
  {
    id: 'veri-gizlilik',
    number: 7,
    title: 'Veri ve Gizlilik',
    paragraphs: [
      'Kişisel verilerin işlenmesine ilişkin ayrıntılar KVKK Aydınlatma Metni ve Gizlilik Politikası\'nda yer alır.',
    ],
    inlineLinks: [
      {
        text: 'Detaylar için KVKK Aydınlatma Metni ve Gizlilik Politikası sayfalarını inceleyebilirsiniz.',
        href: '/yasal/kvkk',
        label: 'KVKK Aydınlatma Metni',
      },
    ],
  },
  {
    id: 'degisiklik',
    number: 8,
    title: 'Değişiklikler',
    paragraphs: [
      '3K Kampüs, mevzuat veya hizmet kapsamındaki değişiklikler doğrultusunda bu koşulları güncelleyebilir.',
      'Güncel metin internet sitesinde yayımlandığı tarihten itibaren geçerlidir.',
    ],
  },
  {
    id: 'iletisim',
    number: 9,
    title: 'İletişim',
    paragraphs: [
      'Kullanım Koşulları hakkında sorularınız için internet sitemizdeki iletişim kanallarından bize ulaşabilirsiniz.',
    ],
  },
];

export const KULLANIM_NAV = buildYasalNav(KULLANIM_SECTIONS);
