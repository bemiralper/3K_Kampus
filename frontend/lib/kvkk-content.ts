/** KVKK Aydınlatma Metni — yapılandırılmış içerik */

import { buildYasalNav, type YasalMetinMeta, type YasalSection } from '@/lib/yasal-metin-types';

export const KVKK_META: YasalMetinMeta = {
  brand: '3K KAMPÜS',
  title: 'Kişisel Verilerin Korunması Aydınlatma Metni',
  lastUpdated: '01 / 07 / 2026',
  intro: '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hazırlanmış resmi aydınlatma metnidir.',
};

export const KVKK_SECTIONS: YasalSection[] = [
  {
    id: 'amac',
    number: 1,
    title: 'Amaç',
    paragraphs: [
      '3K Kampüs olarak öğrencilerimizin, velilerimizin, ziyaretçilerimizin, öğretmenlerimizin ve çalışanlarımızın kişisel verilerinin güvenliğine önem veriyoruz.',
      'Bu Aydınlatma Metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında kişisel verilerinizin hangi amaçlarla işlendiğini, kimlerle paylaşılabileceğini, hangi yöntemlerle toplandığını ve sahip olduğunuz hakları açıklamak amacıyla hazırlanmıştır.',
    ],
  },
  {
    id: 'veri-sorumlusu',
    number: 2,
    title: 'Veri Sorumlusu',
    paragraphs: [
      '6698 sayılı KVKK kapsamında kişisel verileriniz, veri sorumlusu sıfatıyla 3K Kampüs tarafından işlenmektedir.',
      'Kuruma ait iletişim bilgileri internet sitemizde yer alan "İletişim" bölümünde güncel olarak yayımlanmaktadır.',
    ],
  },
  {
    id: 'islenen-veriler',
    number: 3,
    title: 'İşlenen Kişisel Veriler',
    paragraphs: ['Sunulan hizmete göre aşağıdaki kişisel veriler işlenebilir.'],
    categories: [
      {
        title: 'Kimlik Bilgileri',
        items: ['Ad', 'Soyad', 'T.C. Kimlik Numarası (gerektiğinde)', 'Doğum Tarihi'],
      },
      {
        title: 'İletişim Bilgileri',
        items: ['Telefon', 'E-posta', 'Adres', 'Acil durum iletişim bilgileri'],
      },
      {
        title: 'Öğrenci Bilgileri',
        items: [
          'Okul bilgileri',
          'Sınıf',
          'Eğitim seviyesi',
          'Akademik performans',
          'Deneme sınavı sonuçları',
          'Devam durumu',
          'Ödev bilgileri',
          'Etüt bilgileri',
          'Kaynak kullanımı',
          'Koçluk görüşmeleri',
          'Akademik gelişim raporları',
        ],
      },
      {
        title: 'Veli Bilgileri',
        items: ['İletişim bilgileri', 'Öğrenci ile yakınlık bilgisi', 'Bilgilendirme tercihleri'],
      },
      {
        title: 'Dijital Sistem Verileri',
        items: [
          'Kullanıcı giriş kayıtları',
          'Oturum bilgileri',
          'IP adresi',
          'Tarayıcı bilgileri',
          'Cihaz bilgileri',
          'İşlem kayıtları',
          'Güvenlik logları',
        ],
        note: '3K Kampüs dijital platformu üzerinden mevzuat kapsamında güvenlik amacıyla kaydedilebilir.',
      },
    ],
  },
  {
    id: 'islenme-amaclari',
    number: 4,
    title: 'Kişisel Verilerin İşlenme Amaçları',
    paragraphs: ['Kişisel verileriniz;'],
    bullets: [
      'Eğitim hizmetlerinin yürütülmesi',
      'Öğrenci kayıt işlemleri',
      'Akademik gelişimin takip edilmesi',
      'Deneme sınavlarının değerlendirilmesi',
      'Ders programlarının oluşturulması',
      'Koçluk süreçlerinin yürütülmesi',
      'Kütüphane kullanımının takip edilmesi',
      'Birebir özel ders planlamalarının yapılması',
      'Veli bilgilendirmelerinin gerçekleştirilmesi',
      'SMS, WhatsApp ve e-posta bilgilendirmelerinin gönderilmesi',
      'Duyuruların paylaşılması',
      'Eğitim kalitesinin artırılması',
      'Hukuki yükümlülüklerin yerine getirilmesi',
      'Bilgi güvenliğinin sağlanması',
    ],
    afterBullets: ['amaçlarıyla işlenebilir.'],
  },
  {
    id: 'toplama-yontemi',
    number: 5,
    title: 'Kişisel Verilerin Toplanma Yöntemi',
    paragraphs: ['Kişisel veriler;'],
    bullets: [
      'İnternet sitesi',
      'Online başvuru formları',
      'Öğrenci kayıt formları',
      'Veli bilgi formları',
      'Dijital öğrenci bilgi sistemi',
      'Mobil uygulama',
      'Telefon görüşmeleri',
      'WhatsApp yazışmaları',
      'E-posta',
      'Yüz yüze görüşmeler',
    ],
    afterBullets: ['aracılığıyla toplanabilir.'],
  },
  {
    id: 'hukuki-sebep',
    number: 6,
    title: 'Hukuki Sebep',
    paragraphs: [
      'Kişisel veriler; 6698 sayılı KVKK\'nın 5 ve 6. maddelerinde belirtilen hukuki sebepler kapsamında işlenmektedir.',
      'Gerektiğinde açık rızaya dayalı veri işleme süreçleri ayrıca yürütülmektedir.',
    ],
  },
  {
    id: 'veri-aktarimi',
    number: 7,
    title: 'Verilerin Aktarılması',
    paragraphs: ['Kanunen zorunlu olması hâlinde kişisel veriler;'],
    bullets: [
      'Yetkili kamu kurum ve kuruluşlarına',
      'Adli mercilere',
      'Mali yükümlülüklerin yerine getirilmesi amacıyla ilgili kurumlara',
      'Teknik altyapı sağlayıcılarına',
      'Bulut hizmet sağlayıcılarına',
      'SMS, e-posta ve bildirim hizmeti sunan yetkili iş ortaklarına',
    ],
    afterBullets: ['KVKK hükümlerine uygun şekilde aktarılabilir.'],
  },
  {
    id: 'bilgi-guvenligi',
    number: 8,
    title: 'Bilgi Güvenliği',
    paragraphs: [
      '3K Kampüs; kişisel verilerin yetkisiz erişime, değiştirilmeye, kaybolmaya veya hukuka aykırı işlenmeye karşı korunması amacıyla gerekli teknik ve idari tedbirleri uygular.',
      'Sistem üzerinde gerçekleştirilen işlemler güvenlik kayıtları ile takip edilebilir.',
    ],
  },
  {
    id: 'haklariniz',
    number: 9,
    title: 'KVKK Kapsamındaki Haklarınız',
    paragraphs: ['KVKK\'nın 11. maddesi kapsamında;'],
    bullets: [
      'Kişisel verilerinizin işlenip işlenmediğini öğrenme',
      'İşlenmişse bilgi talep etme',
      'Amacına uygun kullanılıp kullanılmadığını öğrenme',
      'Düzeltilmesini isteme',
      'Silinmesini veya yok edilmesini talep etme',
      'Aktarıldığı üçüncü kişileri öğrenme',
      'Otomatik sistemlerle analiz sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme',
      'Kanuna aykırı işleme nedeniyle zararın giderilmesini talep etme',
    ],
    afterBullets: ['haklarına sahipsiniz.'],
  },
  {
    id: 'basvuru',
    number: 10,
    title: 'Başvuru',
    paragraphs: [
      'KVKK kapsamındaki taleplerinizi, kimliğinizi doğrulayacak bilgilerle birlikte 3K Kampüs\'e yazılı olarak veya ilgili mevzuatta belirtilen yöntemlerle iletebilirsiniz.',
      'Başvurular, kanuni süreler içerisinde değerlendirilerek sonuçlandırılır.',
    ],
  },
  {
    id: 'guncellemeler',
    number: 11,
    title: 'Güncellemeler',
    paragraphs: [
      '3K Kampüs, mevzuat değişiklikleri veya sunulan hizmetlerde meydana gelen değişiklikler doğrultusunda bu Aydınlatma Metni\'ni güncelleme hakkını saklı tutar.',
      'Güncel metin her zaman internet sitesi üzerinden yayımlanır.',
    ],
  },
];

export const KVKK_NAV = buildYasalNav(KVKK_SECTIONS);
