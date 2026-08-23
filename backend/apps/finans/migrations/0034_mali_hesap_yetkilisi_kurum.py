from django.db import migrations, models
import django.db.models.deletion


def backfill_kurum_and_make_global(apps, schema_editor):
    Yetkili = apps.get_model('finans', 'MaliHesapYetkilisi')
    seen = set()
    for row in Yetkili.objects.select_related('mali_hesap__sube').order_by('id'):
        kurum_id = row.kurum_id
        if not kurum_id and row.mali_hesap_id and getattr(row.mali_hesap, 'sube', None):
            kurum_id = row.mali_hesap.sube.kurum_id
        if not kurum_id:
            continue
        key = (
            kurum_id,
            row.personel_id or 0,
            (row.telefon or '').replace(' ', ''),
            (row.ad_soyad or '').strip().lower(),
        )
        if key in seen:
            row.delete()
            continue
        seen.add(key)
        row.kurum_id = kurum_id
        row.mali_hesap_id = None
        row.save(update_fields=['kurum_id', 'mali_hesap_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0033_hesaptransferi_iptal_eden_and_more'),
        ('kurum', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='malihesapyetkilisi',
            name='kurum',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='mali_hesap_yetkilileri',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
        migrations.AlterField(
            model_name='malihesapyetkilisi',
            name='mali_hesap',
            field=models.ForeignKey(
                blank=True,
                help_text='Boşsa yetkili tüm mali hesaplardan sorumludur.',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='yetkililer',
                to='finans.malihesap',
                verbose_name='Mali Hesap',
            ),
        ),
        migrations.AddIndex(
            model_name='malihesapyetkilisi',
            index=models.Index(fields=['kurum'], name='finans_mh_yetkili_kurum_idx'),
        ),
        migrations.RunPython(backfill_kurum_and_make_global, migrations.RunPython.noop),
    ]
