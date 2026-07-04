/** 3K Sistemi sayfası içerik yapısı */

import { DERS_FORMATLARI, DERS_FORMATLARI_HEADING } from '@/lib/ders-formatlari-content';

export const SISTEM_3K_HERO = {
  title: '3K Sistemi',
  subtitle: 'Geleceği Planlayan Bir Eğitim Yaklaşımı',
  intro: [
    'Her öğrencinin ihtiyacı farklıdır, ancak başarının temeli aynıdır.',
    'Nitelikli eğitim, verimli çalışma ve bireysel takip.',
    '5 kişilik grup dersleri ve birebir özel derslerle her öğrenciye en uygun modeli sunuyoruz.',
    '3K Kampüs, bu unsurları tek bir eğitim sistemi içinde bir araya getirir.',
  ],
  pillars: [
    { icon: 'graduation', label: '5 Kişilik Grup Dersleri', desc: 'Verimli sınıf ortamında sistemli eğitim', href: '#ders-formatlari' },
    { icon: 'user', label: 'Birebir Özel Ders', desc: 'Kişiye özel plan ve maksimum odak', href: '#ders-formatlari' },
    { icon: 'chart', label: 'Bireysel Takip', desc: 'Koçluk, analiz ve sürekli geri bildirim', href: '#kocluk' },
  ],
};

export const SISTEM_3K_SECTIONS = [
  {
    id: 'egitim',
    title: 'Eğitim Anlayışımız',
    icon: 'lightbulb',
    body: 'Her öğrencinin öğrenme hızı, çalışma alışkanlığı ve hedefi birbirinden farklıdır. Bu nedenle tüm öğrenciler için aynı program yerine, öğrencinin ihtiyaçlarına göre şekillenen dinamik bir eğitim sistemi uyguluyoruz.',
    lead: 'Amacımız yalnızca konuları tamamlamak değil;',
    bullets: [
      'Öğrencinin eksiklerini doğru analiz etmek',
      'Çalışma alışkanlığı kazandırmak',
      'Süreci düzenli takip etmek',
      'Motivasyonu korumak',
      'Hedefe kontrollü şekilde ilerlemesini sağlamaktır',
    ],
  },
  {
    id: 'ders-formatlari',
    navLabel: 'Ders Formatları',
    title: DERS_FORMATLARI_HEADING.title,
    icon: 'graduation',
    body: DERS_FORMATLARI_HEADING.subtitle,
    highlights: DERS_FORMATLARI.map(f => ({
      badge: f.badge,
      title: f.title,
      description: f.description,
      bullets: [...f.highlights],
      accent: f.accent,
    })),
    footer: 'Öğrencilerimiz yalnızca grup dersi, yalnızca özel ders veya her iki formatı birlikte tercih edebilir. Program, hedef ve eksiklere göre koçlarımız tarafından birlikte planlanır.',
  },
  {
    id: 'kurs',
    title: 'Kurs',
    icon: 'book',
    body: 'Alanında deneyimli öğretmen kadromuz tarafından hazırlanan programlarla öğrencilerimizin akademik gelişimini sistemli şekilde destekliyoruz. Temel eğitim modellerimiz 5 kişilik grup dersleri ve birebir özel derslerdir.',
    lead: 'Programlarımız;',
    tags: [
      '5 kişilik grup dersleri',
      'Birebir özel dersler',
      'LGS hazırlık',
      'YKS hazırlık',
      'Ara sınıf destek programları',
      'Yaz kursları',
      'Hızlandırma programları',
      'Kamp programları',
    ],
    footer: 'Dersler yalnızca anlatımla sınırlı kalmaz. Grup ve özel derslerde konu tekrarları, soru çözüm saatleri, etütler ve düzenli deneme sınavlarıyla öğrenme süreci sürekli desteklenir.',
  },
  {
    id: 'kutuphane',
    title: 'Kütüphane',
    icon: 'library',
    body: 'Başarının en önemli şartlarından biri düzenli çalışmadır. Sessiz, konforlu ve verimli çalışma ortamlarımız sayesinde öğrenciler planlı şekilde bireysel çalışmalarını gerçekleştirir.',
    footer: 'Kütüphane süreci yalnızca masa ve sandalye sunmaktan ibaret değildir. Öğrencilerin çalışma saatleri, hedefleri ve verimlilikleri takip edilir. Böylece disiplinli çalışma alışkanlığı kazanmaları desteklenir.',
  },
  {
    id: 'kocluk',
    title: 'Koçluk',
    icon: 'coach',
    body: 'Her öğrencinin yanında, eğitim sürecini yakından takip eden bir koç bulunur.',
    lead: 'Koçluk sistemi kapsamında;',
    bullets: [
      'Haftalık çalışma planları hazırlanır',
      'Günlük hedefler belirlenir',
      'Deneme sonuçları analiz edilir',
      'Eksik konular tespit edilir',
      'Motivasyon görüşmeleri yapılır',
      'Veli bilgilendirmeleri düzenli olarak gerçekleştirilir',
    ],
    footer: 'Koçluk sayesinde öğrenci yalnızca ders çalışan değil; hedeflerini bilen, plan yapan ve gelişimini takip eden birey hâline gelir.',
  },
  {
    id: 'dijital',
    title: 'Dijital Eğitim Sistemi',
    icon: 'device',
    body: "3K Kampüs'te eğitim süreci yalnızca sınıfta değil, dijital ortamda da devam eder. Geliştirdiğimiz dijital platform sayesinde süreç kesintisiz yönetilir.",
    columns: [
      {
        title: 'Öğrenciler',
        items: [
          'Ödevlerini takip edebilir',
          'Kaynaklarına ulaşabilir',
          'Deneme sonuçlarını görüntüleyebilir',
          'Akademik gelişimlerini inceleyebilir',
          'Çalışma planlarını görebilir',
          'Koçlarıyla iletişim kurabilir',
        ],
      },
      {
        title: 'Veliler',
        items: [
          'Devam durumunu',
          'Ödev takibini',
          'Deneme sonuçlarını',
          'Görüşmeleri',
          'Duyuruları',
        ],
        footer: 'tek bir platform üzerinden kolayca takip edebilir.',
      },
    ],
  },
  {
    id: 'olcme',
    title: 'Ölçme ve Değerlendirme',
    icon: 'analytics',
    body: 'Öğrencinin gelişimi yalnızca sınav puanıyla değerlendirilmez.',
    footer: 'Düzenli deneme sınavları, konu analizleri, kazanım değerlendirmeleri ve bireysel performans raporları ile gelişim sürekli izlenir. Elde edilen veriler doğrultusunda öğrencinin çalışma planı güncellenir ve eksik olduğu alanlara yönelik destek programları hazırlanır.',
  },
  {
    id: 'veli',
    title: 'Veli İletişimi',
    icon: 'chat',
    body: 'Eğitim sürecinin en önemli paydaşlarından biri velilerimizdir. Bu nedenle öğrencilerimizin akademik gelişimi düzenli olarak velilerimizle paylaşılır.',
    footer: 'Koç görüşmeleri, deneme analizleri, duyurular ve önemli bilgilendirmeler zamanında iletilerek eğitim sürecinde güçlü bir iletişim sağlanır.',
  },
];

export const SISTEM_3K_CLOSING = {
  title: 'Hedefimiz',
  paragraphs: [
    'Her öğrencinin potansiyeline ulaşabilmesi için planlı, disiplinli ve sürdürülebilir bir eğitim ortamı sunuyoruz.',
    'Amacımız yalnızca sınav başarısı değil; sorumluluk sahibi, hedef belirleyebilen, zamanı doğru yöneten ve öğrenmeyi yaşam boyu sürdürebilen bireyler yetiştirmektir.',
    '3K Kampüs olarak öğrencilerimizin eğitim yolculuğunda güvenilir bir rehber olmayı ve başarıya giden süreçte her zaman yanlarında bulunmayı sürdürüyoruz.',
  ],
};

export const SISTEM_3K_NAV = SISTEM_3K_SECTIONS.map(s => ({
  id: s.id,
  label: 'navLabel' in s && s.navLabel ? s.navLabel : s.title,
}));
