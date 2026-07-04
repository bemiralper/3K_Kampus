"""
Cari Hesap Selector — Sadece okuma amaçlı sorgular
"""
from django.db.models import F, Sum
from django.utils import timezone

from apps.finans.constants.cari_types import CariHareketYonu
from apps.finans.constants.gider_types import GiderDurum, GiderTaksitDurum
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gider_taksit import GiderTaksit
from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository
from apps.finans.infrastructure.cari_hareket_repository import CariHareketRepository


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

    def _vade_aging_maps(self, hesap_ids, today):
        """Cari hesap ID seti için vade kova toplamları."""
        if not hesap_ids:
            return {}, {}, {}, {}, {}, {}

        open_taksit = GiderTaksit.objects.filter(
            gider_kaydi__cari_hesap_id__in=hesap_ids,
            gider_kaydi__durum__in=[GiderDurum.ONAYLANDI, GiderDurum.KISMI_ODENDI],
        ).exclude(durum__in=[GiderTaksitDurum.ODENDI, GiderTaksitDurum.IPTAL])

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

        open_gelir = GelirKaydi.objects.filter(
            cari_hesap_id__in=hesap_ids,
            durum__in=['onaylandi', 'kismi_tahsil'],
        )

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

    def _hareket_totals_map(self, hesap_ids, baslangic=None, bitis=None):
        """Tarih aralığındaki cari hareketlerin borç/alacak toplamları (dönem bakiyesi)."""
        if not hesap_ids:
            return {}
        qs = CariHareket.objects.filter(cari_hesap_id__in=hesap_ids)
        if baslangic:
            qs = qs.filter(islem_tarihi__gte=baslangic)
        if bitis:
            qs = qs.filter(islem_tarihi__lte=bitis)
        rows = (
            qs.values('cari_hesap_id', 'yon')
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

    def _son_hareket_map(self, hesap_ids):
        """Her cari için son hareket."""
        if not hesap_ids:
            return {}
        result = {}
        qs = (
            CariHareket.objects.filter(cari_hesap_id__in=hesap_ids)
            .select_related('islem_yapan')
            .order_by('cari_hesap_id', '-islem_tarihi', '-created_at')
        )
        for h in qs:
            if h.cari_hesap_id not in result:
                result[h.cari_hesap_id] = h
        return result

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
        """Kurumdaki tüm cariler için bakiye / vade rapor satırları.

        `baslangic`/`bitis` verilirse borç/alacak/bakiye o tarih aralığındaki
        cari hareketlerden (dönem hareketi) hesaplanır; verilmezse hesabın
        güncel (tüm zamanlar) toplamları kullanılır.
        """
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
        ) = self._vade_aging_maps(hesap_ids, today)
        son_map = self._son_hareket_map(hesap_ids)

        donem_secili = bool(baslangic or bitis)
        hareket_totals = (
            self._hareket_totals_map(hesap_ids, baslangic=baslangic, bitis=bitis)
            if donem_secili
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

            if hareket_totals is not None:
                borc, alacak = hareket_totals.get(hid, (0.0, 0.0))
            else:
                borc, alacak = float(hesap.toplam_borc), float(hesap.toplam_alacak)
            bakiye = borc - alacak
            if bakiye > 0:
                bakiye_durumu = 'alacakli'
            elif bakiye < 0:
                bakiye_durumu = 'borclu'
            else:
                bakiye_durumu = 'dengede'

            rows.append({
                'id': hid,
                'hesap_kodu': hesap.hesap_kodu,
                'unvan': hesap.unvan,
                'gorunen_ad': hesap.gorunen_ad,
                'hesap_turu': hesap.hesap_turu,
                'hesap_turu_display': hesap.get_hesap_turu_display(),
                'aktif_mi': hesap.aktif_mi,
                'toplam_borc': borc,
                'toplam_alacak': alacak,
                'bakiye': bakiye,
                'bakiye_durumu': bakiye_durumu,
                'vadesi_gelen': vgo + vgt,
                'vadesi_gecmis': vgc + vgct,
                'gelecek_vadeli': gvge + gvget,
                'son_islem_tarihi': son.islem_tarihi.isoformat() if son else None,
                'son_islem_turu': son.get_islem_turu_display() if son else None,
                'son_islem_yapan': son_islem_yapan,
            })
        return rows
