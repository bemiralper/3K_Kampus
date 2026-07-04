from django.db import migrations


def sil_gecmis_odeme_yontemleri(apps, schema_editor):
    """
    Ödeme Yöntemi artık bir Mali Hesaba ait olduğu için, kurum bazlı eski
    kayıtların hangi hesaba ait olduğunu güvenilir biçimde tahmin etmek yerine
    geçmiş tanımları temizleyip kullanıcının yeni ekrandan (Mali Hesap ->
    Ödeme Yöntemleri sekmesi) yeniden eklemesini sağlıyoruz.

    Bu işlem sadece "tanım" (OdemeYontemi) kayıtlarını siler; gerçekleşmiş
    tahsilat/ödeme/gelir kayıtları SİLİNMEZ, sadece o kayıtlardaki
    "ödeme yöntemi" referansı boşa düşer (alanlar zaten nullable).
    """
    OdemeYontemi = apps.get_model('finans', 'OdemeYontemi')
    GiderKaydi = apps.get_model('finans', 'GiderKaydi')
    GiderOdeme = apps.get_model('finans', 'GiderOdeme')
    GelirKaydi = apps.get_model('finans', 'GelirKaydi')
    GelirTahsilat = apps.get_model('finans', 'GelirTahsilat')

    for model in (GiderKaydi, GiderOdeme, GelirKaydi, GelirTahsilat):
        model.objects.filter(odeme_yontemi__isnull=False).update(odeme_yontemi=None)

    try:
        Sozlesme = apps.get_model('odeme_takip', 'Sozlesme')
        Sozlesme.objects.filter(odeme_yontemi__isnull=False).update(odeme_yontemi=None)
    except LookupError:
        pass

    try:
        Tahsilat = apps.get_model('odeme_takip', 'Tahsilat')
        Tahsilat.objects.filter(odeme_yontemi__isnull=False).update(odeme_yontemi=None)
    except LookupError:
        pass

    OdemeYontemi.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('odeme_takip', '0013_alter_sozlesmegecmisi_islem_turu'),
        ('finans', '0013_mali_hesap_odeme_yontemi_iliski'),
    ]

    operations = [
        migrations.RunPython(sil_gecmis_odeme_yontemleri, migrations.RunPython.noop),
    ]
