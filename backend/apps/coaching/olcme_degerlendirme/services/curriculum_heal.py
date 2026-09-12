"""Canlıda başka dersin altına yazılmış kazanımları pasifleştirir."""
from collections import defaultdict

from django.db import transaction
from django.db.models import Count

from ..models.answer_key import AnswerKeyItem
from ..models.curriculum import Outcome
from ..views.curriculum_views import outcome_prose

MIN_METIN_UZUNLUGU = 12
# Okulizyon konu başlığı (Isı ve Sıcaklık, Periyodik Sistem) cümle değildir.
KATALOG_KONU_METIN_UST = 40


def _dotted_part_count(code: str) -> int:
    return len([p for p in (code or '').strip().rstrip('.').split('.') if p])


def _looks_like_catalog_konu(outcome, sub_count: int = 0) -> bool:
    """Okulizyon ünite/konu düğümü — yapıştırma kopyası değil.

    Katalogda Outcome çoğu zaman konu adıdır (9.5.1 / Isı ve Sıcaklık);
    asıl kazanım metni SubOutcome'dadır. Aynı konu adı Fen ve Fizik'te
    geçince eski temizlik Fizik üst kaydını pasifleştiriyor, 9.5.1.1
    eşleşmesi de kayboluyordu.
    """
    if sub_count > 0:
        return True
    parts = _dotted_part_count(getattr(outcome, 'code', '') or '')
    prose = outcome_prose(getattr(outcome, 'text', '') or '')
    return 2 <= parts <= 3 and len(prose) < KATALOG_KONU_METIN_UST


def restore_catalog_konu_outcomes() -> int:
    """Yanlışlıkla pasifleşen katalog konu düğümlerini geri aç."""
    qs = (
        Outcome.objects
        .filter(is_active=False)
        .annotate(sub_count=Count('sub_outcomes'))
    )
    ids = [o.id for o in qs if _looks_like_catalog_konu(o, o.sub_count)]
    if ids:
        Outcome.objects.filter(id__in=ids).update(is_active=True)
    return len(ids)


def karisan_kazanimlari_bul():
    """Metni birden çok derste geçen kazanımlarda, sonradan yazılanları döner."""
    by_text = defaultdict(list)
    qs = (
        Outcome.objects
        .filter(is_active=True)
        .select_related('topic', 'topic__subject')
        .annotate(sub_count=Count('sub_outcomes'))
        .order_by('id')
    )
    for outcome in qs.iterator():
        if _looks_like_catalog_konu(outcome, getattr(outcome, 'sub_count', 0)):
            continue
        prose = outcome_prose(outcome.text or '').lower()
        if len(prose) < MIN_METIN_UZUNLUGU:
            continue
        by_text[prose].append(outcome)

    kopyalar = []
    for grup in by_text.values():
        subject_ids = {o.topic.subject_id for o in grup}
        if len(subject_ids) < 2:
            continue
        ozgun_subject = grup[0].topic.subject_id
        kopyalar.extend(o for o in grup if o.topic.subject_id != ozgun_subject)
    return kopyalar


def uygula_karisan_kazanim_temizligi():
    """Kopyaları pasifleştirir, cevap anahtarı bağlarını koparır.

    Dönüş: (pasifleştirilen_kazanim, koparılan_satır)
    """
    restore_catalog_konu_outcomes()
    kopyalar = karisan_kazanimlari_bul()
    if not kopyalar:
        return 0, 0

    ids = [o.id for o in kopyalar]
    bagli = 0
    with transaction.atomic():
        items = list(
            AnswerKeyItem.objects.filter(outcome_id__in=ids).select_related('outcome')
        )
        bagli = len(items)
        for item in items:
            if not (item.imported_outcome_text or '').strip():
                item.imported_outcome_text = item.outcome.text
            item.outcome = None
            item.sub_outcome = None
            item.save(
                update_fields=['imported_outcome_text', 'outcome', 'sub_outcome'],
            )
        Outcome.objects.filter(id__in=ids).update(is_active=False)
    return len(kopyalar), bagli
