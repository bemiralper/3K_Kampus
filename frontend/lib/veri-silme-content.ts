import { DEFAULT_COMPANY_INFO } from '@/lib/company-info';
import type { YasalMetinMeta, YasalSection } from '@/lib/yasal-metin-types';
import { buildYasalNav } from '@/lib/yasal-metin-types';

export const VERI_SILME_META: YasalMetinMeta = {
  brand: '3K KAMPÜS',
  title: 'Veri Silme Talebi',
  lastUpdated: '01 / 08 / 2026',
  intro:
    '6698 sayılı KVKK kapsamında işlenen kişisel verilerinizin silinmesi, yok edilmesi veya anonim hâle getirilmesi için başvuru süreciniz.',
};

export function buildVeriSilmeSections(): YasalSection[] {
  const c = DEFAULT_COMPANY_INFO;
  return [
    {
      id: 'hak',
      number: 1,
      title: 'Veri Silme Talebinde Bulunma Hakkınız',
      paragraphs: [
        `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, ${c.ticari_unvan} ("${c.marka}") tarafından işlenen kişisel verilerinizin silinmesini, yok edilmesini veya anonim hâle getirilmesini her zaman talep edebilirsiniz.`,
      ],
    },
    {
      id: 'nasil',
      number: 2,
      title: 'Talebinizi Nasıl İletebilirsiniz?',
      paragraphs: [
        'Aşağıdaki başvuru formunu doldurarak veya aşağıdaki kanallardan bize ulaşarak talebinizi iletebilirsiniz.',
      ],
      bullets: [
        `E-posta: ${c.eposta} adresine "Veri Silme Talebi" konu başlığıyla yazın`,
        `Telefon: ${c.telefon}`,
        `Açık adres: ${c.adres}`,
      ],
      afterBullets: [
        'Başvurunuzda kimliğinizi doğrulayabilmemiz için ad-soyad, T.C. kimlik numarası (veya öğrenci/veli kaydınıza ait bilgi) ve size dönüş yapabileceğimiz bir iletişim bilgisi paylaşmanızı rica ederiz.',
      ],
    },
    {
      id: 'hangi',
      number: 3,
      title: 'Hangi Veriler Silinir?',
      paragraphs: [
        'Talebiniz üzerine; iletişim bilgileriniz (telefon, e-posta, WhatsApp mesaj geçmişi), platform kullanım kayıtlarınız ve sistemde tuttuğumuz diğer kişisel verileriniz silinir veya anonim hâle getirilir.',
      ],
    },
    {
      id: 'saklama',
      number: 4,
      title: 'Saklanması Gereken Veriler',
      paragraphs: [
        'Türk Ticaret Kanunu, Vergi Usul Kanunu ve ilgili mevzuat gereği; fatura, tahsilat ve muhasebe kayıtları gibi belgeler yasal saklama süreleri boyunca (genellikle 10 yıl) saklanmak zorundadır. Bu nitelikteki veriler, yasal süre dolmadan silinemez; bu veriler için talebiniz "işlemenin durdurulması / erişimin kısıtlanması" şeklinde uygulanır.',
      ],
    },
    {
      id: 'sure',
      number: 5,
      title: 'Talebiniz Ne Kadar Sürede Sonuçlanır?',
      paragraphs: [
        "Başvurunuz, KVKK'nın 13. maddesi uyarınca en kısa sürede ve en geç 30 gün içinde ücretsiz olarak sonuçlandırılır. İşlemin ayrıca bir maliyet gerektirmesi hâlinde, Kişisel Verileri Koruma Kurulu tarafından belirlenen tarifedeki ücret talep edilebilir.",
      ],
      inlineLinks: [
        {
          text: 'Detaylı bilgi için KVKK Aydınlatma Metni’ni inceleyebilirsiniz.',
          label: 'KVKK Aydınlatma Metni',
          href: '/yasal/kvkk',
        },
      ],
    },
  ];
}

export const VERI_SILME_SECTIONS = buildVeriSilmeSections();
export const VERI_SILME_NAV = buildYasalNav(VERI_SILME_SECTIONS);
