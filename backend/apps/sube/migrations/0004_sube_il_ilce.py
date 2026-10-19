from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sube', '0003_sube_branding'),
    ]

    operations = [
        migrations.AddField(
            model_name='sube',
            name='il',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='İl'),
        ),
        migrations.AddField(
            model_name='sube',
            name='ilce',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='İlçe'),
        ),
    ]
