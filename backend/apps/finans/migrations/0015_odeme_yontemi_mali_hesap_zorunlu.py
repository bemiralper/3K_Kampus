from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0014_sil_gecmis_odeme_yontemleri'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='odemeyontemi',
            name='unique_kurum_odeme_yontemi_ad',
        ),
        migrations.RemoveField(
            model_name='odemeyontemi',
            name='varsayilan_mali_hesap',
        ),
        migrations.AlterField(
            model_name='odemeyontemi',
            name='mali_hesap',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='odeme_yontemleri', to='finans.malihesap', verbose_name='Mali Hesap', help_text='Bu ödeme yönteminin ait olduğu kasa/banka/pos hesabı'),
        ),
        migrations.AlterField(
            model_name='odemeyontemi',
            name='kurum',
            field=models.ForeignKey(help_text='mali_hesap.sube.kurum üzerinden otomatik senkronize edilir', on_delete=django.db.models.deletion.CASCADE, related_name='odeme_yontemleri', to='kurum.kurum', verbose_name='Kurum'),
        ),
        migrations.AddConstraint(
            model_name='odemeyontemi',
            constraint=models.UniqueConstraint(condition=models.Q(('silindi_mi', False)), fields=('mali_hesap', 'ad'), name='unique_mali_hesap_odeme_yontemi_ad'),
        ),
        migrations.AddIndex(
            model_name='odemeyontemi',
            index=models.Index(fields=['mali_hesap', 'aktif_mi', 'silindi_mi'], name='finans_odem_mali_he_0af3b3_idx'),
        ),
    ]
