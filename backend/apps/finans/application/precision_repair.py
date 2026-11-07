"""Belgeli geçmiş kuruş onarımı. Normal işlem akışlarından çağrılmaz.

Ödeme tutarı kaynak kabul edilir; yalnızca eski tam TL dönüşümüyle açıklanan
farklar kabul edilir. Değişen her alanın öncesi/sonrası değişmez finans loguna
yazılır. Kasa hareketi düzenlememe kuralının kontrollü veri onarımı istisnasıdır.
"""
import hashlib
import json
import uuid
from collections import defaultdict
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_EVEN

from django.db import connection, transaction

from apps.finans.models import BakiyeHareketi, DonemBakiye, GiderOdeme, MaliHesap
from apps.finans.domain.finans_islem_log import FinansIslemLog


def _text(value):
    return format(Decimal(value), '.2f')


def _change(obj, values):
    fields = {name: {'before': _text(getattr(obj, name)), 'after': _text(value)}
              for name, value in values.items() if Decimal(getattr(obj, name)) != value}
    return {'id': obj.pk, 'fields': fields} if fields else None


def build_precision_repair_plan():
    replacements = {}
    payments = []
    blocked = []
    for pay in GiderOdeme.objects.filter(durum='tamamlandi', bakiyeden_mahsup=False).select_related('gider_kaydi'):
        if not pay.bakiye_hareketi_id:
            continue  # Eksik veya yanlış bağlı kayıt tahmin edilerek onarılmaz.
        h = BakiyeHareketi.objects.filter(pk=pay.bakiye_hareketi_id).first()
        if h is None or Decimal(h.tutar) == pay.tutar:
            continue
        invoice = pay.gider_kaydi
        old = Decimal(h.tutar)
        eligible = (
            pay.tutar > 0 and abs(pay.tutar - old) < 1 and old == old.to_integral_value()
            and old in (pay.tutar.to_integral_value(rounding=ROUND_DOWN),
                        pay.tutar.to_integral_value(rounding=ROUND_HALF_EVEN))
            and h.yon == 'cikis' and h.kaynak == 'gider'
            and h.kaynak_id == pay.pk and h.kaynak_tip in ('', 'GiderOdeme')
            and h.mali_hesap_id == pay.mali_hesap_id
            and (h.kurum_id, h.sube_id, h.egitim_yili_id) == (
                invoice.kurum_id, invoice.sube_id, invoice.egitim_yili_id)
            and h.islem_tarihi == pay.odeme_tarihi
        )
        if not eligible or h.pk in replacements:
            blocked.append({'payment_id': pay.pk, 'ledger_id': h.pk})
            continue
        replacements[h.pk] = pay.tutar
        payments.append({'payment_id': pay.pk, 'ledger_id': h.pk, 'account_id': h.mali_hesap_id,
                         'year_id': h.egitim_yili_id, 'before': _text(old), 'after': _text(pay.tutar)})

    account_ids = sorted({p['account_id'] for p in payments})
    touched_periods = {(p['account_id'], p['year_id']) for p in payments}
    ledger_changes = []
    period_changes = []
    account_totals = []
    period_totals = defaultdict(lambda: {'giris': Decimal(0), 'cikis': Decimal(0)})
    for account_id in account_ids:
        total = Decimal(0)
        old_total = Decimal(0)
        rows = list(BakiyeHareketi.objects.filter(mali_hesap_id=account_id).order_by('created_at', 'pk'))
        for h in rows:
            amount = replacements.get(h.pk, Decimal(h.tutar))
            before = total
            if h.kaynak != 'devir':
                sign = 1 if h.yon == 'giris' else -1
                total += sign * amount
                old_total += sign * Decimal(h.tutar)
            if h.kaynak not in ('devir', 'acilis'):
                period_totals[(account_id, h.egitim_yili_id)][h.yon] += amount
            change = _change(h, {'tutar': amount, 'bakiye_oncesi': before, 'bakiye_sonrasi': total})
            if change:
                change['account_id'] = account_id
                ledger_changes.append(change)
        account_totals.append({'account_id': account_id, 'ledger_count': len(rows),
                               'before': _text(old_total), 'after': _text(total)})
    for account_id, year_id in sorted(touched_periods, key=lambda p: (p[0], p[1] or 0)):
        periods = list(DonemBakiye.objects.filter(mali_hesap_id=account_id, egitim_yili_id=year_id))
        if len(periods) != 1 or periods[0].durum != 'acik':
            blocked.append({'account_id': account_id, 'year_id': year_id,
                            'period_ids': [d.pk for d in periods], 'reason': 'period_not_single_open'})
            continue
        d = periods[0]
        totals = period_totals[(account_id, year_id)]
        change = _change(d, {'toplam_gelir': totals['giris'], 'toplam_gider': totals['cikis'],
                             'donem_sonu_bakiye': Decimal(d.donem_basi_bakiye) + totals['giris'] - totals['cikis']})
        if change:
            change['account_id'] = account_id
            period_changes.append(change)
    plan = {'version': 1, 'payments': sorted(payments, key=lambda p: p['payment_id']),
            'accounts': account_totals, 'ledger_changes': ledger_changes,
            'period_changes': period_changes, 'blocked': blocked}
    plan['digest'] = hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
    return plan


def _lock_tables():
    if connection.vendor != 'postgresql':
        raise ValueError('Onarım PostgreSQL gerektirir.')
    with connection.cursor() as cursor:
        cursor.execute("SET LOCAL lock_timeout = '10s'")
        cursor.execute('LOCK TABLE finans_mali_hesap, finans_gider_kaydi, finans_gider_odeme, '
                       'finans_bakiye_hareketi, finans_donem_bakiye IN SHARE ROW EXCLUSIVE MODE')
        cursor.execute("SELECT data_type FROM information_schema.columns "
                       "WHERE table_name = 'finans_bakiye_hareketi' AND column_name = 'tutar'")
        if cursor.fetchone()[0] != 'numeric':
            raise ValueError('Önce kuruş hassasiyeti migration\'ı uygulanmalıdır.')


@transaction.atomic
def apply_precision_repair(expected_digest):
    _lock_tables()
    plan = build_precision_repair_plan()
    if plan['digest'] != expected_digest:
        raise ValueError('Veri önizlemeden sonra değişmiş; yeniden plan çıkarın.')
    if plan['blocked']:
        raise ValueError('Kesin doğrulanamayan kayıt veya kapalı dönem var; hiçbir kayıt değişmedi.')
    if not plan['payments']:
        return {'repair_id': None, 'payment_count': 0}
    repair_id = str(uuid.uuid4())
    for model, key in ((BakiyeHareketi, 'ledger_changes'), (DonemBakiye, 'period_changes')):
        for change in plan[key]:
            model.objects.filter(pk=change['id']).update(**{
                name: Decimal(values['after']) for name, values in change['fields'].items()})
    for account in plan['accounts']:
        obj = MaliHesap.objects.tumu().select_related('sube').get(pk=account['account_id'])
        FinansIslemLog.objects.create(
            kurum_id=obj.sube.kurum_id, sube_id=obj.sube_id, modul='kasa', eylem='guncelle',
            kayit_tip='MaliHesap', kayit_id=obj.pk,
            aciklama='Belgeli geçmiş kuruş onarımı',
            tutar=abs(Decimal(account['after']) - Decimal(account['before'])),
            detay={'repair_id': repair_id, 'digest': plan['digest'], 'account': account,
                   'payments': [p for p in plan['payments'] if p['account_id'] == obj.pk],
                   'ledger_changes': [c for c in plan['ledger_changes'] if c['account_id'] == obj.pk],
                   'period_changes': [c for c in plan['period_changes'] if c['account_id'] == obj.pk]},
        )
    if build_precision_repair_plan()['payments']:
        raise ValueError('Onarım sonrası mutabakat başarısız; bütün değişiklikler geri alındı.')
    return {'repair_id': repair_id, 'payment_count': len(plan['payments']),
            'ledger_count': len(plan['ledger_changes']), 'period_count': len(plan['period_changes'])}


@transaction.atomic
def rollback_precision_repair(repair_id):
    _lock_tables()
    logs = list(FinansIslemLog.objects.filter(detay__repair_id=repair_id, aciklama='Belgeli geçmiş kuruş onarımı'))
    if not logs:
        raise ValueError('Onarım kaydı bulunamadı.')
    for log in logs:
        data = log.detay
        if BakiyeHareketi.objects.filter(mali_hesap_id=log.kayit_id).count() != data['account']['ledger_count']:
            raise ValueError('Onarımdan sonra yeni hareket var; otomatik geri alma engellendi.')
        for model, key in ((BakiyeHareketi, 'ledger_changes'), (DonemBakiye, 'period_changes')):
            for change in data[key]:
                row = model.objects.get(pk=change['id'])
                if any(Decimal(getattr(row, name)) != Decimal(v['after']) for name, v in change['fields'].items()):
                    raise ValueError('Onarımdan sonra kayıt değişmiş; otomatik geri alma engellendi.')
                model.objects.filter(pk=row.pk).update(**{n: Decimal(v['before']) for n, v in change['fields'].items()})
        FinansIslemLog.objects.create(kurum_id=log.kurum_id, sube_id=log.sube_id, modul='kasa',
            eylem='guncelle', kayit_tip='MaliHesap', kayit_id=log.kayit_id,
            aciklama='Geçmiş kuruş onarımı geri alındı', detay={'rollback_of': repair_id, 'log_id': log.pk})
    return {'rollback_of': repair_id, 'account_count': len(logs)}
