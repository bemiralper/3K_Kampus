# Koç analiz arayüzü — sadeleştirme

Kullanıcı geri bildirimi: önceki tasarım fazla uzun, açıklama ağırlıklı ve iki görünüm birbirine fazla benziyordu. Bu revizyon önceki görsel yerleşimin yerini alır. Backend ve hesaplama modeli değişmedi.

- Genel Bakış: tek ana performans grafiği, net/puan/sıra ölçütleri, küçük ders eğrileri ve kısa yanlış/boş grafiği. Konu/kazanım listeleri ve uzun analiz açıklamaları bulunmaz.
- Derin Analiz: kayıplı ders menüsü, en çok kaybettiren konular ve seçilen konunun kayıplı kazanımları. Yanlış + boş = 0 olan ders, konu ve kazanımlar bu görünümde listelenmez. Konu listesi ilk 6 kayıtla açılır; devamı isteğe bağlıdır.
- Masaüstünde konu listesi ve ayrıntı yan yana; mobilde konu seçimiyle liste yerine ayrıntı açılır. Geri dönüş ve klavye odağı desteklenir.
- Kanıt, dönem kıyası ve kazanım geçmişi kapalı başlar. Kullanıcı açmadıkça açıklama/tablo alanları yer kaplamaz.
- Tarih, sıralama ve durum seçenekleri Filtrele altında; çoklu ders ve ölçek seçenekleri grafik ayarlarında bulunur.
- Karne ve iki sınav kıyası yan panelde açılır. Escape, arka plana tıklama ve kapatma düğmesi çalışır; odak çağıran elemana döner.
- Önceki tekrarlı karar kartları, büyük açıklama blokları ve ders × sınav ısı haritası kaldırıldı. Kayıp oranları konu satırlarında, dönem kıyası seçili konunun kanıt alanında korunur.
- Mevcut Sınavlarım listesi, karne açma/PDF, sınav aralığı seçimi, kurum/eğitim yılı kapsamı, timeout, eski yanıt koruması ve yenilemede filtre koruma devam eder.

Dosyalar: `ExamAnalyticsWorkspace.tsx`, kendi CSS modülü, `ExamAnalyticsPanels.tsx`, `SinavlarTab.tsx` ve ilgili sentetik tarayıcı testleri. Başka modüller veya gerçek öğrenci kayıtları değiştirilmedi.

Doğrulama: 20/20 model ve sentetik tarayıcı testi başarılı. 390/768/1440 px düzen, iki görünümün farklı içeriği, sıfır kayıp filtrelemesi, isteğe bağlı detaylar, panel/fokus, hata/timeout/retry ve önceki akışlar kontrol edildi. Ekran görüntüleri alındı; masaüstü ve mobil görseller incelendi. Frontend production build başarılı. Bu frontend revizyonunda backend testleri yeniden çalıştırılmadı; backend kodu değişmedi. Üretime yayın yapılmadı.
