# Generated manually for Faz 2.3 — ResourceBook kurum isolation

from django.db import migrations, models
import django.db.models.deletion


def backfill_resource_book_kurum(apps, schema_editor):
    ResourceBook = apps.get_model('resources', 'ResourceBook')
    Kurum = apps.get_model('kurum', 'Kurum')
    default_kurum = Kurum.objects.filter(aktif_mi=True).order_by('id').first()
    if default_kurum:
        ResourceBook.objects.filter(kurum__isnull=True).update(kurum_id=default_kurum.id)


class Migration(migrations.Migration):

    dependencies = [
        ('kurum', '0001_initial'),
        ('resources', '0003_add_zorluk_seviyesi'),
    ]

    operations = [
        migrations.AddField(
            model_name='resourcebook',
            name='kurum',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='resource_books',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
        migrations.AlterField(
            model_name='resourcebook',
            name='kod',
            field=models.CharField(max_length=50, verbose_name='Kod'),
        ),
        migrations.AddConstraint(
            model_name='resourcebook',
            constraint=models.UniqueConstraint(
                fields=('kurum', 'kod'),
                name='unique_resource_book_kod_per_kurum',
            ),
        ),
        migrations.RunPython(backfill_resource_book_kurum, migrations.RunPython.noop),
    ]
