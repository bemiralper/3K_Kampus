from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0019_answerkeyitem_sub_outcome'),
    ]

    operations = [
        migrations.AddField(
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
