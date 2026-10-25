from django.db import migrations, models


class Migration(migrations.Migration):
    """Aktif ek hizmet tekilliğini eğitim yılına indirir.

    Mevcut veride öğrenci + hizmet başına en fazla bir aktif satır vardır.
    Bu küme yeni kısıtları da sağlar. Satır taşınmaz, yılı tahminle doldurulmaz.
    Canlıda bu dosya ayrıca migrate edilmeden uygulanmaz.
    """

    dependencies = [
        ('ogrenci', '0017_bildirim_tercihi_ve_tuslu_telefon'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='ogrenciekhizmet',
            name='unique_ogrenci_ek_hizmet_aktif',
        ),
        migrations.AddConstraint(
            model_name='ogrenciekhizmet',
            constraint=models.UniqueConstraint(
                condition=models.Q(aktif_mi=True),
                fields=('ogrenci', 'ek_hizmet', 'egitim_yili'),
                name='unique_ogrenci_ek_hizmet_yil_aktif',
            ),
        ),
        migrations.AddConstraint(
            model_name='ogrenciekhizmet',
            constraint=models.UniqueConstraint(
                condition=models.Q(('aktif_mi', True), ('egitim_yili__isnull', True)),
                fields=('ogrenci', 'ek_hizmet'),
                name='unique_ogrenci_ek_hizmet_yilsiz_aktif',
            ),
        ),
    ]
