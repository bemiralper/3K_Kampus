"""
Phase 5 — kimlik tekilliği zorunluluğu (kurum bazlı).
"""
from __future__ import annotations

from apps.kimlik.application.resolver import KimlikResolver
from apps.kimlik.exceptions import KimlikConflictError
from apps.kimlik.application.kisi_service import KisiService
from apps.personel.domain.models import Personel


def assert_no_duplicate_personel(kurum_id: int, tc_kimlik_no: str | None) -> None:
    tc = (tc_kimlik_no or '').strip()
    if not tc:
        return
    existing = Personel.objects.filter(kurum_id=kurum_id, tc_kimlik_no=tc).first()
    if existing:
        raise KimlikConflictError(
            f'Bu TC Kimlik No ile kayıtlı personel zaten var: {existing.tam_ad}. Mevcut kişiyi kullanın.',
            code='duplicate_personel_tc',
            details={
                'field': 'tc_kimlik_no',
                'personel_id': existing.id,
                'kisi_id': existing.kisi_id,
            },
        )


def assert_identity_for_new_record(
    kurum_id: int,
    *,
    tc_kimlik_no: str | None = None,
    telefon: str | None = None,
    exclude_kisi_id: int | None = None,
    allow_existing_personel: bool = False,
    context: str | None = None,
) -> None:
    """
    Yeni kayıt öncesi Kisi tekilliğini doğrula.
    allow_existing_personel=True ise sadece personel duplicate kontrolü atlanır (reuse akışı).
    """
    if not allow_existing_personel:
        assert_no_duplicate_personel(kurum_id, tc_kimlik_no)

    KisiService.assert_unique(
        kurum_id,
        tc_kimlik_no,
        telefon,
        exclude_kisi_id=exclude_kisi_id,
    )

    tc = (tc_kimlik_no or '').strip()
    if not tc:
        return

    resolver = KimlikResolver(kurum_id=kurum_id)
    result = resolver.resolve(tc=tc, telefon=telefon, context=context)
    if not result.get('found'):
        return

    if allow_existing_personel:
        return

    roller = result.get('roller') or []
    if context == 'personel':
        if any(r['tip'] == 'personel' for r in roller):
            ref = next(r for r in roller if r['tip'] == 'personel')
            raise KimlikConflictError(
                f"Bu TC Kimlik No sistemde Personel olarak kayıtlı: {ref.get('tam_ad', '')}. Mevcut kişiyi kullanın.",
                code='duplicate_personel_tc',
                details={'roller': roller, 'kisi_id': result.get('kisi', {}).get('id') if result.get('kisi') else None},
            )
