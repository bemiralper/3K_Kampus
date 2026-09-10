from django.db import migrations, models

from ._idempotent import AddFieldIfMissing


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0022_detach_false_heading_binds'),
    ]

    operations = [
        AddFieldIfMissing(
            model_name='studentanswer',
            name='raw_tc_kimlik',
            field=models.CharField(
                blank=True,
                default='',
                help_text=(
                    'DAT satırındaki TC sütunu — oturum sonuçları yeniden '
                    'açıldığında manuel eşleştirme için gerekir.'
                ),
                max_length=20,
                verbose_name='Ham TC Kimlik',
            ),
        ),
    ]
