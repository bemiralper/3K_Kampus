#!/usr/bin/env python
"""B cevap anahtarını A'dan yeniden oluştur (fix)."""
import os, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from django.db import transaction
from apps.coaching.olcme_degerlendirme.models import Exam, AnswerKey, AnswerKeyItem

exam = Exam.objects.get(pk=2)
sections = list(exam.sections.filter(is_sub_section=False).order_by('order'))

a_key = AnswerKey.objects.get(exam=exam, booklet='A')
a_items = list(a_key.items.select_related('section').order_by('question_number'))

print(f"A kitapçığı: {len(a_items)} soru")

# B kitapçığını yeniden oluştur
with transaction.atomic():
    b_key, created = AnswerKey.objects.get_or_create(
        exam=exam, booklet='B',
        defaults={'is_primary': False},
    )
    b_key.items.all().delete()
    
    count = 0
    for item in a_items:
        if item.b_question_number is None:
            continue
        
        # Bölüm-içi B numarası → global B pozisyonu
        b_global = item.section.question_start + item.b_question_number - 1
        
        AnswerKeyItem.objects.create(
            answer_key=b_key,
            section=item.section,
            question_number=b_global,
            correct_answer=item.correct_answer,
            is_cancelled=item.is_cancelled,
            outcome_id=item.outcome_id,
        )
        count += 1
    
    print(f"B kitapçığı: {count} soru oluşturuldu")

# Doğrulama
b_items = list(b_key.items.order_by('question_number'))
print(f"B kitapçığı doğrulama: {len(b_items)} soru")

# Bölüm bazında kontrol
for sec in sections:
    sec_items = [it for it in b_items if it.section_id == sec.id]
    print(f"  {sec.name}: {len(sec_items)} soru (Q{sec.question_start}-Q{sec.question_end})")
    for it in sorted(sec_items, key=lambda x: x.question_number):
        # Bu B global pozisyonunun A eşlemesi
        matching_a = next(
            (a for a in a_items 
             if a.section_id == sec.id and 
             sec.question_start + a.b_question_number - 1 == it.question_number),
            None
        )
        if matching_a:
            match_ok = "✅" if matching_a.correct_answer == it.correct_answer else "❌"
            print(f"    B-{it.question_number}: {it.correct_answer} → A-{matching_a.question_number}: {matching_a.correct_answer} {match_ok}")
        else:
            print(f"    B-{it.question_number}: {it.correct_answer} → A eşlemesi YOK ❌")
