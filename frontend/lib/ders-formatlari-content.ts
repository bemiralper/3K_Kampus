/** Grup ve özel ders formatları — anasayfa + 3K Sistemi ortak içerik */

export const DERS_FORMATLARI_HEADING = {
  eyebrow: 'Ders Formatlarımız',
  title: '5 Kişilik Grup Dersleri & Birebir Özel Ders',
  subtitle:
    'Her öğrencinin ihtiyacına uygun iki farklı eğitim modeli sunuyoruz: verimli grup çalışması ve tam odaklı birebir destek.',
};

export const DERS_FORMATLARI = [
  {
    id: 'grup',
    badge: 'Grup Dersi',
    title: '5 Kişilik Grup Dersleri',
    accent: '#0262a7',
    description:
      'En fazla 5 öğrenciden oluşan sınıflarda, interaktif ve disiplinli bir eğitim ortamı sunuyoruz. Kalabalık sınıfların aksine her öğrenci söz hakkına sahiptir.',
    highlights: [
      'Maksimum 5 kişilik sınıflar',
      'Konu anlatımı + soru çözümü',
      'Deneme analizi ve eksik takibi',
      'LGS & YKS hazırlık programları',
    ],
  },
  {
    id: 'ozel',
    badge: 'Özel Ders',
    title: 'Birebir Özel Dersler',
    accent: '#1e3a5f',
    description:
      'Öğrencinin eksiklerine, hedefine ve öğrenme hızına göre planlanan birebir derslerle maksimum verim hedeflenir. Tamamen kişiye özel program uygulanır.',
    highlights: [
      'Birebir öğretmen eşleşmesi',
      'Kişiye özel konu ve soru planı',
      'Esnek ders saatleri',
      'Grup dersiyle birlikte alınabilir',
    ],
  },
] as const;
