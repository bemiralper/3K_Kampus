"""Aktif eğitim dönemi — tek aktif dönem ve kayıt senkronu."""
from __future__ import annotations

from django.db.models import Q

from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.ogrenci.domain.models import OgrenciKayit
from apps.term.domain.models import Term


def ensure_exclusive_active_term(term: Term) -> None:
    """Aynı kurum/şube/yılda yalnızca bu dönem aktif kalsın."""
    Term.objects.filter(
        kurum_id=term.kurum_id,
        sube_id=term.sube_id,
        egitim_yili_id=term.egitim_yili_id,
        is_active=True,
    ).exclude(pk=term.pk).update(is_active=False)


def previous_term_for(term: Term) -> Term | None:
    """Az önce aktif olan veya aynı yıldaki önceki dönem."""
    previous = (
        Term.objects
        .filter(
            kurum_id=term.kurum_id,
            sube_id=term.sube_id,
            egitim_yili_id=term.egitim_yili_id,
            is_active=True,
        )
        .exclude(pk=term.pk)
        .order_by('-updated_at', 'order_no')
        .first()
    )
    if previous:
        return previous
    return (
        Term.objects
        .filter(
            kurum_id=term.kurum_id,
            sube_id=term.sube_id,
            egitim_yili_id=term.egitim_yili_id,
        )
        .exclude(pk=term.pk)
        .order_by('order_no', 'start_date', 'id')
        .first()
    )


def rehome_inherited_classes(term: Term, previous: Term | None = None) -> int:
    """
    Yeni döneme yanlışlıkla bağlanan eski sınıfları önceki döneme bırakır.

    Canlıdaki 0003 backfill, sınıfları o anki aktif döneme yazdı. Yeni dönem
    açılınca bu sınıflar listede kalıyordu; burada yerleşimi olmayan /
    önceki dönemde oluşmuş sınıflar geri taşınır.
    """
    from apps.sinif.domain.models import Sinif

    if previous is None:
        previous = previous_term_for(term)

    if previous is None:
        return Sinif.objects.filter(
            kurum_id=term.kurum_id,
            sube_id=term.sube_id,
            egitim_yili_id=term.egitim_yili_id,
            term_id__isnull=True,
        ).update(term_id=term.id)

    owned_ids = set(
        StudentClassPlacement.objects.filter(
            term_id=term.id,
            is_active=True,
        ).values_list('classroom_id', flat=True)
    )
    candidates = (
        Sinif.objects
        .filter(
            kurum_id=term.kurum_id,
            sube_id=term.sube_id,
            egitim_yili_id=term.egitim_yili_id,
        )
        .filter(Q(term_id=term.id) | Q(term_id__isnull=True))
        .exclude(id__in=owned_ids)
    )

    moved = 0
    for sinif in candidates:
        has_prev = StudentClassPlacement.objects.filter(
            classroom_id=sinif.id,
            term_id=previous.id,
            is_active=True,
        ).exists()
        created_before = bool(
            sinif.created_at and term.created_at and sinif.created_at < term.created_at
        )
        if not (has_prev or created_before or sinif.term_id is None):
            continue
        clash = Sinif.objects.filter(
            kurum_id=sinif.kurum_id,
            sube_id=sinif.sube_id,
            egitim_yili_id=sinif.egitim_yili_id,
            term_id=previous.id,
            ad=sinif.ad,
        ).exclude(pk=sinif.pk).exists()
        if clash:
            continue
        sinif.term_id = previous.id
        sinif.save(update_fields=['term_id'])
        moved += 1
    return moved


def sync_enrollments_to_term(term: Term) -> None:
    """
    Yıllık OgrenciKayit.sinif alanını aktif dönemin yerleşimine çeker.

    Yeni dönemde henüz yerleşim yoksa sınıf atamaları boş görünür.
    Eski dönemin StudentClassPlacement kayıtları silinmez.
    """
    OgrenciKayit.objects.filter(
        kurum_id=term.kurum_id,
        sube_id=term.sube_id,
        egitim_yili_id=term.egitim_yili_id,
        aktif_mi=True,
    ).update(sinif_id=None)

    placements = (
        StudentClassPlacement.objects
        .filter(term_id=term.id, is_active=True)
        .values_list('student_id', 'classroom_id')
    )
    for student_id, classroom_id in placements:
        OgrenciKayit.objects.filter(
            ogrenci_id=student_id,
            egitim_yili_id=term.egitim_yili_id,
            sube_id=term.sube_id,
            kurum_id=term.kurum_id,
            aktif_mi=True,
        ).update(sinif_id=classroom_id)


def activate_term(term: Term) -> None:
    """Dönemi aktif yap, diğerlerini kapat, kayıt sınıfını bu döneme göre sıfırla/eşle."""
    previous = previous_term_for(term)
    if not term.is_active:
        term.is_active = True
        term.save(update_fields=['is_active', 'updated_at'])
    ensure_exclusive_active_term(term)
    rehome_inherited_classes(term, previous)
    sync_enrollments_to_term(term)
