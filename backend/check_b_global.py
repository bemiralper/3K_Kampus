#!/usr/bin/env python
"""B kitapçığı global pozisyon eşlemesini oluştur ve doğrula."""
import os, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from apps.coaching.olcme_degerlendirme.models import Exam, AnswerKey, AnswerKeyItem, ExamSection

exam = Exam.objects.get(pk=2)
sections = list(exam.sections.filter(is_sub_section=False).order_by('order'))

print("Bölümler:")
for sec in sections:
    count = sec.question_end - sec.question_start + 1
    print(f"  {sec.name}: A global Q{sec.question_start}-Q{sec.question_end} ({count} soru)")

# A cevap anahtarı
a_key = AnswerKey.objects.get(exam=exam, booklet='A')
a_items = list(a_key.items.order_by('question_number'))

# Her bölüm için, bölüm-içi B numaralarını incele
print("\n\nBÖLÜM-İÇİ B NUMARALARI:")
for sec in sections:
    sec_items = [it for it in a_items if it.section_id == sec.id]
    sec_items.sort(key=lambda x: x.question_number)
    
    b_nums = [it.b_question_number for it in sec_items if it.b_question_number is not None]
    if b_nums:
        print(f"\n  {sec.name} (A: {sec.question_start}-{sec.question_end}):")
        print(f"    B numaraları: min={min(b_nums)}, max={max(b_nums)}")
        print(f"    Tüm B numaraları: {sorted(b_nums)}")
        
        # B numarası sıralı mı (bölüm-içi 1..N)?
        expected = sorted(range(1, len(sec_items) + 1))
        actual = sorted(b_nums)
        if actual == expected:
            print(f"    ✅ Bölüm-içi 1..{len(sec_items)} tam eşleme")
        else:
            print(f"    ❌ Bölüm-içi eşleme eksik veya hatalı")
            print(f"    Beklenen: {expected}")
            print(f"    Gerçek:   {actual}")

# B kitapçığını global pozisyonla oluşturma mantığı:
# B öğrencisinin DAT dosyasında: pozisyon 1..120 ardışık cevap var
# Bölüm sırası AYNI: Türkçe(40) + Sosyal(20) + Mat(40) + Fen(20) = 120
# Ama her bölüm İÇİNDE sıralama farklı.
# 
# B kitapçığı Türkçe bölümü: B'nin 1.sorusu Türkçe bölümünde → DAT pozisyon 1
# B kitapçığı Türkçe bölümü: B'nin 2.sorusu Türkçe bölümünde → DAT pozisyon 2
# ...
# B kitapçığı Türkçe bölümü: B'nin 40.sorusu Türkçe bölümünde → DAT pozisyon 40
# B kitapçığı Sosyal bölümü: B'nin 1.sorusu Sosyal bölümünde → DAT pozisyon 41
# ...

print("\n\nGLOBAL B POZİSYON → A SORU EŞLEME:")
b_global_to_a = {}
for sec in sections:
    sec_items = [it for it in a_items if it.section_id == sec.id]
    sec_items.sort(key=lambda x: x.question_number)
    
    for item in sec_items:
        if item.b_question_number is not None:
            # B'nin bölüm-içi numarası → global B pozisyonu
            b_global = sec.question_start + item.b_question_number - 1
            b_global_to_a[b_global] = item.question_number
            
print(f"Toplam eşleme: {len(b_global_to_a)}")
for b_pos in sorted(b_global_to_a.keys()):
    a_q = b_global_to_a[b_pos]
    # A sorusunun bilgilerini bul
    a_item = next(it for it in a_items if it.question_number == a_q)
    print(f"  B global pozisyon {b_pos:>3} → A soru {a_q:>3} ({a_item.section.name}, cevap={a_item.correct_answer})")
