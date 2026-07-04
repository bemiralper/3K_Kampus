'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TOOLTIP AÇIKLAMALARI                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

export const TIPS: Record<string, string> = {
  tahminiSiralama: '2024 YKS yerleştirme sonuçları referans alınarak lineer interpolasyon yöntemiyle hesaplanmıştır. Gerçek sınav ortamındaki öğrenci popülasyonunu yansıtmaz; yalnızca tahmini bir göstergedir.',
  yuzdelikDilim: 'Kurum içindeki öğrencilerin kaçını geçtiğini gösterir. Örn: %75 = öğrencilerin %75\'inden daha iyi performans.',
  medyan: 'Ortanca değer. Tüm öğrenciler sıralandığında tam ortadaki değer. Ortalamadan farklı olarak uç değerlerden etkilenmez.',
  stdSapma: 'Verilerin ortalamadan ne kadar uzaklaştığını gösterir. Düşük = homojen grup (herkes benzer seviyede), Yüksek = heterojen grup (seviye farkı çok).',
  ayirtEdicilik: 'Üst %27 ile alt %27 gruplarının doğru cevap oranları farkı. ≥0.30 iyi ayırt edici, 0.15–0.30 orta, <0.15 zayıf ayırt edici.',
  zorluk: 'Doğru cevap yüzdesine göre: <%30 Zor, %30–%70 Orta, >%70 Kolay.',
  basariYuzdesi: 'Toplam soru sayısının %50\'si kadar veya daha fazla net yapan öğrenci oranı.',
  verimlilik: 'Net / Soru Sayısı × 100. Alan/dersteki soruların ne kadarını netlediğini gösterir.',
  bosPotansiyel: 'Boş bırakılan soruların ¼\'ü oranında potansiyel net kazancı. Tüm boşları işaretleseydi rastgele ¼\'ünü doğru bilirdi varsayımı.',
  hataOrani: 'Yanlış / (Doğru + Yanlış) × 100. Cevaplanan soruların ne kadarının yanlış olduğu.',
  dogrulukOrani: 'Doğru / (Doğru + Yanlış) × 100. Cevaplanan soruların ne kadarının doğru olduğu. Boş bırakılanlar dahil değildir.',
  diffKurum: 'Öğrencinin bu alan/dersteki neti ile kurum ortalaması arasındaki fark.',
  diffSinif: 'Öğrencinin bu alan/dersteki neti ile sınıf ortalaması arasındaki fark.',
};

export default function InfoTip({ tip }: { tip: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (show) { setShow(false); return; }
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.top - 8, left: r.left + r.width / 2 });
    }
    setShow(true);
  }, [show]);

  // Dışarı tıklayınca kapat
  useEffect(() => {
    if (!show) return;
    const close = () => setShow(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [show]);

  return (
    <>
      <span ref={ref} className={s.infoTip} onClick={toggle}>?</span>
      {show && pos && createPortal(
        <div
          className={s.infoTipPopover}
          style={{ top: pos.top, left: pos.left }}
          onClick={e => e.stopPropagation()}
        >
          {TIPS[tip] || tip}
        </div>,
        document.body,
      )}
    </>
  );
}
