from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0011_gelir_tahsilat'),
        ('odeme_takip', '0011_cek_senet_detay'),
    ]

    operations = [
        migrations.AddField(
            model_name='tahsilat',
            name='mali_hesap',
            field=models.ForeignKey(
                blank=True, null=True,
                help_text='Paranın girdiği kasa/banka hesabı — kasa bakiyesi bu alan üzerinden güncellenir',
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='tahsilatlar', to='finans.malihesap', verbose_name='Mali Hesap',
            ),
        ),
        migrations.AddField(
            model_name='tahsilat',
            name='bakiye_hareketi_id',
            field=models.PositiveBigIntegerField(
                blank=True, null=True,
                help_text="İlgili BakiyeHareketi kaydının ID'si (referans amaçlı)",
                verbose_name='Bakiye Hareketi ID',
            ),
        ),
    ]
