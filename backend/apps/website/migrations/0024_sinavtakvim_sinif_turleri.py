from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0023_sitesettings_telefon_multi'),
    ]

    operations = [
        migrations.AlterField(
            model_name='sinavtakvim',
            name='tur',
            field=models.CharField(
                choices=[
                    ('LGS', 'LGS'),
                    ('TYT', 'TYT'),
                    ('AYT', 'AYT'),
                    ('S11', '11. Sınıf'),
                    ('S7', '7. Sınıf'),
                ],
                max_length=10,
                verbose_name='Tür',
            ),
        ),
    ]
