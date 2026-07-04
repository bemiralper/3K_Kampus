"""
Gider Selector — Sadece okuma amaçlı sorgular
"""
from apps.finans.application.gider_service import GiderService
from apps.finans.infrastructure.gider_repository import GiderKaydiRepository, GiderTaksitRepository
from apps.finans.infrastructure.gider_odeme_repository import GiderOdemeRepository


class GiderSelector:
    """Gider kaydı okuma sorguları."""

    def __init__(self):
        self.gider_repo = GiderKaydiRepository
        self.taksit_repo = GiderTaksitRepository
        self.odeme_repo = GiderOdemeRepository
        self.gider_service = GiderService()

    def _prepare_taksit_lists(self, kurum_id, sube_id=None):
        self.gider_service.repair_inconsistent_taksit_rows(kurum_id, sube_id=sube_id)

    def get_by_id(self, gider_id):
        return self.gider_repo.get_by_id(gider_id)

    def list_by_kurum(self, kurum_id, filtreler=None):
        return self.gider_repo.get_by_kurum(kurum_id, filtreler=filtreler)

    def taksitler(self, gider_id):
        return self.taksit_repo.get_by_gider(gider_id)

    def odemeler(self, gider_id):
        return self.odeme_repo.get_by_gider(gider_id)

    def taksit_odemeleri(self, taksit_id):
        return self.odeme_repo.get_by_taksit(taksit_id)

    def ozet_istatistikler(self, kurum_id, egitim_yili_id=None, sube_id=None):
        return self.gider_repo.ozet_istatistikler(
            kurum_id, egitim_yili_id=egitim_yili_id, sube_id=sube_id,
        )

    def geciken_taksitler(self, kurum_id, sube_id=None):
        self._prepare_taksit_lists(kurum_id, sube_id=sube_id)
        return self.taksit_repo.geciken_taksitler(kurum_id, sube_id=sube_id)

    def yaklasan_vadeler(self, kurum_id, gun=7, odeme_yontemi_tipi=None, sube_id=None):
        self._prepare_taksit_lists(kurum_id, sube_id=sube_id)
        return self.taksit_repo.yaklasan_vadeler(
            kurum_id, gun=gun, odeme_yontemi_tipi=odeme_yontemi_tipi, sube_id=sube_id,
        )

    def son_odemeler(self, kurum_id, limit=10, cari_hesap_id=None, sube_id=None, egitim_yili_id=None):
        return self.odeme_repo.son_odemeler(
            kurum_id,
            limit=limit,
            cari_hesap_id=cari_hesap_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        )
