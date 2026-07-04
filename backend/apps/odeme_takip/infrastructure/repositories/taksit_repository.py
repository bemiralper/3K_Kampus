"""
Taksit Repository
"""
from django.db.models import Sum, Q, F

from apps.odeme_takip.domain.models import Taksit
from apps.odeme_takip.domain.enums import TaksitDurum, TahsilatDurum, TahsilatTuru
from apps.odeme_takip.domain.overdue import get_overdue_taksit_queryset, get_upcoming_taksit_queryset


class TaksitRepository:

    def create(self, data):
        return Taksit.objects.create(**data)

    def bulk_create(self, taksitler):
        return Taksit.objects.bulk_create(taksitler)

    def get_by_sozlesme(self, sozlesme_id):
        return Taksit.objects.filter(
            sozlesme_id=sozlesme_id
        ).prefetch_related(
            'tahsilatlar__odeme_yontemi'
        ).order_by('taksit_no')

    def get_by_id(self, id):
        try:
            return Taksit.objects.select_related('sozlesme').get(id=id)
        except Taksit.DoesNotExist:
            return None

    def delete_by_sozlesme(self, sozlesme_id):
        """Sözleşmeye ait tüm taksitleri sil (sadece taslak sözleşmelerde)"""
        Taksit.objects.filter(sozlesme_id=sozlesme_id).delete()

    def get_vadesi_gecenler(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        """Vadesi geçmiş ve ödenmemiş taksitler — overdue.py tek kaynak."""
        return get_overdue_taksit_queryset(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        ).order_by('vade_tarihi')

    def get_vadesi_gelecekler(self, kurum_id=None, sube_id=None, egitim_yili_id=None, baslangic=None, bitis=None, arama=''):
        """Vadesi gelecek (yaklaşan) taksitler — overdue.py tek kaynak."""
        return get_upcoming_taksit_queryset(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            baslangic=baslangic,
            bitis=bitis,
            arama=arama,
        )

    def update(self, taksit, data):
        for key, value in data.items():
            setattr(taksit, key, value)
        taksit.save()
        return taksit
