"""
Çek / Senet portföy servisi — plan kaydı, durum geçişleri, tahsil/ödeme.
"""
from __future__ import annotations

from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone

from apps.finans.constants.hareket_types import HareketKaynagi, HareketYonu
from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.application.cek_senet.cek_senet_helpers import (
    arac_tipi_from_yontem,
    cek_senet_v2_enabled,
    is_cek_senet_yontemi,
)
from apps.finans.domain.payment_method import OdemeYontemi
from apps.odeme_takip.application.services.tahsilat_service import TahsilatService
from apps.odeme_takip.domain.cek_senet import (
    CekSenetAracTipi,
    CekSenetDetay,
    CekSenetDurum,
    CekSenetYon,
)
from apps.odeme_takip.domain.enums import TahsilatDurum, TaksitDurum
from apps.odeme_takip.domain.models import Taksit, TahsilatDagitim


def serialize_cek_senet(det: CekSenetDetay) -> dict:
    sozlesme = None
    ogrenci_adi = ''
    sozlesme_no = ''
    kaynak = ''
    cari_label = ''
    if det.cari_hesap_id:
        cari_label = det.cari_hesap.gorunen_ad

    if det.taksit_id:
        sozlesme = det.taksit.sozlesme
        kaynak = 'taksit'
    elif det.gider_taksit_id:
        gider = det.gider_taksit.gider_kaydi
        kaynak = 'gider_taksit'
        if gider.cari_hesap_id:
            cari_label = gider.cari_hesap.gorunen_ad
    elif det.tahsilat_id:
        sozlesme = det.tahsilat.sozlesme
        kaynak = 'tahsilat'
    else:
        kaynak = kaynak or 'manuel'
    if sozlesme:
        sozlesme_no = sozlesme.sozlesme_no or ''
        if sozlesme.ogrenci:
            ogrenci_adi = f'{sozlesme.ogrenci.ad} {sozlesme.ogrenci.soyad}'.strip()

    display_adi = ogrenci_adi or cari_label

    # Gecikme (aktif kayıtlar için vade geçmişse gün sayısı)
    gecikme_gun = 0
    gun_kalan = None
    vade = det.vade_tarihi
    if isinstance(vade, str):
        try:
            vade = date.fromisoformat(vade)
        except ValueError:
            vade = None
    if vade:
        fark = (vade - timezone.localdate()).days
        gun_kalan = fark
        if fark < 0 and det.aktif_mi:
            gecikme_gun = -fark

    ciro_label = ''
    if det.ciro_edilen_cari_id:
        try:
            ciro_label = det.ciro_edilen_cari.gorunen_ad
        except Exception:
            ciro_label = ''

    return {
        'id': det.id,
        'yon': det.yon,
        'yon_label': det.get_yon_display(),
        'arac_tipi': det.arac_tipi,
        'arac_tipi_label': det.get_arac_tipi_display(),
        'kurum_id': det.kurum_id,
        'sube_id': det.sube_id,
        'cari_hesap_id': det.cari_hesap_id,
        'cari_label': cari_label,
        'odeme_yontemi_id': det.odeme_yontemi_id,
        'odeme_yontemi_adi': det.odeme_yontemi.ad if det.odeme_yontemi_id else '',
        'tutar': det.tutar,
        'aciklama': det.aciklama,
        'olusturma_tarihi': str(det.olusturma_tarihi) if det.olusturma_tarihi else None,
        'cek_senet_no': det.cek_senet_no,
        'seri_no': det.seri_no,
        'banka_adi': det.banka_adi,
        'sube_adi': det.sube_adi,
        'hesap_no': det.hesap_no,
        'keside_eden': det.keside_eden,
        'keside_tarihi': str(det.keside_tarihi) if det.keside_tarihi else None,
        'vade_tarihi': str(det.vade_tarihi) if det.vade_tarihi else None,
        'durum': det.durum,
        'durum_label': CekSenetDurum.get_label(det.durum),
        'aktif_mi': det.aktif_mi,
        'gecikme_gun': gecikme_gun,
        'gun_kalan': gun_kalan,
        'ciro_edilen_cari_id': det.ciro_edilen_cari_id,
        'ciro_edilen_cari_label': ciro_label,
        'ciro_tarihi': str(det.ciro_tarihi) if det.ciro_tarihi else None,
        'protesto_tarihi': str(det.protesto_tarihi) if det.protesto_tarihi else None,
        'iade_tarihi': str(det.iade_tarihi) if det.iade_tarihi else None,
        'tahsil_tarihi': str(det.tahsil_tarihi) if det.tahsil_tarihi else None,
        'durum_aciklamasi': det.durum_aciklamasi,
        'taksit_id': det.taksit_id,
        'gider_taksit_id': det.gider_taksit_id,
        'tahsilat_id': det.tahsilat_id,
        'tahsilat_mali_hesap_id': det.tahsilat_mali_hesap_id,
        'sozlesme_no': sozlesme_no,
        'ogrenci_adi': display_adi,
        'kaynak': kaynak,
        'created_at': det.created_at.isoformat() if det.created_at else None,
        'updated_at': det.updated_at.isoformat() if det.updated_at else None,
    }


def _kullanici_adi(user) -> str:
    if not user:
        return ''
    full = (getattr(user, 'get_full_name', lambda: '')() or '').strip()
    return full or getattr(user, 'username', '') or ''


def log_cek_senet(
    detay,
    eylem: str,
    *,
    onceki_durum: str = '',
    yeni_durum: str = '',
    tutar: int | None = None,
    aciklama: str = '',
    user=None,
):
    """İşlem geçmişi (timeline) kaydı oluştur."""
    from apps.odeme_takip.domain.cek_senet import CekSenetLog
    return CekSenetLog.objects.create(
        detay=detay,
        eylem=eylem,
        onceki_durum=onceki_durum or '',
        yeni_durum=yeni_durum or '',
        tutar=tutar,
        aciklama=aciklama or '',
        kullanici=user if (user and getattr(user, 'is_authenticated', False)) else None,
        kullanici_adi=_kullanici_adi(user),
    )


def serialize_log(log) -> dict:
    return {
        'id': log.id,
        'eylem': log.eylem,
        'onceki_durum': log.onceki_durum,
        'onceki_durum_label': CekSenetDurum.get_label(log.onceki_durum) if log.onceki_durum else '',
        'yeni_durum': log.yeni_durum,
        'yeni_durum_label': CekSenetDurum.get_label(log.yeni_durum) if log.yeni_durum else '',
        'tutar': log.tutar,
        'aciklama': log.aciklama,
        'kullanici_adi': log.kullanici_adi,
        'created_at': log.created_at.isoformat() if log.created_at else None,
    }


def serialize_dosya(d) -> dict:
    return {
        'id': d.id,
        'dosya_adi': d.dosya_adi,
        'dosya_turu': d.dosya_turu,
        'dosya_turu_label': d.get_dosya_turu_display(),
        'dosya_url': d.dosya_url,
        'dosya_boyutu': d.dosya_boyutu,
        'dosya_boyutu_fmt': d.dosya_boyutu_fmt,
        'aciklama': d.aciklama,
        'yukleyen_adi': _kullanici_adi(d.yukleyen) if d.yukleyen_id else '',
        'created_at': d.created_at.isoformat() if d.created_at else None,
    }


class CekSenetService:
    """Çek/senet portföy işlemleri."""

    def __init__(self):
        self.bakiye_service = BakiyeHareketiService()
        self.tahsilat_service = TahsilatService()

    @staticmethod
    def _sync_takvim(detay: CekSenetDetay, user=None):
        try:
            from apps.finans.application.cek_senet.calendar_bridge import CekSenetCalendarBridge
            uid = user.pk if user and getattr(user, 'pk', None) else 1
            CekSenetCalendarBridge().sync_detay(detay, user_id=uid)
        except Exception:
            pass

    # Sekme -> filtre eşlemesi
    SEKME_FILTRELERI = {
        'gelen-cekler': {'yon': CekSenetYon.ALINAN, 'arac_tipi': CekSenetAracTipi.CEK},
        'verilen-cekler': {'yon': CekSenetYon.VERILEN, 'arac_tipi': CekSenetAracTipi.CEK},
        'gelen-senetler': {'yon': CekSenetYon.ALINAN, 'arac_tipi': CekSenetAracTipi.SENET},
        'verilen-senetler': {'yon': CekSenetYon.VERILEN, 'arac_tipi': CekSenetAracTipi.SENET},
        'portfoy': {'durum__in': list(CekSenetDurum.AKTIF_DURUMLAR)},
        'tahsil-edilenler': {'durum__in': [CekSenetDurum.TAHSIL_EDILDI, CekSenetDurum.TAHSIL]},
        'odenenler': {'durum': CekSenetDurum.ODENDI},
        'ciro-edilenler': {'durum': CekSenetDurum.CIRO},
        'iade-edilenler': {'durum': CekSenetDurum.IADE},
        'protestolular': {'durum__in': [CekSenetDurum.PROTESTO, CekSenetDurum.KARSILIKSIZ]},
        'iptaller': {'durum': CekSenetDurum.IPTAL},
    }

    def list_kayitlar(
        self,
        kurum_id: int,
        *,
        sube_id: int | None = None,
        yon: str | None = None,
        arac_tipi: str | None = None,
        durum: str | None = None,
        sekme: str | None = None,
        vade_baslangic: str | None = None,
        vade_bitis: str | None = None,
        arama: str = '',
        sort: str = '',
        page: int = 1,
        page_size: int = 25,
    ) -> dict:
        from django.db.models import Q

        qs = CekSenetDetay.objects.filter(kurum_id=kurum_id).select_related(
            'taksit__sozlesme__ogrenci',
            'tahsilat__sozlesme__ogrenci',
            'gider_taksit__gider_kaydi__cari_hesap',
            'odeme_yontemi',
            'cari_hesap',
            'ciro_edilen_cari',
        )
        if sube_id:
            qs = qs.filter(sube_id=sube_id)

        if sekme and sekme in self.SEKME_FILTRELERI:
            qs = qs.filter(**self.SEKME_FILTRELERI[sekme])

        if yon:
            qs = qs.filter(yon=yon)
        if arac_tipi:
            qs = qs.filter(arac_tipi=arac_tipi)
        if durum:
            durumlar = [d.strip() for d in durum.split(',') if d.strip()]
            if len(durumlar) > 1:
                qs = qs.filter(durum__in=durumlar)
            elif durumlar:
                qs = qs.filter(durum=durumlar[0])
        if vade_baslangic:
            qs = qs.filter(vade_tarihi__gte=vade_baslangic)
        if vade_bitis:
            qs = qs.filter(vade_tarihi__lte=vade_bitis)
        if arama:
            qs = qs.filter(
                Q(cek_senet_no__icontains=arama)
                | Q(seri_no__icontains=arama)
                | Q(banka_adi__icontains=arama)
                | Q(keside_eden__icontains=arama)
                | Q(aciklama__icontains=arama)
                | Q(cari_hesap__unvan__icontains=arama)
                | Q(taksit__sozlesme__sozlesme_no__icontains=arama)
            )

        sort_map = {
            'vade': 'vade_tarihi',
            '-vade': '-vade_tarihi',
            'tutar': 'tutar',
            '-tutar': '-tutar',
            'olusturma': 'created_at',
            '-olusturma': '-created_at',
        }
        order = sort_map.get(sort, 'vade_tarihi')
        qs = qs.order_by(order, '-id')

        total = qs.count()
        offset = max(page - 1, 0) * page_size
        rows = [serialize_cek_senet(d) for d in qs[offset:offset + page_size]]
        return {
            'count': total,
            'page': page,
            'page_size': page_size,
            'results': rows,
        }

    def get_by_id(self, pk: int) -> CekSenetDetay | None:
        return CekSenetDetay.objects.filter(pk=pk).select_related(
            'taksit__sozlesme__ogrenci',
            'tahsilat__sozlesme',
            'odeme_yontemi',
            'cari_hesap',
            'gider_taksit__gider_kaydi',
        ).first()

    @transaction.atomic
    def sync_sozlesme_plan(self, sozlesme) -> None:
        """Sözleşme taksit planı sonrası çek/senet kayıtlarını senkronize et."""
        if not cek_senet_v2_enabled():
            return

        self._apply_default_cek_senet_yontemleri_if_needed(sozlesme)

        taksitler = Taksit.objects.filter(sozlesme=sozlesme).select_related(
            'odeme_yontemi',
        ).prefetch_related('cek_senet_detay')

        for taksit in taksitler:
            yontem = taksit.odeme_yontemi
            detay = getattr(taksit, 'cek_senet_detay', None)

            if yontem and is_cek_senet_yontemi(yontem):
                if taksit.durum in (TaksitDurum.ODENDI, TaksitDurum.IPTAL):
                    if detay and detay.durum == CekSenetDurum.BEKLIYOR:
                        detay.durum = CekSenetDurum.IPTAL
                        detay.save(update_fields=['durum', 'updated_at'])
                    continue

                if detay:
                    if detay.durum == CekSenetDurum.BEKLIYOR:
                        detay.tutar = taksit.kalan_tutar or taksit.tutar
                        detay.vade_tarihi = taksit.vade_tarihi
                        detay.odeme_yontemi = yontem
                        detay.arac_tipi = arac_tipi_from_yontem(yontem)
                        detay.save(update_fields=[
                            'tutar', 'vade_tarihi', 'odeme_yontemi', 'arac_tipi', 'updated_at',
                        ])
                else:
                    self.create_from_taksit(taksit, yontem)
            elif detay and detay.durum == CekSenetDurum.BEKLIYOR:
                detay.durum = CekSenetDurum.IPTAL
                detay.save(update_fields=['durum', 'updated_at'])

    def _apply_default_cek_senet_yontemleri_if_needed(self, sozlesme) -> None:
        """Çek/senet sözleşmesinde yöntemsiz taksitlere kurumdaki tek çek/senet yöntemini ata."""
        from apps.odeme_takip.domain.enums import OdemeTuru
        from apps.finans.constants.payment_types import OdemeYontemiTipi
        from apps.finans.domain.payment_method import OdemeYontemi

        if sozlesme.odeme_turu != OdemeTuru.CEK_SENET:
            return
        if not Taksit.objects.filter(sozlesme=sozlesme, odeme_yontemi_id__isnull=True).exists():
            return

        cek_yontemleri = list(
            OdemeYontemi.objects.filter(
                kurum_id=sozlesme.kurum_id,
                mali_hesap__isnull=True,
                tip__in=[OdemeYontemiTipi.CEK, OdemeYontemiTipi.SENET],
                aktif_mi=True,
                silindi_mi=False,
            ).order_by('siralama', 'id')
        )
        if len(cek_yontemleri) != 1:
            return

        Taksit.objects.filter(
            sozlesme=sozlesme,
            odeme_yontemi_id__isnull=True,
        ).update(odeme_yontemi_id=cek_yontemleri[0].id)

    @transaction.atomic
    def create_from_taksit(self, taksit, odeme_yontemi) -> CekSenetDetay | None:
        if not cek_senet_v2_enabled() or not is_cek_senet_yontemi(odeme_yontemi):
            return None
        if hasattr(taksit, 'cek_senet_detay') and taksit.cek_senet_detay_id:
            return taksit.cek_senet_detay

        sozlesme = taksit.sozlesme
        detay = CekSenetDetay.objects.create(
            yon=CekSenetYon.ALINAN,
            arac_tipi=arac_tipi_from_yontem(odeme_yontemi),
            kurum_id=sozlesme.kurum_id,
            sube_id=sozlesme.sube_id,
            odeme_yontemi=odeme_yontemi,
            tutar=taksit.kalan_tutar or taksit.tutar,
            vade_tarihi=taksit.vade_tarihi,
            olusturma_tarihi=timezone.localdate(),
            aciklama=f'{sozlesme.sozlesme_no} — Taksit {taksit.taksit_no}',
            taksit=taksit,
            durum=CekSenetDurum.BEKLIYOR,
        )
        log_cek_senet(
            detay, 'olusturuldu', yeni_durum=CekSenetDurum.BEKLIYOR,
            tutar=detay.tutar, aciklama='Sözleşme taksit planından oluşturuldu',
        )
        return detay

    @transaction.atomic
    def create_from_gider_taksit(self, gider_taksit, odeme_yontemi) -> CekSenetDetay | None:
        if not cek_senet_v2_enabled() or not is_cek_senet_yontemi(odeme_yontemi):
            return None
        if hasattr(gider_taksit, 'cek_senet_detay') and gider_taksit.cek_senet_detay_id:
            return gider_taksit.cek_senet_detay

        gider = gider_taksit.gider_kaydi
        kalan = gider_taksit.kalan_tutar
        tutar = int(kalan) if kalan else int(gider_taksit.tutar)
        detay = CekSenetDetay.objects.create(
            yon=CekSenetYon.VERILEN,
            arac_tipi=arac_tipi_from_yontem(odeme_yontemi),
            kurum_id=gider.kurum_id,
            sube_id=gider.sube_id,
            cari_hesap=gider.cari_hesap,
            odeme_yontemi=odeme_yontemi,
            tutar=tutar,
            vade_tarihi=gider_taksit.vade_tarihi,
            olusturma_tarihi=timezone.localdate(),
            aciklama=f'Gider {gider.fatura_no or gider.pk} — Taksit {gider_taksit.taksit_no}',
            gider_taksit=gider_taksit,
            durum=CekSenetDurum.BEKLIYOR,
        )
        log_cek_senet(
            detay, 'olusturuldu', yeni_durum=CekSenetDurum.BEKLIYOR,
            tutar=detay.tutar, aciklama='Gider taksit planından oluşturuldu',
        )
        self._sync_takvim(detay)
        return detay

    @transaction.atomic
    def sync_gider_plan(self, gider_kaydi) -> None:
        """Gider taksit planı sonrası verilen çek/senet kayıtlarını senkronize et."""
        if not cek_senet_v2_enabled():
            return

        from apps.finans.constants.gider_types import GiderTaksitDurum
        from apps.finans.domain.gider_taksit import GiderTaksit

        taksitler = GiderTaksit.objects.filter(gider_kaydi=gider_kaydi).select_related(
            'odeme_yontemi', 'gider_kaydi__cari_hesap',
        ).prefetch_related('cek_senet_detay')

        for taksit in taksitler:
            yontem = taksit.odeme_yontemi
            detay = getattr(taksit, 'cek_senet_detay', None)

            if yontem and is_cek_senet_yontemi(yontem):
                if taksit.durum in (GiderTaksitDurum.ODENDI, GiderTaksitDurum.IPTAL):
                    if detay and detay.durum == CekSenetDurum.BEKLIYOR:
                        detay.durum = CekSenetDurum.IPTAL
                        detay.save(update_fields=['durum', 'updated_at'])
                        self._sync_takvim(detay)
                    continue

                kalan = taksit.kalan_tutar
                tutar = int(kalan) if kalan else int(taksit.tutar)
                if detay:
                    if detay.durum == CekSenetDurum.BEKLIYOR:
                        detay.tutar = tutar
                        detay.vade_tarihi = taksit.vade_tarihi
                        detay.odeme_yontemi = yontem
                        detay.arac_tipi = arac_tipi_from_yontem(yontem)
                        detay.cari_hesap = gider_kaydi.cari_hesap
                        detay.save(update_fields=[
                            'tutar', 'vade_tarihi', 'odeme_yontemi', 'arac_tipi',
                            'cari_hesap', 'updated_at',
                        ])
                        self._sync_takvim(detay)
                else:
                    self.create_from_gider_taksit(taksit, yontem)
            elif detay and detay.durum == CekSenetDurum.BEKLIYOR:
                detay.durum = CekSenetDurum.IPTAL
                detay.save(update_fields=['durum', 'updated_at'])
                self._sync_takvim(detay)

    @transaction.atomic
    def transition(self, kayit_id: int, hedef_durum: str, payload: dict | None = None, user=None):
        detay = self.get_by_id(kayit_id)
        if not detay:
            return None, {'error': 'Kayıt bulunamadı'}

        payload = payload or {}
        hedef = CekSenetDurum.normalize(hedef_durum)
        mevcut = CekSenetDurum.normalize(detay.durum)

        if not CekSenetDurum.can_transition(detay.yon, mevcut, hedef):
            return None, {
                'error': f'Geçersiz durum geçişi: {CekSenetDurum.get_label(mevcut)} → {CekSenetDurum.get_label(hedef)}',
            }

        update_fields = ['durum', 'updated_at']
        detay.durum = hedef

        if hedef in (CekSenetDurum.PORTFOYDE, CekSenetDurum.HAZIRLANDI, CekSenetDurum.VERILDI):
            for field in ('cek_senet_no', 'banka_adi', 'sube_adi', 'hesap_no', 'keside_eden'):
                if field in payload:
                    setattr(detay, field, (payload.get(field) or '').strip())
                    update_fields.append(field)
            if payload.get('keside_tarihi'):
                detay.keside_tarihi = payload['keside_tarihi']
                update_fields.append('keside_tarihi')
            if payload.get('vade_tarihi'):
                detay.vade_tarihi = payload['vade_tarihi']
                update_fields.append('vade_tarihi')

        if hedef == CekSenetDurum.IPTAL and detay.taksit_id:
            taksit = detay.taksit
            if taksit.durum not in (TaksitDurum.ODENDI, TaksitDurum.IPTAL):
                pass  # taksit açık kalır

        detay.save(update_fields=update_fields)
        if mevcut != hedef:
            log_cek_senet(
                detay,
                'durum_degisti',
                onceki_durum=mevcut,
                yeni_durum=hedef,
                tutar=detay.tutar,
                aciklama=(payload.get('aciklama') or '').strip(),
                user=user,
            )
        self._sync_takvim(detay, user)
        return detay, None

    @transaction.atomic
    def tahsil_et(
        self,
        kayit_id: int,
        *,
        tahsilat_mali_hesap_id: int,
        tahsilat_tarihi: date | str | None = None,
        referans_no: str = '',
        aciklama: str = '',
        user=None,
    ):
        """Alınan çek/senet tahsil edildi — mali hareket + taksit kapanışı."""
        if not cek_senet_v2_enabled():
            return None, {'error': 'Çek/senet V2 özelliği kapalı'}

        detay = self.get_by_id(kayit_id)
        if not detay:
            return None, {'error': 'Kayıt bulunamadı'}
        if detay.yon != CekSenetYon.ALINAN:
            return None, {'error': 'Yalnızca alınan çek/senet tahsil edilebilir'}
        if detay.durum not in (CekSenetDurum.TAHSILDE, CekSenetDurum.PORTFOYDE):
            return None, {'error': 'Tahsil için kayıt tahsilde veya portföyde olmalı'}
        if not detay.taksit_id:
            return None, {'error': 'Taksit bağlantısı yok'}
        if not detay.odeme_yontemi_id:
            return None, {'error': 'Ödeme yöntemi tanımlı değil'}

        taksit = detay.taksit
        sozlesme = taksit.sozlesme
        tutar = detay.tutar or taksit.kalan_tutar or taksit.tutar
        islem_tarihi = tahsilat_tarihi or timezone.localdate()
        if isinstance(islem_tarihi, str):
            islem_tarihi = date.fromisoformat(islem_tarihi)

        tahsilat_data = {
            'sozlesme_id': sozlesme.id,
            'taksit_id': taksit.id,
            'odeme_yontemi_id': detay.odeme_yontemi_id,
            'mali_hesap_id': tahsilat_mali_hesap_id,
            'tutar': tutar,
            'tahsilat_tarihi': islem_tarihi,
            'referans_no': referans_no or detay.cek_senet_no,
            'aciklama': aciklama or f'Çek/Senet tahsil: {detay.cek_senet_no or detay.id}',
            '_skip_cek_senet_guard': True,
            '_single_taksit_only': True,
        }

        tahsilat, errors = self._create_tahsilat_for_cek_senet(tahsilat_data, user=user)
        if errors:
            return None, errors

        onceki = detay.durum
        detay.tahsilat = tahsilat
        detay.tahsilat_mali_hesap_id = tahsilat_mali_hesap_id
        detay.durum = CekSenetDurum.TAHSIL_EDILDI
        detay.tahsil_tarihi = islem_tarihi
        detay.save(update_fields=[
            'tahsilat', 'tahsilat_mali_hesap', 'durum', 'tahsil_tarihi', 'updated_at',
        ])
        log_cek_senet(
            detay, 'tahsil_edildi',
            onceki_durum=onceki, yeni_durum=CekSenetDurum.TAHSIL_EDILDI,
            tutar=tutar, aciklama=aciklama or 'Tahsil edildi', user=user,
        )

        return serialize_cek_senet(detay), None

    def _create_tahsilat_for_cek_senet(self, data: dict, user=None):
        """Çek/senet tahsilinde yalnızca hedef taksiti kapat."""
        from apps.odeme_takip.domain.models import Sozlesme, Tahsilat
        from apps.odeme_takip.domain.enums import TahsilatTuru, SozlesmeDurum

        sozlesme_id = data['sozlesme_id']
        try:
            sozlesme = Sozlesme.objects.get(id=sozlesme_id)
        except Sozlesme.DoesNotExist:
            return None, {'error': 'Sözleşme bulunamadı'}

        if sozlesme.durum not in (SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS):
            return None, {'error': 'Bu sözleşmeye tahsilat kaydedilemez'}

        taksit = self.tahsilat_service.taksit_repo.get_by_id(data.get('taksit_id'))
        if not taksit:
            return None, {'error': 'Taksit bulunamadı'}

        tutar = int(data['tutar'])
        mali_hesap_id = data.get('mali_hesap_id')
        islem_tarihi = data['tahsilat_tarihi']

        tahsilat = self.tahsilat_service.repo.create({
            'sozlesme_id': sozlesme_id,
            'taksit': taksit,
            'odeme_yontemi_id': data['odeme_yontemi_id'],
            'mali_hesap_id': mali_hesap_id,
            'tutar': tutar,
            'tahsilat_tarihi': islem_tarihi,
            'referans_no': data.get('referans_no', ''),
            'tahsilat_turu': TahsilatTuru.NORMAL,
            'durum': TahsilatDurum.AKTIF,
            'islem_yapan': user,
            'aciklama': data.get('aciklama', ''),
        })

        if mali_hesap_id:
            hareket = self.bakiye_service.tahsilat_giris(
                mali_hesap_id=mali_hesap_id,
                kurum_id=sozlesme.kurum_id,
                sube_id=sozlesme.sube_id,
                egitim_yili_id=sozlesme.egitim_yili_id,
                tutar=tutar,
                islem_tarihi=islem_tarihi,
                tahsilat_id=tahsilat.pk,
                aciklama=f'Tahsilat: {sozlesme.sozlesme_no} — {data.get("aciklama", "")}'.strip(' —'),
                islem_yapan=user,
            )
            tahsilat.bakiye_hareketi_id = hareket.pk
            tahsilat.save(update_fields=['bakiye_hareketi_id'])

        taksit_odenecek = int(min(tutar, taksit.kalan_tutar))
        if taksit_odenecek > 0:
            TahsilatDagitim.objects.create(
                tahsilat=tahsilat,
                taksit=taksit,
                tutar=taksit_odenecek,
            )
            taksit.bakiye_guncelle()
            taksit.save()

        return tahsilat, None

    def allowed_transitions(self, detay: CekSenetDetay) -> list[dict]:
        mevcut = CekSenetDurum.normalize(detay.durum)
        graph = (
            CekSenetDurum.ALINAN_TRANSITIONS
            if detay.yon == CekSenetYon.ALINAN
            else CekSenetDurum.VERILEN_TRANSITIONS
        )
        allowed = graph.get(mevcut, set())
        return [
            {'durum': d, 'label': CekSenetDurum.get_label(d)}
            for d in sorted(allowed)
        ]

    @transaction.atomic
    def create_verilen(self, data: dict, user=None):
        """Manuel verilen çek/senet kaydı oluştur."""
        if not cek_senet_v2_enabled():
            return None, {'error': 'Çek/senet V2 özelliği kapalı'}

        kurum_id = data.get('kurum_id')
        sube_id = data.get('sube_id')
        odeme_yontemi_id = data.get('odeme_yontemi_id')
        if not kurum_id or not sube_id or not odeme_yontemi_id:
            return None, {'error': 'kurum_id, sube_id ve odeme_yontemi_id zorunlu'}

        yontem = OdemeYontemi.objects.filter(id=odeme_yontemi_id).first()
        if not is_cek_senet_yontemi(yontem):
            return None, {'error': 'Ödeme yöntemi çek/senet tipinde olmalı'}

        tutar = int(data.get('tutar') or 0)
        vade = data.get('vade_tarihi')
        if tutar <= 0 or not vade:
            return None, {'error': 'tutar ve vade_tarihi zorunlu'}

        cari_hesap = None
        if data.get('cari_hesap_id'):
            from apps.finans.domain.cari_hesap import CariHesap
            cari_hesap = CariHesap.objects.filter(id=data['cari_hesap_id']).first()

        detay = CekSenetDetay.objects.create(
            yon=CekSenetYon.VERILEN,
            arac_tipi=arac_tipi_from_yontem(yontem),
            kurum_id=kurum_id,
            sube_id=sube_id,
            cari_hesap=cari_hesap,
            odeme_yontemi=yontem,
            tutar=tutar,
            vade_tarihi=vade,
            olusturma_tarihi=timezone.localdate(),
            aciklama=(data.get('aciklama') or '').strip(),
            cek_senet_no=(data.get('cek_senet_no') or '').strip(),
            seri_no=(data.get('seri_no') or '').strip(),
            banka_adi=(data.get('banka_adi') or '').strip(),
            sube_adi=(data.get('sube_adi') or '').strip(),
            hesap_no=(data.get('hesap_no') or '').strip(),
            keside_eden=(data.get('keside_eden') or '').strip(),
            keside_tarihi=data.get('keside_tarihi') or None,
            durum=CekSenetDurum.BEKLIYOR,
        )
        log_cek_senet(
            detay, 'olusturuldu', yeni_durum=CekSenetDurum.BEKLIYOR,
            tutar=detay.tutar, aciklama='Manuel verilen kayıt oluşturuldu', user=user,
        )
        self._sync_takvim(detay, user)
        return serialize_cek_senet(detay), None

    @transaction.atomic
    def create_alinan(self, data: dict, user=None):
        """Manuel alınan çek/senet kaydı oluştur (sözleşmesiz)."""
        if not cek_senet_v2_enabled():
            return None, {'error': 'Çek/senet V2 özelliği kapalı'}

        kurum_id = data.get('kurum_id')
        sube_id = data.get('sube_id')
        odeme_yontemi_id = data.get('odeme_yontemi_id')
        if not kurum_id or not sube_id or not odeme_yontemi_id:
            return None, {'error': 'kurum_id, sube_id ve odeme_yontemi_id zorunlu'}

        yontem = OdemeYontemi.objects.filter(id=odeme_yontemi_id).first()
        if not is_cek_senet_yontemi(yontem):
            return None, {'error': 'Ödeme yöntemi çek/senet tipinde olmalı'}

        tutar = int(data.get('tutar') or 0)
        vade = data.get('vade_tarihi')
        if tutar <= 0 or not vade:
            return None, {'error': 'tutar ve vade_tarihi zorunlu'}

        cari_hesap = None
        if data.get('cari_hesap_id'):
            from apps.finans.domain.cari_hesap import CariHesap
            cari_hesap = CariHesap.objects.filter(id=data['cari_hesap_id']).first()

        detay = CekSenetDetay.objects.create(
            yon=CekSenetYon.ALINAN,
            arac_tipi=arac_tipi_from_yontem(yontem),
            kurum_id=kurum_id,
            sube_id=sube_id,
            cari_hesap=cari_hesap,
            odeme_yontemi=yontem,
            tutar=tutar,
            vade_tarihi=vade,
            olusturma_tarihi=timezone.localdate(),
            aciklama=(data.get('aciklama') or '').strip(),
            cek_senet_no=(data.get('cek_senet_no') or '').strip(),
            seri_no=(data.get('seri_no') or '').strip(),
            banka_adi=(data.get('banka_adi') or '').strip(),
            sube_adi=(data.get('sube_adi') or '').strip(),
            hesap_no=(data.get('hesap_no') or '').strip(),
            keside_eden=(data.get('keside_eden') or '').strip(),
            keside_tarihi=data.get('keside_tarihi') or None,
            durum=CekSenetDurum.PORTFOYDE,
        )
        log_cek_senet(
            detay, 'olusturuldu', yeni_durum=CekSenetDurum.PORTFOYDE,
            tutar=detay.tutar, aciklama='Manuel alınan kayıt oluşturuldu', user=user,
        )
        return serialize_cek_senet(detay), None

    @transaction.atomic
    def guncelle(self, kayit_id: int, data: dict, user=None):
        """Kimlik/belge alanlarını güncelle (durum değiştirmeden)."""
        detay = self.get_by_id(kayit_id)
        if not detay:
            return None, {'error': 'Kayıt bulunamadı'}

        editable = [
            'cek_senet_no', 'seri_no', 'banka_adi', 'sube_adi', 'hesap_no',
            'keside_eden', 'aciklama',
        ]
        update_fields = ['updated_at']
        for field in editable:
            if field in data:
                setattr(detay, field, (data.get(field) or '').strip())
                update_fields.append(field)
        if 'keside_tarihi' in data:
            detay.keside_tarihi = data.get('keside_tarihi') or None
            update_fields.append('keside_tarihi')
        if data.get('vade_tarihi') and detay.aktif_mi:
            detay.vade_tarihi = data['vade_tarihi']
            update_fields.append('vade_tarihi')
        if data.get('tutar') and detay.durum in (CekSenetDurum.BEKLIYOR, CekSenetDurum.PORTFOYDE, CekSenetDurum.HAZIRLANDI):
            try:
                detay.tutar = int(data['tutar'])
                update_fields.append('tutar')
            except (TypeError, ValueError):
                pass
        if data.get('cari_hesap_id') is not None:
            detay.cari_hesap_id = data['cari_hesap_id'] or None
            update_fields.append('cari_hesap')

        detay.save(update_fields=update_fields)
        log_cek_senet(detay, 'guncellendi', tutar=detay.tutar, aciklama='Bilgiler güncellendi', user=user)
        self._sync_takvim(detay, user)
        return serialize_cek_senet(detay), None

    @transaction.atomic
    def ciro_et(self, kayit_id: int, *, ciro_edilen_cari_id: int, ciro_tarihi=None, aciklama: str = '', user=None):
        """Alınan çek/senedi başka bir cariye ciro et (devret)."""
        detay = self.get_by_id(kayit_id)
        if not detay:
            return None, {'error': 'Kayıt bulunamadı'}
        if detay.yon != CekSenetYon.ALINAN:
            return None, {'error': 'Yalnızca alınan çek/senet ciro edilebilir'}
        if not CekSenetDurum.can_transition(detay.yon, detay.durum, CekSenetDurum.CIRO):
            return None, {'error': 'Bu durumdaki kayıt ciro edilemez'}
        if not ciro_edilen_cari_id:
            return None, {'error': 'Ciro edilecek cari seçilmeli'}

        from apps.finans.domain.cari_hesap import CariHesap
        cari = CariHesap.objects.filter(id=ciro_edilen_cari_id).first()
        if not cari:
            return None, {'error': 'Ciro edilecek cari bulunamadı'}

        tarih = ciro_tarihi or timezone.localdate()
        if isinstance(tarih, str):
            tarih = date.fromisoformat(tarih)

        onceki = detay.durum
        detay.ciro_edilen_cari = cari
        detay.ciro_tarihi = tarih
        detay.durum = CekSenetDurum.CIRO
        detay.durum_aciklamasi = aciklama or f'{cari.gorunen_ad} carisine ciro edildi'
        detay.save(update_fields=[
            'ciro_edilen_cari', 'ciro_tarihi', 'durum', 'durum_aciklamasi', 'updated_at',
        ])
        log_cek_senet(
            detay, 'ciro_edildi', onceki_durum=onceki, yeni_durum=CekSenetDurum.CIRO,
            tutar=detay.tutar,
            aciklama=aciklama or f'{cari.gorunen_ad} carisine ciro edildi', user=user,
        )
        return serialize_cek_senet(detay), None

    @transaction.atomic
    def protesto_et(self, kayit_id: int, *, protesto_tarihi=None, aciklama: str = '', user=None):
        """Çek/senedi protestolu işaretle (vadede ödenmedi)."""
        detay = self.get_by_id(kayit_id)
        if not detay:
            return None, {'error': 'Kayıt bulunamadı'}
        if not CekSenetDurum.can_transition(detay.yon, detay.durum, CekSenetDurum.PROTESTO):
            return None, {'error': 'Bu durumdaki kayıt protesto edilemez'}

        tarih = protesto_tarihi or timezone.localdate()
        if isinstance(tarih, str):
            tarih = date.fromisoformat(tarih)

        onceki = detay.durum
        detay.protesto_tarihi = tarih
        detay.durum = CekSenetDurum.PROTESTO
        detay.durum_aciklamasi = aciklama or 'Vadesinde tahsil edilemedi — protesto'
        detay.save(update_fields=['protesto_tarihi', 'durum', 'durum_aciklamasi', 'updated_at'])
        log_cek_senet(
            detay, 'protesto_edildi', onceki_durum=onceki, yeni_durum=CekSenetDurum.PROTESTO,
            tutar=detay.tutar, aciklama=detay.durum_aciklamasi, user=user,
        )
        return serialize_cek_senet(detay), None

    @transaction.atomic
    def iade_et(self, kayit_id: int, *, iade_tarihi=None, aciklama: str = '', user=None):
        """Çek/senedi iade et (kaynağına geri verildi)."""
        detay = self.get_by_id(kayit_id)
        if not detay:
            return None, {'error': 'Kayıt bulunamadı'}
        if not CekSenetDurum.can_transition(detay.yon, detay.durum, CekSenetDurum.IADE):
            return None, {'error': 'Bu durumdaki kayıt iade edilemez'}

        tarih = iade_tarihi or timezone.localdate()
        if isinstance(tarih, str):
            tarih = date.fromisoformat(tarih)

        onceki = detay.durum
        detay.iade_tarihi = tarih
        detay.durum = CekSenetDurum.IADE
        detay.durum_aciklamasi = aciklama or 'İade edildi'
        detay.save(update_fields=['iade_tarihi', 'durum', 'durum_aciklamasi', 'updated_at'])
        log_cek_senet(
            detay, 'iade_edildi', onceki_durum=onceki, yeni_durum=CekSenetDurum.IADE,
            tutar=detay.tutar, aciklama=detay.durum_aciklamasi, user=user,
        )
        return serialize_cek_senet(detay), None

    @transaction.atomic
    def iptal_et(self, kayit_id: int, *, aciklama: str = '', user=None):
        """Çek/senedi iptal et."""
        detay = self.get_by_id(kayit_id)
        if not detay:
            return None, {'error': 'Kayıt bulunamadı'}
        if not CekSenetDurum.can_transition(detay.yon, detay.durum, CekSenetDurum.IPTAL):
            return None, {'error': 'Bu durumdaki kayıt iptal edilemez'}

        onceki = detay.durum
        detay.durum = CekSenetDurum.IPTAL
        detay.durum_aciklamasi = aciklama or 'İptal edildi'
        detay.save(update_fields=['durum', 'durum_aciklamasi', 'updated_at'])
        log_cek_senet(
            detay, 'iptal_edildi', onceki_durum=onceki, yeni_durum=CekSenetDurum.IPTAL,
            tutar=detay.tutar, aciklama=detay.durum_aciklamasi, user=user,
        )
        self._sync_takvim(detay, user)
        return serialize_cek_senet(detay), None

    def timeline(self, kayit_id: int) -> list[dict]:
        from apps.odeme_takip.domain.cek_senet import CekSenetLog
        loglar = CekSenetLog.objects.filter(detay_id=kayit_id).select_related('kullanici')
        return [serialize_log(l) for l in loglar]

    def dosyalar(self, kayit_id: int) -> list[dict]:
        from apps.odeme_takip.domain.cek_senet import CekSenetDosya
        rows = CekSenetDosya.objects.filter(detay_id=kayit_id).select_related('yukleyen')
        return [serialize_dosya(d) for d in rows]

    @transaction.atomic
    def dosya_ekle(self, kayit_id: int, *, dosya, dosya_adi: str = '', dosya_turu: str = 'diger', aciklama: str = '', user=None):
        from apps.odeme_takip.domain.cek_senet import CekSenetDosya
        detay = self.get_by_id(kayit_id)
        if not detay:
            return None, {'error': 'Kayıt bulunamadı'}
        if not dosya:
            return None, {'error': 'Dosya gerekli'}

        obj = CekSenetDosya.objects.create(
            detay=detay,
            kurum_id=detay.kurum_id,
            dosya=dosya,
            dosya_adi=(dosya_adi or getattr(dosya, 'name', 'dosya')).strip(),
            dosya_turu=dosya_turu or 'diger',
            aciklama=(aciklama or '').strip(),
            dosya_boyutu=getattr(dosya, 'size', 0) or 0,
            yukleyen=user if (user and getattr(user, 'is_authenticated', False)) else None,
        )
        log_cek_senet(detay, 'dosya_eklendi', aciklama=f'Dosya: {obj.dosya_adi}', user=user)
        return serialize_dosya(obj), None

    @transaction.atomic
    def dosya_sil(self, kayit_id: int, dosya_id: int, user=None):
        from apps.odeme_takip.domain.cek_senet import CekSenetDosya
        obj = CekSenetDosya.objects.filter(id=dosya_id, detay_id=kayit_id).first()
        if not obj:
            return False, {'error': 'Dosya bulunamadı'}
        ad = obj.dosya_adi
        detay = obj.detay
        try:
            obj.dosya.delete(save=False)
        except Exception:
            pass
        obj.delete()
        log_cek_senet(detay, 'dosya_silindi', aciklama=f'Dosya silindi: {ad}', user=user)
        return True, None

    def dashboard(self, kurum_id: int, *, sube_id: int | None = None) -> dict:
        """Özet KPI'lar + grafik verileri."""
        from django.db.models import Count, Sum, Q

        qs = CekSenetDetay.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)

        bugun = timezone.localdate()
        yaklasan_sinir = bugun + timedelta(days=7)
        aktif = list(CekSenetDurum.AKTIF_DURUMLAR)

        def _agg(queryset):
            r = queryset.aggregate(adet=Count('id'), tutar=Sum('tutar'))
            return {'adet': r['adet'] or 0, 'tutar': int(r['tutar'] or 0)}

        aktif_qs = qs.filter(durum__in=aktif)
        alinan_aktif = aktif_qs.filter(yon=CekSenetYon.ALINAN)
        verilen_aktif = aktif_qs.filter(yon=CekSenetYon.VERILEN)

        kpi = {
            'toplam_cek': _agg(aktif_qs.filter(arac_tipi=CekSenetAracTipi.CEK)),
            'toplam_senet': _agg(aktif_qs.filter(arac_tipi=CekSenetAracTipi.SENET)),
            'tahsil_bekleyen': _agg(alinan_aktif),
            'odeme_bekleyen': _agg(verilen_aktif),
            'yaklasan_vadeler': _agg(aktif_qs.filter(vade_tarihi__gte=bugun, vade_tarihi__lte=yaklasan_sinir)),
            'gecikenler': _agg(aktif_qs.filter(vade_tarihi__lt=bugun)),
            'toplam_risk': _agg(verilen_aktif),
            'toplam_portfoy': _agg(alinan_aktif),
        }

        # Durum dağılımı
        durum_dagilim = []
        for row in qs.values('durum').annotate(adet=Count('id'), tutar=Sum('tutar')).order_by('-adet'):
            durum_dagilim.append({
                'durum': row['durum'],
                'durum_label': CekSenetDurum.get_label(row['durum']),
                'adet': row['adet'],
                'tutar': int(row['tutar'] or 0),
            })

        # Aylık vade dağılımı (aktif kayıtlar, önümüzdeki 6 ay)
        aylik = []
        for i in range(6):
            ay_bas = (bugun.replace(day=1) + timedelta(days=32 * i)).replace(day=1)
            sonraki = (ay_bas + timedelta(days=32)).replace(day=1)
            ag = aktif_qs.filter(vade_tarihi__gte=ay_bas, vade_tarihi__lt=sonraki).aggregate(
                alinan=Sum('tutar', filter=Q(yon=CekSenetYon.ALINAN)),
                verilen=Sum('tutar', filter=Q(yon=CekSenetYon.VERILEN)),
            )
            aylik.append({
                'ay': ay_bas.strftime('%Y-%m'),
                'ay_label': ay_bas.strftime('%m/%Y'),
                'alinan': int(ag['alinan'] or 0),
                'verilen': int(ag['verilen'] or 0),
            })

        return {
            'kpi': kpi,
            'durum_dagilim': durum_dagilim,
            'aylik_vade': aylik,
        }

    @transaction.atomic
    def ode(
        self,
        kayit_id: int,
        *,
        odeme_mali_hesap_id: int,
        odeme_tarihi: date | str | None = None,
        aciklama: str = '',
        user=None,
    ):
        """Verilen çek/senet ödendi — banka çıkış hareketi."""
        if not cek_senet_v2_enabled():
            return None, {'error': 'Çek/senet V2 özelliği kapalı'}

        detay = self.get_by_id(kayit_id)
        if not detay:
            return None, {'error': 'Kayıt bulunamadı'}
        if detay.yon != CekSenetYon.VERILEN:
            return None, {'error': 'Yalnızca verilen çek/senet ödenebilir'}
        if detay.durum != CekSenetDurum.VERILDI:
            return None, {'error': 'Ödeme için kayıt verildi durumunda olmalı'}

        tutar = detay.tutar
        if tutar <= 0:
            return None, {'error': 'Geçersiz tutar'}

        islem_tarihi = odeme_tarihi or timezone.localdate()
        if isinstance(islem_tarihi, str):
            islem_tarihi = date.fromisoformat(islem_tarihi)

        from apps.finans.domain.financial_account import MaliHesap
        mali_hesap = MaliHesap.objects.filter(id=odeme_mali_hesap_id).first()
        if not mali_hesap:
            return None, {'error': 'Mali hesap bulunamadı'}

        if detay.gider_taksit_id:
            from decimal import Decimal
            from apps.finans.application.gider_odeme_service import GiderOdemeService

            gt = detay.gider_taksit
            gider = gt.gider_kaydi
            if not detay.odeme_yontemi_id:
                return None, {'error': 'Çek/senet kaydında ödeme yöntemi bulunamadı'}

            odeme_svc = GiderOdemeService()
            _, err = odeme_svc.record_from_cek_senet_odeme(
                gider,
                Decimal(str(tutar)),
                {
                    'gider_kaydi_id': gider.pk,
                    'gider_taksit_id': gt.pk,
                    'odeme_yontemi_id': detay.odeme_yontemi_id,
                    'mali_hesap_id': odeme_mali_hesap_id,
                    'tutar': Decimal(str(tutar)),
                    'odeme_tarihi': islem_tarihi,
                    'aciklama': aciklama or f'Verilen çek/senet ödeme: {detay.cek_senet_no or detay.id}',
                    'islem_yapan': user,
                },
            )
            if err:
                return None, err
        else:
            egitim_yili_id = None
            if detay.kurum_id:
                from apps.egitim_yili.domain.models import EgitimYili
                ey = EgitimYili.objects.filter(aktif_mi=True).order_by('-baslangic_yil').first()
                egitim_yili_id = ey.id if ey else None

            self.bakiye_service.hareket_olustur(
                mali_hesap_id=odeme_mali_hesap_id,
                kurum_id=detay.kurum_id,
                sube_id=detay.sube_id,
                egitim_yili_id=egitim_yili_id,
                tutar=tutar,
                yon=HareketYonu.CIKIS,
                kaynak=HareketKaynagi.GIDER,
                islem_tarihi=islem_tarihi,
                kaynak_id=detay.pk,
                aciklama=aciklama or f'Verilen çek/senet ödeme: {detay.cek_senet_no or detay.id}',
                islem_yapan=user,
            )

        onceki = detay.durum
        detay.tahsilat_mali_hesap_id = odeme_mali_hesap_id
        detay.durum = CekSenetDurum.ODENDI
        detay.tahsil_tarihi = islem_tarihi
        detay.save(update_fields=['tahsilat_mali_hesap', 'durum', 'tahsil_tarihi', 'updated_at'])

        log_cek_senet(
            detay, 'odendi',
            onceki_durum=onceki, yeni_durum=CekSenetDurum.ODENDI,
            tutar=tutar, aciklama=aciklama or 'Ödendi', user=user,
        )
        self._sync_takvim(detay, user)
        return serialize_cek_senet(detay), None
