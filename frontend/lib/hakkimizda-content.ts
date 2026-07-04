/** Hakkımızda sayfası içerik yapısı */

export const HAKKIMIZDA_META = {
  brand: '3K KAMPÜS',
  title: 'Hakkımızda',
  subtitle: 'Geleceğe Değer Katan Bir Eğitim Yolculuğu',
  intro: [
    '3K Kampüs, her öğrencinin doğru rehberlik, planlı çalışma ve nitelikli eğitimle hedeflerine ulaşabileceğine inanan bir eğitim merkezidir.',
    'Eğitim anlayışımız; yalnızca sınavlara hazırlık sürecini değil, öğrencinin akademik gelişimini, çalışma disiplinini ve kişisel sorumluluk bilincini birlikte geliştirmeyi hedefler. Çünkü gerçek başarının, yalnızca bilgiyle değil; doğru planlama, istikrarlı çalışma ve sürekli rehberlikle mümkün olduğuna inanıyoruz.',
  ],
};

export const THREE_K_PILLARS = [
  {
    letter: 'K',
    title: 'Kurs',
    desc: 'Güçlü akademik eğitim',
    icon: 'book',
  },
  {
    letter: 'K',
    title: 'Kütüphane',
    desc: 'Verimli ve disiplinli çalışma ortamı',
    icon: 'library',
  },
  {
    letter: 'K',
    title: 'Koçluk',
    desc: 'Öğrenciyi bireysel olarak takip eden rehberlik sistemi',
    icon: 'coach',
  },
] as const;

export const HAKKIMIZDA_SECTIONS = [
  {
    id: 'neden',
    number: 1,
    title: 'Neden 3K Kampüs?',
    lead: 'İsmimizi oluşturan 3K, eğitim anlayışımızın temelini oluşturur:',
    footer:
      'Bu üç temel unsur, öğrencilerimizin ihtiyaç duyduğu desteği tek çatı altında sunan bütüncül bir eğitim modelini oluşturur.',
    showPillars: true,
  },
  {
    id: 'ogrenci',
    number: 2,
    title: 'Öğrenci Merkezli Yaklaşım',
    paragraphs: [
      'Her öğrencinin öğrenme biçimi, hedefi ve gelişim süreci birbirinden farklıdır.',
      'Bu nedenle standart çözümler yerine öğrenciyi tanımayı, güçlü yönlerini desteklemeyi ve gelişime açık alanlarını doğru analiz etmeyi önemsiyoruz.',
      'Amacımız yalnızca sınav başarısı elde etmek değil; planlı çalışan, sorumluluk alan, hedef belirleyen ve kendi gelişimini yönetebilen bireyler yetiştirmektir.',
    ],
  },
  {
    id: 'guven',
    number: 3,
    title: 'Güvene Dayalı Eğitim',
    paragraphs: [
      'Başarılı bir eğitim sürecinin temelinde güven vardır.',
      'Öğrencilerimizle, velilerimizle ve eğitim kadromuzla açık iletişim kurmayı; şeffaf, ulaşılabilir ve çözüm odaklı bir yaklaşım benimsemeyi ilke ediniyoruz.',
      'Velilerimizi yalnızca sonuçlardan haberdar eden değil, eğitim sürecinin doğal bir parçası hâline getiren bir anlayışla çalışıyoruz.',
    ],
  },
  {
    id: 'gelisim',
    number: 4,
    title: 'Sürekli Gelişim',
    paragraphs: [
      'Eğitim dünyası sürekli değişiyor; biz de bu değişimi yakından takip ediyoruz.',
      'Güncel öğretim yöntemleri, teknolojik altyapılar ve dijital çözümlerle eğitim süreçlerimizi sürekli geliştiriyor, öğrencilerimize çağın ihtiyaçlarına uygun bir öğrenme ortamı sunuyoruz.',
    ],
  },
];

export const VISION_MISSION = {
  vision: {
    title: 'Vizyonumuz',
    text: 'Öğrencilerin akademik başarılarının yanında; öğrenmeyi seven, sorumluluk sahibi, hedef odaklı ve yaşam boyu gelişime açık bireyler olarak yetişmelerine katkı sağlayan, güvenilir ve yenilikçi bir eğitim kurumu olmak.',
  },
  mission: {
    title: 'Misyonumuz',
    text: 'Nitelikli eğitim, planlı çalışma ortamı ve bireysel rehberlik anlayışını bir araya getirerek her öğrencinin potansiyelini ortaya çıkarmasına destek olmak; ailelerimizle iş birliği içinde, sürdürülebilir başarıya ulaşan bireyler yetiştirmek.',
  },
};

export const VALUES = [
  'Öğrenci odaklı yaklaşım',
  'Güven ve şeffaflık',
  'Akademik kalite',
  'Sürekli gelişim',
  'Planlı çalışma kültürü',
  'Etik değerlere bağlılık',
  'Sorumluluk bilinci',
  'İş birliği ve iletişim',
];

export const HAKKIMIZDA_CLOSING = {
  title: 'Birlikte Başarıya',
  paragraphs: [
    '3K Kampüs olarak, her öğrencinin potansiyeline ulaşabileceğine inanıyor; bu yolculukta bilgiyle, disiplinle ve doğru rehberlikle onların yanında olmaya devam ediyoruz.',
    'Çünkü bizim için eğitim, yalnızca bugünün başarısını değil, geleceğin güçlü bireylerini inşa etmektir.',
  ],
};

export const HAKKIMIZDA_NAV = [
  { id: 'neden', label: 'Neden 3K?' },
  { id: 'ogrenci', label: 'Öğrenci Merkezli' },
  { id: 'guven', label: 'Güven' },
  { id: 'gelisim', label: 'Sürekli Gelişim' },
  { id: 'vizyon', label: 'Vizyon & Misyon' },
  { id: 'degerler', label: 'Değerlerimiz' },
  { id: 'kapanis', label: 'Birlikte Başarıya' },
];
