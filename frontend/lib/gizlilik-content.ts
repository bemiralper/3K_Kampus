/** Gizlilik Politikası — yapılandırılmış içerik */

import { buildYasalNav, type YasalMetinMeta, type YasalSection } from '@/lib/yasal-metin-types';

export const GIZLILIK_META: YasalMetinMeta = {
  brand: '3K KAMPÜS',
  title: 'Gizlilik Politikası',
  lastUpdated: '01 / 07 / 2026',
  intro:
    'İnternet sitemizi ve dijital hizmetlerimizi kullanırken kişisel bilgilerinizin nasıl korunduğunu açıklayan resmi gizlilik politikasıdır.',
};

export const GIZLILIK_SECTIONS: YasalSection[] = [
  {
    id: 'giris',
    number: 1,
    title: 'Giriş',
    paragraphs: [
      '3K Kampüs olarak, öğrencilerimizin, velilerimizin, öğretmenlerimizin, çalışanlarımızın ve internet sitemizi ziyaret eden tüm kullanıcılarımızın gizliliğine önem veriyoruz.',
      'Bu Gizlilik Politikası; internet sitemiz, öğrenci bilgi sistemi, veli portalı, öğretmen ve koç portalı, mobil uygulamalar ile sunduğumuz dijital hizmetleri kullanırken kişisel bilgilerinizin nasıl korunduğunu açıklamak amacıyla hazırlanmıştır.',
      'İnternet sitemizi veya dijital hizmetlerimizi kullanmanız, bu politikada belirtilen esasları kabul ettiğiniz anlamına gelir.',
    ],
  },
  {
    id: 'ilkemiz',
    number: 2,
    title: 'Gizlilik İlkemiz',
    paragraphs: ['3K Kampüs olarak temel prensibimiz;'],
    bullets: [
      'Kişisel verileri yalnızca gerekli olduğu kadar toplamak',
      'Açık ve şeffaf şekilde işlemek',
      'Güvenli biçimde saklamak',
      'Yetkisiz erişime karşı korumak',
      'Mevzuata uygun şekilde kullanmak',
      'Amacı sona eren verileri ilgili mevzuat çerçevesinde silmek, yok etmek veya anonim hale getirmek',
    ],
  },
  {
    id: 'toplanan-bilgiler',
    number: 3,
    title: 'Toplanan Bilgiler',
    paragraphs: ['Sunulan hizmetlere bağlı olarak aşağıdaki bilgiler toplanabilir.'],
    categories: [
      {
        title: 'Kimlik Bilgileri',
        items: ['Ad', 'Soyad', 'Doğum tarihi', 'T.C. Kimlik Numarası (gerektiğinde)'],
      },
      {
        title: 'İletişim Bilgileri',
        items: ['Telefon numarası', 'E-posta adresi', 'Adres bilgileri'],
      },
      {
        title: 'Akademik Bilgiler',
        items: [
          'Okul bilgileri',
          'Sınıf bilgisi',
          'Ders programları',
          'Devamsızlık bilgileri',
          'Deneme sınavı sonuçları',
          'Ödev kayıtları',
          'Akademik gelişim raporları',
          'Koçluk görüşme notları',
          'Etüt planlamaları',
          'Birebir özel ders kayıtları',
        ],
      },
      {
        title: 'Sistem Kullanım Bilgileri',
        items: [
          'Kullanıcı giriş tarihleri',
          'Oturum kayıtları',
          'İşlem geçmişi',
          'IP adresi',
          'Tarayıcı bilgileri',
          'Cihaz bilgileri',
          'Sistem log kayıtları',
        ],
      },
    ],
  },
  {
    id: 'kullanim-amaclari',
    number: 4,
    title: 'Bilgileriniz Nasıl Kullanılır?',
    paragraphs: ['Toplanan bilgiler aşağıdaki amaçlarla kullanılabilir.'],
    bullets: [
      'Eğitim hizmetlerinin yürütülmesi',
      'Öğrenci kayıt işlemleri',
      'Akademik gelişimin takip edilmesi',
      'Ders planlarının oluşturulması',
      'Deneme sınavlarının değerlendirilmesi',
      'Kütüphane kullanımının planlanması',
      'Koçluk süreçlerinin yürütülmesi',
      'Birebir özel ders organizasyonunun yapılması',
      'Veli bilgilendirmelerinin gerçekleştirilmesi',
      'Duyuruların paylaşılması',
      'Sistem güvenliğinin sağlanması',
      'Teknik destek hizmetlerinin sunulması',
      'Hizmet kalitesinin geliştirilmesi',
      'Yasal yükümlülüklerin yerine getirilmesi',
    ],
  },
  {
    id: 'dijital-platform',
    number: 5,
    title: 'Dijital Eğitim Platformu',
    paragraphs: ['3K Kampüs dijital eğitim sistemi;'],
    bullets: [
      'Öğrenci Portalı',
      'Veli Portalı',
      'Öğretmen Portalı',
      'Koç Portalı',
      'Yönetim Paneli',
    ],
    afterBullets: [
      'üzerinden sunulan hizmetleri kapsar.',
      'Bu sistemlerde gerçekleştirilen işlemler hizmetin güvenli şekilde yürütülebilmesi amacıyla kayıt altına alınabilir.',
    ],
  },
  {
    id: 'paylasim',
    number: 6,
    title: 'Bilgilerin Paylaşılması',
    paragraphs: ['Kişisel bilgileriniz;'],
    bullets: [
      'Kanuni zorunluluk bulunması',
      'Resmî makamların talebi',
      'Hukuki yükümlülüklerin yerine getirilmesi',
      'Teknik altyapı hizmetlerinin sağlanması',
    ],
    afterBullets: [
      'halleri dışında üçüncü kişilerle satılmaz, kiralanmaz veya ticari amaçlarla paylaşılmaz.',
    ],
  },
  {
    id: 'bilgi-guvenligi',
    number: 7,
    title: 'Bilgi Güvenliği',
    paragraphs: [
      '3K Kampüs, kullanıcı bilgilerinin güvenliği için uygun teknik ve idari tedbirleri uygular.',
      'Bu kapsamda;',
    ],
    bullets: [
      'Yetkilendirme sistemleri kullanılır',
      'Güçlü parola politikaları uygulanır',
      'Veri erişimleri sınırlandırılır',
      'Güvenlik kayıtları tutulur',
      'Düzenli yedekleme yapılır',
      'Yetkisiz erişimlere karşı koruma mekanizmaları kullanılır',
    ],
    afterBullets: [
      'Ancak internet üzerinden gerçekleştirilen veri iletimlerinin %100 güvenli olduğu garanti edilemeyeceğinden kullanıcıların da hesap bilgilerini koruma konusunda gerekli özeni göstermesi önemlidir.',
    ],
  },
  {
    id: 'hesap-guvenligi',
    number: 8,
    title: 'Kullanıcı Hesap Güvenliği',
    paragraphs: ['Kullanıcılar;'],
    bullets: [
      'Şifrelerini gizli tutmak',
      'Hesap bilgilerini üçüncü kişilerle paylaşmamak',
      'Ortak kullanılan cihazlarda oturumu güvenli şekilde kapatmak',
      'Hesaplarının izinsiz kullanıldığını düşündüklerinde derhal 3K Kampüs ile iletişime geçmek',
    ],
    afterBullets: [
      'ile yükümlüdür.',
      'Hesap bilgilerinin kullanıcı tarafından üçüncü kişilerle paylaşılmasından doğabilecek sonuçlardan kullanıcı sorumludur.',
    ],
  },
  {
    id: 'cerezler',
    number: 9,
    title: 'Çerezler ve Benzeri Teknolojiler',
    paragraphs: [
      'İnternet sitemizde kullanıcı deneyimini geliştirmek, güvenliği sağlamak ve sistem performansını artırmak amacıyla çerezler ve benzeri teknolojiler kullanılabilir.',
    ],
    inlineLinks: [
      {
        text: 'Çerezlerin kullanımına ilişkin ayrıntılı bilgiler Çerez Politikası\'nda yer almaktadır.',
        href: '/yasal/cerez',
        label: 'Çerez Politikası',
      },
    ],
  },
  {
    id: 'dis-baglantilar',
    number: 10,
    title: 'Dış Bağlantılar',
    paragraphs: [
      'İnternet sitemizde üçüncü taraf internet sitelerine yönlendiren bağlantılar bulunabilir.',
      'Bu internet sitelerinin gizlilik uygulamalarından 3K Kampüs sorumlu değildir.',
      'Kullanıcıların ziyaret ettikleri internet sitelerinin gizlilik politikalarını ayrıca incelemeleri önerilir.',
    ],
  },
  {
    id: 'cocuklar',
    number: 11,
    title: 'Çocukların Gizliliği',
    paragraphs: [
      '3K Kampüs, eğitim hizmetleri kapsamında öğrencilerle ilgili kişisel verileri yalnızca ilgili mevzuat hükümleri doğrultusunda ve gerekli olduğu ölçüde işler.',
      '18 yaşından küçük öğrencilere ilişkin işlemler, gerekli durumlarda veli veya yasal temsilcileri aracılığıyla yürütülür.',
    ],
  },
  {
    id: 'degisiklikler',
    number: 12,
    title: 'Politika Değişiklikleri',
    paragraphs: [
      '3K Kampüs, yürürlükteki mevzuat, teknolojik gelişmeler veya hizmetlerde meydana gelen değişiklikler doğrultusunda bu Gizlilik Politikası\'nı güncelleyebilir.',
      'Güncel sürüm internet sitesi üzerinden yayımlandığı tarihten itibaren geçerlidir.',
    ],
  },
  {
    id: 'iletisim',
    number: 13,
    title: 'İletişim',
    paragraphs: [
      'Gizlilik Politikası hakkında sorularınız veya talepleriniz için internet sitemizde yer alan iletişim kanallarımız üzerinden bizimle iletişime geçebilirsiniz.',
      '3K Kampüs, kullanıcılarının gizliliğini korumayı ve kişisel verileri güvenli şekilde işlemeyi temel sorumluluklarından biri olarak kabul etmektedir.',
    ],
  },
];

export const GIZLILIK_NAV = buildYasalNav(GIZLILIK_SECTIONS);
