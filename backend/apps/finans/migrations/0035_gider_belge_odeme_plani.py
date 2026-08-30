from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def _backfill_belge_nolar(apps, schema_editor):
    GiderKaydi = apps.get_model('finans', 'GiderKaydi')
    GiderOdeme = apps.get_model('finans', 'GiderOdeme')

    counters = {}
    for gider in GiderKaydi.objects.all().order_by('id'):
        if gider.islem_belge_no:
            continue
        if gider.fatura_no and str(gider.fatura_no).startswith('GDR-'):
            gider.islem_belge_no = gider.fatura_no[:30]
            gider.save(update_fields=['islem_belge_no'])
            continue
        year = (gider.created_at.year if gider.created_at else 2026)
        key = (gider.kurum_id, year)
        counters[key] = counters.get(key, 0) + 1
        gider.islem_belge_no = f'GDR-{year}-{counters[key]:06d}'
        gider.save(update_fields=['islem_belge_no'])

    odeme_counters = {}
    for odeme in GiderOdeme.objects.filter(durum='tamamlandi').order_by('odeme_tarihi', 'id'):
        if odeme.odeme_belge_no:
            continue
        year = odeme.odeme_tarihi.year if odeme.odeme_tarihi else 2026
        kurum_id = odeme.gider_kaydi.kurum_id
        key = (kurum_id, year)
        odeme_counters[key] = odeme_counters.get(key, 0) + 1
        odeme.odeme_belge_no = f'ODM-{year}-{odeme_counters[key]:06d}'
        odeme.save(update_fields=['odeme_belge_no'])


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('finans', '0034_mali_hesap_yetkilisi_kurum'),
    ]

    operations = [
        migrations.AddField(
            model_name='giderkaydi',
            name='islem_belge_no',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                help_text='Sistem belgesi: GDR-YYYY-000001. Tedarikçi faturası değildir.',
                max_length=30,
                verbose_name='Gider İşlem Belge No',
            ),
        ),
        migrations.AddField(
            model_name='giderodeme',
            name='odeme_belge_no',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                help_text='Yalnızca gerçekleşen ödeme için: ODM-YYYY-000001',
                max_length=30,
                verbose_name='Ödeme Belge No',
            ),
        ),
        migrations.AddField(
            model_name='gidertaksit',
            name='mali_hesap',
            field=models.ForeignKey(
                blank=True,
                help_text='Son gerçekleşen ödemenin çıktığı hesap',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='gider_taksitleri',
                to='finans.malihesap',
                verbose_name='Mali Hesap',
            ),
        ),
        migrations.AddField(
            model_name='gidertaksit',
            name='odeme_tarihi',
            field=models.DateField(
                blank=True,
                help_text='Son gerçekleşen ödeme tarihi',
                null=True,
                verbose_name='Ödeme Tarihi',
            ),
        ),
        migrations.CreateModel(
            name='GiderEkliBelge',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('dosya', models.FileField(upload_to='finans/gider_ekleri/%Y/%m/', verbose_name='Dosya')),
                ('dosya_adi', models.CharField(max_length=255, verbose_name='Dosya Adı')),
                ('dosya_turu', models.CharField(
                    choices=[
                        ('fatura_fis', 'Ekli Fatura / Fiş'),
                        ('dekont', 'Dekont'),
                        ('diger', 'Diğer'),
                    ],
                    default='fatura_fis',
                    max_length=20,
                    verbose_name='Dosya Türü',
                )),
                ('aciklama', models.CharField(blank=True, default='', max_length=255, verbose_name='Açıklama')),
                ('dosya_boyutu', models.PositiveIntegerField(default=0, verbose_name='Boyut (byte)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('gider_kaydi', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='ekli_belgeler',
                    to='finans.giderkaydi',
                    verbose_name='Gider Kaydı',
                )),
                ('yukleyen', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Yükleyen',
                )),
            ],
            options={
                'verbose_name': 'Gider Ekli Belge',
                'verbose_name_plural': 'Gider Ekli Belgeler',
                'db_table': 'finans_gider_ekli_belge',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='giderkaydi',
            index=models.Index(fields=['kurum', 'islem_belge_no'], name='finans_gide_kurum_i_belge_idx'),
        ),
        migrations.RunPython(_backfill_belge_nolar, migrations.RunPython.noop),
    ]
