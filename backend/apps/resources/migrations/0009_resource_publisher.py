import re

from django.db import migrations, models
import django.db.models.deletion


def _normalize_ad(value: str) -> str:
    return re.sub(r'\s+', ' ', (value or '').strip())


def migrate_yayinevi_to_publisher(apps, schema_editor):
    ResourceBook = apps.get_model('resources', 'ResourceBook')
    ResourcePublisher = apps.get_model('resources', 'ResourcePublisher')

    cache = {}
    for book in ResourceBook.objects.exclude(yayinevi='').exclude(yayinevi__isnull=True).iterator():
        ad = _normalize_ad(book.yayinevi)
        if not ad or not book.kurum_id:
            continue
        key = (book.kurum_id, ad.casefold())
        publisher = cache.get(key)
        if publisher is None:
            publisher, _ = ResourcePublisher.objects.get_or_create(
                kurum_id=book.kurum_id,
                ad=ad,
                defaults={'kisa_ad': ad[:100], 'aktif_mi': True},
            )
            cache[key] = publisher
        book.publisher_id = publisher.id
        book.save(update_fields=['publisher_id'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('kurum', '0001_initial'),
        ('resources', '0008_add_icerik_tamamlandi_mi'),
    ]

    operations = [
        migrations.CreateModel(
            name='ResourcePublisher',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ad', models.CharField(max_length=200, verbose_name='Yayınevi Adı')),
                ('kisa_ad', models.CharField(blank=True, max_length=100, verbose_name='Kısa Ad')),
                ('logo', models.ImageField(blank=True, null=True, upload_to='resources/publisher/', verbose_name='Logo')),
                ('aktif_mi', models.BooleanField(default=True, verbose_name='Aktif')),
                ('aciklama', models.TextField(blank=True, verbose_name='Açıklama')),
                ('eslesme_anahtarlari', models.TextField(blank=True, help_text='Virgülle ayrılmış kısaltma/alias (otomatik eşleştirme için)', verbose_name='Eşleşme Anahtarları')),
                ('sira', models.PositiveIntegerField(default=0, verbose_name='Sıra')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Oluşturma Tarihi')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Güncelleme Tarihi')),
                ('kurum', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='resource_publishers', to='kurum.kurum', verbose_name='Kurum')),
            ],
            options={
                'verbose_name': 'Yayınevi',
                'verbose_name_plural': 'Yayınevleri',
                'db_table': 'resource_publisher',
                'ordering': ['sira', 'ad'],
            },
        ),
        migrations.AddConstraint(
            model_name='resourcepublisher',
            constraint=models.UniqueConstraint(fields=('kurum', 'ad'), name='unique_resource_publisher_ad_per_kurum'),
        ),
        migrations.AddField(
            model_name='resourcebook',
            name='publisher',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='books',
                to='resources.resourcepublisher',
                verbose_name='Yayınevi',
            ),
        ),
        migrations.RunPython(migrate_yayinevi_to_publisher, noop_reverse),
        migrations.RemoveField(
            model_name='resourcebook',
            name='yayinevi',
        ),
    ]
