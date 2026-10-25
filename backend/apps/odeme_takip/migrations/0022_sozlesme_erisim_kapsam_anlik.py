from django.db import migrations, models


class Migration(migrations.Migration):
    """Sözleşmenin dahil hizmet anlık görüntüsü. Mevcut satırlar boş kalır.

    Boş değer, katalogdan yeniden üretim emri değildir. Onarım komutu
    boş görüntüyü mevcut erişim satırlarından türetir; katalogdan doldurmaz.
    """

    dependencies = [
        ('odeme_takip', '0021_sync_deneme_display_names'),
    ]

    operations = [
        migrations.AddField(
            model_name='sozlesme',
            name='erisim_kapsam_anlik',
            field=models.JSONField(
                blank=True,
                help_text=(
                    'Pakete dahil hizmetler kapsam değişince sabitlenir. '
                    'Katalog sonradan değişince veya not gibi ilgisiz bir kayıtta yenilenmez.'
                ),
                null=True,
                verbose_name='Erişim kapsamı anlık görüntüsü',
            ),
        ),
    ]
