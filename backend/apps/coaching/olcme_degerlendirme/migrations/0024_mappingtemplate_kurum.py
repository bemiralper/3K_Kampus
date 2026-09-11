import django.db.models.deletion
from django.db import migrations, models

from ._idempotent import AddFieldIfMissing


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0023_studentanswer_raw_tc_kimlik'),
        ('kurum', '0001_initial'),
    ]

    operations = [
        AddFieldIfMissing(
            model_name='mappingtemplate',
            name='kurum',
            field=models.ForeignKey(
                blank=True,
                help_text='Şablonlar kuruma özeldir; eşleştirmeler o kurumun '
                          "bölüm ID'lerini taşıdığı için başka kuruma "
                          'sızdırılmamalıdır.',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='olcme_mapping_sablonlari',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
    ]
