from django.db import migrations, models


def copy_sinif_seviyesi_to_m2m(apps, schema_editor):
    ResourceBook = apps.get_model('resources', 'ResourceBook')
    for book in ResourceBook.objects.exclude(sinif_seviyesi_id__isnull=True).iterator():
        if not book.sinif_seviyeleri.filter(pk=book.sinif_seviyesi_id).exists():
            book.sinif_seviyeleri.add(book.sinif_seviyesi_id)


class Migration(migrations.Migration):

    dependencies = [
        ('egitim_tanimlari', '0001_initial'),
        ('resources', '0004_resourcebook_kurum'),
    ]

    operations = [
        migrations.AddField(
            model_name='resourcebook',
            name='sinif_seviyeleri',
            field=models.ManyToManyField(
                blank=True,
                help_text='Kitabın hedeflediği sınıf seviyeleri (birden fazla seçilebilir)',
                related_name='resource_books_multi',
                to='egitim_tanimlari.sinifseviyesi',
                verbose_name='Sınıf Seviyeleri',
            ),
        ),
        migrations.RunPython(copy_sinif_seviyesi_to_m2m, migrations.RunPython.noop),
    ]
