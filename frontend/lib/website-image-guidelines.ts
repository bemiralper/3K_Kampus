/** Kurumsal site görsel boyut önerileri — admin panelinde gösterilir */
export const WEBSITE_IMAGE_GUIDELINES = {
  hero: {
    label: 'Hero slayt görseli',
    size: '1920 × 1080 px (16:9)',
    maxMb: 5,
    hint: 'Tam 1920×1080 (16:9) yatay görsel yükleyin. Sitede kırpılmadan gösterilir; metin sol tarafta kalacağı için görselin sağ yarısı ferah olmalı.',
    field: 'gorsel' as const,
    aspectRatio: '16 / 9' as const,
  },
  duyuru: {
    label: 'Duyuru kapak görseli',
    size: '800 × 450 px (16:9)',
    maxMb: 5,
    hint: 'Kart üzerinde görünür. Başlık okunaklı kalacak şekilde net, yatay görsel tercih edin.',
    field: 'kapak_gorseli' as const,
  },
  sinav: {
    label: 'Sınav görseli',
    size: '1200 × 675 px (16:9 yatay)',
    maxMb: 5,
    hint: 'Yatay afiş veya yayın logosu. Görsel yalnızca sınav detay penceresinde gösterilir; takvimde görünmez. 16:9 oranında yükleyin, böylece pencerede bozulmadan görünür.',
    field: 'gorsel' as const,
    aspectRatio: '16 / 9' as const,
  },
};
