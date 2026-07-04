"""
Management command: TYT Matematik kazanımlarını sisteme yükler
ve TYT sınavlarındaki Matematik bölümüne bağlar.

Kullanım:
  python manage.py seed_matematik_kazanimlari
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.coaching.olcme_degerlendirme.models.curriculum import (
    Subject, Topic, Outcome, SubOutcome,
)
from apps.coaching.olcme_degerlendirme.models.exam import ExamSection


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TYT MATEMATİK KAZANIM VERİSİ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MATEMATIK_DATA = [
    {
        "code": "9.1",
        "name": "MANTIK",
        "outcomes": [
            {
                "code": "9.1.1",
                "text": "Mantıksal önermeleri tanır ve değerlendirir.",
                "sub_outcomes": [
                    {"code": "9.1.1.1", "text": "Önermeleri doğru/yanlış değerleri ile belirler."},
                    {"code": "9.1.1.2", "text": "Önermeler arasında bağlaç ilişkilerini (ve, veya, değil) kullanır."},
                    {"code": "9.1.1.3", "text": "De Morgan kurallarını uygular."},
                    {"code": "9.1.1.4", "text": "Basit mantıksal çıkarım yapar."},
                ],
            },
        ],
    },
    {
        "code": "9.2",
        "name": "KÜMELER",
        "outcomes": [
            {
                "code": "9.2.1",
                "text": "Küme kavramını açıklar ve gösterir.",
                "sub_outcomes": [
                    {"code": "9.2.1.1", "text": "Küme elemanlarını listeler."},
                    {"code": "9.2.1.2", "text": "Küme gösterimlerini (liste, tanım, grafik) kullanır."},
                    {"code": "9.2.1.3", "text": "Alt küme ve eşit küme kavramlarını tanır."},
                ],
            },
            {
                "code": "9.2.2",
                "text": "Küme işlemleri yapar.",
                "sub_outcomes": [
                    {"code": "9.2.2.1", "text": "Birleşim, kesişim, fark ve tümleyeni uygular."},
                    {"code": "9.2.2.2", "text": "Venn diyagramını yorumlar."},
                    {"code": "9.2.2.3", "text": "Kartezyen çarpım ile eleman çiftlerini belirler."},
                ],
            },
        ],
    },
    {
        "code": "9.3",
        "name": "GERÇEK SAYILAR",
        "outcomes": [
            {
                "code": "9.3.1",
                "text": "Gerçek sayı kümelerini tanır ve aralarındaki ilişkileri açıklar.",
                "sub_outcomes": [
                    {"code": "9.3.1.1", "text": "Doğal, tam, rasyonel ve irrasyonel sayıları ayırt eder."},
                    {"code": "9.3.1.2", "text": "Sayı kümeleri arasındaki kapsama ilişkisini gösterir."},
                    {"code": "9.3.1.3", "text": "Gerçek sayıları sayı doğrusunda gösterir."},
                ],
            },
            {
                "code": "9.3.2",
                "text": "Gerçek sayılarda işlem yapar.",
                "sub_outcomes": [
                    {"code": "9.3.2.1", "text": "Dört işlem uygular."},
                    {"code": "9.3.2.2", "text": "İşlem önceliğini uygular."},
                    {"code": "9.3.2.3", "text": "Üslü ve köklü ifadeleri gerçek sayılar kümesinde yorumlar."},
                ],
            },
        ],
    },
    {
        "code": "9.4",
        "name": "BÖLÜNEBİLME",
        "outcomes": [
            {
                "code": "9.4.1",
                "text": "Bölünebilme kurallarını kullanır.",
                "sub_outcomes": [
                    {"code": "9.4.1.1", "text": "2, 3, 4, 5, 6, 8, 9 ve 10 ile bölünebilme kurallarını uygular."},
                    {"code": "9.4.1.2", "text": "Bölünebilme kurallarını problem çözümünde kullanır."},
                ],
            },
            {
                "code": "9.4.2",
                "text": "Bir sayının bölenlerini ve katlarını belirler.",
                "sub_outcomes": [
                    {"code": "9.4.2.1", "text": "Pozitif bölenleri listeler."},
                    {"code": "9.4.2.2", "text": "Asal çarpanlarına ayırır."},
                ],
            },
        ],
    },
    {
        "code": "9.5",
        "name": "EBOB – EKOK",
        "outcomes": [
            {
                "code": "9.5.1",
                "text": "İki doğal sayının EBOB ve EKOK'unu bulur.",
                "sub_outcomes": [
                    {"code": "9.5.1.1", "text": "Asal çarpanlara ayırma yöntemiyle EBOB bulur."},
                    {"code": "9.5.1.2", "text": "Asal çarpanlara ayırma yöntemiyle EKOK bulur."},
                    {"code": "9.5.1.3", "text": "EBOB × EKOK ilişkisini kullanır."},
                ],
            },
            {
                "code": "9.5.2",
                "text": "EBOB ve EKOK'u problem çözümünde kullanır.",
                "sub_outcomes": [
                    {"code": "9.5.2.1", "text": "Ortak bölme problemlerini çözer."},
                    {"code": "9.5.2.2", "text": "Periyodik tekrar problemlerini çözer."},
                ],
            },
        ],
    },
    {
        "code": "9.6",
        "name": "RASYONEL SAYILAR",
        "outcomes": [
            {
                "code": "9.6.1",
                "text": "Rasyonel sayılarla işlem yapar.",
                "sub_outcomes": [
                    {"code": "9.6.1.1", "text": "Rasyonel sayıları sadeleştirir."},
                    {"code": "9.6.1.2", "text": "Toplama ve çıkarma işlemi yapar."},
                    {"code": "9.6.1.3", "text": "Çarpma ve bölme işlemi yapar."},
                ],
            },
            {
                "code": "9.6.2",
                "text": "Rasyonel sayıları farklı gösterimlerle ifade eder.",
                "sub_outcomes": [
                    {"code": "9.6.2.1", "text": "Ondalık gösterimi kesre dönüştürür."},
                    {"code": "9.6.2.2", "text": "Devirli ondalık sayıları kesre çevirir."},
                ],
            },
        ],
    },
    {
        "code": "9.7",
        "name": "BİRİNCİ DERECEDEN DENKLEMLER",
        "outcomes": [
            {
                "code": "9.7.1",
                "text": "Birinci dereceden bir bilinmeyenli denklemleri çözer.",
                "sub_outcomes": [
                    {"code": "9.7.1.1", "text": "Denklem kurar."},
                    {"code": "9.7.1.2", "text": "Denklem çözer ve çözüm kümesini yazar."},
                    {"code": "9.7.1.3", "text": "Problemleri denklem kurarak çözer."},
                ],
            },
            {
                "code": "9.7.2",
                "text": "Denklem çözümünü kontrol eder.",
                "sub_outcomes": [
                    {"code": "9.7.2.1", "text": "Çözümü yerine koyarak doğrular."},
                ],
            },
        ],
    },
    {
        "code": "9.8",
        "name": "BİRİNCİ DERECEDEN EŞİTSİZLİKLER",
        "outcomes": [
            {
                "code": "9.8.1",
                "text": "Birinci dereceden bir bilinmeyenli eşitsizlikleri çözer.",
                "sub_outcomes": [
                    {"code": "9.8.1.1", "text": "Eşitsizlik kurar."},
                    {"code": "9.8.1.2", "text": "Eşitsizliği çözer."},
                    {"code": "9.8.1.3", "text": "Çözüm kümesini sayı doğrusunda gösterir."},
                ],
            },
            {
                "code": "9.8.2",
                "text": "Eşitsizlikleri problem çözümünde kullanır.",
                "sub_outcomes": [
                    {"code": "9.8.2.1", "text": "Günlük hayat problemlerini eşitsizlik modeliyle çözer."},
                ],
            },
        ],
    },
    {
        "code": "9.9",
        "name": "MUTLAK DEĞER",
        "outcomes": [
            {
                "code": "9.9.1",
                "text": "Mutlak değerin anlamını açıklar.",
                "sub_outcomes": [
                    {"code": "9.9.1.1", "text": "Mutlak değeri sayı doğrusunda yorumlar."},
                    {"code": "9.9.1.2", "text": "|x| ifadesinin tanımını yapar."},
                ],
            },
            {
                "code": "9.9.2",
                "text": "Mutlak değerli ifadelerle işlem yapar.",
                "sub_outcomes": [
                    {"code": "9.9.2.1", "text": "Mutlak değerli denklemleri çözer."},
                    {"code": "9.9.2.2", "text": "Mutlak değerli eşitsizlikleri çözer."},
                    {"code": "9.9.2.3", "text": "Parçalı durum analizini yapar."},
                ],
            },
        ],
    },
    {
        "code": "9.10",
        "name": "ÜSLÜ SAYILAR",
        "outcomes": [
            {
                "code": "9.10.1",
                "text": "Üslü ifadelerin özelliklerini kullanır.",
                "sub_outcomes": [
                    {"code": "9.10.1.1", "text": "Üslü sayılarda çarpma ve bölme kurallarını uygular."},
                    {"code": "9.10.1.2", "text": "Üssün üssü kuralını uygular."},
                    {"code": "9.10.1.3", "text": "Negatif üs kavramını açıklar ve işlem yapar."},
                    {"code": "9.10.1.4", "text": "Sıfırıncı kuvveti yorumlar."},
                    {"code": "9.10.1.5", "text": "Bilimsel gösterimi kullanır."},
                ],
            },
        ],
    },
    {
        "code": "9.11",
        "name": "KÖKLÜ SAYILAR",
        "outcomes": [
            {
                "code": "9.11.1",
                "text": "Köklü ifadelerin özelliklerini kullanır.",
                "sub_outcomes": [
                    {"code": "9.11.1.1", "text": "Kareköklü ifadelerde çarpma ve bölme işlemi yapar."},
                    {"code": "9.11.1.2", "text": "Köklü ifadeyi sadeleştirir."},
                    {"code": "9.11.1.3", "text": "Köklü ifadeyi rasyonel sayıya dönüştürür."},
                    {"code": "9.11.1.4", "text": "Paydada kök bulunan ifadeyi rasyonelleştirir."},
                ],
            },
        ],
    },
    {
        "code": "9.12",
        "name": "ÇARPANLARA AYIRMA",
        "outcomes": [
            {
                "code": "9.12.1",
                "text": "Cebirsel ifadeleri çarpanlara ayırır.",
                "sub_outcomes": [
                    {"code": "9.12.1.1", "text": "Ortak çarpan parantezine alma yapar."},
                    {"code": "9.12.1.2", "text": "İki kare farkını uygular."},
                    {"code": "9.12.1.3", "text": "Tam kare özdeşlikleri kullanır."},
                    {"code": "9.12.1.4", "text": "Gruplama yöntemiyle çarpanlara ayırır."},
                ],
            },
        ],
    },
    {
        "code": "9.13",
        "name": "ORAN ORANTI",
        "outcomes": [
            {
                "code": "9.13.1",
                "text": "Oran ve orantı kavramlarını açıklar ve uygular.",
                "sub_outcomes": [
                    {"code": "9.13.1.1", "text": "Oranı yorumlar ve sadeleştirir."},
                    {"code": "9.13.1.2", "text": "Doğru orantı kurar."},
                    {"code": "9.13.1.3", "text": "Ters orantı kurar."},
                    {"code": "9.13.1.4", "text": "Orantı problemleri çözer."},
                ],
            },
        ],
    },
    {
        "code": "9.14",
        "name": "SAYI VE KESİR PROBLEMLERİ",
        "outcomes": [
            {
                "code": "9.14.1",
                "text": "Sayı ve kesir problemlerini çözer.",
                "sub_outcomes": [
                    {"code": "9.14.1.1", "text": "Kesirlerle problem modeli kurar."},
                    {"code": "9.14.1.2", "text": "Parça–bütün ilişkisi kurar."},
                    {"code": "9.14.1.3", "text": "Denklem kurarak çözüme ulaşır."},
                ],
            },
        ],
    },
    {
        "code": "9.15",
        "name": "YAŞ PROBLEMLERİ",
        "outcomes": [
            {
                "code": "9.15.1",
                "text": "Yaş problemlerini cebirsel modelleme ile çözer.",
                "sub_outcomes": [
                    {"code": "9.15.1.1", "text": "Geçmiş ve gelecek yaş ilişkisi kurar."},
                    {"code": "9.15.1.2", "text": "Denklem kurar ve çözer."},
                    {"code": "9.15.1.3", "text": "Orantısal yaş ilişkisini yorumlar."},
                ],
            },
        ],
    },
    {
        "code": "9.16",
        "name": "YÜZDE, KÂR – ZARAR PROBLEMLERİ",
        "outcomes": [
            {
                "code": "9.16.1",
                "text": "Yüzde ile ilgili problemleri çözer.",
                "sub_outcomes": [
                    {"code": "9.16.1.1", "text": "Yüzde hesaplaması yapar."},
                    {"code": "9.16.1.2", "text": "Artış ve azalış oranını hesaplar."},
                    {"code": "9.16.1.3", "text": "Bileşik yüzde değişimini yorumlar."},
                ],
            },
            {
                "code": "9.16.2",
                "text": "Kâr – zarar problemlerini çözer.",
                "sub_outcomes": [
                    {"code": "9.16.2.1", "text": "Maliyet, satış ve kâr ilişkisini kurar."},
                    {"code": "9.16.2.2", "text": "Kâr ve zarar yüzdesini hesaplar."},
                    {"code": "9.16.2.3", "text": "İskonto problemlerini çözer."},
                ],
            },
        ],
    },
    {
        "code": "9.17",
        "name": "KARIŞIM PROBLEMLERİ",
        "outcomes": [
            {
                "code": "9.17.1",
                "text": "Karışım problemlerini çözer.",
                "sub_outcomes": [
                    {"code": "9.17.1.1", "text": "Yüzde konsantrasyon modeli kurar."},
                    {"code": "9.17.1.2", "text": "Denklem ile karışım miktarını bulur."},
                    {"code": "9.17.1.3", "text": "Saf madde miktarını hesaplar."},
                ],
            },
        ],
    },
    {
        "code": "9.18",
        "name": "İŞÇİ PROBLEMLERİ",
        "outcomes": [
            {
                "code": "9.18.1",
                "text": "İş–zaman ilişkisini kullanarak problem çözer.",
                "sub_outcomes": [
                    {"code": "9.18.1.1", "text": "Birim iş kavramını açıklar."},
                    {"code": "9.18.1.2", "text": "İşçi sayısı ile süre arasındaki ters orantıyı kurar."},
                    {"code": "9.18.1.3", "text": "Ortak iş problemlerini çözer."},
                ],
            },
        ],
    },
    {
        "code": "9.19",
        "name": "HAREKET PROBLEMLERİ",
        "outcomes": [
            {
                "code": "9.19.1",
                "text": "Hareket problemlerini çözer.",
                "sub_outcomes": [
                    {"code": "9.19.1.1", "text": "Yol = Hız × Zaman modelini kullanır."},
                    {"code": "9.19.1.2", "text": "Karşılaşma problemleri çözer."},
                    {"code": "9.19.1.3", "text": "Aynı yönlü hareket problemlerini çözer."},
                    {"code": "9.19.1.4", "text": "Ortalama hız hesaplar."},
                ],
            },
        ],
    },
    {
        "code": "9.20",
        "name": "RUTİN OLMAYAN PROBLEMLER",
        "outcomes": [
            {
                "code": "9.20.1",
                "text": "Rutin olmayan problemleri çözer.",
                "sub_outcomes": [
                    {"code": "9.20.1.1", "text": "Standart formüller veya rutin yöntemler yetmediğinde çözüm stratejisi geliştirir."},
                    {"code": "9.20.1.2", "text": "Birden fazla konu veya kazanımı birleştirir."},
                    {"code": "9.20.1.3", "text": "Günlük yaşam veya alışılmışın dışında problemleri yorumlar."},
                    {"code": "9.20.1.4", "text": "Alternatif çözüm yollarını değerlendirir."},
                ],
            },
        ],
    },
    {
        "code": "9.21",
        "name": "VERİ VE GRAFİKLER",
        "outcomes": [
            {
                "code": "9.21.1",
                "text": "Veri analizi yapar.",
                "sub_outcomes": [
                    {"code": "9.21.1.1", "text": "Aritmetik ortalamayı hesaplar."},
                    {"code": "9.21.1.2", "text": "Medyan ve modu bulur."},
                    {"code": "9.21.1.3", "text": "Veri dağılımını yorumlar."},
                ],
            },
            {
                "code": "9.21.2",
                "text": "Grafik yorumlar.",
                "sub_outcomes": [
                    {"code": "9.21.2.1", "text": "Sütun grafiğini yorumlar."},
                    {"code": "9.21.2.2", "text": "Çizgi grafiğini yorumlar."},
                    {"code": "9.21.2.3", "text": "Daire grafiğini yorumlar."},
                ],
            },
        ],
    },
    {
        "code": "9.22",
        "name": "FONKSİYONLAR",
        "outcomes": [
            {
                "code": "9.22.1",
                "text": "Fonksiyon kavramını tanır.",
                "sub_outcomes": [
                    {"code": "9.22.1.1", "text": "Fonksiyon tanımını yapar."},
                    {"code": "9.22.1.2", "text": "Fonksiyon grafiğini yorumlar."},
                    {"code": "9.22.1.3", "text": "Fonksiyonun değer kümesini ve tanım kümesini belirler."},
                ],
            },
            {
                "code": "9.22.2",
                "text": "Fonksiyon işlemleri uygular.",
                "sub_outcomes": [
                    {"code": "9.22.2.1", "text": "Fonksiyonlarda değer bulur."},
                    {"code": "9.22.2.2", "text": "Bileşke fonksiyonları çözer."},
                    {"code": "9.22.2.3", "text": "Fonksiyon eşitliklerini yorumlar."},
                ],
            },
        ],
    },
    {
        "code": "9.23",
        "name": "POLİNOMLAR",
        "outcomes": [
            {
                "code": "9.23.1",
                "text": "Polinomları tanır ve işlemler yapar.",
                "sub_outcomes": [
                    {"code": "9.23.1.1", "text": "Polinomların terim, katsayı ve derecesini belirler."},
                    {"code": "9.23.1.2", "text": "Polinomları toplar ve çıkarır."},
                    {"code": "9.23.1.3", "text": "Polinomları çarpar."},
                    {"code": "9.23.1.4", "text": "Polinom bölme (kısmi) uygular."},
                    {"code": "9.23.1.5", "text": "Özdeşlikleri ve çarpanlara ayırmayı polinomlara uygular."},
                ],
            },
        ],
    },
    {
        "code": "9.24",
        "name": "İKİNCİ DERECEDEN DENKLEMLER",
        "outcomes": [
            {
                "code": "9.24.1",
                "text": "İkinci dereceden denklemleri çözer.",
                "sub_outcomes": [
                    {"code": "9.24.1.1", "text": "Faktörleme yöntemi ile çözer."},
                    {"code": "9.24.1.2", "text": "Diskriminant kullanarak kökleri bulur."},
                    {"code": "9.24.1.3", "text": "Tam kareye tamamlama yöntemi uygular."},
                    {"code": "9.24.1.4", "text": "Denklem köklerinin toplamı ve çarpımını yorumlar."},
                ],
            },
            {
                "code": "9.24.2",
                "text": "İkinci dereceden denklemleri problem çözümünde uygular.",
                "sub_outcomes": [
                    {"code": "9.24.2.1", "text": "Alan, hız ve yaş problemlerini cebirsel modelleme ile çözer."},
                    {"code": "9.24.2.2", "text": "Günlük yaşam problemlerinde kökleri yorumlar."},
                ],
            },
        ],
    },
    {
        "code": "9.25",
        "name": "SAYMA, PERMÜTASYON VE KOMBİNASYON",
        "outcomes": [
            {
                "code": "9.25.1",
                "text": "Sayma, permütasyon ve kombinasyon kavramlarını uygular.",
                "sub_outcomes": [
                    {"code": "9.25.1.1", "text": "Temel çarpan kuralını uygular."},
                    {"code": "9.25.1.2", "text": "Tekrarlı ve tekrarsız durumları ayırır."},
                    {"code": "9.25.1.3", "text": "Permütasyon problemleri çözer."},
                    {"code": "9.25.1.4", "text": "Kombinasyon problemleri çözer."},
                ],
            },
            {
                "code": "9.25.2",
                "text": "Olasılık problemleri çözer.",
                "sub_outcomes": [
                    {"code": "9.25.2.1", "text": "Basit olasılığı hesaplar."},
                    {"code": "9.25.2.2", "text": "Deney sayısı ile olasılık ilişkisini yorumlar."},
                    {"code": "9.25.2.3", "text": "Karışık olasılık problemlerini çözer."},
                ],
            },
        ],
    },
]


class Command(BaseCommand):
    help = 'TYT Matematik kazanımlarını sisteme yükler ve TYT sınavındaki Matematik bölümüne bağlar.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('TYT Matematik kazanımları yükleniyor...'))

        with transaction.atomic():
            # 1. Matematik dersini oluştur veya getir
            subject, created = Subject.objects.get_or_create(
                code='MAT_TYT',
                defaults={
                    'name': 'Matematik',
                    'display_name': 'Matematik (TYT)',
                    'exam_type_filter': 'YKS_TYT',
                    'order': 1,
                },
            )

            if not created:
                self.stdout.write(self.style.WARNING(
                    f'Matematik dersi zaten mevcut (id={subject.id}). Mevcut kazanımlar korunacak.'
                ))
                # Eğer zaten varsa ve konuları doluysa, üzerine yazmamak için kontrol et
                if subject.topics.count() > 0:
                    self.stdout.write(self.style.WARNING(
                        f'Dersin zaten {subject.topics.count()} konusu var. '
                        'Mevcut veriler temizleniyor ve yeniden yükleniyor...'
                    ))
                    subject.topics.all().delete()

            self.stdout.write(self.style.SUCCESS(
                f'Ders: {subject.name} (id={subject.id}, code={subject.code})'
            ))

            # 2. Konuları, kazanımları ve alt kazanımları yükle
            topic_count = 0
            outcome_count = 0
            sub_outcome_count = 0

            for t_idx, t_data in enumerate(MATEMATIK_DATA):
                topic = Topic.objects.create(
                    subject=subject,
                    code=t_data['code'],
                    name=t_data['name'],
                    order=t_idx,
                )
                topic_count += 1

                for o_idx, o_data in enumerate(t_data['outcomes']):
                    outcome = Outcome.objects.create(
                        topic=topic,
                        code=o_data['code'],
                        text=o_data['text'],
                        order=o_idx,
                    )
                    outcome_count += 1

                    for s_idx, s_data in enumerate(o_data.get('sub_outcomes', [])):
                        SubOutcome.objects.create(
                            outcome=outcome,
                            code=s_data['code'],
                            text=s_data['text'],
                            order=s_idx,
                        )
                        sub_outcome_count += 1

            self.stdout.write(self.style.SUCCESS(
                f'\n✅ Yükleme tamamlandı!\n'
                f'   📚 Konu sayısı:        {topic_count}\n'
                f'   🎯 Kazanım sayısı:     {outcome_count}\n'
                f'   📝 Alt kazanım sayısı: {sub_outcome_count}\n'
            ))

            # 3. TYT sınavlarındaki Matematik bölümlerini bu derse bağla
            linked = ExamSection.objects.filter(
                name__icontains='matematik',
                exam__exam_type='YKS_TYT',
                subject__isnull=True,
            ).update(subject=subject)

            if linked:
                self.stdout.write(self.style.SUCCESS(
                    f'🔗 {linked} adet TYT sınav bölümü Matematik dersine bağlandı.'
                ))
            else:
                self.stdout.write(self.style.NOTICE(
                    '⚠️  Bağlanacak TYT Matematik bölümü bulunamadı. '
                    'Sınav oluşturulduğunda manuel bağlama yapabilirsiniz.'
                ))

            self.stdout.write(self.style.SUCCESS('\n🎉 İşlem tamamlandı!'))
