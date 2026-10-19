"""
Koç portalında görünmemesi gereken öğrenciler.

Pasif, kaydı kapanmış veya geçerli sözleşmesi kalmamış öğrenciler
koç listesinde, atama kapsamında ve kapasitede yok sayılır.
Atamaları kapanır; iptal/fesih sonrası koçluk erişimi de kapanır.
"""
from django.db.models import Exists, OuterRef
from django.utils import timezone

from apps.coaching.services.eligibility import AKTIF_SOZLESME_DURUMLARI

GRANTING_DURUMLAR = AKTIF_SOZLESME_DURUMLARI


def visible_coach_student_queryset():
    """Koç portalında durabilecek öğrenciler.

    Aktif öğrenci görünür. Hiç kaydı yoksa kayıt şartı aranmaz.
    Kaydı varsa en az biri aktif olmalıdır. Hiç sözleşmesi yoksa
    sözleşme şartı aranmaz. Sözleşmesi varsa en az biri geçerli
    (aktif, tamamlandı, dondurulmuş) olmalıdır.
    """
    from apps.odeme_takip.domain.models import Sozlesme
    from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit

    has_kayit = Exists(OgrenciKayit.objects.filter(ogrenci_id=OuterRef('pk')))
    has_active_kayit = Exists(
        OgrenciKayit.objects.filter(ogrenci_id=OuterRef('pk'), aktif_mi=True),
    )
    has_sozlesme = Exists(Sozlesme.objects.filter(ogrenci_id=OuterRef('pk')))
    has_granting = Exists(
        Sozlesme.objects.filter(
            ogrenci_id=OuterRef('pk'),
            durum__in=GRANTING_DURUMLAR,
        ),
    )
    return (
        Ogrenci.objects.filter(aktif_mi=True)
        .filter(~has_kayit | has_active_kayit)
        .filter(~has_sozlesme | has_granting)
    )


def portal_visible_student_ids(student_ids) -> set[int]:
    ids = _clean_ids(student_ids)
    if not ids:
        return set()
    return set(
        visible_coach_student_queryset()
        .filter(id__in=ids)
        .values_list('id', flat=True)
    )


def is_student_visible_in_coach_portal(student_id) -> bool:
    try:
        sid = int(student_id)
    except (TypeError, ValueError):
        return False
    return sid in portal_visible_student_ids([sid])


def release_hidden_coach_assignments(student_ids) -> int:
    """Görünmemesi gereken öğrencilerin açık koç atamasını bugün kapatır."""
    from apps.coaching.models import CoachStudentAssignment

    ids = _clean_ids(student_ids)
    if not ids:
        return 0
    visible = portal_visible_student_ids(ids)
    hidden = [sid for sid in ids if sid not in visible]
    if not hidden:
        return 0
    updated = CoachStudentAssignment.objects.filter(
        student_id__in=hidden,
        end_date__isnull=True,
    ).update(end_date=timezone.localdate())
    _close_access_without_granting_contract(hidden)
    return updated


def release_student_after_contract_revoked(ogrenci_id, sozlesme=None) -> int:
    """İptal veya fesih: kalan geçerli sözleşme yoksa erişimi ve koç atamasını kapat."""
    if sozlesme is not None:
        from apps.odeme_takip.application.services.sozlesme_erisim_sync import (
            close_revoked_sozlesme_erisim,
        )
        close_revoked_sozlesme_erisim(sozlesme)
    if not ogrenci_id:
        return 0
    return release_hidden_coach_assignments([ogrenci_id])


def _close_access_without_granting_contract(student_ids):
    from apps.odeme_takip.application.services.sozlesme_erisim_sync import (
        close_revoked_sozlesme_erisim,
    )
    from apps.odeme_takip.domain.models import Sozlesme

    granting_ids = set(
        Sozlesme.objects.filter(
            ogrenci_id__in=student_ids,
            durum__in=GRANTING_DURUMLAR,
        ).values_list('ogrenci_id', flat=True)
    )
    for sid in student_ids:
        if sid in granting_ids:
            continue
        sozlesme = (
            Sozlesme.objects.filter(ogrenci_id=sid)
            .order_by('-id')
            .first()
        )
        if sozlesme is None:
            continue
        close_revoked_sozlesme_erisim(sozlesme)


def _clean_ids(student_ids) -> list[int]:
    ids = []
    seen = set()
    for raw in student_ids or []:
        try:
            sid = int(raw)
        except (TypeError, ValueError):
            continue
        if sid in seen:
            continue
        seen.add(sid)
        ids.append(sid)
    return ids
