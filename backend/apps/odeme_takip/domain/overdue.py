"""
Vadesi geçmiş taksit sorguları — tek kaynak (Faz 0).

Kural: vade_tarihi < bugün VE kalan_tutar > 0
"""
from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum
from apps.odeme_takip.domain.models import Taksit


def overdue_base_q(*, reference_date: date | None = None) -> Q:
    """Vadesi geçmiş ve kalan borcu olan taksit filtresi."""
    today = reference_date or timezone.localdate()
    return Q(
        vade_tarihi__lt=today,
        kalan_tutar__gt=0,
        durum__in=[
            TaksitDurum.BEKLEMEDE,
            TaksitDurum.KISMI_ODENDI,
            TaksitDurum.GECIKTI,
        ],
    )


def active_sozlesme_q(*, kurum_id=None, sube_id=None, egitim_yili_id=None) -> Q:
    """Aktif sözleşme filtresi."""
    q = Q(sozlesme__durum__in=[SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS])
    if kurum_id:
        q &= Q(sozlesme__kurum_id=kurum_id)
    if sube_id:
        q &= Q(sozlesme__sube_id=sube_id)
    if egitim_yili_id:
        q &= Q(sozlesme__egitim_yili_id=egitim_yili_id)
    return q


def get_overdue_taksit_queryset(
    *,
    kurum_id=None,
    sube_id=None,
    egitim_yili_id=None,
    min_gecikme_gun: int | None = None,
    arama: str = '',
    reference_date: date | None = None,
) -> QuerySet:
    """Vadesi geçmiş taksit queryset'i."""
    today = reference_date or timezone.localdate()
    qs = (
        Taksit.objects.filter(overdue_base_q(reference_date=today))
        .filter(active_sozlesme_q(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        ))
        .select_related(
            'sozlesme__ogrenci',
            'sozlesme__veli',
            'sozlesme__sube',
            'sozlesme__egitim_yili',
            'sozlesme__kurum',
        )
    )

    if min_gecikme_gun is not None and min_gecikme_gun > 0:
        max_vade = today - timedelta(days=min_gecikme_gun)
        qs = qs.filter(vade_tarihi__lte=max_vade)

    arama = (arama or '').strip()
    if arama:
        qs = qs.filter(
            Q(sozlesme__sozlesme_no__icontains=arama)
            | Q(sozlesme__ogrenci__ad__icontains=arama)
            | Q(sozlesme__ogrenci__soyad__icontains=arama)
        )

    return qs


def upcoming_base_q(*, baslangic: date, bitis: date) -> Q:
    """Vadesi gelecek (henüz gelmemiş) ve kalan borcu olan taksit filtresi."""
    return Q(
        vade_tarihi__gte=baslangic,
        vade_tarihi__lte=bitis,
        kalan_tutar__gt=0,
        durum__in=[
            TaksitDurum.BEKLEMEDE,
            TaksitDurum.KISMI_ODENDI,
        ],
    )


def get_upcoming_taksit_queryset(
    *,
    kurum_id=None,
    sube_id=None,
    egitim_yili_id=None,
    baslangic: date,
    bitis: date,
    arama: str = '',
) -> QuerySet:
    """Vadesi gelecek (yaklaşan) taksit queryset'i — Bugün/Yarın/Bu Hafta/Bu Ay filtreleri için."""
    qs = (
        Taksit.objects.filter(upcoming_base_q(baslangic=baslangic, bitis=bitis))
        .filter(active_sozlesme_q(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        ))
        .select_related(
            'sozlesme__ogrenci',
            'sozlesme__veli',
            'sozlesme__sube',
            'sozlesme__egitim_yili',
            'sozlesme__kurum',
        )
    )

    arama = (arama or '').strip()
    if arama:
        qs = qs.filter(
            Q(sozlesme__sozlesme_no__icontains=arama)
            | Q(sozlesme__ogrenci__ad__icontains=arama)
            | Q(sozlesme__ogrenci__soyad__icontains=arama)
        )

    return qs.order_by('vade_tarihi')


def gecikme_gunu(taksit: Taksit, *, reference_date: date | None = None) -> int:
    """Vade tarihinden bugüne geçen gün sayısı."""
    today = reference_date or timezone.localdate()
    if not taksit.vade_tarihi:
        return 0
    return max(0, (today - taksit.vade_tarihi).days)
