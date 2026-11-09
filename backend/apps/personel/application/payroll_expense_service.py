"""Bordro -> gider aktarımı: şube kapsamı ve bordro başına tek belge."""
from datetime import date
from decimal import Decimal
from django.db import transaction
from apps.personel.domain.sozlesme_models import AylikHakedis
from apps.personel.infrastructure.sozlesme_repository import HakedisRepository
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_kategorisi import GiderKategorisi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.payment_method import OdemeYontemi


@transaction.atomic
def export_payroll_expenses(ctx,body):
    year,month=int(body.get('yil',0)),int(body.get('ay',0))
    HakedisRepository.month_bounds(year,month)
    scope={'kurum_id':ctx['kurum_id'],'sube_id':ctx['sube_id']}
    category=GiderKategorisi.objects.filter(pk=body.get('gider_kategorisi_id'),aktif_mi=True,**scope).first()
    if not category:raise ValueError('Gider kategorisi seçili şubeye ait ve aktif olmalıdır.')
    account=None
    if body.get('mali_hesap_id'):
        account=MaliHesap.objects.filter(pk=body['mali_hesap_id'],sube_id=ctx['sube_id'],sube__kurum_id=ctx['kurum_id'],aktif_mi=True).first()
        if not account:raise ValueError('Mali hesap seçili şubeye ait ve aktif olmalıdır.')
    method=None
    if body.get('odeme_yontemi_id'):
        method=OdemeYontemi.objects.filter(pk=body['odeme_yontemi_id'],kurum_id=ctx['kurum_id'],mali_hesap__sube_id=ctx['sube_id'],aktif_mi=True).select_related('mali_hesap').first()
        if not method:raise ValueError('Ödeme yöntemi seçili şubeye ait ve aktif olmalıdır.')
        if account and method.mali_hesap_id!=account.pk:raise ValueError('Ödeme yöntemi ve mali hesap eşleşmiyor.')
        account=method.mali_hesap
    day=date.fromisoformat(body.get('fatura_tarihi') or date.today().isoformat())
    rows=AylikHakedis.objects.select_for_update(of=('self',)).filter(
        sozlesme__kurum_id=ctx['kurum_id'],sozlesme__sube_id=ctx['sube_id'],
        sozlesme__egitim_yili_id=ctx['egitim_yili_id'],yil=year,ay=month,durum='ODENDI',
    ).select_related('sozlesme__personel').order_by('pk')
    found=False
    created=[]
    skipped=0
    for payroll in rows:
        found=True
        if payroll.finans_gider_id:
            skipped+=1
            continue
        if payroll.brut_toplam<=0:continue
        expense=GiderKaydi.objects.create(**scope,egitim_yili_id=ctx['egitim_yili_id'],
            gider_kategorisi=category,mali_hesap=account,odeme_yontemi=method,
            fatura_tarihi=day,vade_tarihi=day,brut_tutar=payroll.brut_toplam,
            net_tutar=payroll.brut_toplam,kdv_orani=0,kdv_tutar=Decimal('0'),durum='onaylandi',
            aciklama=f'{payroll.sozlesme.personel.tam_ad} — {month:02d}/{year} Maaş Gideri')
        payroll.finans_gider=expense
        payroll.save(update_fields=['finans_gider','updated_at'])
        created.append({'id':expense.pk,'personel':payroll.sozlesme.personel.tam_ad,'tutar':float(payroll.brut_toplam)})
    if not found:raise ValueError('Seçili ay ve şubede ödendi durumunda bordro bulunamadı.')
    return {'olusturulan':len(created),'zaten_aktarilan':skipped,'giderler':created,
            'toplam':float(sum((Decimal(str(x['tutar'])) for x in created),Decimal('0')))}
