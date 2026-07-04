#!/usr/bin/env python
"""B kitapçığı skorlamasını test et."""
import os, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from apps.coaching.olcme_degerlendirme.models import (
    Exam, ExamSection, AnswerKey, AnswerKeyItem,
)

exam = Exam.objects.get(pk=2)
sections = list(exam.sections.filter(is_sub_section=False).order_by('order'))

# Bölüm offset'leri
section_offset = {sec.id: sec.question_start for sec in sections}

# A cevap anahtarı
a_key = AnswerKey.objects.get(exam=exam, booklet='A')
correct_map_a = {}
b_to_a_map = {}

for item in a_key.items.select_related('section').all():
    correct_map_a[item.question_number] = {
        'answer': item.correct_answer,
        'is_cancelled': item.is_cancelled,
        'section_id': item.section_id,
    }
    if item.b_question_number is not None and item.section_id in section_offset:
        b_global = section_offset[item.section_id] + item.b_question_number - 1
        b_to_a_map[b_global] = item.question_number

print(f"b_to_a_map: {len(b_to_a_map)} eşleme")

# DAT dosyasını oku
dat_path = '/Users/taner/Documents/3K Kampüs LMS/AYT Deneme Sınavları/3k_kampus_ulti_tyt_tg.dat'
with open(dat_path, 'r', encoding='windows-1254') as f:
    lines = f.read().strip().splitlines()

total_questions = sum(sec.question_end - sec.question_start + 1 for sec in sections)
wrong_penalty = exam.wrong_answer_count

# Kitapçık pozisyonu: DAT pozisyon 54 (0-indexed), 'A' veya 'B'
# Cevaplar: DAT pozisyon 55+ (0-indexed)
# Bu pozisyonları DAT'tan biliyoruz (önceki analiz)

print(f"\nToplam soru: {total_questions}, Wrong penalty: {wrong_penalty}")
print(f"Toplam satır: {len(lines)}\n")

# İlk birkaç A ve B öğrencisini kontrol et
a_students = []
b_students = []

for line in lines:
    if len(line) < 60:
        continue
    
    # Pozisyonları kullan (mapping'e göre değişir — şimdilik sabit)
    # Öğrenci no: pos 11-15
    sid = line[11:16].strip()
    # Ad soyad: pos 16-35
    name = line[16:36].strip()
    # Kitapçık: pos 54
    booklet = line[54:55].strip()
    # Cevaplar: pos 55+
    answers = line[55:55+total_questions]
    
    if booklet == '1':
        booklet = 'A'
    elif booklet == '2':
        booklet = 'B'
    else:
        booklet = 'A'  # Varsayılan
    
    if booklet == 'A' and len(a_students) < 2:
        a_students.append((sid, name, booklet, answers))
    elif booklet == 'B' and len(b_students) < 2:
        b_students.append((sid, name, booklet, answers))

def score_student(sid, name, booklet, answers):
    print(f"\n{'='*60}")
    print(f"Öğrenci: {name} ({sid}), Kitapçık: {booklet}")
    
    comparison = {}
    for q_idx, ch in enumerate(answers):
        q_no = q_idx + 1
        if q_no > total_questions:
            break
        
        given = ch.upper().strip()
        if given not in ('A', 'B', 'C', 'D', 'E'):
            given = ''
        
        if booklet == 'B' and b_to_a_map:
            a_q_no = b_to_a_map.get(q_no)
            correct_info = correct_map_a.get(a_q_no) if a_q_no else None
        else:
            correct_info = correct_map_a.get(q_no)
        
        if correct_info:
            if correct_info['is_cancelled']:
                result = 'cancelled'
            elif not given:
                result = 'empty'
            elif given == correct_info['answer']:
                result = 'correct'
            else:
                result = 'wrong'
            
            comparison[q_no] = {
                'given': given,
                'correct': correct_info['answer'],
                'result': result,
                'section_id': correct_info['section_id'],
            }
    
    # Bölüm bazında skor
    for sec in sections:
        correct = wrong = empty = 0
        for q_no in range(sec.question_start, sec.question_end + 1):
            comp = comparison.get(q_no, {})
            r = comp.get('result', 'empty')
            if r in ('correct', 'cancelled'):
                correct += 1
            elif r == 'wrong':
                wrong += 1
            else:
                empty += 1
        
        net = correct - (wrong / wrong_penalty) if wrong_penalty > 0 else correct
        print(f"  {sec.name}: D={correct} Y={wrong} B={empty} Net={net:.2f}")
    
    # Toplam
    t_c = sum(1 for c in comparison.values() if c['result'] in ('correct', 'cancelled'))
    t_w = sum(1 for c in comparison.values() if c['result'] == 'wrong')
    t_e = sum(1 for c in comparison.values() if c['result'] == 'empty')
    t_net = t_c - (t_w / wrong_penalty) if wrong_penalty > 0 else t_c
    print(f"  TOPLAM: D={t_c} Y={t_w} B={t_e} Net={t_net:.2f}")

# A öğrencileri
for s in a_students:
    score_student(*s)

# B öğrencileri
for s in b_students:
    score_student(*s)
