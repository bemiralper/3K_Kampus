"""
Gelir Service — İş kuralları katmanı
Gelir kaydı oluşturma, onaylama, durum yönetimi.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from apps.finans.infrastructure.gelir_repository import GelirKaydiRepository
from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.constants.cari_types import GelirDurum, CariHareketTuru, CariHareketYonu


class GelirService:
    """Gelir kaydı iş kuralları."""

    def __init__(self):
        self.gelir_repo = GelirKaydiRepository
        self.cari_hareket_service = CariHareketService()

    @staticmethod
    def _generate_fatura_no(kurum_id):
        """
        Otomatik fatura numarası üret.
        Format: GLR-YYYYMM-NNN  (ör. GLR-202603-001)
        """
        from apps.finans.domain.gelir_kaydi import GelirKaydi
        now = timezone.now()
        prefix = f"GLR-{now.strftime('%Y%m')}-"
        son_kayit = (
            GelirKaydi.objects
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
        Yeni gelir kaydı oluşturur ve otomatik onaylar.
        KDV otomatik hesaplanır; cari hareket hemen oluşur.
        Returns: (GelirKaydi, None) veya (None, error_dict)
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
        data['durum'] = GelirDurum.TASLAK

        gelir = self.gelir_repo.create(data)

        islem_yapan = data.get('olusturan')
        gelir = self.gelir_repo.update(gelir, {'durum': GelirDurum.ONAYLANDI})
        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=gelir.cari_hesap_id,
            kurum_id=gelir.kurum_id,
            tutar=gelir.net_tutar,
            yon=CariHareketYonu.BORC,
            islem_turu=CariHareketTuru.SATIS,
            islem_tarihi=gelir.fatura_tarihi,
            sube_id=gelir.sube_id,
            egitim_yili_id=gelir.egitim_yili_id,
            kaynak_tip='GelirKaydi',
            kaynak_id=gelir.pk,
            aciklama=f'Gelir: {gelir.fatura_no or "Belgesiz"} — {gelir.net_tutar} ₺',
            belge_no=gelir.fatura_no,
            islem_yapan=islem_yapan,
        )

        return gelir, None

    @transaction.atomic
    def update(self, gelir_id: int, data: dict):
        """Gelir kaydını günceller (taslak veya tahsilatsız onaylı)."""
        gelir = self.gelir_repo.get_by_id(gelir_id)
        if not gelir:
            return None, {'genel': 'Gelir kaydı bulunamadı.'}

        if not gelir.duzenlenebilir_mi:
            return None, {'genel': f'Bu gelir kaydı düzenlenemez (durum: {gelir.durum}).'}

        merged = {
            'cari_hesap_id': gelir.cari_hesap_id,
            'gelir_kategorisi_id': gelir.gelir_kategorisi_id,
            'sube_id': gelir.sube_id,
        }
        merged.update(data)
        errors = self._validate_kategori_for_cari(merged)
        if errors:
            return None, errors

        old_net = gelir.net_tutar
        old_cari_id = gelir.cari_hesap_id
        old_fatura_tarihi = gelir.fatura_tarihi
        old_durum = gelir.durum

        # Brüt tutar değiştiyse KDV'yi yeniden hesapla
        if 'brut_tutar' in data or 'kdv_orani' in data:
            brut = data.get('brut_tutar', gelir.brut_tutar)
            kdv_orani = data.get('kdv_orani', gelir.kdv_orani)
            data['kdv_tutar'] = (brut * Decimal(kdv_orani) / Decimal('100')).quantize(Decimal('0.01'))
            data['net_tutar'] = brut + data['kdv_tutar']

        gelir = self.gelir_repo.update(gelir, data)

        if old_durum == GelirDurum.ONAYLANDI and gelir.tahsil_edilen == Decimal('0'):
            cari_changed = gelir.cari_hesap_id != old_cari_id
            amount_changed = gelir.net_tutar != old_net
            date_changed = gelir.fatura_tarihi != old_fatura_tarihi
            if cari_changed or amount_changed or date_changed:
                islem_yapan = data.get('islem_yapan')
                self.cari_hareket_service.hareket_olustur(
                    cari_hesap_id=old_cari_id,
                    kurum_id=gelir.kurum_id,
                    tutar=old_net,
                    yon=CariHareketYonu.ALACAK,
                    islem_turu=CariHareketTuru.IADE,
                    islem_tarihi=old_fatura_tarihi,
                    sube_id=gelir.sube_id,
                    egitim_yili_id=gelir.egitim_yili_id,
                    kaynak_tip='GelirKaydi',
                    kaynak_id=gelir.pk,
                    aciklama=f'Gelir düzeltme (ters): {gelir.fatura_no or "Belgesiz"}',
                    belge_no=gelir.fatura_no,
                    islem_yapan=islem_yapan,
                )
                self.cari_hareket_service.hareket_olustur(
                    cari_hesap_id=gelir.cari_hesap_id,
                    kurum_id=gelir.kurum_id,
                    tutar=gelir.net_tutar,
                    yon=CariHareketYonu.BORC,
                    islem_turu=CariHareketTuru.SATIS,
                    islem_tarihi=gelir.fatura_tarihi,
                    sube_id=gelir.sube_id,
                    egitim_yili_id=gelir.egitim_yili_id,
                    kaynak_tip='GelirKaydi',
                    kaynak_id=gelir.pk,
                    aciklama=f'Gelir düzeltme: {gelir.fatura_no or "Belgesiz"} — {gelir.net_tutar} ₺',
                    belge_no=gelir.fatura_no,
                    islem_yapan=islem_yapan,
                )

        return gelir, None

    @transaction.atomic
    def onayla(self, gelir_id: int):
        """
        Gelir kaydını onaylar.
        Cari hesapta borç hareketi oluşturur (müşteri bize borçlanır).
        """
        gelir = self.gelir_repo.get_by_id(gelir_id)
        if not gelir:
            return None, {'genel': 'Gelir kaydı bulunamadı.'}

        if gelir.durum != GelirDurum.TASLAK:
            return None, {'genel': 'Sadece taslak durumdaki gelirler onaylanabilir.'}

        gelir = self.gelir_repo.update(gelir, {'durum': GelirDurum.ONAYLANDI})

        # Cari hesapta BORÇ hareketi (müşteri bize borçlanır)
        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=gelir.cari_hesap_id,
            kurum_id=gelir.kurum_id,
            tutar=gelir.net_tutar,
            yon=CariHareketYonu.BORC,
            islem_turu=CariHareketTuru.SATIS,
            islem_tarihi=gelir.fatura_tarihi,
            sube_id=gelir.sube_id,
            egitim_yili_id=gelir.egitim_yili_id,
            kaynak_tip='GelirKaydi',
            kaynak_id=gelir.pk,
            aciklama=f'Gelir: {gelir.fatura_no or "Belgesiz"} — {gelir.net_tutar} ₺',
            belge_no=gelir.fatura_no,
            islem_yapan=getattr(gelir, 'olusturan', None),
        )

        return gelir, None

    @transaction.atomic
    def iptal_et(self, gelir_id: int):
        """Gelir kaydını iptal eder ve cari bakiyeyi düzeltir."""
        gelir = self.gelir_repo.get_by_id(gelir_id)
        if not gelir:
            return None, {'genel': 'Gelir kaydı bulunamadı.'}

        if not gelir.iptal_edilebilir_mi:
            return None, {'genel': 'Bu gelir kaydı iptal edilemez.'}

        if gelir.tahsil_edilen > Decimal('0'):
            return None, {'genel': 'Tahsilatı olan gelir iptal edilemez. Önce tahsilatları iptal edin.'}

        onceki_durum = gelir.durum
        gelir = self.gelir_repo.update(gelir, {'durum': GelirDurum.IPTAL})

        # Eğer onaylanmıştı ise cari borç düzeltmesi (ALACAK hareketi)
        if onceki_durum in [GelirDurum.ONAYLANDI, GelirDurum.KISMI_TAHSIL]:
            self.cari_hareket_service.hareket_olustur(
                cari_hesap_id=gelir.cari_hesap_id,
                kurum_id=gelir.kurum_id,
                tutar=gelir.net_tutar,
                yon=CariHareketYonu.ALACAK,
                islem_turu=CariHareketTuru.IADE,
                islem_tarihi=gelir.fatura_tarihi,
                sube_id=gelir.sube_id,
                egitim_yili_id=gelir.egitim_yili_id,
                kaynak_tip='GelirKaydi',
                kaynak_id=gelir.pk,
                aciklama=f'Gelir iptali: {gelir.fatura_no or "Belgesiz"}',
            )

        return gelir, None

    def soft_delete(self, gelir_id: int):
        """Soft delete — sadece taslak gelirler silinebilir."""
        gelir = self.gelir_repo.get_by_id(gelir_id)
        if not gelir:
            return None, {'genel': 'Gelir kaydı bulunamadı.'}

        if gelir.durum != GelirDurum.TASLAK:
            return None, {'genel': 'Sadece taslak durumdaki gelirler silinebilir.'}

        gelir = self.gelir_repo.soft_delete(gelir)
        return gelir, None

    # ─── Validasyon ──────────────────────────────

    def _validate_kategori_for_cari(self, data):
        """Cari hesaba bağlı gelir kategorisi doğrulaması."""
        errors = {}
        from apps.finans.domain.cari_hesap import CariHesap
        from apps.finans.domain.gelir_kategorisi import GelirKategorisi

        cari_id = data.get('cari_hesap_id') or getattr(data.get('cari_hesap'), 'id', None)
        kategori_id = data.get('gelir_kategorisi_id') or getattr(data.get('gelir_kategorisi'), 'id', None)

        if not kategori_id:
            errors['gelir_kategorisi'] = 'Gelir kategorisi zorunludur.'
            return errors

        if cari_id and kategori_id:
            try:
                cari = CariHesap.objects.get(pk=cari_id)
                linked_ids = set(cari.gelir_kategorileri.values_list('id', flat=True))
                if linked_ids and kategori_id not in linked_ids:
                    errors['gelir_kategorisi'] = (
                        'Seçilen kategori bu cari hesaba tanımlı değil.'
                    )
                elif linked_ids and not GelirKategorisi.objects.filter(
                    pk=kategori_id, pk__in=linked_ids, aktif_mi=True
                ).exists():
                    errors['gelir_kategorisi'] = 'Seçilen kategori geçersiz veya pasif.'
            except CariHesap.DoesNotExist:
                pass

        return errors if errors else None

    def _validate_create(self, data):
        errors = {}

        if not data.get('kurum_id') and not data.get('kurum'):
            errors['kurum'] = 'Kurum bilgisi zorunludur.'
        if not data.get('sube_id') and not data.get('sube'):
            errors['sube'] = 'Şube bilgisi zorunludur.'
        if not data.get('cari_hesap_id') and not data.get('cari_hesap'):
            errors['cari_hesap'] = 'Cari hesap seçimi zorunludur.'
        else:
            from apps.finans.domain.cari_hesap import CariHesap
            from apps.finans.constants.cari_types import CariHesapTuru
            cari_id = data.get('cari_hesap_id') or getattr(data.get('cari_hesap'), 'id', None)
            if cari_id:
                try:
                    cari = CariHesap.objects.get(pk=cari_id)
                    if cari.hesap_turu == CariHesapTuru.TEDARIKCI:
                        errors['cari_hesap'] = (
                            'Tedarikçi cari hesabına gelir kaydı açılamaz. Gider kaydı kullanın.'
                        )
                    sube_id = data.get('sube_id') or getattr(data.get('sube'), 'id', None)
                    if sube_id and cari.sube_id != int(sube_id):
                        errors['cari_hesap'] = 'Cari hesap seçili şubeye ait değil.'
                except CariHesap.DoesNotExist:
                    pass
        if not data.get('gelir_kategorisi_id') and not data.get('gelir_kategorisi'):
            errors['gelir_kategorisi'] = 'Gelir kategorisi zorunludur.'
        else:
            kategori_errors = self._validate_kategori_for_cari(data)
            if kategori_errors:
                errors.update(kategori_errors)
        if not data.get('brut_tutar') or data.get('brut_tutar', Decimal('0')) <= 0:
            errors['brut_tutar'] = 'Brüt tutar sıfırdan büyük olmalıdır.'
        if not data.get('fatura_tarihi'):
            errors['fatura_tarihi'] = 'Fatura tarihi zorunludur.'
        if not data.get('vade_tarihi'):
            errors['vade_tarihi'] = 'Vade tarihi zorunludur.'

        return errors if errors else None
