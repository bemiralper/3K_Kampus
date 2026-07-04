"""
Integer-Only Fiyatlandırma Migration

fiyat (DecimalField, KDV hariç) → brut_fiyat (IntegerField, KDV dahil)
+ net_fiyat, kdv_tutari alanları eklenir
+ kdv_orani IntegerField'a çevrilir

Data Migration:
- Eski fiyat (KDV hariç Decimal) → brut_fiyat (KDV dahil, 100 TL'nin katına yuvarlanmış int)
- Formül: brut = round(fiyat * (1 + kdv_orani/100) / 100) * 100
- net_fiyat ve kdv_tutari model.save() ile hesaplanacak
"""

from django.db import migrations, models


def fiyat_to_brut_fiyat(apps, schema_editor):
    """Eski fiyat (KDV hariç Decimal) → brut_fiyat (KDV dahil int, 100'ün katı)"""
    model_names = ['GrupDersi', 'OzelDers', 'Deneme', 'EkHizmet', 'DavranisPaketi']
    
    for model_name in model_names:
        try:
            Model = apps.get_model('egitim_paketleri', model_name)
        except LookupError:
            continue
        
        for obj in Model.objects.all():
            eski_fiyat = float(obj.fiyat or 0)
            kdv_orani = float(obj.kdv_orani or 10)
            
            # KDV hariç → KDV dahil, 100'ün katına yuvarla
            brut = round(eski_fiyat * (1 + kdv_orani / 100) / 100) * 100
            brut = max(brut, 0)
            
            # hesapla_kdv formülü: net = round(brut / (1 + kdv_orani/100) / 100) * 100
            net = round(brut / (1 + kdv_orani / 100) / 100) * 100
            kdv = brut - net
            
            obj.brut_fiyat = int(brut)
            obj.net_fiyat = int(net)
            obj.kdv_tutari = int(kdv)
            obj.kdv_orani = int(kdv_orani)
            obj.save(update_fields=['brut_fiyat', 'net_fiyat', 'kdv_tutari', 'kdv_orani'])


def brut_fiyat_to_fiyat(apps, schema_editor):
    """Geri alma: brut_fiyat → fiyat (net fiyat olarak)"""
    from decimal import Decimal
    model_names = ['GrupDersi', 'OzelDers', 'Deneme', 'EkHizmet', 'DavranisPaketi']
    
    for model_name in model_names:
        try:
            Model = apps.get_model('egitim_paketleri', model_name)
        except LookupError:
            continue
        
        for obj in Model.objects.all():
            # brut_fiyat (KDV dahil) → net fiyat (KDV hariç)
            brut = float(obj.brut_fiyat or 0)
            kdv_orani = float(obj.kdv_orani or 10)
            net = brut / (1 + kdv_orani / 100)
            obj.fiyat = Decimal(str(round(net, 2)))
            obj.save(update_fields=['fiyat'])


class Migration(migrations.Migration):

    dependencies = [
        ('egitim_paketleri', '0010_deneme_dahil_ek_hizmetler'),
    ]

    operations = [
        # 1) Yeni alanları ekle (default 0 ile — henüz veri yok)
        migrations.AddField(
            model_name='grupdersi',
            name='brut_fiyat',
            field=models.IntegerField(default=0, verbose_name='Brüt Fiyat (KDV Dahil)'),
        ),
        migrations.AddField(
            model_name='grupdersi',
            name='net_fiyat',
            field=models.IntegerField(default=0, verbose_name='Net Fiyat (KDV Hariç)'),
        ),
        migrations.AddField(
            model_name='grupdersi',
            name='kdv_tutari',
            field=models.IntegerField(default=0, verbose_name='KDV Tutarı'),
        ),
        
        migrations.AddField(
            model_name='ozelders',
            name='brut_fiyat',
            field=models.IntegerField(default=0, verbose_name='Brüt Fiyat (KDV Dahil)'),
        ),
        migrations.AddField(
            model_name='ozelders',
            name='net_fiyat',
            field=models.IntegerField(default=0, verbose_name='Net Fiyat (KDV Hariç)'),
        ),
        migrations.AddField(
            model_name='ozelders',
            name='kdv_tutari',
            field=models.IntegerField(default=0, verbose_name='KDV Tutarı'),
        ),
        
        migrations.AddField(
            model_name='deneme',
            name='brut_fiyat',
            field=models.IntegerField(default=0, verbose_name='Brüt Fiyat (KDV Dahil)'),
        ),
        migrations.AddField(
            model_name='deneme',
            name='net_fiyat',
            field=models.IntegerField(default=0, verbose_name='Net Fiyat (KDV Hariç)'),
        ),
        migrations.AddField(
            model_name='deneme',
            name='kdv_tutari',
            field=models.IntegerField(default=0, verbose_name='KDV Tutarı'),
        ),
        
        migrations.AddField(
            model_name='ekhizmet',
            name='brut_fiyat',
            field=models.IntegerField(default=0, verbose_name='Brüt Fiyat (KDV Dahil)'),
        ),
        migrations.AddField(
            model_name='ekhizmet',
            name='net_fiyat',
            field=models.IntegerField(default=0, verbose_name='Net Fiyat (KDV Hariç)'),
        ),
        migrations.AddField(
            model_name='ekhizmet',
            name='kdv_tutari',
            field=models.IntegerField(default=0, verbose_name='KDV Tutarı'),
        ),
        
        migrations.AddField(
            model_name='davranispaketi',
            name='brut_fiyat',
            field=models.IntegerField(default=0, verbose_name='Brüt Fiyat (KDV Dahil)'),
        ),
        migrations.AddField(
            model_name='davranispaketi',
            name='net_fiyat',
            field=models.IntegerField(default=0, verbose_name='Net Fiyat (KDV Hariç)'),
        ),
        migrations.AddField(
            model_name='davranispaketi',
            name='kdv_tutari',
            field=models.IntegerField(default=0, verbose_name='KDV Tutarı'),
        ),
        
        # 2) Data migration — eski fiyat → yeni brut_fiyat
        migrations.RunPython(fiyat_to_brut_fiyat, brut_fiyat_to_fiyat),
        
        # 3) Eski fiyat alanını kaldır
        migrations.RemoveField(model_name='grupdersi', name='fiyat'),
        migrations.RemoveField(model_name='ozelders', name='fiyat'),
        migrations.RemoveField(model_name='deneme', name='fiyat'),
        migrations.RemoveField(model_name='ekhizmet', name='fiyat'),
        migrations.RemoveField(model_name='davranispaketi', name='fiyat'),
        
        # 4) kdv_orani DecimalField → IntegerField
        migrations.AlterField(
            model_name='grupdersi',
            name='kdv_orani',
            field=models.IntegerField(default=10, verbose_name='KDV Oranı (%)'),
        ),
        migrations.AlterField(
            model_name='ozelders',
            name='kdv_orani',
            field=models.IntegerField(default=10, verbose_name='KDV Oranı (%)'),
        ),
        migrations.AlterField(
            model_name='deneme',
            name='kdv_orani',
            field=models.IntegerField(default=10, verbose_name='KDV Oranı (%)'),
        ),
        migrations.AlterField(
            model_name='ekhizmet',
            name='kdv_orani',
            field=models.IntegerField(default=10, verbose_name='KDV Oranı (%)'),
        ),
        migrations.AlterField(
            model_name='davranispaketi',
            name='kdv_orani',
            field=models.IntegerField(default=10, verbose_name='KDV Oranı (%)'),
        ),
    ]
