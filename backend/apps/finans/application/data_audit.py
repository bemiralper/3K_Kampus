"""Salt okunur finans mutabakatı. İşlem/onarım servisleri çağrılmaz."""
from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, Sum

from apps.finans.models import (
    BakiyeHareketi, CariHareket, CariHesap, GelirKaydi, GiderKaydi,
    GelirTahsilat, GiderOdeme, DonemBakiye,
)
from apps.odeme_takip.domain.cek_senet import CekSenetDetay
from apps.odeme_takip.domain.models import Tahsilat


def build_finans_audit(*, kurum_id=None, sube_id=None, sample_limit=100):
    findings = {}
    scanned = defaultdict(int)

    def scope(qs, prefix=''):
        if kurum_id is not None:
            qs = qs.filter(**{prefix + 'kurum_id': kurum_id})
        if sube_id is not None:
            qs = qs.filter(**{prefix + 'sube_id': sube_id})
        return qs

    def add(code, obj, **details):
        entry = findings.setdefault(code, {'count': 0, 'samples': []})
        entry['count'] += 1
        if len(entry['samples']) < sample_limit:
            entry['samples'].append({'model': obj.__class__.__name__, 'id': obj.pk, **details})

    def relations(obj, owner, account=None, method=None, cari=None):
        kid, sid = owner.kurum_id, owner.sube_id
        if sid and owner.sube.kurum_id != kid:
            add('sube_kurum_mismatch', obj, kurum_id=kid, sube_id=sid)
        if account and (account.sube.kurum_id != kid or (sid and account.sube_id != sid)):
            add('mali_hesap_scope_mismatch', obj, mali_hesap_id=account.pk,
                kurum_id=kid, sube_id=sid)
        if method:
            if method.kurum_id != kid:
                add('odeme_yontemi_kurum_mismatch', obj, odeme_yontemi_id=method.pk)
            if method.mali_hesap_id:
                mh = method.mali_hesap
                if mh.sube.kurum_id != kid or (sid and mh.sube_id != sid):
                    add('odeme_yontemi_sube_mismatch', obj, odeme_yontemi_id=method.pk)
                if account and method.tip not in ('cek', 'senet') and mh.pk != account.pk:
                    add('odeme_yontemi_hesap_mismatch', obj, mali_hesap_id=account.pk,
                        yontem_hesap_id=mh.pk)
        if cari and (cari.kurum_id != kid or (sid and cari.sube_id != sid)):
            add('cari_scope_mismatch', obj, cari_hesap_id=cari.pk)

    for model in (BakiyeHareketi, CariHareket):
        related = ['sube', 'mali_hesap__sube'] if model is BakiyeHareketi else ['sube', 'cari_hesap']
        for obj in scope(model.objects.all()).select_related(*related).iterator():
            scanned[model.__name__] += 1
            relations(obj, obj, account=getattr(obj, 'mali_hesap', None),
                      cari=getattr(obj, 'cari_hesap', None))

    for model, parent_field, parent_model, cache_field in (
        (GelirTahsilat, 'gelir_kaydi', GelirKaydi, 'tahsil_edilen'),
        (GiderOdeme, 'gider_kaydi', GiderKaydi, 'odenen_toplam'),
    ):
        rows = scope(model.objects.all(), parent_field + '__')
        totals = dict(rows.filter(durum='tamamlandi').values(parent_field + '_id')
                      .annotate(total=Sum('tutar')).values_list(parent_field + '_id', 'total'))
        ledger = {h.pk: h for h in BakiyeHareketi.objects.filter(
            pk__in=rows.exclude(bakiye_hareketi_id=None).values('bakiye_hareketi_id'))}
        reversal_ids = set(BakiyeHareketi.objects.filter(
            kaynak_tip=model.__name__, kaynak_id__in=rows.values('pk'),
            kaynak='tahsilat_iptal' if model is GelirTahsilat else 'gider_iptal',
        ).values_list('kaynak_id', flat=True))
        for obj in rows.select_related(
                parent_field + '__sube', 'mali_hesap__sube',
                'odeme_yontemi__mali_hesap__sube').iterator():
            scanned[model.__name__] += 1
            parent = getattr(obj, parent_field)
            relations(obj, parent, account=obj.mali_hesap, method=obj.odeme_yontemi)
            mahsup = getattr(obj, 'bakiyeden_mahsup', False)
            if obj.durum == 'iptal' and obj.bakiye_hareketi_id and not mahsup and obj.pk not in reversal_ids:
                add('missing_payment_reversal_review', obj, hareket_id=obj.bakiye_hareketi_id)
            if obj.durum == 'tamamlandi' and not mahsup:
                h = ledger.get(obj.bakiye_hareketi_id)
                if h is None:
                    add('missing_payment_ledger', obj, tutar=str(obj.tutar))
                elif (Decimal(h.tutar) != obj.tutar or h.mali_hesap_id != obj.mali_hesap_id):
                    add('payment_ledger_mismatch', obj, tutar=str(obj.tutar),
                        hareket_tutar=str(h.tutar), hareket_id=h.pk)
        # _base_manager includes soft-deleted invoices: audit must not hide history.
        for parent in scope(parent_model._base_manager.all()).select_related(
                'sube', 'cari_hesap', 'mali_hesap__sube',
                'odeme_yontemi__mali_hesap__sube').iterator():
            scanned[parent_model.__name__] += 1
            relations(parent, parent, account=parent.mali_hesap,
                      method=parent.odeme_yontemi, cari=parent.cari_hesap)
            total = totals.get(parent.pk, Decimal('0'))
            if total != getattr(parent, cache_field):
                add('payment_total_mismatch', parent, kayitli=str(getattr(parent, cache_field)),
                    hesaplanan=str(total))
            if total > parent.net_tutar:
                add('overpaid_invoice', parent, toplam=str(total), net_tutar=str(parent.net_tutar))

    for obj in scope(Tahsilat.objects.all(), 'sozlesme__').select_related(
            'sozlesme__sube', 'mali_hesap__sube', 'odeme_yontemi__mali_hesap__sube').iterator():
        scanned['Tahsilat'] += 1
        relations(obj, obj.sozlesme, account=obj.mali_hesap, method=obj.odeme_yontemi)

    duplicates = scope(BakiyeHareketi.objects.exclude(kaynak_tip='').exclude(kaynak_id=None))
    for group in duplicates.values('mali_hesap_id', 'kaynak_tip', 'kaynak_id', 'kaynak', 'yon').annotate(
            adet=Count('pk'), toplam=Sum('tutar')).filter(adet__gt=1):
        # Multiple rows can be intentional; candidates must be reviewed, never auto-repaired.
        entry = findings.setdefault('duplicate_source_ledger_review', {'count': 0, 'samples': []})
        entry['count'] += 1
        if len(entry['samples']) < sample_limit:
            entry['samples'].append({**group, 'toplam': str(group['toplam'])})

    cari_rows = scope(CariHesap._base_manager.all())
    movement_totals = {
        (row['cari_hesap_id'], row['yon']): row['total']
        for row in CariHareket.objects.filter(cari_hesap_id__in=cari_rows.values('pk'))
        .values('cari_hesap_id', 'yon').annotate(total=Sum('tutar'))
    }
    for cari in scope(CariHesap._base_manager.all()).iterator():
        scanned['CariHesap'] += 1
        # Cari totals are global per account. Aggregate all its movements even
        # when the audit is branch-scoped (legacy null-branch movements exist).
        borc = movement_totals.get((cari.pk, 'borc'), 0)
        alacak = movement_totals.get((cari.pk, 'alacak'), 0)
        if cari.toplam_borc != borc or cari.toplam_alacak != alacak:
            add('cari_totals_mismatch', cari, kayitli_borc=str(cari.toplam_borc),
                hesaplanan_borc=str(borc), kayitli_alacak=str(cari.toplam_alacak),
                hesaplanan_alacak=str(alacak))

    for obj in scope(CekSenetDetay.objects.all()).select_related(
            'sube', 'cari_hesap', 'ciro_edilen_cari', 'tahsilat_mali_hesap__sube',
            'odeme_yontemi__mali_hesap__sube').iterator():
        scanned['CekSenetDetay'] += 1
        relations(obj, obj, account=obj.tahsilat_mali_hesap,
                  method=obj.odeme_yontemi, cari=obj.cari_hesap)
        if obj.ciro_edilen_cari:
            relations(obj, obj, cari=obj.ciro_edilen_cari)

    for donem in scope(DonemBakiye.objects.all()).iterator():
        scanned['DonemBakiye'] += 1
        if donem.durum in ('kapandi', 'devredildi') and donem.devir_tutari != donem.donem_sonu_bakiye:
            add('closed_period_snapshot_mismatch', donem, devir=str(donem.devir_tutari),
                donem_sonu=str(donem.donem_sonu_bakiye))

    return {'read_only': True, 'filters': {'kurum_id': kurum_id, 'sube_id': sube_id},
            'scanned': dict(scanned), 'finding_count': sum(v['count'] for v in findings.values()),
            'sample_limit_per_check': sample_limit, 'findings': findings,
            'notes': ['Bulgular otomatik düzeltilmez; review/gap kodları inceleme adaylarıdır.',
                      'Mükerrer işlem niyeti ve yetkisiz erişim geçmişi bu taramayla kanıtlanamaz.']}
