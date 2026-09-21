from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0026_ayt_keep_existing_optional_philosophy_off'),
    ]

    operations = [
        migrations.AlterField(
            model_name='exam',
            name='exam_type',
            field=models.CharField(
                choices=[
                    ('YKS_TYT', 'YKS – TYT (Temel Yeterlilik)'),
                    ('YKS_AYT', 'YKS – AYT (Alan Yeterlilik)'),
                    ('LGS', 'LGS (8. Sınıf)'),
                    ('LGS_7', 'LGS (7. Sınıf)'),
                    ('DENEME', 'Deneme Sınavı'),
                    ('KURUM_ICI', 'Kurum İçi Sınav'),
                    ('KONU_TARAMA', 'Konu Tarama'),
                    ('KAZANIM', 'Kazanım Sınavı'),
                    ('OZEL', 'Özel Sınav'),
                ],
                max_length=20,
                verbose_name='Sınav Türü',
            ),
        ),
        migrations.AlterField(
            model_name='mappingtemplate',
            name='exam_type',
            field=models.CharField(
                choices=[
                    ('YKS_TYT', 'YKS – TYT'),
                    ('YKS_AYT', 'YKS – AYT'),
                    ('LGS', 'LGS (8. Sınıf)'),
                    ('LGS_7', 'LGS (7. Sınıf)'),
                    ('DENEME', 'Deneme Sınavı'),
                    ('KURUM_ICI', 'Kurum İçi Sınav'),
                    ('KONU_TARAMA', 'Konu Tarama'),
                    ('KAZANIM', 'Kazanım Sınavı'),
                    ('OZEL', 'Özel Sınav'),
                ],
                max_length=20,
                verbose_name='Sınav Türü',
            ),
        ),
        migrations.AlterField(
            model_name='olcmekatsayiseti',
            name='kind',
            field=models.CharField(
                choices=[
                    ('TYT', 'TYT'),
                    ('AYT_SAY', 'AYT Sayısal'),
                    ('AYT_EA', 'AYT Eşit Ağırlık'),
                    ('AYT_SOZ', 'AYT Sözel'),
                    ('LGS', 'LGS 8. Sınıf'),
                    ('LGS_7', 'LGS 7. Sınıf'),
                ],
                max_length=12,
                verbose_name='Tür',
            ),
        ),
    ]
