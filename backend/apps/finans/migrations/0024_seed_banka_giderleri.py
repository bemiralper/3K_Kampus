# Generated data migration — Banka Giderleri kategorisini mevcut şubelere ekler

from django.db import migrations


def seed_banka_giderleri(apps, schema_editor):
    Kurum = apps.get_model('kurum', 'Kurum')
    Sube = apps.get_model('sube', 'Sube')
    GiderKategorisi = apps.get_model('finans', 'GiderKategorisi')

    banka_kat = {
        'ad': 'Banka Giderleri',
        'ikon': '🏦',
        'renk': '#64748b',
        'alt': [
            'Havale Masrafı',
            'EFT Masrafı',
            'FAST Ücreti',
            'POS Komisyonu',
            'Sanal POS Komisyonu',
            'Online Ödeme Komisyonu',
            'Hesap İşletim Ücreti',
            'Döviz Çevrim Masrafı',
            'Diğer Banka Masrafları',
        ],
    }

    for kurum in Kurum.objects.all():
        subeler = Sube.objects.filter(kurum_id=kurum.id)
        for sube in subeler:
            ana = GiderKategorisi.objects.filter(
                kurum_id=kurum.id,
                sube_id=sube.id,
                parent__isnull=True,
                ad=banka_kat['ad'],
            ).first()
            if not ana:
                sira = GiderKategorisi.objects.filter(sube_id=sube.id).count() + 1
                ana = GiderKategorisi.objects.create(
                    kurum_id=kurum.id,
                    sube_id=sube.id,
                    ad=banka_kat['ad'],
                    ikon=banka_kat['ikon'],
                    renk=banka_kat['renk'],
                    siralama=sira,
                    aktif_mi=True,
                )
            for alt_idx, alt_ad in enumerate(banka_kat['alt']):
                exists = GiderKategorisi.objects.filter(
                    kurum_id=kurum.id,
                    sube_id=sube.id,
                    parent_id=ana.id,
                    ad=alt_ad,
                ).exists()
                if not exists:
                    GiderKategorisi.objects.create(
                        kurum_id=kurum.id,
                        sube_id=sube.id,
                        parent_id=ana.id,
                        ad=alt_ad,
                        siralama=alt_idx + 1,
                        aktif_mi=True,
                    )


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0023_islem_masrafi'),
    ]

    operations = [
        migrations.RunPython(seed_banka_giderleri, migrations.RunPython.noop),
    ]
