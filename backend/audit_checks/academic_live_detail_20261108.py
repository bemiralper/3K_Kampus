"""Follow-up anonymous aggregation; same READ ONLY guarantees as primary audit."""
import json
from collections import Counter,defaultdict
from django.db import connection,transaction
from django.db.models import Sum
from django.utils import timezone
from apps.academic.domain.lesson_session import LessonSession
from apps.ozel_ders.domain.models import BirebirDersOturumu,BirebirHakedis
from apps.ozel_ders.services.ucret_engine import evaluate,_get_active_contract
from apps.personel.domain.sozlesme_models import AylikHakedis,AvansKaydi
from apps.academic.domain.class_period_attendance import ClassPeriodAttendanceRecord,ClassPeriodAttendanceSession

with transaction.atomic():
    with connection.cursor() as cursor:
        cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        cursor.execute("SET LOCAL statement_timeout = '45s'")
        cursor.execute('SHOW transaction_read_only')
        assert cursor.fetchone()[0]=='on'
    result=Counter()
    rows=[]
    for s in LessonSession.objects.filter(is_active=True).exclude(status__in=['CANCELLED','POSTPONED','NO_SHOW']).select_related('schedule_version'):
        rows.append(dict(day=s.session_date,start=s.start_time,end=s.end_time,teacher=s.substitute_ogretmen_id if s.teacher_attendance=='SUBSTITUTE' else s.ogretmen_id,
            classroom=s.sinif_id,version=s.schedule_version_id,version_active=s.schedule_version.is_active if s.schedule_version_id else None,kind='class',status=s.status))
    for s in BirebirDersOturumu.objects.filter(is_active=True).exclude(durum='IPTAL'):
        rows.append(dict(day=s.session_date,start=s.start_time,end=s.end_time,teacher=s.ogretmen_id,classroom=None,version=None,version_active=None,kind='individual',status=s.durum))
    for resource in ['teacher','classroom']:
        groups=defaultdict(list)
        for r in rows:
            if r[resource] is not None:
                groups[(r['day'],r[resource])].append(r)
        for group in groups.values():
            group.sort(key=lambda r:r['start'])
            for i,a in enumerate(group):
                for b in group[i+1:]:
                    if b['start']>=a['end']:break
                    if a['start']>=b['end']:continue
                    prefix=resource+'_overlap_'
                    result[prefix+('today_or_future' if a['day']>=timezone.localdate() else 'past')]+=1
                    result[prefix+('same_kind' if a['kind']==b['kind'] else 'cross_class_individual')]+=1
                    if a['kind']==b['kind']=='class':
                        result[prefix+('same_version' if a['version']==b['version'] else 'different_version')]+=1
                        if a['version_active'] and b['version_active']:result[prefix+'both_versions_active']+=1
                    if a['status'] in ['COMPLETED','ISLENDI','ONLINE'] and b['status'] in ['COMPLETED','ISLENDI','ONLINE']:
                        result[prefix+'both_completed']+=1
    for s in BirebirDersOturumu.objects.filter(is_active=True,durum__in=['ISLENDI','ONLINE']).select_related('ders'):
        calc=evaluate(s)
        h=BirebirHakedis.objects.filter(oturum=s).first()
        if calc.payable and h is None:
            result['missing_entitlement_completed_payable']+=1
            contract=_get_active_contract(s.ogretmen_id,s.session_date,s.kurum_id,sube_id=s.sube_id)
            if contract and contract.created_at.date()>s.session_date:result['missing_entitlement_contract_created_later']+=1
        if h and h.durum=='TASLAK' and (not calc.payable or h.tutar!=calc.tutar):
            result['draft_mismatch_payable' if calc.payable else 'draft_mismatch_not_payable']+=1
            if calc.birim_ucret!=h.birim_ucret:result['draft_mismatch_rate']+=1
            if calc.sure_dk!=h.sure_dk:result['draft_mismatch_duration']+=1
    for p in AylikHakedis.objects.all():
        total=AvansKaydi.objects.filter(sozlesme_id=p.sozlesme_id,mahsup_yil=p.yil,mahsup_ay=p.ay).aggregate(v=Sum('tutar'))['v'] or 0
        if total!=p.avans:
            result['advance_mismatch_payroll_'+p.durum]+=1
            result['advance_mismatch_has_records' if total else 'advance_mismatch_manual_only']+=1
    result['class_completed_count']=LessonSession.objects.filter(is_active=True,status='COMPLETED').count()
    result['individual_completed_count']=BirebirDersOturumu.objects.filter(is_active=True,durum__in=['ISLENDI','ONLINE']).count()
    result['class_period_attendance_session_count']=ClassPeriodAttendanceSession.objects.count()
    result['class_period_attendance_record_count']=ClassPeriodAttendanceRecord.objects.count()
    print('ACADEMIC_DETAIL_JSON='+json.dumps(dict(result),sort_keys=True))
