"""
Gider Service — İş kuralları katmanı
Gider kaydı oluşturma, onaylama, taksitlendirme, durum yönetimi.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.finans.infrastructure.gider_repository import GiderKaydiRepository, GiderTaksitRepository
from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.constants.gider_types import GiderDurum, GiderTaksitDurum
from apps.finans.constants.cari_types import CariHareketTuru, CariHareketYonu


class GiderService:
    """Gider kaydı iş kuralları."""

    def __init__(self):
        self.gider_repo = GiderKaydiRepository
        self.taksit_repo = GiderTaksitRepository
        self.cari_hareket_service = CariHareketService()

    @staticmethod
    def _generate_fatura_no(kurum_id):
        """
        Otomatik fatura numarası üret.
        Format: GDR-YYYYMM-NNN  (ör. GDR-202603-001)
        """
        from apps.finans.domain.gider_kaydi import GiderKaydi
        now = timezone.now()
        prefix = f"GDR-{now.strftime('%Y%m')}-"
        son_kayit = (
            GiderKaydi.objects
            .filter(kurum_id=kurum_id, fatura_no__startswith=prefix)
            .order_by('-fatura_no')
            .values_list('fatura_no', flat=True)
            .first()
        )
        if son_kayit:
            try:
                son_sira = int(son_kayit.split('-')[-1])
            except (ValueError, IndexError):
                son_sira = 0
        else:
            son_sira = 0
        return f"{prefix}{son_sira + 1:03d}"

    @transaction.atomic
    def create(self, data: dict):
        """
        Yeni gider kaydı oluşturur ve otomatik onaylar.
        KDV otomatik hesaplanır; cari hareket ve taksit planı hemen oluşur.
        Returns: (GiderKaydi, None) veya (None, error_dict)
        """
        errors = self._validate_create(data)
        if errors:
            return None, errors

        # Fatura no boşsa otomatik üret
        if not data.get('fatura_no'):
            data['fatura_no'] = self._generate_fatura_no(data.get('kurum_id'))

        # KDV hesapla
        brut = data.get('brut_tutar', Decimal('0'))
        kdv_orani = data.get('kdv_orani', 20)
        kdv_tutar = (brut * Decimal(kdv_orani) / Decimal('100')).quantize(Decimal('0.01'))
        net_tutar = brut + kdv_tutar

        data['kdv_tutar'] = kdv_tutar
        data['net_tutar'] = net_tutar
        data['durum'] = GiderDurum.TASLAK

        # Özel taksit planı varsa JSON olarak sakla
        taksit_plani = data.pop('taksit_plani', None)
        if taksit_plani:
            data['taksit_plani_json'] = taksit_plani

        onaylayan_user = data.get('olusturan')

        gider = self.gider_repo.create(data)

        update_data = {
            'durum': GiderDurum.ONAYLANDI,
            'onay_tarihi': timezone.now(),
        }
        if onaylayan_user:
            update_data['onaylayan'] = onaylayan_user
        gider = self.gider_repo.update(gider, update_data)

        taksit_plani_json = getattr(gider, 'taksit_plani_json', None)
        self.taksit_repo.toplu_olustur(gider, taksit_plani=taksit_plani_json)

        from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
        CekSenetService().sync_gider_plan(gider)

        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=gider.cari_hesap_id,
            kurum_id=gider.kurum_id,
            tutar=gider.net_tutar,
            yon=CariHareketYonu.ALACAK,
            islem_turu=CariHareketTuru.ALIS,
            islem_tarihi=gider.fatura_tarihi,
            sube_id=gider.sube_id,
            egitim_yili_id=gider.egitim_yili_id,
            kaynak_tip='GiderKaydi',
            kaynak_id=gider.pk,
            aciklama=f'Gider onayı: {gider.fatura_no or "Belgesiz"} — {gider.net_tutar} ₺',
            belge_no=gider.fatura_no,
            islem_yapan=onaylayan_user,
        )

        return gider, None

    @transaction.atomic
    def update(self, gider_id: int, data: dict):
        """
        Gider kaydını günceller (taslak veya ödemesiz onaylı).
        Returns: (GiderKaydi, None) veya (None, error_dict)
        """
        gider = self.gider_repo.get_by_id(gider_id)
        if not gider:
            return None, {'genel': 'Gider kaydı bulunamadı.'}

        if not gider.duzenlenebilir_mi:
            return None, {'genel': f'Bu gider kaydı düzenlenemez (durum: {gider.get_durum_display()}).'}

        errors = self._validate_update(data)
        if errors:
            return None, errors

        old_net = gider.net_tutar
        old_cari_id = gider.cari_hesap_id
        old_fatura_tarihi = gider.fatura_tarihi
        old_durum = gider.durum
        old_taksit_sayisi = gider.taksit_sayisi
        old_vade = gider.vade_tarihi

        taksit_plani = data.pop('taksit_plani', None)

        # Brüt tutar değiştiyse KDV'yi yeniden hesapla
        if 'brut_tutar' in data or 'kdv_orani' in data:
            brut = data.get('brut_tutar', gider.brut_tutar)
            kdv_orani = data.get('kdv_orani', gider.kdv_orani)
            data['kdv_tutar'] = (brut * Decimal(kdv_orani) / Decimal('100')).quantize(Decimal('0.01'))
            data['net_tutar'] = brut + data['kdv_tutar']

        gider = self.gider_repo.update(gider, data)

        if old_durum == GiderDurum.ONAYLANDI and gider.odenen_toplam == Decimal('0'):
            cari_changed = gider.cari_hesap_id != old_cari_id
            amount_changed = gider.net_tutar != old_net
            date_changed = gider.fatura_tarihi != old_fatura_tarihi
            taksit_structure_changed = (
                gider.taksit_sayisi != old_taksit_sayisi
                or gider.vade_tarihi != old_vade
                or taksit_plani is not None
            )

            if cari_changed or amount_changed or date_changed:
                islem_yapan = data.get('islem_yapan')
                self.cari_hareket_service.hareket_olustur(
                    cari_hesap_id=old_cari_id,
                    kurum_id=gider.kurum_id,
                    tutar=old_net,
                    yon=CariHareketYonu.BORC,
                    islem_turu=CariHareketTuru.IADE,
                    islem_tarihi=old_fatura_tarihi,
                    sube_id=gider.sube_id,
                    egitim_yili_id=gider.egitim_yili_id,
                    kaynak_tip='GiderKaydi',
                    kaynak_id=gider.pk,
                    aciklama=f'Gider düzeltme (ters): {gider.fatura_no or "Belgesiz"}',
                    belge_no=gider.fatura_no,
                    islem_yapan=islem_yapan,
                )
                self.cari_hareket_service.hareket_olustur(
                    cari_hesap_id=gider.cari_hesap_id,
                    kurum_id=gider.kurum_id,
                    tutar=gider.net_tutar,
                    yon=CariHareketYonu.ALACAK,
                    islem_turu=CariHareketTuru.ALIS,
                    islem_tarihi=gider.fatura_tarihi,
                    sube_id=gider.sube_id,
                    egitim_yili_id=gider.egitim_yili_id,
                    kaynak_tip='GiderKaydi',
                    kaynak_id=gider.pk,
                    aciklama=f'Gider düzeltme: {gider.fatura_no or "Belgesiz"} — {gider.net_tutar} ₺',
                    belge_no=gider.fatura_no,
                    islem_yapan=islem_yapan,
                )

            if amount_changed or taksit_structure_changed:
                gider.taksitler.all().delete()
                plan = taksit_plani or getattr(gider, 'taksit_plani_json', None)
                self.taksit_repo.toplu_olustur(gider, taksit_plani=plan)
                from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
                CekSenetService().sync_gider_plan(gider)

        return gider, None

    @transaction.atomic
    def onaya_gonder(self, gider_id: int):
        """
        Gider kaydını onaya gönderir.
        Returns: (GiderKaydi, None) veya (None, error_dict)
        """
        gider = self.gider_repo.get_by_id(gider_id)
        if not gider:
            return None, {'genel': 'Gider kaydı bulunamadı.'}

        if gider.durum != GiderDurum.TASLAK:
            return None, {'genel': 'Sadece taslak durumundaki giderler onaya gönderilebilir.'}

        gider = self.gider_repo.update(gider, {'durum': GiderDurum.ONAY_BEKLIYOR})
        return gider, None

    @transaction.atomic
    def onayla(self, gider_id: int, onaylayan_user=None):
        """
        Gider kaydını onaylar + taksit planını otomatik oluşturur.
        Tedarikçi cari bakiyesini günceller.
        Returns: (GiderKaydi, None) veya (None, error_dict)
        """
        gider = self.gider_repo.get_by_id(gider_id)
        if not gider:
            return None, {'genel': 'Gider kaydı bulunamadı.'}

        if gider.durum not in [GiderDurum.TASLAK, GiderDurum.ONAY_BEKLIYOR]:
            return None, {'genel': 'Bu gider kaydı onaylanamaz.'}

        # Durumu güncelle
        update_data = {
            'durum': GiderDurum.ONAYLANDI,
            'onay_tarihi': timezone.now(),
        }
        if onaylayan_user:
            update_data['onaylayan'] = onaylayan_user

        gider = self.gider_repo.update(gider, update_data)

        # Taksit planı oluştur (özel plan varsa kullan)
        taksit_plani = getattr(gider, 'taksit_plani_json', None)
        self.taksit_repo.toplu_olustur(gider, taksit_plani=taksit_plani)

        # Cari hesapta ALACAK hareketi (biz tedarikçiye borçlanıyoruz)
        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=gider.cari_hesap_id,
            kurum_id=gider.kurum_id,
            tutar=gider.net_tutar,
            yon=CariHareketYonu.ALACAK,
            islem_turu=CariHareketTuru.ALIS,
            islem_tarihi=gider.fatura_tarihi,
            sube_id=gider.sube_id,
            egitim_yili_id=gider.egitim_yili_id,
            kaynak_tip='GiderKaydi',
            kaynak_id=gider.pk,
            aciklama=f'Gider onayı: {gider.fatura_no or "Belgesiz"} — {gider.net_tutar} ₺',
            belge_no=gider.fatura_no,
            islem_yapan=onaylayan_user,
        )

        return gider, None

    @transaction.atomic
    def iptal_et(self, gider_id: int):
        """
        Gider kaydını iptal eder.
        Ödemesi yapılmış gider iptal edilemez.
        Returns: (GiderKaydi, None) veya (None, error_dict)
        """
        gider = self.gider_repo.get_by_id(gider_id)
        if not gider:
            return None, {'genel': 'Gider kaydı bulunamadı.'}

        if not gider.iptal_edilebilir_mi:
            return None, {'genel': f'Bu gider kaydı iptal edilemez (durum: {gider.get_durum_display()}).'}

        if gider.odenen_toplam > Decimal('0'):
            return None, {'genel': 'Ödemesi olan gider iptal edilemez. Önce ödemeleri iptal edin.'}

        onceki_durum = gider.durum

        # Taksitleri iptal et
        gider.taksitler.update(durum=GiderTaksitDurum.IPTAL)

        # Gideri iptal et
        gider = self.gider_repo.update(gider, {'durum': GiderDurum.IPTAL})

        # Eğer onaylanmıştı ise cari alacak düzeltmesi (BORÇ hareketi — ters kayıt)
        if onceki_durum in [GiderDurum.ONAYLANDI, GiderDurum.KISMI_ODENDI]:
            self.cari_hareket_service.hareket_olustur(
                cari_hesap_id=gider.cari_hesap_id,
                kurum_id=gider.kurum_id,
                tutar=gider.net_tutar,
                yon=CariHareketYonu.BORC,
                islem_turu=CariHareketTuru.IADE,
                islem_tarihi=gider.fatura_tarihi,
                sube_id=gider.sube_id,
                egitim_yili_id=gider.egitim_yili_id,
                kaynak_tip='GiderKaydi',
                kaynak_id=gider.pk,
                aciklama=f'Gider iptali: {gider.fatura_no or "Belgesiz"}',
            )

        return gider, None

    def soft_delete(self, gider_id: int):
        """Soft delete — sadece taslak giderler silinebilir."""
        gider = self.gider_repo.get_by_id(gider_id)
        if not gider:
            return None, {'genel': 'Gider kaydı bulunamadı.'}

        if gider.durum != GiderDurum.TASLAK:
            return None, {'genel': 'Sadece taslak durumdaki giderler silinebilir.'}

        gider = self.gider_repo.soft_delete(gider)
        return gider, None

    def durum_guncelle(self, gider):
        """
        Ödeme yapıldıktan sonra giderin durumunu otomatik günceller.
        Service dışından çağrılır (GiderOdemeService tarafından).
        """
        if gider.durum == GiderDurum.IPTAL:
            return gider

        self.gider_repo.odenen_toplam_guncelle(gider)
        gider.refresh_from_db()

        if gider.odenen_toplam >= gider.net_tutar:
            new_durum = GiderDurum.ODENDI
        elif gider.odenen_toplam > Decimal('0'):
            new_durum = GiderDurum.KISMI_ODENDI
        else:
            new_durum = GiderDurum.ONAYLANDI

        if gider.durum != new_durum:
            gider = self.gider_repo.update(gider, {'durum': new_durum})

        self.taksitleri_odeme_ile_hizala(gider)
        return gider

    def taksitleri_odeme_ile_hizala(self, gider):
        """
        Gider ödeme toplamı ile taksit satırlarını senkronize eder.
        Taksitsiz tam ödeme sonrası açık kalan taksit satırlarını kapatır.
        """
        taksitler = list(self.taksit_repo.get_by_gider(gider.pk))
        if not taksitler:
            return

        gider.refresh_from_db()

        if gider.odenen_toplam >= gider.net_tutar:
            for t in taksitler:
                if t.durum == GiderTaksitDurum.IPTAL:
                    continue
                t.odenen_tutar = t.tutar
                t.durum = GiderTaksitDurum.ODENDI
                t.save(update_fields=['odenen_tutar', 'durum', 'updated_at'])
            return

        for t in taksitler:
            if t.durum != GiderTaksitDurum.IPTAL:
                self.taksit_repo.odenen_tutar_guncelle(t)

    def repair_inconsistent_taksit_rows(self, kurum_id, sube_id=None):
        """
        Tam ödenmiş giderlerde açık kalmış taksit satırlarını onarır (eski kayıtlar).
        """
        from apps.finans.domain.gider_kaydi import GiderKaydi

        qs = GiderKaydi.objects.filter(kurum_id=kurum_id, durum=GiderDurum.ODENDI)
        if sube_id:
            qs = qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))
        for gider in qs.iterator():
            stale = gider.taksitler.filter(
                durum__in=[GiderTaksitDurum.BEKLEMEDE, GiderTaksitDurum.KISMI_ODENDI],
            ).exists()
            if stale:
                self.taksitleri_odeme_ile_hizala(gider)

    # ─── Validasyon ──────────────────────────────

    def _validate_create(self, data):
        errors = {}

        if not data.get('kurum_id') and not data.get('kurum'):
            errors['kurum'] = 'Kurum bilgisi zorunludur.'
        if not data.get('cari_hesap_id') and not data.get('cari_hesap'):
            errors['cari_hesap'] = 'Cari hesap seçimi zorunludur.'
        else:
            from apps.finans.domain.cari_hesap import CariHesap
            from apps.finans.constants.cari_types import CariHesapTuru
            cari_id = data.get('cari_hesap_id') or getattr(data.get('cari_hesap'), 'id', None)
            if cari_id:
                try:
                    cari = CariHesap.objects.get(pk=cari_id)
                    if cari.hesap_turu == CariHesapTuru.MUSTERI:
                        errors['cari_hesap'] = (
                            'Müşteri cari hesabına gider kaydı açılamaz. Gelir kaydı kullanın.'
                        )
                except CariHesap.DoesNotExist:
                    pass
        if not data.get('gider_kategorisi_id') and not data.get('gider_kategorisi'):
            errors['gider_kategorisi'] = 'Gider kategorisi zorunludur.'
        else:
            from apps.finans.domain.cari_hesap import CariHesap
            from apps.finans.domain.gider_kategorisi import GiderKategorisi
            cari_id = data.get('cari_hesap_id') or getattr(data.get('cari_hesap'), 'id', None)
            kategori_id = data.get('gider_kategorisi_id') or getattr(data.get('gider_kategorisi'), 'id', None)
            if cari_id and kategori_id:
                try:
                    cari = CariHesap.objects.get(pk=cari_id)
                    linked_ids = set(cari.gider_kategorileri.values_list('id', flat=True))
                    if linked_ids and kategori_id not in linked_ids:
                        errors['gider_kategorisi'] = (
                            'Seçilen kategori bu cari hesaba tanımlı değil.'
                        )
                    elif linked_ids and not GiderKategorisi.objects.filter(
                        pk=kategori_id, pk__in=linked_ids, aktif_mi=True
                    ).exists():
                        errors['gider_kategorisi'] = 'Seçilen kategori geçersiz veya pasif.'
                except CariHesap.DoesNotExist:
                    pass
        if not data.get('brut_tutar') or data.get('brut_tutar', Decimal('0')) <= 0:
            errors['brut_tutar'] = 'Brüt tutar sıfırdan büyük olmalıdır.'
        if not data.get('fatura_tarihi'):
            errors['fatura_tarihi'] = 'Fatura tarihi zorunludur.'
        if not data.get('vade_tarihi'):
            errors['vade_tarihi'] = 'Vade tarihi zorunludur.'

        taksit_sayisi = data.get('taksit_sayisi', 1)
        if taksit_sayisi < 1 or taksit_sayisi > 60:
            errors['taksit_sayisi'] = 'Taksit sayısı 1-60 arasında olmalıdır.'

        return errors if errors else None

    def _validate_update(self, data):
        errors = {}

        if 'brut_tutar' in data and data['brut_tutar'] <= 0:
            errors['brut_tutar'] = 'Brüt tutar sıfırdan büyük olmalıdır.'

        if 'taksit_sayisi' in data:
            ts = data['taksit_sayisi']
            if ts < 1 or ts > 60:
                errors['taksit_sayisi'] = 'Taksit sayısı 1-60 arasında olmalıdır.'

        return errors if errors else None
