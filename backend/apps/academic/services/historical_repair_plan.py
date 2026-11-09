"""Tarihsel tarife kanıtı olmadan hakediş/bordro değiştirmeyen onarım planı."""
import hashlib
import json
from decimal import Decimal

from django.db import connection, transaction
from django.db.models import Sum

from apps.ozel_ders.domain.models import BirebirDersOturumu, BirebirHakedis
from apps.ozel_ders.services.ucret_engine import evaluate
from apps.personel.domain.sozlesme_models import AylikHakedis, AvansKaydi


def build_historical_repair_plan():
    # Çıktı kimlik ve tutar içerir; üretim çıktısı sunucuda tutulmalıdır.
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            cursor.execute("SET LOCAL statement_timeout = '60s'")
            cursor.execute('SHOW transaction_read_only')
            if cursor.fetchone()[0] != 'on':
                raise RuntimeError('Salt okunur işlem başlatılamadı.')
        review=[]
        for session in BirebirDersOturumu.objects.filter(
            is_active=True,durum__in=['ISLENDI','ONLINE'],
        ).select_related('ders').order_by('pk'):
            calculation=evaluate(session)
            h=BirebirHakedis.objects.filter(oturum=session).first()
            if h is None and calculation.payable:
                review.append({'kind':'missing_entitlement','session_id':session.pk,
                    'reason':'historical_tariff_evidence_required',
                    'current_estimate_only':str(calculation.tutar)})
            elif h and h.durum=='TASLAK' and (not calculation.payable or h.tutar!=calculation.tutar):
                review.append({'kind':'draft_tariff_difference','session_id':session.pk,
                    'entitlement_id':h.pk,'preserve_amount':str(h.tutar),
                    'preserve_unit_rate':str(h.birim_ucret),
                    'current_estimate_only':str(calculation.tutar),
                    'reason':'preserve_historical_snapshot_until_verified'})
        for payroll in AylikHakedis.objects.filter(durum='ODENDI').order_by('pk'):
            advances=AvansKaydi.objects.filter(sozlesme_id=payroll.sozlesme_id,
                mahsup_yil=payroll.yil,mahsup_ay=payroll.ay).aggregate(v=Sum('tutar'))['v'] or Decimal('0')
            if advances!=payroll.avans:
                review.append({'kind':'paid_advance_difference','payroll_id':payroll.pk,
                    'preserve_advance':str(payroll.avans),'recorded_advance':str(advances),
                    'reason':'paid_payroll_requires_payment_reconciliation'})
        payload={'policy':'historical_verified_only','database_writes':False,
                 'automatic_actions':[], 'manual_review':review}
        payload['sha256']=hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        return payload
