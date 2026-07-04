"""
Çek / Senet portföy servisi — plan kaydı, durum geçişleri, tahsil/ödeme.
"""
from __future__ import annotations

from datetime import date

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
    if sozlesme:
        sozlesme_no = sozlesme.sozlesme_no or ''
        if sozlesme.ogrenci:
            ogrenci_adi = f'{sozlesme.ogrenci.ad} {sozlesme.ogrenci.soyad}'.strip()

    display_adi = ogrenci_adi or cari_label

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
        'banka_adi': det.banka_adi,
        'sube_adi': det.sube_adi,
        'hesap_no': det.hesap_no,
        'keside_eden': det.keside_eden,
        'keside_tarihi': str(det.keside_tarihi) if det.keside_tarihi else None,
        'vade_tarihi': str(det.vade_tarihi) if det.vade_tarihi else None,
        'durum': det.durum,
        'durum_label': CekSenetDurum.get_label(det.durum),
        'taksit_id': det.taksit_id,
        'tahsilat_id': det.tahsilat_id,
        'tahsilat_mali_hesap_id': det.tahsilat_mali_hesap_id,
        'sozlesme_no': sozlesme_no,
        'ogrenci_adi': display_adi,
        'kaynak': kaynak,
        'created_at': det.created_at.isoformat() if det.created_at else None,
        'updated_at': det.updated_at.isoformat() if det.updated_at else None,
    }


class CekSenetService:
    """Çek/senet portföy işlemleri."""

    def __init__(self):
        self.bakiye_service = BakiyeHareketiService()
        self.tahsilat_service = TahsilatService()

    def list_kayitlar(
        self,
        kurum_id: int,
        *,
        sube_id: int | None = None,
        yon: str | None = None,
        durum: str | None = None,
        arama: str = '',
        page: int = 1,
        page_size: int = 25,
    ) -> dict:
        qs = CekSenetDetay.objects.filter(kurum_id=kurum_id).select_related(
            'taksit__sozlesme__ogrenci',
            'tahsilat__sozlesme__ogrenci',
            'gider_taksit__gider_kaydi__cari_hesap',
            'odeme_yontemi',
            'cari_hesap',
        )
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if yon:
            qs = qs.filter(yon=yon)
        if durum:
            qs = qs.filter(durum=durum)
        if arama:
            from django.db.models import Q
            qs = qs.filter(
                Q(cek_senet_no__icontains=arama)
                | Q(banka_adi__icontains=arama)
                | Q(keside_eden__icontains=arama)
                | Q(aciklama__icontains=arama)
                | Q(taksit__sozlesme__sozlesme_no__icontains=arama)
            )
        qs = qs.order_by('vade_tarihi', '-id')
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
        return CekSenetDetay.objects.create(
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

    @transaction.atomic
    def create_from_gider_taksit(self, gider_taksit, odeme_yontemi) -> CekSenetDetay | None:
        if not cek_senet_v2_enabled() or not is_cek_senet_yontemi(odeme_yontemi):
            return None
        if hasattr(gider_taksit, 'cek_senet_detay') and gider_taksit.cek_senet_detay_id:
            return gider_taksit.cek_senet_detay

        gider = gider_taksit.gider_kaydi
        kalan = gider_taksit.kalan_tutar
        tutar = int(kalan) if kalan else int(gider_taksit.tutar)
        return CekSenetDetay.objects.create(
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
                else:
                    self.create_from_gider_taksit(taksit, yontem)
            elif detay and detay.durum == CekSenetDurum.BEKLIYOR:
                detay.durum = CekSenetDurum.IPTAL
                detay.save(update_fields=['durum', 'updated_at'])

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

        detay.tahsilat = tahsilat
        detay.tahsilat_mali_hesap_id = tahsilat_mali_hesap_id
        detay.durum = CekSenetDurum.TAHSIL_EDILDI
        detay.save(update_fields=['tahsilat', 'tahsilat_mali_hesap', 'durum', 'updated_at'])

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
            banka_adi=(data.get('banka_adi') or '').strip(),
            durum=CekSenetDurum.BEKLIYOR,
        )
        return serialize_cek_senet(detay), None

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

        detay.tahsilat_mali_hesap_id = odeme_mali_hesap_id
        detay.durum = CekSenetDurum.ODENDI
        detay.save(update_fields=['tahsilat_mali_hesap', 'durum', 'updated_at'])

        if detay.gider_taksit_id:
            from apps.finans.constants.gider_types import GiderTaksitDurum
            gt = detay.gider_taksit
            gt.odenen_tutar = gt.tutar
            gt.durum = GiderTaksitDurum.ODENDI
            gt.save(update_fields=['odenen_tutar', 'durum', 'updated_at'])

        return serialize_cek_senet(detay), None
