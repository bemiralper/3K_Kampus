from decimal import Decimal

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('personel', '0019_deactivate_passive_personel_users'),
    ]

    operations = [
        migrations.AlterField(
            model_name='personelsozlesme',
            name='haftalik_calisma_gun_sayisi',
            field=models.DecimalField(
                decimal_places=1,
                default=Decimal('5'),
                help_text='Yarım gün için 0,5 adım (ör. 2,5).',
                max_digits=3,
                validators=[
                    django.core.validators.MinValueValidator(Decimal('0.5')),
                    django.core.validators.MaxValueValidator(Decimal('7')),
                ],
                verbose_name='Haftalık Çalışma Gün Sayısı',
            ),
        ),
    ]
