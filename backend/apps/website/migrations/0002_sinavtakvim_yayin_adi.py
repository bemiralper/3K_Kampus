from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='sinavtakvim',
            name='yayin_adi',
            field=models.CharField(blank=True, default='', max_length=120, verbose_name='Yayın / Kurum Adı'),
        ),
    ]
