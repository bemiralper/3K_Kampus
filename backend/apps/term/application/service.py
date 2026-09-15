"""Aktif eğitim dönemi — tek aktif dönem ve kayıt senkronu."""
from __future__ import annotations

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
    if not term.is_active:
        term.is_active = True
        term.save(update_fields=['is_active', 'updated_at'])
    ensure_exclusive_active_term(term)
    sync_enrollments_to_term(term)
