"""
Gelir Selector — Sadece okuma amaçlı sorgular
"""
from apps.finans.infrastructure.gelir_repository import GelirKaydiRepository


class GelirSelector:
    """Gelir kaydı okuma sorguları."""

    def __init__(self):
        self.gelir_repo = GelirKaydiRepository

    def get_by_id(self, gelir_id):
        return self.gelir_repo.get_by_id(gelir_id)

    def list_by_kurum(self, kurum_id, filtreler=None):
        return self.gelir_repo.get_by_kurum(kurum_id, filtreler=filtreler)

    def ozet_istatistikler(self, kurum_id, egitim_yili_id=None, sube_id=None):
        return self.gelir_repo.ozet_istatistikler(
            kurum_id, egitim_yili_id=egitim_yili_id, sube_id=sube_id,
        )
