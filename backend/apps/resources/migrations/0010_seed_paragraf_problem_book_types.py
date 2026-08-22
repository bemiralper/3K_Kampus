from django.db import migrations


def seed_paragraf_problem_types(apps, schema_editor):
    BookType = apps.get_model('resources', 'BookType')
    defaults = [
        {
            'kod': 'PARAGRAF',
            'ad': 'Paragraf',
            'renk': 'info',
            'ikon': '📄',
            'sira': 10,
            'aktif_mi': True,
        },
        {
            'kod': 'PROBLEM',
            'ad': 'Problem',
            'renk': 'warning',
            'ikon': '🔢',
            'sira': 11,
            'aktif_mi': True,
        },
    ]
    for payload in defaults:
        obj, created = BookType.objects.get_or_create(
            kod=payload['kod'],
            defaults=payload,
        )
        if not created and obj.ad.endswith(' Bankası'):
            obj.ad = payload['ad']
            obj.save(update_fields=['ad'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('resources', '0009_resource_publisher'),
    ]

    operations = [
        migrations.RunPython(seed_paragraf_problem_types, noop_reverse),
    ]
