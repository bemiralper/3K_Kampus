"""
Dönem Bakiye Selector
Read-only sorgular — dönem bazlı bakiye ve yıllar arası karşılaştırma.
"""
from apps.finans.infrastructure.donem_bakiye_repository import DonemBakiyeRepository
from apps.finans.constants.hareket_types import DonemDurum


class DonemBakiyeSelector:
    """Dönem bakiyeleri için read-only sorgular."""

    def __init__(self):
        self.repo = DonemBakiyeRepository()

    def get_by_id(self, pk):
        """Tek bir dönem bakiye kaydı getirir."""
        return self.repo.get_by_id(pk)

    def get_by_mali_hesap_ve_yil(self, mali_hesap_id, egitim_yili_id):
        """Mali hesap + eğitim yılı çifti ile kayıt getirir."""
        return self.repo.get_by_mali_hesap_ve_yil(mali_hesap_id, egitim_yili_id)

    def get_sube_ozet(self, sube_id, egitim_yili_id):
        """
        Şubenin dönem özeti — tüm mali hesaplar konsolide.
        Returns:
            dict: { hesaplar: [...], toplam_gelir, toplam_gider, toplam_bakiye, donem_basi }
        """
        donemler = self.repo.get_by_sube_ve_yil(sube_id, egitim_yili_id)
        hesaplar = []
        toplam_donem_basi = 0
        toplam_gelir = 0
        toplam_gider = 0
        toplam_bakiye = 0

        for d in donemler:
            hesaplar.append({
                'id': d.id,
                'mali_hesap_id': d.mali_hesap_id,
                'mali_hesap_ad': d.mali_hesap.ad,
                'mali_hesap_tip': d.mali_hesap.tip,
                'donem_basi_bakiye': d.donem_basi_bakiye,
                'toplam_gelir': d.toplam_gelir,
                'toplam_gider': d.toplam_gider,
                'donem_sonu_bakiye': d.donem_sonu_bakiye,
                'durum': d.durum,
                'durum_label': d.get_durum_display(),
            })
            toplam_donem_basi += d.donem_basi_bakiye
            toplam_gelir += d.toplam_gelir
            toplam_gider += d.toplam_gider
            toplam_bakiye += d.donem_sonu_bakiye

        return {
            'hesaplar': hesaplar,
            'toplam_donem_basi': toplam_donem_basi,
            'toplam_gelir': toplam_gelir,
            'toplam_gider': toplam_gider,
            'toplam_bakiye': toplam_bakiye,
            'net_kar': toplam_gelir - toplam_gider,
        }

    def get_kurum_ozet(self, kurum_id, egitim_yili_id):
        """
        Kurumun dönem özeti — tüm şubeler konsolide.
        """
        donemler = self.repo.get_by_kurum_ve_yil(kurum_id, egitim_yili_id)
        sube_map = {}

        for d in donemler:
            sube_key = d.sube_id
            if sube_key not in sube_map:
                sube_map[sube_key] = {
                    'sube_id': d.sube_id,
                    'sube_ad': d.sube.ad if hasattr(d, 'sube') and d.sube else '',
                    'donem_basi_bakiye': 0,
                    'toplam_gelir': 0,
                    'toplam_gider': 0,
                    'donem_sonu_bakiye': 0,
                }
            sube_map[sube_key]['donem_basi_bakiye'] += d.donem_basi_bakiye
            sube_map[sube_key]['toplam_gelir'] += d.toplam_gelir
            sube_map[sube_key]['toplam_gider'] += d.toplam_gider
            sube_map[sube_key]['donem_sonu_bakiye'] += d.donem_sonu_bakiye

        subeler = list(sube_map.values())
        toplam_gelir = sum(s['toplam_gelir'] for s in subeler)
        toplam_gider = sum(s['toplam_gider'] for s in subeler)

        return {
            'subeler': subeler,
            'toplam_gelir': toplam_gelir,
            'toplam_gider': toplam_gider,
            'net_kar': toplam_gelir - toplam_gider,
            'toplam_bakiye': sum(s['donem_sonu_bakiye'] for s in subeler),
        }

    def get_yillar_arasi_karsilastirma(self, kurum_id):
        """
        Kurum bazında yıllar arası karşılaştırma.
        Returns:
            list: [{ yil: '2024-2025', gelir, gider, net, bakiye, degisim_yuzde }, ...]
        """
        rows = self.repo.get_kurum_yillar_arasi(kurum_id)
        sonuc = []
        onceki_net = None

        for row in rows:
            gelir = row['toplam_gelir'] or 0
            gider = row['toplam_gider'] or 0
            net = gelir - gider
            bakiye = row['toplam_donem_sonu'] or 0

            degisim = None
            if onceki_net is not None and onceki_net != 0:
                degisim = round((net - onceki_net) * 100 / abs(onceki_net), 1)

            sonuc.append({
                'egitim_yili_id': row['egitim_yili__id'],
                'yil': f"{row['egitim_yili__baslangic_yil']}-{row['egitim_yili__bitis_yil']}",
                'donem_basi': row['toplam_donem_basi'] or 0,
                'toplam_gelir': gelir,
                'toplam_gider': gider,
                'net_kar': net,
                'donem_sonu_bakiye': bakiye,
                'gider_gelir_orani': round(gider * 100 / gelir, 1) if gelir > 0 else None,
                'degisim_yuzde': degisim,
            })
            onceki_net = net

        return sonuc

    def get_mali_hesap_yillar_arasi(self, mali_hesap_id):
        """
        Tek bir mali hesabın yıllar arası bakiye seyri.
        """
        donemler = self.repo.get_yillar_arasi(mali_hesap_id)
        return [
            {
                'egitim_yili_id': d.egitim_yili_id,
                'yil': str(d.egitim_yili),
                'donem_basi_bakiye': d.donem_basi_bakiye,
                'toplam_gelir': d.toplam_gelir,
                'toplam_gider': d.toplam_gider,
                'donem_sonu_bakiye': d.donem_sonu_bakiye,
                'devir_tutari': d.devir_tutari,
                'durum': d.durum,
            }
            for d in donemler
        ]
