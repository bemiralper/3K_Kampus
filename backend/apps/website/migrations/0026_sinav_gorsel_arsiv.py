import hashlib
import os
from collections import Counter

from django.core.files.base import ContentFile
from django.db import migrations, models
import django.db.models.deletion

import apps.website.models as website_models


def _archive_existing_images(apps, schema_editor):
    """Aynı içeriğe sahip sınav görsellerini tek arşiv kaydında toplar."""
    SinavTakvim = apps.get_model('website', 'SinavTakvim')
    Arsiv = apps.get_model('website', 'SinavGorselArsiv')
    groups = {}
    rows = SinavTakvim.objects.exclude(gorsel='').exclude(gorsel__isnull=True).iterator()
    for row in rows:
        try:
            with row.gorsel.open('rb') as handle:
                payload = handle.read()
        except Exception:
            continue
        if not payload:
            continue
        digest = hashlib.sha256(payload).hexdigest()
        bucket = groups.setdefault((row.kurum_id, digest), {'payload': payload, 'rows': [], 'ext': ''})
        bucket['rows'].append(row)
        if not bucket['ext']:
            bucket['ext'] = os.path.splitext(row.gorsel.name)[1].lower() or '.jpg'

    for (kurum_id, digest), bucket in groups.items():
        owners = bucket['rows']
        names = [(owner.yayin_adi or '').strip() for owner in owners if (owner.yayin_adi or '').strip()]
        ad = Counter(names).most_common(1)[0][0] if names else ((owners[0].baslik or 'Görsel')[:120])
        tags = []
        seen = set()
        for value in names + [owner.tur for owner in owners if owner.tur]:
            key = value.casefold()
            if key in seen:
                continue
            seen.add(key)
            tags.append(value)
        arsiv = Arsiv(kurum_id=kurum_id, ad=ad[:120], etiketler=', '.join(tags)[:300])
        arsiv.save()
        arsiv.gorsel.save(f'{digest[:16]}{bucket["ext"]}', ContentFile(bucket['payload']), save=True)
        ids = [owner.id for owner in owners]
        for owner in owners:
            try:
                owner.gorsel.delete(save=False)
            except Exception:
                pass
        SinavTakvim.objects.filter(id__in=ids).update(gorsel='', gorsel_arsiv_id=arsiv.id)


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0025_sinavtakvim_grup_id'),
    ]

    operations = [
        migrations.CreateModel(
            name='SinavGorselArsiv',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ad', models.CharField(max_length=120, verbose_name='Ad')),
                ('etiketler', models.CharField(
                    blank=True,
                    default='',
                    help_text='Virgülle ayrılmış etiketler. Arşiv aramasında ada ek olarak kullanılır.',
                    max_length=300,
                    verbose_name='Etiketler',
                )),
                ('gorsel', models.ImageField(upload_to=website_models.arsiv_gorsel_upload_to, verbose_name='Görsel')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('kurum', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sinav_gorsel_arsivi',
                    to='kurum.kurum',
                )),
            ],
            options={
                'verbose_name': 'Sınav görseli',
                'verbose_name_plural': 'Sınav görsel arşivi',
                'ordering': ['ad', '-updated_at'],
            },
        ),
        migrations.AddField(
            model_name='sinavtakvim',
            name='gorsel_arsiv',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='sinavlar',
                to='website.sinavgorselarsiv',
                verbose_name='Arşiv görseli',
            ),
        ),
        migrations.RunPython(_archive_existing_images, migrations.RunPython.noop),
    ]
