#!/usr/bin/env python
"""A ve B kitapçığı eşlemelerini detaylı kontrol et."""
import os, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from apps.coaching.olcme_degerlendirme.models import Exam, AnswerKey, AnswerKeyItem

exam = Exam.objects.get(pk=2)
a_key = AnswerKey.objects.get(exam=exam, booklet='A')
b_key = AnswerKey.objects.get(exam=exam, booklet='B')

a_items = list(a_key.items.order_by('question_number'))
b_items = list(b_key.items.order_by('question_number'))

print(f"A kitapçığı: {len(a_items)} soru")
print(f"B kitapçığı: {len(b_items)} soru")
print()

# Sections
sections = list(exam.sections.filter(is_sub_section=False).order_by('order'))
print("Bölümler:")
for sec in sections:
    print(f"  {sec.name}: Q{sec.question_start}-Q{sec.question_end} ({sec.question_end - sec.question_start + 1} soru)")
print()

# A→B eşlemesini göster (bölüm bazlı)
current_section = None
print("A Kitapçığı → B Kitapçığı Eşlemesi:")
print(f"{'A_Soru':>7} {'Cevap':>6} {'B_Soru':>7} {'Bölüm'}")
print("-" * 50)
for item in a_items:
    sec_name = item.section.name
    if sec_name != current_section:
        print(f"\n--- {sec_name} ---")
        current_section = sec_name
    print(f"  A-{item.question_number:>3}   {item.correct_answer:>3}    B-{item.b_question_number or '?':>3}    {sec_name}")

print()
print("B Kitapçığı cevap anahtarı:")
print(f"{'B_Soru':>7} {'Cevap':>6} {'Bölüm'}")
print("-" * 30)
current_section = None
for item in b_items:
    sec_name = item.section.name
    if sec_name != current_section:
        print(f"\n--- {sec_name} ---")
        current_section = sec_name
    print(f"  B-{item.question_number:>3}   {item.correct_answer:>3}    {sec_name}")

# B cevap anahtarı doğruluk kontrolü
print("\n\n=== DOĞRULUK KONTROLÜ ===")
# B cevap anahtarında her B soru numarasının, A'daki b_question_number ile eşleşmesi lazım
b_correct_map = {item.question_number: item.correct_answer for item in b_items}
errors = 0
for a_item in a_items:
    if a_item.b_question_number:
        b_answer = b_correct_map.get(a_item.b_question_number)
        if b_answer is None:
            print(f"  HATA: A-{a_item.question_number} → B-{a_item.b_question_number} ama B cevap anahtarında bu soru YOK!")
            errors += 1
        elif b_answer != a_item.correct_answer:
            print(f"  HATA: A-{a_item.question_number}={a_item.correct_answer} → B-{a_item.b_question_number}={b_answer} CEVAP UYUŞMUYOR!")
            errors += 1
if errors == 0:
    print("  ✅ Tüm eşlemeler doğru.")
else:
    print(f"  ❌ {errors} hata bulundu!")
