"""
Gider Service — İş kuralları katmanı
Gider kaydı oluşturma, onaylama, taksitlendirme, durum yönetimi.
"""
import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)

from apps.finans.infrastructure.gider_repository import GiderKaydiRepository, GiderTaksitRepository
from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.application.finans_v2.kdv import kdv_hesapla, kdv_hesapla_mod, KDV_MOD_VALUES, KDV_HARIC
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
        """Eski çağrılar için: Gider İşlem Belge No üretir (GDR-YYYY-000001)."""
        from apps.finans.application.gider_belge_service import generate_gider_islem_belge_no
        return generate_gider_islem_belge_no(kurum_id)

    @staticmethod
    def _sync_gider_cek_senet(gider):
        """Çek/senet senkronu gider kaydını düşürmesin."""
        try:
            with transaction.atomic():
                from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
                CekSenetService().sync_gider_plan(gider)
        except Exception:
            logger.exception('Gider çek/senet senkronu atlandı (gider_id=%s)', getattr(gider, 'pk', None))

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

        from apps.finans.application.gider_belge_service import generate_gider_islem_belge_no
        data['islem_belge_no'] = generate_gider_islem_belge_no(data.get('kurum_id'))

        # KDV hesapla (moda göre: haric | dahil | muaf)
        girilen = data.get('brut_tutar', Decimal('0'))
        kdv_orani = data.get('kdv_orani', 20)
        kdv_mod = (data.get('kdv_mod') or KDV_HARIC)
        if kdv_mod not in KDV_MOD_VALUES:
            kdv_mod = KDV_HARIC
        data['kdv_mod'] = kdv_mod
        data['brut_tutar'], data['kdv_tutar'], data['net_tutar'] = kdv_hesapla_mod(
            girilen, kdv_orani, kdv_mod,
        )
        data['durum'] = GiderDurum.TASLAK

        # Özel taksit planı varsa doğrula ve JSON olarak sakla
        taksit_plani = data.pop('taksit_plani', None)
        if taksit_plani:
            err = self._validate_taksit_plani(taksit_plani, data['net_tutar'])
            if err:
                return None, err
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

        self._sync_gider_cek_senet(gider)

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

        # Tutar/KDV modu değiştiyse yeniden hesapla
        if 'brut_tutar' in data or 'kdv_orani' in data or 'kdv_mod' in data:
            girilen = data.get('brut_tutar', gider.brut_tutar)
            kdv_orani = data.get('kdv_orani', gider.kdv_orani)
            kdv_mod = data.get('kdv_mod', getattr(gider, 'kdv_mod', KDV_HARIC))
            if kdv_mod not in KDV_MOD_VALUES:
                kdv_mod = KDV_HARIC
            data['kdv_mod'] = kdv_mod
            data['brut_tutar'], data['kdv_tutar'], data['net_tutar'] = kdv_hesapla_mod(
                girilen, kdv_orani, kdv_mod,
            )

        if taksit_plani:
            net_kontrol = data.get('net_tutar', gider.net_tutar)
            err = self._validate_taksit_plani(taksit_plani, net_kontrol)
            if err:
                return None, err
            data['taksit_plani_json'] = taksit_plani

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
                self._sync_gider_cek_senet(gider)

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
    def onay_kaldir(self, gider_id: int):
        """Onayı kaldırır → taslak. Ödemesi olan kayda uygulanmaz."""
        gider = self.gider_repo.get_by_id(gider_id)
        if not gider:
            return None, {'genel': 'Gider kaydı bulunamadı.'}

        if gider.durum != GiderDurum.ONAYLANDI:
            return None, {'genel': 'Onay yalnızca "Onaylandı" durumundaki kayıttan kaldırılabilir.'}

        if gider.odenen_toplam > Decimal('0'):
            return None, {'genel': 'Ödemesi olan giderin onayı kaldırılamaz. Önce ödemeleri iptal edin.'}

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
            aciklama=f'Gider onay kaldırma: {gider.fatura_no or "Belgesiz"}',
        )
        gider.taksitler.all().delete()
        gider = self.gider_repo.update(gider, {
            'durum': GiderDurum.TASLAK,
            'onaylayan': None,
            'onay_tarihi': None,
        })
        return gider, None

    @transaction.atomic
    def iptal_et(self, gider_id: int, *, force=False):
        """
        Gider kaydını iptal eder.
        Ödemesi yapılmış gider varsayılan olarak iptal edilemez.
        force=True (süper yönetici): önce aktif ödemeleri iptal eder.
        """
        gider = self.gider_repo.get_by_id(gider_id)
        if not gider:
            return None, {'genel': 'Gider kaydı bulunamadı.'}

        if gider.durum == GiderDurum.IPTAL:
            return None, {'genel': 'Bu gider kaydı zaten iptal edilmiş.'}

        if force and gider.odenen_toplam > Decimal('0'):
            from apps.finans.application.gider_odeme_service import GiderOdemeService
            from apps.finans.constants.gider_types import OdemeDurum
            odeme_svc = GiderOdemeService()
            aktif = list(gider.odemeler.filter(durum=OdemeDurum.TAMAMLANDI))
            for odeme in aktif:
                _, err = odeme_svc.odeme_iptal(odeme.pk)
                if err:
                    return None, err
            gider.refresh_from_db()

        if not force and not gider.iptal_edilebilir_mi:
            return None, {'genel': f'Bu gider kaydı iptal edilemez (durum: {gider.get_durum_display()}).'}

        if not force and gider.odenen_toplam > Decimal('0'):
            return None, {'genel': 'Ödemesi olan gider iptal edilemez. Önce ödemeleri iptal edin.'}

        onceki_durum = gider.durum

        # Taksitleri iptal et
        gider.taksitler.update(durum=GiderTaksitDurum.IPTAL)

        # Gideri iptal et
        gider = self.gider_repo.update(gider, {'durum': GiderDurum.IPTAL})

        # Eğer onaylanmıştı ise cari alacak düzeltmesi (BORÇ hareketi — ters kayıt)
        if onceki_durum in [GiderDurum.ONAYLANDI, GiderDurum.KISMI_ODENDI, GiderDurum.ODENDI]:
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

    def soft_delete(self, gider_id: int, *, force=False):
        """Soft delete — taslak; force ile önce iptal (ödemeler dahil) sonra silinir."""
        gider = self.gider_repo.get_by_id(gider_id)
        if not gider:
            return None, {'genel': 'Gider kaydı bulunamadı.'}

        if gider.durum != GiderDurum.TASLAK:
            if not force:
                return None, {'genel': 'Sadece taslak durumdaki giderler silinebilir.'}
            if gider.durum != GiderDurum.IPTAL:
                gider, err = self.iptal_et(gider_id, force=True)
                if err:
                    return None, err

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
        Gider ödemelerini taksit satırlarına yayar.

        Taksit seçilerek yapılan ödeme o satırda kalır. Taksit seçilmeden
        (giderler listesinden) alınan ödeme, vade sırasıyla açık taksitlere
        yazılır. Böylece ödeme takibi giderin ödenen tutarını görür.
        """
        from apps.finans.constants.gider_types import OdemeDurum
        from apps.finans.domain.gider_odeme import GiderOdeme

        taksitler = [
            t for t in self.taksit_repo.get_by_gider(gider.pk)
            if t.durum != GiderTaksitDurum.IPTAL
        ]
        if not taksitler:
            return

        gider.refresh_from_db()
        odemeler = list(
            GiderOdeme.objects.filter(
                gider_kaydi=gider,
                durum=OdemeDurum.TAMAMLANDI,
            ).order_by('odeme_tarihi', 'id')
        )
        linked = {}
        unlinked_total = Decimal('0')
        for odeme in odemeler:
            if odeme.gider_taksit_id:
                linked[odeme.gider_taksit_id] = (
                    linked.get(odeme.gider_taksit_id, Decimal('0')) + odeme.tutar
                )
            else:
                unlinked_total += odeme.tutar

        son = odemeler[-1] if odemeler else None
        if gider.net_tutar > 0 and gider.odenen_toplam >= gider.net_tutar:
            for t in taksitler:
                self._yaz_taksit_odeme(t, t.tutar, son)
            return

        pool = unlinked_total
        for t in sorted(taksitler, key=lambda row: (row.taksit_no, row.id)):
            base = linked.get(t.pk, Decimal('0'))
            extra = Decimal('0')
            room = t.tutar - base
            if room > 0 and pool > 0:
                extra = min(room, pool)
                pool -= extra
            self._yaz_taksit_odeme(t, base + extra, son if extra or base else None)

    @staticmethod
    def _yaz_taksit_odeme(taksit, odenen, son_odeme):
        from apps.finans.application.gider_odeme_durumu import resolve_taksit_durum_values

        durum = resolve_taksit_durum_values(
            taksit.vade_tarihi, taksit.tutar, odenen, iptal=False,
        )
        taksit.odenen_tutar = odenen
        taksit.durum = durum
        fields = ['odenen_tutar', 'durum', 'updated_at']
        if son_odeme and odenen > 0:
            taksit.odeme_tarihi = son_odeme.odeme_tarihi
            fields.append('odeme_tarihi')
            if son_odeme.mali_hesap_id:
                taksit.mali_hesap_id = son_odeme.mali_hesap_id
                fields.append('mali_hesap_id')
            if son_odeme.odeme_yontemi_id:
                taksit.odeme_yontemi_id = son_odeme.odeme_yontemi_id
                fields.append('odeme_yontemi_id')
        elif odenen <= 0:
            taksit.odeme_tarihi = None
            fields.append('odeme_tarihi')
        taksit.save(update_fields=fields)

    def repair_inconsistent_taksit_rows(self, kurum_id, sube_id=None):
        """
        Ödeme takibi satırı giderin ödenen tutarından sapmış kayıtları hizalar.
        Eski ödemeler taksit seçilmeden alındığında satır açık kalıyordu.
        """
        from django.db.models import F, Sum
        from django.db.models.functions import Coalesce

        from apps.finans.domain.gider_kaydi import GiderKaydi

        qs = GiderKaydi.objects.filter(kurum_id=kurum_id).exclude(durum=GiderDurum.IPTAL)
        if sube_id:
            qs = qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))
        qs = qs.annotate(
            taksit_odenen=Coalesce(
                Sum(
                    'taksitler__odenen_tutar',
                    filter=~Q(taksitler__durum=GiderTaksitDurum.IPTAL),
                ),
                Decimal('0'),
            ),
        ).exclude(taksit_odenen=F('odenen_toplam'))
        for gider in qs.iterator():
            self.taksitleri_odeme_ile_hizala(gider)

    # ─── Validasyon ──────────────────────────────

    @staticmethod
    def _validate_taksit_plani(taksit_plani, net_tutar):
        """Manuel taksit planını doğrular: satırlar geçerli + toplam = net_tutar (±0.05).

        Returns: None (geçerli) veya error_dict.
        """
        if not isinstance(taksit_plani, (list, tuple)) or len(taksit_plani) == 0:
            return {'taksit_plani': 'Taksit planı en az bir satır içermelidir.'}

        toplam = Decimal('0.00')
        for idx, item in enumerate(taksit_plani, start=1):
            if not isinstance(item, dict):
                return {'taksit_plani': f'{idx}. taksit satırı geçersiz.'}
            if not item.get('vade_tarihi'):
                return {'taksit_plani': f'{idx}. taksitte vade tarihi zorunludur.'}
            try:
                tutar = Decimal(str(item.get('tutar', '0')))
            except Exception:
                return {'taksit_plani': f'{idx}. taksitte tutar geçersiz.'}
            if tutar <= 0:
                return {'taksit_plani': f'{idx}. taksit tutarı sıfırdan büyük olmalıdır.'}
            toplam += tutar

        net = Decimal(str(net_tutar or '0'))
        if (toplam - net).copy_abs() > Decimal('0.05'):
            return {
                'taksit_plani': (
                    f'Taksit toplamı ({toplam} ₺) net tutara ({net} ₺) eşit olmalıdır. '
                    f'Fark: {(toplam - net):+} ₺'
                )
            }
        return None

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
