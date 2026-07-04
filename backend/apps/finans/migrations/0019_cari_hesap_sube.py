# Step 1: nullable sube FK on CariHesap

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sube', '0001_initial'),
        ('finans', '0018_gider_kategorisi_sube_zorunlu'),
    ]

    operations = [
        migrations.AddField(
            model_name='carihesap',
            name='sube',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='cari_hesaplar',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
    ]
