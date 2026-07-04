#!/usr/bin/env python
"""Mevcut cevap anahtarı verilerini kontrol et."""
import os, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from apps.coaching.olcme_degerlendirme.models import Exam, AnswerKey, AnswerKeyItem

for e in Exam.objects.all():
    print(f'Exam {e.id}: {e.name} (type={e.exam_type}, booklet={e.booklet_type})')
    for ak in e.answer_keys.all():
        items = ak.items.order_by('question_number')
        b_count = items.filter(b_question_number__isnull=False).count()
        print(f'  AnswerKey {ak.id}: booklet="{ak.booklet}", primary={ak.is_primary}, items={items.count()}, b_mapped={b_count}')
        for item in items[:5]:
            print(f'    Q{item.question_number}: {item.correct_answer} (sec={item.section.name}, b_q={item.b_question_number})')
        if items.count() > 5:
            last_items = items[items.count()-3:]
            print(f'    ...')
            for item in last_items:
                print(f'    Q{item.question_number}: {item.correct_answer} (sec={item.section.name}, b_q={item.b_question_number})')
        print()
