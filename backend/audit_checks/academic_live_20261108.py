"""Run via production manage.py shell stdin. Outputs anonymous counts only.

No names, identifiers, dates of individual records, rates or amounts leave DB host.
All application queries execute inside a PostgreSQL READ ONLY transaction.
"""
import json
from collections import Counter, defaultdict
from decimal import Decimal

from django.apps import apps
from django.db import connection, transaction
from django.db.models import F, Q, Sum
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone

from apps.academic.domain.lesson_session import LessonSession
from apps.academic.domain.lesson_attendance import LessonAttendanceRecord
from apps.academic.domain.program_grid_cell import ProgramGridCell
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.ozel_ders.domain.models import BirebirDersOturumu, BirebirHakedis, BirebirOgrenciProgrami
from apps.personel.domain.sozlesme_models import AylikHakedis, PersonelSozlesme, AvansKaydi

def overlaps(rows, resource):
    groups = defaultdict(list)
    count = 0
    for row in rows:
        key = resource(row)
        if key is not None:
            groups[(row['day'], key)].append(row)
    for group in groups.values():
        group.sort(key=lambda r: r['start'])
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if b['start'] >= a['end']:
                    break
                if a['start'] < b['end']:
                    count += 1
    return count

with transaction.atomic():
    with connection.cursor() as cur:
        cur.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        cur.execute("SET LOCAL statement_timeout = '45s'")
        cur.execute('SHOW transaction_read_only')
        assert cur.fetchone()[0] == 'on'
    out = {'transaction_read_only': True, 'checked_at': timezone.now().isoformat(), 'counts': {}, 'checks': {}}
    c = out['checks']
    models = [LessonSession, LessonAttendanceRecord, ProgramGridCell, StudentClassPlacement,
              BirebirDersOturumu, BirebirHakedis, BirebirOgrenciProgrami,
              AylikHakedis, PersonelSozlesme, AvansKaydi]
    out['counts'] = {m.__name__: m.objects.count() for m in models}
    executor = MigrationExecutor(connection)
    c['pending_migrations'] = len(executor.migration_plan(executor.loader.graph.leaf_nodes()))
    ls = LessonSession.objects.filter(is_active=True)
    bi = BirebirDersOturumu.objects.filter(is_active=True)
    c['class_invalid_time_window'] = ls.filter(start_time__gte=F('end_time')).count()
    c['individual_invalid_time_window'] = bi.filter(start_time__gte=F('end_time')).count()
    c['class_branch_mismatch'] = ls.filter(sinif__isnull=False).exclude(sinif__sube_id=F('term__sube_id')).count()
    c['class_teacher_institution_mismatch'] = ls.exclude(ogretmen__kurum_id=F('term__kurum_id')).count()
    c['individual_teacher_institution_mismatch'] = bi.exclude(ogretmen__kurum_id=F('kurum_id')).count()
    c['individual_student_institution_mismatch'] = bi.exclude(ogrenci__kurum_id=F('kurum_id')).count()
    c['individual_branch_institution_mismatch'] = bi.exclude(sube__kurum_id=F('kurum_id')).count()
    c['individual_program_scope_mismatch'] = bi.filter(program__isnull=False).exclude(program__sube_id=F('sube_id'), program__kurum_id=F('kurum_id'), program__ogrenci_id=F('ogrenci_id')).count()
    c['completed_class_absent_teacher_payable'] = ls.filter(status='COMPLETED', teacher_attendance='ABSENT', payable=True).count()
    c['completed_class_pending_teacher'] = ls.filter(status='COMPLETED', teacher_attendance='PENDING').count()
    c['future_completed_class'] = ls.filter(status='COMPLETED', session_date__gt=timezone.localdate()).count()
    c['future_completed_individual'] = bi.filter(durum__in=['ISLENDI', 'ONLINE'], session_date__gt=timezone.localdate()).count()
    c['substitute_without_teacher'] = ls.filter(teacher_attendance='SUBSTITUTE', substitute_ogretmen__isnull=True).count()
    c['attendance_wrong_institution'] = LessonAttendanceRecord.objects.exclude(student__kurum_id=F('session__term__kurum_id')).count()
    c['placement_scope_mismatch'] = StudentClassPlacement.objects.filter(is_active=True).exclude(classroom__sube_id=F('term__sube_id'), student__kurum_id=F('term__kurum_id')).count()
    c['contract_invalid_period'] = PersonelSozlesme.objects.filter(baslangic_tarihi__gt=F('bitis_tarihi')).count()
    c['active_contract_outside_period_today'] = PersonelSozlesme.objects.filter(durum='AKTIF').filter(Q(baslangic_tarihi__gt=timezone.localdate()) | Q(bitis_tarihi__lt=timezone.localdate())).count()
    c['contract_wrong_institution'] = PersonelSozlesme.objects.exclude(personel__kurum_id=F('kurum_id')).count()
    hs = BirebirHakedis.objects.exclude(durum='IPTAL')
    c['entitlement_teacher_mismatch'] = hs.exclude(ogretmen_id=F('oturum__ogretmen_id')).count()
    c['entitlement_date_mismatch'] = hs.exclude(tarih=F('oturum__session_date')).count()
    c['entitlement_noncompleted_session'] = hs.exclude(oturum__durum__in=['ISLENDI', 'ONLINE']).count()
    c['entitlement_nonpositive_amount'] = hs.filter(tutar__lte=0).count()
    processed = hs.filter(durum='BORDOYA_ISLENDI')
    c['processed_without_payroll'] = processed.filter(aylik_hakedis__isnull=True).count()
    c['processed_teacher_mismatch'] = processed.filter(aylik_hakedis__isnull=False).exclude(ogretmen_id=F('aylik_hakedis__sozlesme__personel_id')).count()
    c['processed_branch_mismatch'] = processed.filter(aylik_hakedis__sozlesme__sube__isnull=False).exclude(oturum__sube_id=F('aylik_hakedis__sozlesme__sube_id')).count()
    c['processed_period_mismatch'] = sum(h.tarih.year != h.aylik_hakedis.yil or h.tarih.month != h.aylik_hakedis.ay for h in processed.filter(aylik_hakedis__isnull=False).select_related('aylik_hakedis'))
    c['payroll_arithmetic_mismatch'] = 0
    c['payroll_individual_total_mismatch'] = 0
    c['payroll_advance_total_mismatch_candidates'] = 0
    c['paid_without_payment_date'] = AylikHakedis.objects.filter(durum='ODENDI', odeme_tarihi__isnull=True).count()
    for p in AylikHakedis.objects.all():
        lesson = p.ders_basi_ucret * p.toplam_ders_saati
        gross = p.sabit_maas + lesson + p.prim + p.fazla_mesai + p.ek_odeme + p.ozel_ders_hakedis_toplam
        if (p.ders_ucreti_toplam, p.brut_toplam, p.net_hakedis) != (lesson.quantize(Decimal('.01')), gross.quantize(Decimal('.01')), (gross-p.avans-p.kesintiler).quantize(Decimal('.01'))):
            c['payroll_arithmetic_mismatch'] += 1
        total = processed.filter(aylik_hakedis=p).aggregate(v=Sum('tutar'))['v'] or Decimal(0)
        c['payroll_individual_total_mismatch'] += total != p.ozel_ders_hakedis_toplam
        advances = AvansKaydi.objects.filter(sozlesme_id=p.sozlesme_id, mahsup_yil=p.yil, mahsup_ay=p.ay).aggregate(v=Sum('tutar'))['v'] or Decimal(0)
        c['payroll_advance_total_mismatch_candidates'] += advances != p.avans
    rows = []
    for s in ls.exclude(status__in=['CANCELLED','POSTPONED','NO_SHOW']).values('id','session_date','start_time','end_time','ogretmen_id','substitute_ogretmen_id','teacher_attendance','sinif_id'):
        rows.append(dict(kind='class', day=s['session_date'], start=s['start_time'], end=s['end_time'], teacher=s['substitute_ogretmen_id'] if s['teacher_attendance']=='SUBSTITUTE' else s['ogretmen_id'], classroom=s['sinif_id'], student=None, room=None))
    for s in bi.exclude(durum='IPTAL').values('session_date','start_time','end_time','ogretmen_id','ogrenci_id','oda_id'):
        rows.append(dict(kind='individual', day=s['session_date'], start=s['start_time'], end=s['end_time'], teacher=s['ogretmen_id'], student=s['ogrenci_id'], room=s['oda_id'], classroom=None))
    c['teacher_overlap_pairs'] = overlaps(rows, lambda r:r['teacher'])
    c['individual_student_overlap_pairs'] = overlaps(rows, lambda r:r['student'])
    c['individual_room_overlap_pairs'] = overlaps(rows, lambda r:r['room'])
    c['class_overlap_pairs'] = overlaps(rows, lambda r:r['classroom'])
    # Pure evaluation only; historical contract edits can legitimately change estimates.
    from apps.ozel_ders.services.ucret_engine import evaluate
    c['completed_individual_payable_missing_entitlement'] = 0
    c['draft_entitlement_current_formula_mismatch_candidates'] = 0
    for s in bi.filter(durum__in=['ISLENDI','ONLINE']).select_related('ders'):
        result = evaluate(s)
        h = BirebirHakedis.objects.filter(oturum=s).first()
        if result.payable and h is None:
            c['completed_individual_payable_missing_entitlement'] += 1
        if h and h.durum == 'TASLAK' and (not result.payable or h.tutar != result.tutar):
            c['draft_entitlement_current_formula_mismatch_candidates'] += 1
    print('ACADEMIC_AUDIT_JSON=' + json.dumps(out, ensure_ascii=False, sort_keys=True))
