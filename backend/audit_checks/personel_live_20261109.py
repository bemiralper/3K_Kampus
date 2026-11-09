"""Personnel READ ONLY audit. Only anonymous aggregate counts leave server."""
import json
from collections import Counter
from django.contrib.auth.hashers import check_password
from django.db import connection,transaction
from django.db.models import F,Q,Count
from django.utils import timezone
from apps.personel.domain.models import Personel,PersonelGorevlendirme
from apps.personel.domain.sozlesme_models import PersonelSozlesme,AylikHakedis,AvansKaydi
from apps.roller.models import UserRole

with transaction.atomic():
    with connection.cursor() as cursor:
        cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        cursor.execute("SET LOCAL statement_timeout = '45s'")
        cursor.execute('SHOW transaction_read_only')
        assert cursor.fetchone()[0]=='on'
    p=Personel.objects.all()
    g=PersonelGorevlendirme.objects.all()
    c={}
    c['people']=p.count()
    c['active_people']=p.filter(aktif_mi=True).count()
    c['inactive_people']=p.filter(aktif_mi=False).count()
    c['people_without_central_identity']=p.filter(kisi__isnull=True).count()
    c['people_identity_institution_mismatch']=p.filter(kisi__isnull=False).exclude(kisi__kurum_id=F('kurum_id')).count()
    c['people_branch_institution_mismatch']=p.filter(sube__isnull=False).exclude(sube__kurum_id=F('kurum_id')).count()
    c['blank_name']=p.filter(Q(ad='')|Q(soyad='')).count()
    c['linked_users']=p.filter(user__isnull=False).count()
    c['active_people_inactive_user_candidates']=p.filter(aktif_mi=True,user__is_active=False).count()
    c['inactive_people_active_user']=p.filter(aktif_mi=False,user__is_active=True).count()
    c['linked_user_missing_role']=0
    c['linked_user_role_institution_mismatch']=0
    c['password_equals_identity_number']=0
    c['password_equals_identity_number_without_forced_change']=0
    emails=Counter()
    for person in p.select_related('user'):
        if person.email.strip():emails[(person.kurum_id,person.email.strip().lower())]+=1
        if person.user_id:
            role=UserRole.objects.filter(user_id=person.user_id).first()
            c['linked_user_missing_role']+=role is None
            c['linked_user_role_institution_mismatch']+=bool(role and role.kurum_id!=person.kurum_id)
            if person.tc_kimlik_no and check_password(person.tc_kimlik_no,person.user.password,setter=None):
                c['password_equals_identity_number']+=1
                c['password_equals_identity_number_without_forced_change']+=bool(not role or not role.must_change_password)
    c['shared_email_groups_candidates']=sum(v>1 for v in emails.values())
    c['assignments']=g.count()
    c['assignment_person_institution_mismatch']=g.exclude(personel__kurum_id=F('kurum_id')).count()
    c['assignment_branch_institution_mismatch']=g.exclude(gorev_sube__kurum_id=F('kurum_id')).count()
    c['assignment_subject_institution_mismatch']=g.filter(brans__isnull=False).exclude(brans__kurum_id=F('kurum_id')).count()
    c['assignment_reverse_dates']=g.filter(gorev_baslangic__gt=F('gorev_bitis')).count()
    c['active_assignment_inactive_person']=g.filter(aktif_mi=True,personel__aktif_mi=False).count()
    c['active_assignment_no_role']=g.filter(aktif_mi=True,rol__isnull=True).count()
    c['active_assignment_deleted_role']=g.filter(aktif_mi=True,rol__silindi_mi=True).count()
    c['active_assignment_outside_dates_candidates']=g.filter(aktif_mi=True).filter(Q(gorev_baslangic__gt=timezone.localdate())|Q(gorev_bitis__lt=timezone.localdate())).count()
    c['assignment_duplicate_groups']=g.filter(aktif_mi=True).values('personel_id','egitim_yili_id','gorev_sube_id','rol_id','brans_id').annotate(n=Count('pk')).filter(n__gt=1).count()
    c['contracts']=PersonelSozlesme.objects.count()
    c['active_contract_inactive_person']=PersonelSozlesme.objects.filter(durum='AKTIF',personel__aktif_mi=False).count()
    c['payrolls']=AylikHakedis.objects.count()
    c['invalid_payroll_month']=AylikHakedis.objects.filter(Q(ay__lt=1)|Q(ay__gt=12)).count()
    c['advances']=AvansKaydi.objects.count()
    c['invalid_advance_month']=AvansKaydi.objects.filter(Q(mahsup_ay__lt=1)|Q(mahsup_ay__gt=12)).count()
    c['nonpositive_advance']=AvansKaydi.objects.filter(tutar__lte=0).count()
    print('PERSONEL_AUDIT_JSON='+json.dumps({'read_only':True,'checked_at':timezone.now().isoformat(),'counts':c},sort_keys=True))
