"""Önceki prefix hatasının yazdığı başlık→çocuk kazanım bağlarını çöz."""
import re

from django.db import migrations

_DOTTED_CODE_RE = re.compile(r'^\d+(?:\.\d+)+$')


def _is_heading_code(text: str) -> bool:
    stripped = (text or '').strip().rstrip('.')
    parts = [p for p in stripped.split('.') if p]
    return bool(_DOTTED_CODE_RE.match(stripped) and len(parts) == 2)


def detach_false_heading_binds(apps, schema_editor):
    AnswerKeyItem = apps.get_model('olcme_degerlendirme', 'AnswerKeyItem')
    items = AnswerKeyItem.objects.exclude(outcome_id=None).select_related('outcome')
    for item in items.iterator():
        text = (item.imported_outcome_text or '').strip().rstrip('.')
        if not _is_heading_code(text):
            continue
        bound = (getattr(item.outcome, 'code', None) or '').strip().rstrip('.')
        if bound.lower() == text.lower():
            continue
        item.outcome_id = None
        if hasattr(item, 'sub_outcome_id'):
            item.sub_outcome_id = None
            item.save(update_fields=['outcome_id', 'sub_outcome_id'])
        else:
            item.save(update_fields=['outcome_id'])


def noop(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0021_exam_curriculum_band'),
    ]

    operations = [
        migrations.RunPython(detach_false_heading_binds, noop),
    ]
