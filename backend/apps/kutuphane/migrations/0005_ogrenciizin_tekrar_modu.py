from django.db import migrations, models


def set_existing_weekly(apps, schema_editor):
    OgrenciIzin = apps.get_model('kutuphane', 'OgrenciIzin')
    OgrenciIzin.objects.filter(gun__isnull=False).update(tekrar_modu='WEEKLY')


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('kutuphane', '0004_ders_programi_sablonu'),
    ]

    operations = [
        migrations.AddField(
            model_name='ogrenciizin',
            name='tekrar_modu',
            field=models.CharField(
                choices=[('RANGE', 'Tarih Aralığı'), ('WEEKLY', 'Haftalık Tekrar')],
                default='RANGE',
                max_length=16,
                verbose_name='Tekrar',
            ),
        ),
        migrations.AddField(
            model_name='ogrenciizin',
            name='sebep_kodu',
            field=models.CharField(
                blank=True,
                choices=[
                    ('HASTALIK', 'Hastalık'),
                    ('AILEVI', 'Ailevi'),
                    ('SINAV', 'Sınav'),
                    ('SPOR', 'Spor'),
                    ('RESMI_ISLEM', 'Resmi işlem'),
                    ('DIGER', 'Diğer'),
                ],
                default='',
                max_length=20,
                verbose_name='Sebep Kodu',
            ),
        ),
        migrations.AlterField(
            model_name='ogrenciizin',
            name='gun',
            field=models.IntegerField(
                blank=True,
                choices=[
                    (0, 'Pazartesi'),
                    (1, 'Salı'),
                    (2, 'Çarşamba'),
                    (3, 'Perşembe'),
                    (4, 'Cuma'),
                    (5, 'Cumartesi'),
                    (6, 'Pazar'),
                ],
                help_text='WEEKLY için haftanın günü (0=Pazartesi ... 6=Pazar). RANGE için boş.',
                null=True,
                verbose_name='Gün',
            ),
        ),
        migrations.AlterModelOptions(
            name='ogrenciizin',
            options={
                'ordering': ['ogrenci_id', 'baslangic_tarihi', 'gun', 'periyot_kodu'],
                'verbose_name': 'Öğrenci İzni',
                'verbose_name_plural': 'Öğrenci İzinleri',
            },
        ),
        migrations.AddIndex(
            model_name='ogrenciizin',
            index=models.Index(fields=['tekrar_modu', 'baslangic_tarihi'], name='kutuphane_o_tekrar__idx'),
        ),
        migrations.RunPython(set_existing_weekly, noop),
    ]
