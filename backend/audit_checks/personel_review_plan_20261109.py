"""Production stdin utility: private review file stays on the database host."""
import hashlib,json,os
from django.db import transaction,connection
from django.db.models import F
from apps.personel.domain.models import PersonelGorevlendirme
from apps.personel.domain.sozlesme_models import PersonelSozlesme

with transaction.atomic():
    with connection.cursor() as cursor:
        cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        cursor.execute('SHOW transaction_read_only')
        assert cursor.fetchone()[0]=='on'
    review={
        'reverse_assignment_dates':list(PersonelGorevlendirme.objects.filter(gorev_baslangic__gt=F('gorev_bitis')).values('id','personel_id','gorev_baslangic','gorev_bitis')),
        'active_assignment_inactive_person':list(PersonelGorevlendirme.objects.filter(aktif_mi=True,personel__aktif_mi=False).values('id','personel_id')),
        'active_contract_inactive_person':list(PersonelSozlesme.objects.filter(durum='AKTIF',personel__aktif_mi=False).values('id','personel_id')),
        'active_assignment_without_role':list(PersonelGorevlendirme.objects.filter(aktif_mi=True,rol__isnull=True).values('id','personel_id')),
    }
    payload={'database_writes':False,'automatic_actions':[],
             'reason':'Historical dates and employment intent require confirmation; existing passwords preserved by user choice.',
             'review':review}
    raw=json.dumps(payload,sort_keys=True,indent=2,default=str)
    target='/var/backups/lms/personel-fixes-20261109/data-review-plan.json'
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as output:output.write(raw)
    print(json.dumps({'database_writes':False,'review_counts':{k:len(v) for k,v in review.items()},
        'sha256':hashlib.sha256(raw.encode()).hexdigest()},sort_keys=True))
