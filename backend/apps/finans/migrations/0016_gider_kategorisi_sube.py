# Step 1: nullable sube FK

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sube', '0001_initial'),
        ('finans', '0015_odeme_yontemi_mali_hesap_zorunlu'),
    ]

    operations = [
        migrations.AddField(
            model_name='giderkategorisi',
            name='sube',
            field=models.ForeignKey(
                blank=True,
                null=True,
                help_text='Her şubenin kendi gider kategori seti vardır',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='gider_kategorileri',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
    ]
