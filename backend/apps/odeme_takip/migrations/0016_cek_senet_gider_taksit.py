from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0026_gider_taksit_odeme_yontemi'),
        ('odeme_takip', '0015_backfill_cek_senet_v2'),
    ]

    operations = [
        migrations.AddField(
            model_name='ceksenetdetay',
            name='gider_taksit',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='cek_senet_detay',
                to='finans.gidertaksit',
            ),
        ),
    ]
