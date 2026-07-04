#!/usr/bin/env python
"""Geriye dönük imported_outcome_text alanını doldur."""
import django, os, sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKeyItem

items = AnswerKeyItem.objects.filter(
    outcome__isnull=False,
    imported_outcome_text='',
).select_related('outcome')

count = 0
for item in items:
    if item.outcome and item.outcome.code:
        item.imported_outcome_text = item.outcome.code
        item.save(update_fields=['imported_outcome_text'])
        count += 1

print(f'Updated: {count}')
total = AnswerKeyItem.objects.count()
filled = AnswerKeyItem.objects.exclude(imported_outcome_text='').count()
print(f'Filled: {filled}/{total}')
