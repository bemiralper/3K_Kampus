# ResourceBook şube izolasyonu — kurum kataloğundan şube kataloğuna geçiş

from django.db import migrations, models
import django.db.models.deletion


def backfill_resourcebook_sube(apps, schema_editor):
    ResourceBook = apps.get_model('resources', 'ResourceBook')
    Sube = apps.get_model('sube', 'Sube')

    for book in ResourceBook.objects.filter(sube_id__isnull=True).iterator():
        sube_id = None
        ders = getattr(book, 'ders', None)
        if ders is not None and getattr(ders, 'sube_id', None):
            sube_id = ders.sube_id
        if not sube_id:
            sinif = getattr(book, 'sinif_seviyesi', None)
            if sinif is not None and getattr(sinif, 'sube_id', None):
                sube_id = sinif.sube_id
        if not sube_id and book.kurum_id:
            first = (
                Sube.objects.filter(kurum_id=book.kurum_id, aktif_mi=True)
                .order_by('id')
                .first()
            )
            if not first:
                first = Sube.objects.filter(kurum_id=book.kurum_id).order_by('id').first()
            if first:
                sube_id = first.id
        if sube_id:
            book.sube_id = sube_id
            book.save(update_fields=['sube_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('resources', '0005_resourcebook_sinif_seviyeleri_m2m'),
        ('sube', '0003_sube_branding'),
    ]

    operations = [
        migrations.AddField(
            model_name='resourcebook',
            name='sube',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='resource_books',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.RunPython(backfill_resourcebook_sube, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name='resourcebook',
            name='unique_resource_book_kod_per_kurum',
        ),
        migrations.AddConstraint(
            model_name='resourcebook',
            constraint=models.UniqueConstraint(
                fields=('sube', 'kod'),
                name='unique_resource_book_kod_per_sube',
            ),
        ),
    ]
