# Akademik operasyon denetimi — 8 Kasım 2026

İlk salt okunur denetimin araçları ve ardından uygulanan düzeltmelerin regresyon çalıştırıcısıdır.

## Sentetik regresyonlar

Backend dizininde:

```bash
LMS_TEST_DB_NAME=academic_audit_20261108 DJANGO_ENV=test venv/bin/python -m audit_checks.run_regressions --strict
```

19 hatayı yeniden üreten 20 senaryo normal regresyon testlerine taşındı;
şube yazma/CSRF ve eşzamanlı aktarım/tarihsel koruma testleriyle birlikte
**25 test** artık başarılıdır. `expectedFailure` işaretleri kaldırıldı.
Kalıcı testler `backend/apps/academic/tests/` altında normal keşfe dahildir.
`--strict` eski komutlarla uyumluluk için kabul edilir; testler her zaman normal çalışır.

## Canlı veri denetimi

`academic_live_20261108.py` ve `academic_live_detail_20261108.py`, yetkili
sunucunun `manage.py shell` stdin girdisi olarak çalıştırılır. PostgreSQL
`REPEATABLE READ, READ ONLY` işlemi kullanır; salt okunurluğu ayrıca doğrular.
Üretim üzerinde test çalıştırmaz, model kaydetmez ve bildirim göndermez.
Çıktılar yalnız anonim sayaçlardır; kişi, kimlik, kayıt kimliği, ücret ve tutar içermez.

Sayaçlar farklı zamanlarda yeniden alındığında doğal olarak değişebilir.
Güncel sözleşmeyle geçmişi karşılaştıran sayaçlar **inceleme adayıdır**;
tek başına geçmiş kaydın yanlış oluşturulduğunu kanıtlamaz.
