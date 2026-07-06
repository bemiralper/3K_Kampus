# Generated manually — Sozlesme.notlar_json per-note visibility

from django.db import migrations, models


def migrate_notlar_to_json(apps, schema_editor):
    Sozlesme = apps.get_model('odeme_takip', 'Sozlesme')
    for s in Sozlesme.objects.exclude(notlar='').exclude(notlar__isnull=True):
        text = (s.notlar or '').strip()
        if text and not s.notlar_json:
            s.notlar_json = [
                {
                    'id': 'legacy-1',
                    'text': text,
                    'veli_ile_paylas': True,
                }
            ]
            s.save(update_fields=['notlar_json'])


class Migration(migrations.Migration):

    dependencies = [
        ('odeme_takip', '0017_odeme_turu_cek_senet'),
    ]

    operations = [
        migrations.AddField(
            model_name='sozlesme',
            name='notlar_json',
            field=models.JSONField(blank=True, default=list, verbose_name='Notlar (yapılandırılmış)'),
        ),
        migrations.RunPython(migrate_notlar_to_json, migrations.RunPython.noop),
    ]
