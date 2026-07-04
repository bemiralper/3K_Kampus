"""Mali hesaba banka kodu alanı ekler ve mevcut banka_adi değerlerini eşler."""
from django.db import migrations, models


def backfill_banka_kodu(apps, schema_editor):
    MaliHesap = apps.get_model('finans', 'MaliHesap')
    aliases = {
        'vakıfbank': 'vakifbank',
        'vakifbank': 'vakifbank',
        'ziraat bankası': 'ziraat',
        'ziraat': 'ziraat',
        'halkbank': 'halkbank',
        'iş bankası': 'is_bankasi',
        'is bankasi': 'is_bankasi',
        'garanti bbva': 'garanti',
        'garanti': 'garanti',
        'akbank': 'akbank',
        'yapı kredi': 'yapi_kredi',
        'yapi kredi': 'yapi_kredi',
        'qnb': 'qnb',
        'teb': 'teb',
        'denizbank': 'denizbank',
        'ing': 'ing',
        'hsbc': 'hsbc',
        'fibabanka': 'fibabank',
        'şekerbank': 'sekerbank',
        'sekerbank': 'sekerbank',
        'odea bank': 'odeabank',
        'odeabank': 'odeabank',
        'albaraka türk': 'albaraka',
        'albaraka': 'albaraka',
        'kuveyt türk': 'kuveyt',
        'kuveyt turk': 'kuveyt',
    }
    label_map = {
        'vakifbank': 'VakıfBank',
        'ziraat': 'Ziraat Bankası',
        'halkbank': 'Halkbank',
        'is_bankasi': 'İş Bankası',
        'garanti': 'Garanti BBVA',
        'akbank': 'Akbank',
        'yapi_kredi': 'Yapı Kredi',
        'qnb': 'QNB',
        'teb': 'TEB',
        'denizbank': 'Denizbank',
        'ing': 'ING',
        'hsbc': 'HSBC',
        'fibabank': 'Fibabanka',
        'sekerbank': 'Şekerbank',
        'odeabank': 'Odea Bank',
        'albaraka': 'Albaraka Türk',
        'kuveyt': 'Kuveyt Türk',
        'diger': 'Diğer',
    }
    for hesap in MaliHesap.objects.exclude(banka_adi=''):
        code = aliases.get(hesap.banka_adi.strip().casefold(), '')
        if code:
            hesap.banka = code
            hesap.banka_adi = label_map.get(code, hesap.banka_adi)
            hesap.save(update_fields=['banka', 'banka_adi'])


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0021_gelir_kategorisi_cari_m2m'),
    ]

    operations = [
        migrations.AddField(
            model_name='malihesap',
            name='banka',
            field=models.CharField(
                blank=True,
                choices=[
                    ('vakifbank', 'VakıfBank'),
                    ('ziraat', 'Ziraat Bankası'),
                    ('halkbank', 'Halkbank'),
                    ('is_bankasi', 'İş Bankası'),
                    ('garanti', 'Garanti BBVA'),
                    ('akbank', 'Akbank'),
                    ('yapi_kredi', 'Yapı Kredi'),
                    ('qnb', 'QNB'),
                    ('teb', 'TEB'),
                    ('denizbank', 'Denizbank'),
                    ('ing', 'ING'),
                    ('hsbc', 'HSBC'),
                    ('fibabank', 'Fibabanka'),
                    ('sekerbank', 'Şekerbank'),
                    ('odeabank', 'Odea Bank'),
                    ('albaraka', 'Albaraka Türk'),
                    ('kuveyt', 'Kuveyt Türk'),
                    ('diger', 'Diğer'),
                ],
                default='',
                help_text='Banka hesabı veya POS için banka seçimi',
                max_length=30,
                verbose_name='Banka',
            ),
        ),
        migrations.RunPython(backfill_banka_kodu, migrations.RunPython.noop),
    ]
