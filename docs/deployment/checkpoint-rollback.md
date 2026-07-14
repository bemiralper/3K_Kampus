# GitHub checkpoint — geri dönüş noktaları

Büyük canlı alımlarından önce kod tabanının sabitlenmiş hali. Bu commit’lere istediğiniz zaman dönebilirsiniz.

---

## Aktif checkpoint’ler

| Etiket / dal | Commit | Ne içerir |
|--------------|--------|-----------|
| `checkpoint/2026-07-15-pre-restore-session-media-fix` | `4550429` | **Restore oturum/medya sırası + eğitim yılı varsayılanı deploy öncesi** |
| `backup/checkpoint-pre-restore-session-media-20260715` | `4550429` | Aynı commit'te yedek dal |
| `checkpoint/2026-07-14-pre-yedekleme-v2-hardening` | `4bbd268` | **Yedekleme v2 hardening deploy öncesi** — migration 0004 (bildirim/remote) **öncesi** |
| `backup/checkpoint-pre-yedekleme-v2-hardening-20260714` | `4bbd268` | Aynı commit'te yedek dal |
| `checkpoint/2026-07-13-pre-website-cms-content` | `1df43ad` | **Website CMS duyuru/haber + admin dashboard deploy öncesi** — migration 0016 **öncesi** |
| `backup/checkpoint-pre-website-cms-content-20260713` | `1df43ad` | Aynı commit'te yedek dal |
| `checkpoint/2026-07-13-pre-cms-v2-landing` | `8b6c643` | CMS v2 + anasayfa bölüm yönetimi deploy öncesi canlı — website migration 0008–0014 **öncesi** |
| `backup/checkpoint-pre-cms-v2-landing-20260713` | `8b6c643` | Aynı commit’te yedek dal |
| `checkpoint/2026-07-12-pre-akademi-finans-portal` | `8ddf8d1` | Akademi redesign + şube finans + muhasebe portal düzeltmeleri **öncesi** |
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

**Migration uyarısı:** Website CMS migration’ları (`website` `0008`–`0014`: hero galeri, bölüm sırası, görünürlük vb.) uygulandıysa, eski koda dönmek DB şemasını bozabilir. Tam geri dönüş için yedek DB restore gerekebilir — bkz. [backup-restore.md](./backup-restore.md).

CMS v2 deploy sonrası hızlı geri alma:

```bash
cd /var/www/lms
git fetch origin --tags
git checkout checkpoint/2026-07-13-pre-cms-v2-landing
export LMS_APP_ROOT=/var/www/lms LMS_BACKEND_SERVICE=lms-backend LMS_FRONTEND_SERVICE=lms-frontend
./backend/scripts/rollback-production.sh checkpoint/2026-07-13-pre-cms-v2-landing
```

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
