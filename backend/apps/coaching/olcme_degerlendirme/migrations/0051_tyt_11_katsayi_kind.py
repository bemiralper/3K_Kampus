from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0050_tyt_11_exam_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='olcmekatsayiseti',
            name='kind',
            field=models.CharField(
                choices=[
                    ('TYT', 'TYT'),
                    ('TYT_11', '11. Sınıf TYT'),
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
