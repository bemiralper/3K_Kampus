# Step 3: sube zorunlu + yeni unique constraint

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0017_kopyala_gider_kategorileri_subelere'),
    ]

    operations = [
        migrations.AlterField(
            model_name='giderkategorisi',
            name='sube',
            field=models.ForeignKey(
                help_text='Her şubenin kendi gider kategori seti vardır',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='gider_kategorileri',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.RemoveConstraint(
            model_name='giderkategorisi',
            name='unique_kurum_gider_kategori_ad',
        ),
        migrations.AddConstraint(
            model_name='giderkategorisi',
            constraint=models.UniqueConstraint(
                condition=models.Q(('silindi_mi', False)),
                fields=('sube', 'parent', 'ad'),
                name='unique_sube_gider_kategori_ad',
            ),
        ),
        migrations.RemoveIndex(
            model_name='giderkategorisi',
            name='finans_gide_kurum_i_5e44af_idx',
        ),
        migrations.AddIndex(
            model_name='giderkategorisi',
            index=models.Index(
                fields=['kurum', 'sube', 'parent', 'aktif_mi', 'silindi_mi'],
                name='finans_gide_kurum_s_7c1b2a_idx',
            ),
        ),
    ]
