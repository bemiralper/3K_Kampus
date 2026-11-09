"""Ders tarihine göre ortak sözleşme seçimi; şube sözleşmesi önceliklidir."""
from django.db.models import Case, IntegerField, Q, Value, When

from apps.personel.domain.sozlesme_models import PersonelSozlesme, SozlesmeDurumu


def active_lesson_contract(personel_id, day, kurum_id, sube_id, egitim_yili_id=None):
    qs = PersonelSozlesme.objects.filter(
        personel_id=personel_id, kurum_id=kurum_id, durum=SozlesmeDurumu.AKTIF,
        baslangic_tarihi__lte=day, bitis_tarihi__gte=day,
    )
    if egitim_yili_id is not None:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    qs = qs.filter(Q(sube_id=sube_id) | Q(sube__isnull=True))
    return qs.annotate(branch_priority=Case(
        When(sube_id=sube_id, then=Value(0)), default=Value(1), output_field=IntegerField(),
    )).prefetch_related('mesai_saatleri', 'ders_ucretleri__brans').order_by('branch_priority', '-id').first()
