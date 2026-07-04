#!/usr/bin/env python
"""B kitapcigi skorlamasini gercek DAT verisiyle test et."""
import os, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from apps.coaching.olcme_degerlendirme.models import (
    Exam, AnswerKey, AnswerKeyItem,
)

exam = Exam.objects.get(pk=2)
sections = list(exam.sections.filter(is_sub_section=False).order_by('order'))

# Bolum offsetleri
section_offset = {sec.id: sec.question_start for sec in sections}

# A cevap anahtari
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

total_questions = sum(sec.question_end - sec.question_start + 1 for sec in sections)
wrong_penalty = exam.wrong_answer_count
print("b_to_a_map: %d esleme" % len(b_to_a_map))
print("Toplam soru: %d, Wrong penalty: %d" % (total_questions, wrong_penalty))

# DAT dosyasi
dat_path = '/Users/taner/Documents/3K Kampus LMS/AYT Deneme Sinavlari/3k_kampus_ulti_tyt_tg.dat'.replace(
    'Kampus', 'Kampüs').replace('Sinavlari', 'Sınavları')
dat_path = '/Users/taner/Documents/3K Kampüs LMS/AYT Deneme Sınavları/3k_kampus_ulti_tyt_tg.dat'
with open(dat_path, 'r', encoding='windows-1254') as f:
    lines = f.read().strip().splitlines()

def score_student(name, booklet, answers_raw):
    comparison = {}
    for q_idx in range(min(len(answers_raw), total_questions)):
        q_no = q_idx + 1
        ch = answers_raw[q_idx].upper().strip()
        given = ch if ch in ('A', 'B', 'C', 'D', 'E') else ''
        
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
            comparison[q_no] = result
    
    sec_results = {}
    for sec in sections:
        c = w = e = 0
        for q_no in range(sec.question_start, sec.question_end + 1):
            r = comparison.get(q_no, 'empty')
            if r in ('correct', 'cancelled'):
                c += 1
            elif r == 'wrong':
                w += 1
            else:
                e += 1
        net = c - (w / wrong_penalty) if wrong_penalty > 0 else c
        sec_results[sec.name] = (c, w, e, net)
    
    tc = sum(v[0] for v in sec_results.values())
    tw = sum(v[1] for v in sec_results.values())
    te = sum(v[2] for v in sec_results.values())
    tnet = tc - (tw / wrong_penalty) if wrong_penalty > 0 else tc
    return sec_results, (tc, tw, te, tnet)


# Ilk 5 A ve 5 B ogrencisi
a_count = b_count = 0
print("\n===== A KITAPCIGI OGRENCILERI =====")
for line in lines:
    if len(line) < 60:
        continue
    sid = line[11:16].strip()
    name = line[16:36].strip()
    booklet = line[55:56]
    answers = line[56:56+total_questions]
    
    if booklet == 'A' and a_count < 3:
        sec_res, totals = score_student(name, 'A', answers)
        print("\n%s (%s) - Kitapcik A" % (name, sid))
        for sn, (c, w, e, n) in sec_res.items():
            print("  %s: D=%d Y=%d B=%d Net=%.2f" % (sn, c, w, e, n))
        print("  TOPLAM: D=%d Y=%d B=%d Net=%.2f" % totals)
        a_count += 1

print("\n===== B KITAPCIGI OGRENCILERI =====")
for line in lines:
    if len(line) < 60:
        continue
    sid = line[11:16].strip()
    name = line[16:36].strip()
    booklet = line[55:56]
    answers = line[56:56+total_questions]
    
    if booklet == 'B' and b_count < 3:
        sec_res, totals = score_student(name, 'B', answers)
        print("\n%s (%s) - Kitapcik B" % (name, sid))
        for sn, (c, w, e, n) in sec_res.items():
            print("  %s: D=%d Y=%d B=%d Net=%.2f" % (sn, c, w, e, n))
        print("  TOPLAM: D=%d Y=%d B=%d Net=%.2f" % totals)
        b_count += 1

# Ayrica: B ogrencisini A gibi skorlarsak ne olur (eski hata)
print("\n===== KARSILASTIRMA: B OGRENCI YANLIS SKORLAMA (ESKİ HALİ) =====")
b_count = 0
for line in lines:
    if len(line) < 60:
        continue
    booklet = line[55:56]
    if booklet == 'B' and b_count < 2:
        sid = line[11:16].strip()
        name = line[16:36].strip()
        answers = line[56:56+total_questions]
        
        # Yanlis: A gibi skorla
        sec_wrong, totals_wrong = score_student(name, 'A', answers)
        # Dogru: B gibi skorla
        sec_right, totals_right = score_student(name, 'B', answers)
        
        print("\n%s (%s)" % (name, sid))
        print("  YANLIS (A gibi): D=%d Y=%d B=%d Net=%.2f" % totals_wrong)
        print("  DOGRU  (B gibi): D=%d Y=%d B=%d Net=%.2f" % totals_right)
        b_count += 1
