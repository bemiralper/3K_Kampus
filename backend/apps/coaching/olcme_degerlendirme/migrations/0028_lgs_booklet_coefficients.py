from django.db import migrations


def _is_placeholder(coef):
    """İlk LGS taslağı: ham ağırlık 4/1 ve 100–500 ölçeği."""
    if not isinstance(coef, dict):
        return False
    try:
        return (
            float(coef.get('Türkçe') or 0) == 4.0
            and float(coef.get('Matematik') or 0) == 4.0
            and float(coef.get('Fen Bilimleri') or 0) == 4.0
            and float(coef.get('_base') or 0) == 100.0
            and float(coef.get('_max_weighted') or 0) == 270.0
        )
    except (TypeError, ValueError):
        return False


def _upgrade_placeholder_lgs(apps, schema_editor):
    OlcmeKatsayiSeti = apps.get_model('olcme_degerlendirme', 'OlcmeKatsayiSeti')
    lgs = {
        'Türkçe': 4.110,
        'İnkılap Tarihi': 1.731,
        'Din Kültürü': 1.816,
        'Yabancı Dil': 1.532,
        'Matematik': 4.630,
        'Fen Bilimleri': 3.890,
        '_base': 196.604,
    }
    lgs7 = {
        'Türkçe': 4.110,
        'Sosyal Bilgiler': 1.731,
        'Din Kültürü': 1.816,
        'Yabancı Dil': 1.532,
        'Matematik': 4.630,
        'Fen Bilimleri': 3.890,
        '_base': 196.604,
    }
    for row in OlcmeKatsayiSeti.objects.filter(kind__in=['LGS', 'LGS_7']):
        if not _is_placeholder(row.coefficients):
            continue
        row.coefficients = lgs7 if row.kind == 'LGS_7' else lgs
        row.save(update_fields=['coefficients', 'updated_at'])


def _noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0027_lgs_7_and_lgs_katsayi'),
    ]

    operations = [
        migrations.RunPython(_upgrade_placeholder_lgs, _noop),
    ]
