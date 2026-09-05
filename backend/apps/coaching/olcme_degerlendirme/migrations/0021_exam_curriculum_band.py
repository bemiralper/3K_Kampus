from django.db import migrations, models

from . import _idempotent as idem


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0020_dispatch_enabled_campaign'),
    ]

    operations = [
        idem.AddFieldIfMissing(
            model_name='exam',
            name='curriculum_band',
            field=models.CharField(
                blank=True,
                choices=[('YKS', 'YKS (9–12)'), ('LGS', 'LGS (5–8)')],
                default='',
                help_text='YKS 9–12 veya LGS 5–8. TYT/AYT/LGS türünde otomatik kilitlenir.',
                max_length=8,
                verbose_name='Müfredat düzeyi',
            ),
        ),
    ]
