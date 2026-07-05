from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0002_sinavtakvim_yayin_adi'),
    ]

    operations = [
        migrations.AddField(
            model_name='sinavtakvim',
            name='saat_bitis',
            field=models.TimeField(blank=True, null=True, verbose_name='Bitiş Saati'),
        ),
        migrations.AlterField(
            model_name='sinavtakvim',
            name='saat',
            field=models.TimeField(blank=True, null=True, verbose_name='Başlangıç Saati'),
        ),
    ]
