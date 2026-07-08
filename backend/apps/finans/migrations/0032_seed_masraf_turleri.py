"""Varsayılan Masraf Türlerini her kurum için (kurum geneli) seed eder.

KesintiTuru enum'undaki türler, yönetilebilir MasrafTuru kayıtlarına dönüştürülür.
Böylece banka masrafı girişinde kullanıcı hazır bir listeden seçim yapabilir ve
Finansman Tanımları'ndan yenilerini ekleyebilir.
"""
from django.db import migrations


SEED = [
    # (ad, kesinti_turu, odeme_tipi, siralama)
    ('EFT Masrafı', 'eft_masrafi', '', 10),
    ('Havale Masrafı', 'havale_masrafi', '', 20),
    ('FAST Ücreti', 'fast_ucreti', '', 30),
    ('POS Komisyonu', 'pos_komisyonu', '', 40),
    ('Sanal POS Komisyonu', 'sanal_pos_komisyonu', '', 50),
    ('Online Ödeme Komisyonu', 'online_odeme_komisyonu', '', 60),
    ('Hesap İşletim Ücreti', 'hesap_isletim_ucreti', '', 70),
    ('Döviz Çevrim Masrafı', 'doviz_cevrim_masrafi', '', 80),
    ('Diğer Banka Masrafları', 'diger_banka_masraflari', '', 90),
]


def seed(apps, schema_editor):
    Kurum = apps.get_model('kurum', 'Kurum')
    MasrafTuru = apps.get_model('finans', 'MasrafTuru')
    for kurum_id in Kurum.objects.values_list('id', flat=True):
        for ad, kesinti_turu, odeme_tipi, siralama in SEED:
            if MasrafTuru.objects.filter(
                kurum_id=kurum_id, sube__isnull=True, ad=ad,
            ).exists():
                continue
            MasrafTuru.objects.create(
                kurum_id=kurum_id,
                sube=None,
                ad=ad,
                kesinti_turu=kesinti_turu,
                odeme_tipi=odeme_tipi,
                siralama=siralama,
                aktif_mi=True,
            )


def unseed(apps, schema_editor):
    MasrafTuru = apps.get_model('finans', 'MasrafTuru')
    adlar = [s[0] for s in SEED]
    MasrafTuru.objects.filter(sube__isnull=True, ad__in=adlar).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0031_masrafturu_islemmasrafi_masraf_turu_and_more'),
        ('kurum', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
