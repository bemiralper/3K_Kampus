from django.db import migrations


def deactivate_deneme_analiz(apps, schema_editor):
    GorevTipi = apps.get_model('gorev', 'GorevTipi')
    GorevTipi.objects.filter(kod='DENEME_ANALIZ').update(is_active=False)


class Migration(migrations.Migration):

    dependencies = [
        ('gorev', '0007_gorevdosya'),
    ]

    operations = [
        migrations.RunPython(deactivate_deneme_analiz, migrations.RunPython.noop),
    ]
