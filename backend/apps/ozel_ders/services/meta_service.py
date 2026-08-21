"""Özel ders formları için ders / öğretmen seçenekleri."""
from __future__ import annotations

from django.db.models import Q

from apps.egitim_tanimlari.models import Ders
from apps.personel.domain.models import Personel, PersonelGorevlendirme


def _serialize_ders(d: dict) -> dict:
    return {
        'id': d['id'],
        'ad': d['ad'],
        'kod': d.get('kod') or '',
        'kisa_ad': (d.get('kisa_ad') or '').strip(),
    }


def list_dersler(*, kurum_id: int, sube_id: int | None = None) -> list[dict]:
    """Aktif dersler — önce şube, şubede yoksa kurum geneli."""
    qs = Ders.objects.filter(aktif_mi=True, kurum_id=kurum_id)
    scoped = qs.filter(sube_id=sube_id) if sube_id else qs
    rows = list(scoped.order_by('ad').values('id', 'ad', 'kod', 'kisa_ad')[:500])
    if not rows and sube_id:
        rows = list(qs.order_by('ad').values('id', 'ad', 'kod', 'kisa_ad')[:500])
    return [_serialize_ders(d) for d in rows]


def list_teachers(*, kurum_id: int, sube_id: int | None = None) -> list[dict]:
    """Aktif personel — ev şubesi veya görevlendirme ile bu şubede olanlar."""
    qs = Personel.objects.filter(aktif_mi=True, kurum_id=kurum_id)
    if sube_id:
        assigned_ids = PersonelGorevlendirme.objects.filter(
            kurum_id=kurum_id,
            gorev_sube_id=sube_id,
            aktif_mi=True,
        ).values_list('personel_id', flat=True)
        qs = qs.filter(Q(sube_id=sube_id) | Q(id__in=assigned_ids))
    teachers = list(qs.order_by('ad', 'soyad').values('id', 'ad', 'soyad')[:300])
    return [
        {'id': t['id'], 'name': f"{t['ad']} {t['soyad']}".strip()}
        for t in teachers
    ]


def build_meta(*, kurum_id: int, sube_id: int | None = None) -> dict:
    return {
        'teachers': list_teachers(kurum_id=kurum_id, sube_id=sube_id),
        'dersler': list_dersler(kurum_id=kurum_id, sube_id=sube_id),
    }
