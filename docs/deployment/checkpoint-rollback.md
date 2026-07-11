# GitHub checkpoint — geri dönüş noktaları

Büyük canlı alımlarından önce kod tabanının sabitlenmiş hali. Bu commit’lere istediğiniz zaman dönebilirsiniz.

---

## Aktif checkpoint’ler

| Etiket / dal | Commit | Ne içerir |
|--------------|--------|-----------|
| `checkpoint/2026-07-12-pre-akademi-finans-portal` | `8ddf8d1` | **Bu deploy öncesi canlı** — Akademi redesign + şube finans + muhasebe portal düzeltmeleri **öncesi** |
| `backup/checkpoint-pre-akademi-finans-20260712` | `8ddf8d1` | Aynı commit’te yedek dal |
| `checkpoint/2026-07-11-pre-akademi-redesign` | `0144af3` | Personel sözleşme v2 (PR #7) dahil, önceki Akademi checkpoint |
| `backup/checkpoint-pre-akademi-20260711` | `0144af3` | 11 Temmuz yedek dal |
| `checkpoint/2026-07-11-pre-personel-sozlesme-v2` | `5f277bf` | Personel modülü öncesi (daha eski) |

GitHub’da etiketler: **Releases / Tags** veya `git fetch --tags && git tag -l 'checkpoint/*'`.

---

## Lokal — belirli checkpoint’e geçmek

```bash
cd ~/Documents/3k-kampus-lms-main-2
git fetch origin --tags

# Bu canlı alımından önceki durum (önerilen geri dönüş)
git checkout checkpoint/2026-07-12-pre-akademi-finans-portal

# Veya yedek dal
git checkout backup/checkpoint-pre-akademi-finans-20260712
```

`main`’i checkpoint’e sabitlemek (dikkat: force push gerekir, ekip onayı şart):

```bash
git checkout main
git reset --hard checkpoint/2026-07-12-pre-akademi-finans-portal
git push origin main --force-with-lease
```

Alternatif (daha güvenli): GitHub’da **Revert** PR’ları veya yeni dal açıp merge.

---

## Sunucu — canlıyı geri almak

Sunucuda (`/var/www/lms`):

```bash
cd /var/www/lms
git fetch origin --tags
git checkout checkpoint/2026-07-12-pre-akademi-finans-portal

export LMS_APP_ROOT=/var/www/lms
export LMS_BACKEND_SERVICE=lms-backend
export LMS_FRONTEND_SERVICE=lms-frontend
./backend/scripts/deploy-production.sh --no-git
```

`--no-git` kullanın; kod zaten checkout ile güncellendi.

**Migration uyarısı:** Akademik migration’lar (`0009`–`0014`) uygulandıysa, eski koda dönmek DB şemasını bozabilir. Tam geri dönüş için yedek DB restore gerekebilir — bkz. [backup-restore.md](./backup-restore.md).

---

## Yeni checkpoint oluşturmak

Büyük modül değişikliği öncesi:

```bash
git checkout main && git pull origin main
git tag -a checkpoint/YYYY-MM-DD-kisa-aciklama -m "Açıklama"
git push origin checkpoint/YYYY-MM-DD-kisa-aciklama

git branch backup/checkpoint-YYYY-MM-DD-kisa-aciklama
git push origin backup/checkpoint-YYYY-MM-DD-kisa-aciklama
```

Etiket adında `/` kullanılabilir; GitHub’da klasör gibi gruplanır (`checkpoint/...`).

---

## İlgili

- [canliya-alma-hizli.md](./canliya-alma-hizli.md) — normal deploy akışı
- [production-deploy.md](./production-deploy.md) — deploy script bayrakları
- [backup-restore.md](./backup-restore.md) — veritabanı yedekleri
