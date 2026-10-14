'use client';

import { useEffect } from 'react';
import s from './daireDizisi.module.css';

type Adim = {
  baslik: string;
  paragraflar: string[];
  maddeler?: string[];
  dikkat?: string[];
};

const ADIMLAR: Adim[] = [
  {
    baslik: 'Boş formu yükleyin',
    paragraflar: [
      'Sol panelde şablon adını yazın, boş optik formun dosyasını seçin ve Yükle’ye basın. PDF, PNG ve JPG kabul edilir.',
      'Olması gereken sayfa ölçüsü A4’tür: genişlik 210 mm, yükseklik 297 mm. Dairelerin yeri bu sayfanın milimetresine yazılır. Yakınlaştırma ve kaydırma kayıtlı konumu değiştirmez.',
      'Yatay A4 kullanıyorsanız ölçü 297 × 210 mm olmalıdır. Sistem dikey ve yatay A4’e 2 mm’ye kadar yakın sayfaları gerçek A4 ölçüsüne normalleştirir.',
      'PDF’te ölçü sayfa kutusundan okunur. PNG ve JPG’de piksel sayısı dosyadaki çözünürlüğe bölünür. Çözünürlük yazılmamış büyük bir görselde uzun kenar 297 mm kabul edilir, en-boy oranı korunur ve ekranda uyarı çıkar.',
    ],
    dikkat: [
      'A4’e 2 mm’den yakın bir dosya çıktıda tam 210 × 297 mm yapılır. İşaretlerin milimetresi değişmez. Yazıcının sayfayı özel boyutta görüp kaydırması böyle engellenir.',
      'Bu ekran koordinat editörünün yerine geçmez. Oradaki formlar olduğu gibi durur.',
    ],
  },
  {
    baslik: 'Kenar zaman izlerine hizalayın',
    paragraflar: [
      'Sağ panelde Sol ize hizala’ya basın. Araç sol ve sağ kenardaki siyah dikdörtgenleri ölçer ve okuma için saklar. Dairelerin yeri bu adımda değişmez.',
      'Baskı, sağ panelde yazdığınız başlangıç ve aralığı kullanır. İz, dolu form taranınca sayfayı şablona çekmek içindir. Tuvalde dikdörtgenlerin üzerinde siyah çizgiler görünür.',
    ],
    dikkat: [
      'Formun solunda bu dikdörtgenler yoksa satırlar eşit aralıkla dizilir. Böyle formlarda alttaki satırlar daha kolay kayar.',
      'Algılama eksik veya fazla iz bulursa İz sayısı, İlk iz ve İz aralığı alanlarını elle düzeltebilirsiniz. Bu formda iz kullanılmayacaksa İzleri kaldır’a basın.',
    ],
  },
  {
    baslik: 'Daire dizilerini yerleştirin',
    paragraflar: [
      'Otomatik algıla daireleri bölgesel kümelere ayırır. Her kümenin merkezi ve aralığı formdaki halkalardan ölçülür. Türünü seçip Dizileri ekle ile şablona alın. Reddet vazgeçirir. Şablon kendiliğinden değişmez.',
      'İsterseniz Daire dizisi ekle aracını seçip formun ilk dairesinden sürükleyin. Satır, sütun, çap ve yatay aralığı sağ panelden ayarlayın. Çap ile aralık birbirinden bağımsızdır; çapı büyütmek aralığı değiştirmez.',
    ],
    maddeler: [
      'Alan türünü formdaki bölüme göre seçin: T.C. kimlik numarası, öğrenci numarası, kitapçık türü veya sayısal kodlama.',
      'Sınav cevapları için Cevap bloğu türünü seçin. Algılanan geniş bir dizi birden çok cevap sütunu içeriyorsa seçenek sayısını (genellikle 4 veya 5) yazın; editör diziyi otomatik bloklara böler ve soru numaralarını art arda verir. Sonrasında ilk soru, soru sayısı ve gerekiyorsa fiziksel soru sırasını kontrol edin.',
      'Veri kaynağını bağlayın. Sınav çıktısı bu kaynaktan doldurulur. Kaynak seçilmezse sabit değer basılır.',
      'Kodlama yönünde “Satırlar karakter, sütunlar seçenek” T.C. ve ad soyad için doğrudur. Her satır bir rakam veya harf, her sütun bir seçenektir.',
      'Ad soyad 29 harfle kodlanır: A B C Ç D E F G Ğ H I İ J K L M N O Ö P R S Ş T U Ü V Y Z. Boşluk da bir karakterdir. Sığmayan uzun isimde diğer adlar kısaltılır, soyad korunur.',
      'Sayı hizası sağ seçilirse kısa numara sağa yaslanır ve baştaki sıfırlar korunur.',
      'Daire çapı formdaki basılı halkanın ölçüsüdür. Siyah işaret çapı ise içine basılan dolgunun ölçüsüdür; 3,2 mm halka için yaklaşık 2,2 mm uygundur.',
      'Metin kutusu her daire diliminin yanına bir kutu koyar. On dilim varsa on kutu olur ve kutular birbirine yapışır. Daire boşluğu, kutular ile dairelerin arasını ayarlar.',
      'Alanı çoğaltmak için Çoğalt’a basın, Cmd+D kullanın ya da Option (Alt) ile birlikte Cmd veya Ctrl basılıyken alanı sürükleyin.',
    ],
    dikkat: [
      'Yatay ve dikey aralığı yakınlaştırıp kontrol edin. Aralık, formdaki halkaların ölçüsüdür. Sol iz bu aralığın yerine geçmez. Geniş alanlarda, ad soyad gibi, küçük bir aralık hatası en sağdaki sütunda birikir.',
    ],
  },
  {
    baslik: 'Yazı alanlarını ekleyin',
    paragraflar: [
      'İsim, sınıf, salon gibi düz yazılar için Metin alanı ekle’yi kullanın. Veri kaynağını seçin, punto ve hizalamayı ayarlayın.',
      'Önizleme düğmesi örnek öğrenci verisiyle sonucu gösterir.',
    ],
  },
  {
    baslik: 'Kaydedin',
    paragraflar: [
      'Kaydet’e basılmadan yapılanlar kalıcı olmaz. Geri almak için Geri al veya Cmd+Z, yinelemek için Cmd+Shift+Z.',
    ],
  },
  {
    baslik: 'Test baskısı alın',
    paragraflar: [
      'Test baskısı formu basmaz. Yalnız daire işaretlerini ve yazıları basar. Çıktıyı önceden basılmış gerçek optik formun üstüne yazdırın.',
    ],
    dikkat: [
      'Yazdırma penceresinde ölçek yüzde 100 kalsın.',
      'Sayfaya sığdır kapalı olsun.',
      'Kenarlıksız baskı kapalı olsun. Bu seçenek çıktıyı yaklaşık yüzde 1 büyütür ve sayfa aşağı indikçe kayma birikir.',
      'PDF önizleme formu da gösterir. Hizayı önizlemeden değil, kâğıdın üstüne basılmış çıktıdan kontrol edin.',
    ],
  },
  {
    baslik: 'Taramadan yazıcıyı ölçün',
    paragraflar: [
      'Test baskısını sayfanın tamamı görünecek şekilde, kenarları kırpmadan tarayın. Sağ panelde Taramadan ayarla bölümünden dosyayı seçin. PDF, JPG ve PNG kabul edilir.',
      'Araç sol dikdörtgenleri şablonla eşleştirir, dolu dairelerin düştüğü yeri ölçer ve yazıcının büyütmesi ile kaymasını gösterir. Uygula değerleri kalibrasyona yazar. Ardından Kaydet’e basın ve yeni bir çıktı indirin.',
    ],
    dikkat: [
      'Ölçek ve ofset dairelerin kayıtlı yerini değiştirmez. Yalnız baskıya uygulanır.',
      'Aynı yazıcıyı farklı formlarda kullanacaksanız kalibrasyonu adlandırılmış yazıcı profili olarak kaydedin. Profili yeni şablonlara bağlayarak aynı ölçümü tekrar yapmak zorunda kalmazsınız.',
      'Yazıcıyı veya yazdırma ayarını değiştirirseniz yeniden ölçün. Ayar değiştikten sonra eski çıktıyı ölçmek yanlış sonuç verir.',
      'Kâğıt tepsiye her seferinde biraz farklı girer. 0,3 ile 0,6 mm arasındaki oynama normaldir ve optik okuyucu bunu tolere eder. Tek bir sayfaya bakıp kalibrasyonu sürekli güncellemek bu oynamayı kovalar.',
      'Tarama, formla aynı sayfa ölçüsünde ve sayfanın tamamı olmalıdır. A4 formda bu 210 × 297 mm’dir. Kenarları kırpılmış tarama kabul edilmez.',
    ],
  },
  {
    baslik: 'Doldurulmuş formları OMR ile okuyun',
    paragraflar: [
      'Sınavın Sonuç Yükle ekranında Optik tarama modunu açın. Şablonu seçip çok sayfalı PDF veya birden fazla JPG/PNG yükleyin; her sayfa bir öğrenci kabul edilir.',
      'Sistem önce sol izi taramada arar ve sayfayı şablona kilitler. İz yoksa sayfa kenarına göre kaydeder. Her dairenin doluluğu, aynı sorudaki diğer dairelerle karşılaştırılır.',
      'Öğrenci, kitapçık ve cevapları sayfa sayfa kontrol edip onaylayın. Onay düğmesine basılana kadar sınav sonuçlarına hiçbir kayıt yazılmaz.',
    ],
    dikkat: [
      'Kritik uyarılı sayfa kullanıcı tarafından incelenmeden sonuçlara aktarılamaz.',
      'Tarama sayfanın tamamını göstermeli; kırpılmış, çok eğri veya çok soluk sayfalar düşük güvenle işaretlenir.',
    ],
  },
];

export default function OptikTanimlaYardim({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={s.helpBack} onClick={onClose}>
      <div
        className={s.helpDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="optik-yardim-baslik"
        onClick={event => event.stopPropagation()}
      >
        <div className={s.helpHead}>
          <h2 id="optik-yardim-baslik">Optik form nasıl tanımlanır</h2>
          <button type="button" className={s.ghost} onClick={onClose}>Kapat</button>
        </div>
        <p className={s.helpLead}>
          Sıra şöyle: formu yükleyin, sol izi ölçün, daireleri formdaki halkalara oturtun,
          kaydedin, gerçek formun üstüne test basın ve taramadan yazıcıyı ölçün.
        </p>
        <ol className={s.steps}>
          {ADIMLAR.map((adim, index) => (
            <li key={adim.baslik} className={s.step}>
              <span className={s.stepNo}>{index + 1}</span>
              <div>
                <h3>{adim.baslik}</h3>
                {adim.paragraflar.map(metin => <p key={metin}>{metin}</p>)}
                {adim.maddeler && (
                  <ul>
                    {adim.maddeler.map(madde => <li key={madde}>{madde}</li>)}
                  </ul>
                )}
                {adim.dikkat && (
                  <div className={s.care}>
                    <strong>Dikkat.</strong>
                    <ul>
                      {adim.dikkat.map(madde => <li key={madde}>{madde}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
