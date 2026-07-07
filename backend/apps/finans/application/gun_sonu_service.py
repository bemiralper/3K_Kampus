"""
Gün Sonu Service
Belirli bir gün için tahsilat/ödeme özetini ve kasa-banka bakiyelerini hesaplar.

Veri kaynakları:
- apps.odeme_takip.Tahsilat  → öğrenci/veli sözleşme tahsilatları
- apps.finans.GelirTahsilat  → diğer gelir tahsilatları
- apps.finans.GiderOdeme     → giderler için yapılan ödemeler
- apps.finans.BakiyeHareketi → mali hesapların anlık bakiyesi (son hareket)
"""
from datetime import date

from django.db.models import Sum, Count

from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.constants.gider_types import OdemeDurum
from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.application.gun_sonu_finans_helpers import bugun_islem_q
from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository


class GunSonuService:

    def __init__(self):
        self.bakiye_repo = BakiyeHareketiRepository()

    def ozet(self, kurum_id, gun=None, sube_id=None):
        gun = gun or date.today()

        tahsilat_kirilimi, tahsilat_toplam, tahsilat_adet = self._tahsilat_kirilimi(kurum_id, gun, sube_id)
        odeme_kirilimi, odeme_toplam, odeme_adet = self._odeme_kirilimi(kurum_id, gun, sube_id)
        iade_toplam = self._iade_toplami(kurum_id, gun, sube_id)

        hesap_bakiyeleri = self._hesap_bakiyeleri(kurum_id, sube_id)
        kasa_bakiye = sum(h['bakiye'] for h in hesap_bakiyeleri if h['tip'] == MaliHesapTipi.KASA)
        banka_bakiye = sum(h['bakiye'] for h in hesap_bakiyeleri if h['tip'] == MaliHesapTipi.BANKA)
        kart_bekleyen = sum(
            h['bakiye'] for h in hesap_bakiyeleri
            if h['tip'] in (MaliHesapTipi.POS, MaliHesapTipi.SANAL_POS)
        )

        return {
            'gun': str(gun),
            'tahsilatlar': {
                'kirilim': tahsilat_kirilimi,
                'toplam': tahsilat_toplam,
                'adet': tahsilat_adet,
            },
            'odemeler': {
                'kirilim': odeme_kirilimi,
                'toplam': odeme_toplam,
                'adet': odeme_adet,
            },
            'iade_toplam': iade_toplam,
            'net': tahsilat_toplam - odeme_toplam - iade_toplam,
            'kasada_beklenen': int(kasa_bakiye),
            'banka_bakiye': int(banka_bakiye),
            'kart_bekleyen': int(kart_bekleyen),
            'hesap_bakiyeleri': hesap_bakiyeleri,
        }

    # ─── Yardımcılar ──────────────────────────────

    def _tip_bucket(self, tip):
        """OdemeYontemiTipi → Gün Sonu ekranındaki kova adı."""
        from apps.finans.application.gun_sonu_finans_helpers import odeme_tip_to_bucket
        return odeme_tip_to_bucket(tip)

    def _bucket_labels(self):
        from apps.finans.application.gun_sonu_finans_helpers import RAPOR_ODEME_LABELS
        return dict(RAPOR_ODEME_LABELS)

    def _tahsilat_kirilimi(self, kurum_id, gun, sube_id=None):
        from apps.odeme_takip.domain.models import Tahsilat
        from apps.odeme_takip.domain.enums import TahsilatDurum, TahsilatTuru

        kova = {}

        # Öğrenci/veli sözleşme tahsilatları
        qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            durum=TahsilatDurum.AKTIF,
        ).exclude(tahsilat_turu=TahsilatTuru.IADE).filter(
            bugun_islem_q('tahsilat_tarihi', gun),
        )
        if sube_id:
            qs = qs.filter(sozlesme__sube_id=sube_id)
        for row in qs.values('odeme_yontemi__tip').annotate(toplam=Sum('tutar'), adet=Count('id')):
            b = self._tip_bucket(row['odeme_yontemi__tip'])
            kova.setdefault(b, {'toplam': 0, 'adet': 0})
            kova[b]['toplam'] += int(row['toplam'] or 0)
            kova[b]['adet'] += row['adet']

        # Diğer gelir tahsilatları
        gqs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.TAMAMLANDI,
        ).filter(bugun_islem_q('tahsilat_tarihi', gun))
        if sube_id:
            gqs = gqs.filter(gelir_kaydi__sube_id=sube_id)
        for row in gqs.values('odeme_yontemi__tip').annotate(toplam=Sum('tutar'), adet=Count('id')):
            b = self._tip_bucket(row['odeme_yontemi__tip'])
            kova.setdefault(b, {'toplam': 0, 'adet': 0})
            kova[b]['toplam'] += int(row['toplam'] or 0)
            kova[b]['adet'] += row['adet']

        labels = self._bucket_labels()
        kirilim = [
            {'tip': k, 'label': labels.get(k, k), 'toplam': v['toplam'], 'adet': v['adet']}
            for k, v in sorted(kova.items(), key=lambda kv: -kv[1]['toplam'])
        ]
        toplam = sum(v['toplam'] for v in kova.values())
        adet = sum(v['adet'] for v in kova.values())
        return kirilim, toplam, adet

    def _odeme_kirilimi(self, kurum_id, gun, sube_id=None):
        kova = {}

        qs = GiderOdeme.objects.filter(
            gider_kaydi__kurum_id=kurum_id,
            odeme_tarihi=gun,
            durum=OdemeDurum.TAMAMLANDI,
        )
        if sube_id:
            qs = qs.filter(gider_kaydi__sube_id=sube_id)
        for row in qs.values('odeme_yontemi__tip', 'bakiyeden_mahsup').annotate(toplam=Sum('tutar'), adet=Count('id')):
            if row['bakiyeden_mahsup']:
                b = 'cari_mahsup'
            else:
                b = self._tip_bucket(row['odeme_yontemi__tip'])
            kova.setdefault(b, {'toplam': 0, 'adet': 0})
            kova[b]['toplam'] += int(row['toplam'] or 0)
            kova[b]['adet'] += row['adet']

        labels = self._bucket_labels()
        labels['cari_mahsup'] = 'Cari Bakiyeden Mahsup'
        kirilim = [
            {'tip': k, 'label': labels.get(k, k), 'toplam': v['toplam'], 'adet': v['adet']}
            for k, v in sorted(kova.items(), key=lambda kv: -kv[1]['toplam'])
        ]
        toplam = sum(v['toplam'] for v in kova.values())
        adet = sum(v['adet'] for v in kova.values())
        return kirilim, toplam, adet

    def _iade_toplami(self, kurum_id, gun, sube_id=None):
        from apps.odeme_takip.domain.models import Tahsilat
        from apps.odeme_takip.domain.enums import TahsilatDurum, TahsilatTuru

        qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            tahsilat_tarihi=gun,
            durum=TahsilatDurum.AKTIF,
            tahsilat_turu=TahsilatTuru.IADE,
        )
        if sube_id:
            qs = qs.filter(sozlesme__sube_id=sube_id)
        return int(qs.aggregate(t=Sum('tutar'))['t'] or 0)

    def _hesap_bakiyeleri(self, kurum_id, sube_id=None):
        qs = MaliHesap.objects.filter(sube__kurum_id=kurum_id, aktif_mi=True)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)

        sonuc = []
        for hesap in qs.select_related('sube').order_by('siralama', 'ad'):
            bakiye = self.bakiye_repo.son_bakiye(hesap.id)
            sonuc.append({
                'id': hesap.id,
                'ad': hesap.ad,
                'tip': hesap.tip,
                'tip_label': hesap.get_tip_display(),
                'sube_ad': hesap.sube.ad if hesap.sube else '',
                'bakiye': int(bakiye),
            })
        return sonuc
