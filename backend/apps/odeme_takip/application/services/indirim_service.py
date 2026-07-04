"""
İndirim Service
İş kuralları: indirim ekleme, onay mekanizması, otomatik onay eşiği, net tutar yeniden hesaplama
"""
from apps.odeme_takip.domain.enums import (
    OnayDurum, GecmisIslemTuru, SozlesmeDurum,
)
from apps.odeme_takip.infrastructure.repositories.sozlesme_repository import (
    SozlesmeIndirimiRepository, SozlesmeGecmisiRepository,
)


class IndirimService:

    def __init__(self):
        self.repo = SozlesmeIndirimiRepository()
        self.gecmis_repo = SozlesmeGecmisiRepository()

    def get_by_sozlesme(self, sozlesme_id):
        return self.repo.get_by_sozlesme(sozlesme_id)

    def add_discount(self, sozlesme_id, data, user=None):
        """
        Sözleşmeye indirim ekle.
        max_oran kontrolü → otomatik onay / onay beklemede

        data: {
            indirim_turu_id, oran, tutar, aciklama
        }
        """
        from apps.odeme_takip.domain.models import Sozlesme, IndirimTuru

        try:
            sozlesme = Sozlesme.objects.get(id=sozlesme_id)
        except Sozlesme.DoesNotExist:
            return None, {'error': 'Sözleşme bulunamadı'}

        if sozlesme.durum not in [SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF]:
            return None, {'error': 'Bu statüdeki sözleşmeye indirim eklenemez'}

        indirim_turu_id = data.get('indirim_turu_id')
        if not indirim_turu_id:
            return None, {'error': 'İndirim türü seçilmedi'}

        try:
            indirim_turu = IndirimTuru.objects.get(id=indirim_turu_id)
        except IndirimTuru.DoesNotExist:
            return None, {'error': 'İndirim türü bulunamadı'}

        oran = int(data.get('oran', 0))
        tutar = int(data.get('tutar', 0))

        # Oran veya tutar kontrolü
        if oran <= 0 and tutar <= 0:
            return None, {'error': 'Oran veya tutar belirtilmeli'}

        # Orandan tutar hesapla (oran girilmişse)
        if oran > 0:
            if oran > indirim_turu.max_oran:
                return None, {
                    'error': f'Bu indirim türünde maksimum oran %{indirim_turu.max_oran}\'dir'
                }
            tutar = round(sozlesme.brut_tutar * oran / 100)

        # Otomatik onay mı yoksa onay beklemede mi?
        onay_durumu = OnayDurum.ONAYLANDI  # varsayılan: otomatik onay

        if indirim_turu.onay_gerektiren_oran and oran > 0:
            if oran >= indirim_turu.onay_gerektiren_oran:
                onay_durumu = OnayDurum.BEKLEMEDE

        indirim = self.repo.create({
            'sozlesme': sozlesme,
            'indirim_turu': indirim_turu,
            'indirim_orani': oran,
            'indirim_tutari': tutar,
            'onay_durumu': onay_durumu,
            'olusturan': user,
            'aciklama': data.get('aciklama', ''),
            'onaylayan': user if onay_durumu == OnayDurum.ONAYLANDI else None,
        })

        # Onaylandıysa net tutarı güncelle
        if onay_durumu == OnayDurum.ONAYLANDI:
            self._recalculate_net(sozlesme)

        # Audit
        self.gecmis_repo.create({
            'sozlesme': sozlesme,
            'islem_turu': GecmisIslemTuru.INDIRIM,
            'yeni_deger': {
                'turu': indirim_turu.ad,
                'oran': str(oran),
                'tutar': str(tutar),
                'onay_durumu': onay_durumu,
            },
            'aciklama': f'İndirim eklendi: {indirim_turu.ad} — {tutar} TL'
                        + (f' (Onay bekliyor)' if onay_durumu == OnayDurum.BEKLEMEDE else ''),
            'islem_yapan': user,
        })

        return indirim, None

    def approve(self, indirim_id, user=None):
        """İndirimi onayla"""
        indirim = self.repo.get_by_id(indirim_id)
        if not indirim:
            return None, {'error': 'İndirim bulunamadı'}

        if indirim.onay_durumu != OnayDurum.BEKLEMEDE:
            return None, {'error': 'Bu indirim onay beklemede değil'}

        indirim.onay_durumu = OnayDurum.ONAYLANDI
        indirim.onaylayan = user
        indirim.save()

        # Net tutarı güncelle
        self._recalculate_net(indirim.sozlesme)

        # Audit
        self.gecmis_repo.create({
            'sozlesme': indirim.sozlesme,
            'islem_turu': GecmisIslemTuru.INDIRIM,
            'yeni_deger': {'indirim_id': indirim.id, 'onay_durumu': 'onaylandi'},
            'aciklama': f'İndirim onaylandı: {indirim.indirim_turu.ad} — {indirim.indirim_tutari} TL',
            'islem_yapan': user,
        })

        return indirim, None

    def reject(self, indirim_id, neden='', user=None):
        """İndirimi reddet"""
        indirim = self.repo.get_by_id(indirim_id)
        if not indirim:
            return None, {'error': 'İndirim bulunamadı'}

        if indirim.onay_durumu != OnayDurum.BEKLEMEDE:
            return None, {'error': 'Bu indirim onay beklemede değil'}

        indirim.onay_durumu = OnayDurum.REDDEDILDI
        indirim.save()

        # Audit
        self.gecmis_repo.create({
            'sozlesme': indirim.sozlesme,
            'islem_turu': GecmisIslemTuru.INDIRIM,
            'yeni_deger': {
                'indirim_id': indirim.id,
                'onay_durumu': 'reddedildi',
                'neden': neden,
            },
            'aciklama': f'İndirim reddedildi: {indirim.indirim_turu.ad} — Neden: {neden}',
            'islem_yapan': user,
        })

        return indirim, None

    def _recalculate_net(self, sozlesme):
        """Onaylanan indirimlerin toplamını hesapla → net tutarı güncelle"""
        toplam = self.repo.get_onaylanan_toplam(sozlesme.id)
        sozlesme.toplam_indirim_tutari = toplam
        sozlesme.net_tutar = sozlesme.kdv_dahil_tutar - toplam
        sozlesme.save(update_fields=['toplam_indirim_tutari', 'net_tutar'])
