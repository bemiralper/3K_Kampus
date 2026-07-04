from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0025_cek_senet_v2'),
    ]

    operations = [
        migrations.AddField(
            model_name='gidertaksit',
            name='odeme_yontemi',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='gider_taksitleri',
                to='finans.odemeyontemi',
                verbose_name='Ödeme Yöntemi',
            ),
        ),
    ]
