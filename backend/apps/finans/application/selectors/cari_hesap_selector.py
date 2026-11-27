"""
Cari Hesap Selector — Sadece okuma amaçlı sorgular
"""
from decimal import Decimal

from django.db.models import F, Sum
from django.utils import timezone

from apps.finans.application.cari_balance import (
    apply_iade_netting,
    bakiye_durumu_from_net,
    empty_islem_totals,
    net_bakiye,
)
from apps.finans.application.ekstre_balance import tarih_parametresi
from apps.finans.constants.cari_types import CariHareketTuru, CariHareketYonu, GelirDurum
from apps.finans.constants.gider_types import GiderDurum, GiderTaksitDurum, OdemeDurum
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.domain.gider_taksit import GiderTaksit
from apps.finans.infrastructure.cari_hareket_repository import CariHareketRepository
from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository


class CariHesapSelector:
    """Cari hesap okuma sorguları."""

    def __init__(self):
        self.hesap_repo = CariHesapRepository
        self.hareket_repo = CariHareketRepository

    def get_by_id(self, hesap_id):
        return self.hesap_repo.get_by_id(hesap_id)

    def list_by_kurum(self, kurum_id, sube_id=None, sadece_aktif=True, hesap_turu=None):
        return self.hesap_repo.get_by_kurum(
            kurum_id, sube_id=sube_id, sadece_aktif=sadece_aktif, hesap_turu=hesap_turu,
        )

    def search(self, kurum_id, arama_metni, sube_id=None, sadece_aktif=True, hesap_turu=None):
        return self.hesap_repo.search(
            kurum_id, arama_metni, sube_id=sube_id,
            sadece_aktif=sadece_aktif, hesap_turu=hesap_turu,
        )

    def dropdown_list(self, kurum_id, sube_id=None, hesap_turu=None):
        return self.hesap_repo.dropdown_list(kurum_id, sube_id=sube_id, hesap_turu=hesap_turu)

    def hareketler(self, hesap_id, filtreler=None):
        return self.hareket_repo.get_by_cari_hesap(hesap_id, filtreler=filtreler)

    @staticmethod
    def _acik_taksitler(hesap_ids):
        """Ödenecek açık belgeler: onaylı gider kayıtlarının kapanmamış taksitleri."""
        return GiderTaksit.objects.filter(
            gider_kaydi__cari_hesap_id__in=hesap_ids,
            gider_kaydi__durum__in=[GiderDurum.ONAYLANDI, GiderDurum.KISMI_ODENDI],
        ).exclude(durum__in=[GiderTaksitDurum.ODENDI, GiderTaksitDurum.IPTAL])

    @staticmethod
    def _acik_gelirler(hesap_ids):
        """Tahsil edilecek açık belgeler: onaylı, tamamı tahsil edilmemiş gelir kayıtları."""
        return GelirKaydi.objects.filter(
            cari_hesap_id__in=hesap_ids,
            durum__in=[GelirDurum.ONAYLANDI, GelirDurum.KISMI_TAHSIL],
        )

    @staticmethod
    def _tarihi_acik_gelir_kalanlari(hesap_ids, kesim_tarihi):
        """`kesim_tarihi` sonu itibarıyla açık olan onaylı gelir kayıtlarını döner."""
        gelirler = list(
            GelirKaydi.objects.filter(
                cari_hesap_id__in=hesap_ids,
                fatura_tarihi__lte=kesim_tarihi,
                durum__in=[
                    GelirDurum.ONAYLANDI,
                    GelirDurum.KISMI_TAHSIL,
                    GelirDurum.TAHSIL_EDILDI,
                ],
            ).values('id', 'cari_hesap_id', 'vade_tarihi', 'net_tutar', 'tahsil_edilen')
        )
        if not gelirler:
            return []

        gids = [g['id'] for g in gelirler]
        kesim_tahsil = {
            r['gelir_kaydi_id']: r['t'] or Decimal('0')
            for r in GelirTahsilat.objects.filter(
                gelir_kaydi_id__in=gids,
                durum=OdemeDurum.TAMAMLANDI,
                tahsilat_tarihi__lte=kesim_tarihi,
            ).values('gelir_kaydi_id').annotate(t=Sum('tutar'))
        }
        tum_tahsil = {
            r['gelir_kaydi_id']: r['t'] or Decimal('0')
            for r in GelirTahsilat.objects.filter(
                gelir_kaydi_id__in=gids,
                durum=OdemeDurum.TAMAMLANDI,
            ).values('gelir_kaydi_id').annotate(t=Sum('tutar'))
        }

        kalemler = []
        for g in gelirler:
            gid = g['id']
            if gid not in tum_tahsil and (g['tahsil_edilen'] or Decimal('0')) > Decimal('0'):
                tahsil = g['tahsil_edilen']
            else:
                tahsil = kesim_tahsil.get(gid, Decimal('0'))
            kalan = float(g['net_tutar'] - tahsil)
            if kalan > 0:
                kalemler.append((g['cari_hesap_id'], g['vade_tarihi'], kalan))
        return kalemler

    @staticmethod
    def _tarihi_acik_taksit_kalanlari(hesap_ids, kesim_tarihi):
        """`kesim_tarihi` sonu itibarıyla açık olan onaylı gider taksitlerini döner."""
        gider_rows = list(
            GiderKaydi.objects.filter(
                cari_hesap_id__in=hesap_ids,
                fatura_tarihi__lte=kesim_tarihi,
                durum__in=[
                    GiderDurum.ONAYLANDI,
                    GiderDurum.KISMI_ODENDI,
                    GiderDurum.ODENDI,
                ],
            ).values('id', 'cari_hesap_id')
        )
        if not gider_rows:
            return []

        cari_by_gider = {g['id']: g['cari_hesap_id'] for g in gider_rows}
        gids = list(cari_by_gider.keys())

        taksit_by_gider: dict[int, list[dict]] = {}
        for t in (
            GiderTaksit.objects.filter(gider_kaydi_id__in=gids)
            .exclude(durum=GiderTaksitDurum.IPTAL)
            .order_by('taksit_no', 'id')
            .values('id', 'gider_kaydi_id', 'taksit_no', 'vade_tarihi', 'tutar', 'odenen_tutar')
        ):
            taksit_by_gider.setdefault(t['gider_kaydi_id'], []).append(t)

        odemeler_by_gider: dict[int, list[dict]] = {}
        for o in (
            GiderOdeme.objects.filter(
                gider_kaydi_id__in=gids,
                durum=OdemeDurum.TAMAMLANDI,
            )
            .order_by('odeme_tarihi', 'id')
            .values('gider_kaydi_id', 'gider_taksit_id', 'tutar', 'odeme_tarihi')
        ):
            odemeler_by_gider.setdefault(o['gider_kaydi_id'], []).append(o)

        kalemler = []
        for gid, taksitler in taksit_by_gider.items():
            hid = cari_by_gider[gid]
            tum_odemeler = odemeler_by_gider.get(gid)
            if not tum_odemeler:
                for t in taksitler:
                    kalan = float(t['tutar'] - (t['odenen_tutar'] or Decimal('0')))
                    if kalan > 0:
                        kalemler.append((hid, t['vade_tarihi'], kalan))
                continue

            linked: dict[int, Decimal] = {}
            pool = Decimal('0')
            for o in tum_odemeler:
                if o['odeme_tarihi'] > kesim_tarihi:
                    continue
                tid = o['gider_taksit_id']
                if tid:
                    linked[tid] = linked.get(tid, Decimal('0')) + o['tutar']
                else:
                    pool += o['tutar']

            carry = Decimal('0')
            for t in taksitler:
                tutar = t['tutar']
                base = linked.get(t['id'], Decimal('0')) + carry
                carry = Decimal('0')
                if base > tutar:
                    applied = tutar
                    carry = base - tutar
                else:
                    applied = base
                room = tutar - applied
                extra = Decimal('0')
                if room > 0 and pool > 0:
                    extra = min(room, pool)
                    pool -= extra
                kalan = float(tutar - (applied + extra))
                if kalan > 0:
                    kalemler.append((hid, t['vade_tarihi'], kalan))
        return kalemler

    def acik_kalemler(self, hesap_id):
        """
        Cari hesabın açık belgeleri (vade sıralı) ve brüt özetleri.

        Net bakiye karşılıklı borç/alacağı birbirinden düşer; burada her belge
        kendi vadesi ve kalan tutarıyla ayrı görünür.
        """
        today = timezone.localdate()
        kalemler = []
        for g in self._acik_gelirler([hesap_id]).select_related('gelir_kategorisi'):
            kalan = max(float(g.net_tutar - g.tahsil_edilen), 0.0)
            if kalan <= 0:
                continue
            kalemler.append({
                'tip': 'gelir',
                'kaynak_id': g.pk,
                'taksit_id': None,
                'belge_no': g.fatura_no or '',
                'aciklama': g.aciklama or (g.gelir_kategorisi.ad if g.gelir_kategorisi else ''),
                'belge_tarihi': g.fatura_tarihi.isoformat(),
                'vade_tarihi': g.vade_tarihi.isoformat(),
                'tutar': float(g.net_tutar),
                'odenen': float(g.tahsil_edilen),
                'kalan': kalan,
                'gecikme_gun': max((today - g.vade_tarihi).days, 0),
                'durum': g.durum,
                'durum_label': g.get_durum_display(),
            })
        for t in self._acik_taksitler([hesap_id]).select_related(
            'gider_kaydi__gider_kategorisi',
        ):
            gider = t.gider_kaydi
            kalan = max(float(t.tutar - t.odenen_tutar), 0.0)
            if kalan <= 0:
                continue
            aciklama = gider.aciklama or (
                gider.gider_kategorisi.ad if gider.gider_kategorisi else ''
            )
            if gider.taksit_sayisi > 1:
                aciklama = f'{aciklama} — Taksit {t.taksit_no}/{gider.taksit_sayisi}'.strip(' —')
            kalemler.append({
                'tip': 'gider',
                'kaynak_id': gider.pk,
                'taksit_id': t.pk,
                'belge_no': gider.gorunen_belge_no,
                'aciklama': aciklama,
                'belge_tarihi': gider.fatura_tarihi.isoformat(),
                'vade_tarihi': t.vade_tarihi.isoformat(),
                'tutar': float(t.tutar),
                'odenen': float(t.odenen_tutar),
                'kalan': kalan,
                'gecikme_gun': max((today - t.vade_tarihi).days, 0),
                'durum': gider.durum,
                'durum_label': gider.get_durum_display(),
            })
        kalemler.sort(key=lambda k: (k['vade_tarihi'], k['tip'], k['kaynak_id']))

        def _toplam(tip, sadece_geciken=False):
            return round(sum(
                k['kalan'] for k in kalemler
                if k['tip'] == tip and (not sadece_geciken or k['gecikme_gun'] > 0)
            ), 2)

        return {
            'kalemler': kalemler,
            'ozet': {
                'acik_alacak_belge': _toplam('gelir'),
                'acik_borc_belge': _toplam('gider'),
                'geciken_tahsilat': _toplam('gelir', sadece_geciken=True),
                'geciken_odeme': _toplam('gider', sadece_geciken=True),
                'acik_tahsilat_adet': sum(1 for k in kalemler if k['tip'] == 'gelir'),
                'acik_odeme_adet': sum(1 for k in kalemler if k['tip'] == 'gider'),
            },
        }

    YASLANDIRMA_KOVALARI = ('gelecek', 'bugun', 'g1_30', 'g31_60', 'g61_90', 'g90_ustu')

    @staticmethod
    def _yaslandirma_kovasi(gecikme_gun):
        if gecikme_gun < 0:
            return 'gelecek'
        if gecikme_gun == 0:
            return 'bugun'
        if gecikme_gun <= 30:
            return 'g1_30'
        if gecikme_gun <= 60:
            return 'g31_60'
        if gecikme_gun <= 90:
            return 'g61_90'
        return 'g90_ustu'

    def vade_yaslandirma(self, hesap_ids, today=None, *, kesim_tarihi=None):
        """
        Açık belge kalanlarını gecikme gününe göre kovalar.

        `kesim_tarihi` verilirse hem açık kalanlar hem de gecikme günü o tarih
        sonu itibarıyla hesaplanır; verilmezse güncel açık belgeler kullanılır.
        Returns: {hesap_id: {'tahsilat': {kova: tutar}, 'odeme': {kova: tutar}}}
        """
        if not hesap_ids:
            return {}
        ref = kesim_tarihi or today or timezone.localdate()
        sonuc = {}

        def _ekle(hid, yon, vade, kalan):
            kalan = float(kalan or 0)
            if kalan <= 0:
                return
            taraf = sonuc.setdefault(hid, {
                'tahsilat': dict.fromkeys(self.YASLANDIRMA_KOVALARI, 0.0),
                'odeme': dict.fromkeys(self.YASLANDIRMA_KOVALARI, 0.0),
            })[yon]
            taraf[self._yaslandirma_kovasi((ref - vade).days)] += kalan

        if kesim_tarihi is not None:
            gelir_satirlar = self._tarihi_acik_gelir_kalanlari(hesap_ids, kesim_tarihi)
            taksit_satirlar = self._tarihi_acik_taksit_kalanlari(hesap_ids, kesim_tarihi)
        else:
            gelir_satirlar = self._acik_gelirler(hesap_ids).annotate(
                kalan=F('net_tutar') - F('tahsil_edilen'),
            ).values_list('cari_hesap_id', 'vade_tarihi', 'kalan')
            taksit_satirlar = self._acik_taksitler(hesap_ids).annotate(
                kalan=F('tutar') - F('odenen_tutar'),
            ).values_list('gider_kaydi__cari_hesap_id', 'vade_tarihi', 'kalan')

        for hid, vade, kalan in gelir_satirlar:
            _ekle(hid, 'tahsilat', vade, kalan)
        for hid, vade, kalan in taksit_satirlar:
            _ekle(hid, 'odeme', vade, kalan)
        for taraflar in sonuc.values():
            for kovalar in taraflar.values():
                for k in kovalar:
                    kovalar[k] = round(kovalar[k], 2)
        return sonuc

    def _vade_aging_maps(self, hesap_ids, today, *, kesim_tarihi=None):
        """Cari hesap ID seti için vade kova toplamları."""
        if not hesap_ids:
            return {}, {}, {}, {}, {}, {}

        if kesim_tarihi is not None:
            vg_odeme: dict[int, float] = {}
            vgc_odeme: dict[int, float] = {}
            gvge_odeme: dict[int, float] = {}
            vg_tahsilat: dict[int, float] = {}
            vgc_tahsilat: dict[int, float] = {}
            gvge_tahsilat: dict[int, float] = {}

            for hid, vade, kalan in self._tarihi_acik_taksit_kalanlari(hesap_ids, kesim_tarihi):
                hedef = (
                    vg_odeme if vade == kesim_tarihi
                    else vgc_odeme if vade < kesim_tarihi
                    else gvge_odeme
                )
                hedef[hid] = round(hedef.get(hid, 0.0) + kalan, 2)
            for hid, vade, kalan in self._tarihi_acik_gelir_kalanlari(hesap_ids, kesim_tarihi):
                hedef = (
                    vg_tahsilat if vade == kesim_tarihi
                    else vgc_tahsilat if vade < kesim_tarihi
                    else gvge_tahsilat
                )
                hedef[hid] = round(hedef.get(hid, 0.0) + kalan, 2)
            return vg_odeme, vgc_odeme, gvge_odeme, vg_tahsilat, vgc_tahsilat, gvge_tahsilat

        open_taksit = self._acik_taksitler(hesap_ids)

        def _bucket_taksit(**filters):
            rows = (
                open_taksit.filter(**filters)
                .values('gider_kaydi__cari_hesap_id')
                .annotate(t=Sum(F('tutar') - F('odenen_tutar')))
            )
            return {
                r['gider_kaydi__cari_hesap_id']: float(max(r['t'] or 0, 0))
                for r in rows
            }

        open_gelir = self._acik_gelirler(hesap_ids)

        def _bucket_gelir(**filters):
            rows = (
                open_gelir.filter(**filters)
                .values('cari_hesap_id')
                .annotate(t=Sum(F('net_tutar') - F('tahsil_edilen')))
            )
            return {
                r['cari_hesap_id']: float(max(r['t'] or 0, 0))
                for r in rows
            }

        vg_odeme = _bucket_taksit(vade_tarihi=today)
        vgc_odeme = _bucket_taksit(vade_tarihi__lt=today)
        gvge_odeme = _bucket_taksit(vade_tarihi__gt=today)
        vg_tahsilat = _bucket_gelir(vade_tarihi=today)
        vgc_tahsilat = _bucket_gelir(vade_tarihi__lt=today)
        gvge_tahsilat = _bucket_gelir(vade_tarihi__gt=today)
        return vg_odeme, vgc_odeme, gvge_odeme, vg_tahsilat, vgc_tahsilat, gvge_tahsilat

    def _kumulatif_hareket_map(self, hesap_ids, kesim_tarihi):
        """`kesim_tarihi` sonu itibarıyla kümülatif borç/alacak toplamları."""
        if not hesap_ids:
            return {}
        rows = (
            CariHareket.objects.filter(
                cari_hesap_id__in=hesap_ids,
                islem_tarihi__lte=kesim_tarihi,
            )
            .values('cari_hesap_id', 'yon')
            .annotate(t=Sum('tutar'))
        )
        result: dict[int, tuple[float, float]] = {}
        for r in rows:
            hid = r['cari_hesap_id']
            borc, alacak = result.get(hid, (0.0, 0.0))
            tutar = float(r['t'] or 0)
            if r['yon'] == CariHareketYonu.BORC:
                borc += tutar
            else:
                alacak += tutar
            result[hid] = (borc, alacak)
        return result

    def _islem_totals_map(self, hesap_ids, *, kesim_tarihi=None):
        """Cari hesap başına işlem türü toplamları (tek sorgu).

        Alış/satış/ödeme/tahsilat, ilgili iptal ve düzeltme iadeleri düşülerek
        netlenir; aksi halde iptal fatura özet kartında görünür kalır.
        """
        if not hesap_ids:
            return {}
        qs = CariHareket.objects.filter(cari_hesap_id__in=hesap_ids)
        if kesim_tarihi is not None:
            qs = qs.filter(islem_tarihi__lte=kesim_tarihi)
        rows = qs.values('cari_hesap_id', 'islem_turu', 'kaynak_tip').annotate(t=Sum('tutar'))
        result: dict[int, dict[str, float]] = {}
        iade_by_hesap: dict[int, dict[str, float]] = {}
        for r in rows:
            hid = r['cari_hesap_id']
            if hid not in result:
                result[hid] = empty_islem_totals()
                iade_by_hesap[hid] = {}
            tur = r['islem_turu']
            tutar = float(r['t'] or 0)
            if tur in result[hid]:
                result[hid][tur] += tutar
            if tur == CariHareketTuru.IADE:
                kaynak = r['kaynak_tip'] or ''
                iade_by_hesap[hid][kaynak] = iade_by_hesap[hid].get(kaynak, 0.0) + tutar
        for hid, totals in result.items():
            result[hid] = apply_iade_netting(totals, iade_by_hesap.get(hid, {}))
        return result

    def _son_hareket_map(self, hesap_ids, *, kesim_tarihi=None):
        """Her cari için son hareket (PostgreSQL DISTINCT ON)."""
        if not hesap_ids:
            return {}
        qs = CariHareket.objects.filter(cari_hesap_id__in=hesap_ids)
        if kesim_tarihi is not None:
            qs = qs.filter(islem_tarihi__lte=kesim_tarihi)
        qs = (
            qs.select_related('islem_yapan')
            .order_by('cari_hesap_id', '-islem_tarihi', '-created_at')
            .distinct('cari_hesap_id')
        )
        return {h.cari_hesap_id: h for h in qs}

    def cari_ozet(self, hesap_id):
        """Cari hesabın borç/alacak ve vade özeti."""
        hesap = self.hesap_repo.get_by_id(hesap_id)
        if not hesap:
            return None

        today = timezone.localdate()
        (
            vg_odeme,
            vgc_odeme,
            gvge_odeme,
            vg_tahsilat,
            vgc_tahsilat,
            gvge_tahsilat,
        ) = self._vade_aging_maps([hesap_id], today)

        vadesi_gelen_odeme = vg_odeme.get(hesap_id, 0)
        vadesi_gecmis_odeme = vgc_odeme.get(hesap_id, 0)
        gelecek_vadeli_odeme = gvge_odeme.get(hesap_id, 0)
        vadesi_gelen_tahsilat = vg_tahsilat.get(hesap_id, 0)
        vadesi_gecmis_tahsilat = vgc_tahsilat.get(hesap_id, 0)
        gelecek_vadeli_tahsilat = gvge_tahsilat.get(hesap_id, 0)

        son_hareket = self._son_hareket_map([hesap_id]).get(hesap_id)

        son_islem_yapan = None
        if son_hareket and son_hareket.islem_yapan:
            son_islem_yapan = (
                son_hareket.islem_yapan.get_full_name()
                or son_hareket.islem_yapan.username
            )

        return {
            'id': hesap.pk,
            'hesap_kodu': hesap.hesap_kodu,
            'unvan': hesap.unvan,
            'gorunen_ad': hesap.gorunen_ad,
            'hesap_turu': hesap.hesap_turu,
            'toplam_borc': float(hesap.toplam_borc),
            'toplam_alacak': float(hesap.toplam_alacak),
            'bakiye': float(hesap.bakiye),
            'bakiye_durumu': hesap.bakiye_durumu,
            'vadesi_gelen': vadesi_gelen_odeme + vadesi_gelen_tahsilat,
            'vadesi_gecmis': vadesi_gecmis_odeme + vadesi_gecmis_tahsilat,
            'gelecek_vadeli': gelecek_vadeli_odeme + gelecek_vadeli_tahsilat,
            'vadesi_gelen_odeme': vadesi_gelen_odeme,
            'vadesi_gelen_tahsilat': vadesi_gelen_tahsilat,
            'vadesi_gecmis_odeme': vadesi_gecmis_odeme,
            'vadesi_gecmis_tahsilat': vadesi_gecmis_tahsilat,
            'gelecek_vadeli_odeme': gelecek_vadeli_odeme,
            'gelecek_vadeli_tahsilat': gelecek_vadeli_tahsilat,
            'acik_alacak_belge': round(
                vadesi_gelen_tahsilat + vadesi_gecmis_tahsilat + gelecek_vadeli_tahsilat, 2,
            ),
            'acik_borc_belge': round(
                vadesi_gelen_odeme + vadesi_gecmis_odeme + gelecek_vadeli_odeme, 2,
            ),
            'son_islem_tarihi': son_hareket.islem_tarihi.isoformat() if son_hareket else None,
            'son_islem_turu': son_hareket.get_islem_turu_display() if son_hareket else None,
            'son_islem_yapan': son_islem_yapan,
        }

    def cari_rapor_listesi(
        self,
        kurum_id,
        sube_id=None,
        hesap_turu=None,
        arama=None,
        baslangic=None,
        bitis=None,
    ):
        """Kurumdaki tüm cariler için bakiye / açık belge / vade rapor satırları.

        Tüm sütunlar aynı kesim tarihi itibarıyla üretilir:
        - `bitis` verilirse: `bitis` sonu itibarıyla kümülatif bakiye, o tarihte açık
          olan belgeler ve `bitis`e göre gecikme.
        - `bitis` verilmezse: bugünkü güncel bakiye, açık belgeler ve gecikme.
        """
        baslangic_tarihi = tarih_parametresi(baslangic)
        kesim_tarihi = tarih_parametresi(bitis)
        if baslangic_tarihi and kesim_tarihi and baslangic_tarihi > kesim_tarihi:
            raise ValueError('Başlangıç tarihi bitiş tarihinden büyük olamaz.')

        if arama:
            hesaplar = self.search(
                kurum_id, arama.strip(), sube_id=sube_id, hesap_turu=hesap_turu,
            )
        else:
            hesaplar = self.list_by_kurum(
                kurum_id, sube_id=sube_id, hesap_turu=hesap_turu,
            )

        hesap_list = list(hesaplar)
        hesap_ids = [h.pk for h in hesap_list]
        if not hesap_ids:
            return []

        today = timezone.localdate()
        (
            vg_odeme,
            vgc_odeme,
            gvge_odeme,
            vg_tahsilat,
            vgc_tahsilat,
            gvge_tahsilat,
        ) = self._vade_aging_maps(hesap_ids, today, kesim_tarihi=kesim_tarihi)
        son_map = self._son_hareket_map(hesap_ids, kesim_tarihi=kesim_tarihi)
        islem_totals_map = self._islem_totals_map(hesap_ids, kesim_tarihi=kesim_tarihi)
        kumulatif_totals = (
            self._kumulatif_hareket_map(hesap_ids, kesim_tarihi)
            if kesim_tarihi is not None
            else None
        )

        rows = []
        for hesap in hesap_list:
            hid = hesap.pk
            vgo = vg_odeme.get(hid, 0)
            vgc = vgc_odeme.get(hid, 0)
            gvge = gvge_odeme.get(hid, 0)
            vgt = vg_tahsilat.get(hid, 0)
            vgct = vgc_tahsilat.get(hid, 0)
            gvget = gvge_tahsilat.get(hid, 0)
            son = son_map.get(hid)
            son_islem_yapan = None
            if son and son.islem_yapan:
                son_islem_yapan = (
                    son.islem_yapan.get_full_name() or son.islem_yapan.username
                )

            if kumulatif_totals is not None:
                borc, alacak = kumulatif_totals.get(hid, (0.0, 0.0))
            else:
                borc, alacak = float(hesap.toplam_borc), float(hesap.toplam_alacak)
            bakiye = round(net_bakiye(borc, alacak), 2)
            bakiye_durumu = bakiye_durumu_from_net(bakiye)
            islem = islem_totals_map.get(hid, empty_islem_totals())

            rows.append({
                'id': hid,
                'hesap_kodu': hesap.hesap_kodu,
                'unvan': hesap.unvan,
                'gorunen_ad': hesap.gorunen_ad,
                'hesap_turu': hesap.hesap_turu,
                'hesap_turu_display': hesap.get_hesap_turu_display(),
                'aktif_mi': hesap.aktif_mi,
                'toplam_borc': round(borc, 2),
                'toplam_alacak': round(alacak, 2),
                'bakiye': bakiye,
                'bakiye_durumu': bakiye_durumu,
                'toplam_satis': islem[CariHareketTuru.SATIS],
                'toplam_alis': islem[CariHareketTuru.ALIS],
                'toplam_tahsilat': islem[CariHareketTuru.TAHSILAT],
                'toplam_odeme': islem[CariHareketTuru.ODEME],
                'toplam_iade': islem[CariHareketTuru.IADE],
                'toplam_mahsup': islem[CariHareketTuru.MAHSUP],
                'vadesi_gelen': round(vgo + vgt, 2),
                'vadesi_gecmis': round(vgc + vgct, 2),
                'gelecek_vadeli': round(gvge + gvget, 2),
                'vadesi_gecmis_tahsilat': round(vgct, 2),
                'vadesi_gecmis_odeme': round(vgc, 2),
                'acik_alacak_belge': round(vgt + vgct + gvget, 2),
                'acik_borc_belge': round(vgo + vgc + gvge, 2),
                'son_islem_tarihi': son.islem_tarihi.isoformat() if son else None,
                'son_islem_turu': son.get_islem_turu_display() if son else None,
                'son_islem_yapan': son_islem_yapan,
            })
        return rows
