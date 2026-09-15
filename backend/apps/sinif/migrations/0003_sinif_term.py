from django.db import migrations, models
import django.db.models.deletion


def _backfill_sinif_term(apps, schema_editor):
    Sinif = apps.get_model('sinif', 'Sinif')
    Term = apps.get_model('term', 'Term')
    for sinif in Sinif.objects.filter(term_id__isnull=True).iterator():
        term = (
            Term.objects
            .filter(
                kurum_id=sinif.kurum_id,
                sube_id=sinif.sube_id,
                egitim_yili_id=sinif.egitim_yili_id,
                is_active=True,
            )
            .order_by('order_no', 'start_date')
            .first()
        )
        if not term:
            term = (
                Term.objects
                .filter(
                    kurum_id=sinif.kurum_id,
                    sube_id=sinif.sube_id,
                    egitim_yili_id=sinif.egitim_yili_id,
                )
                .order_by('order_no', 'start_date')
                .first()
            )
        if term:
            sinif.term_id = term.id
            sinif.save(update_fields=['term_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('sinif', '0002_sinif_oda'),
        ('term', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='sinif',
            name='term',
            field=models.ForeignKey(
                blank=True,
                help_text='Sınıfın ait olduğu eğitim dönemi. Dönem değişince listelenmez.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='siniflar',
                to='term.term',
                verbose_name='Eğitim Dönemi',
            ),
        ),
        migrations.RunPython(_backfill_sinif_term, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name='sinif',
            name='unique_sinif_per_year',
        ),
        migrations.AddConstraint(
            model_name='sinif',
            constraint=models.UniqueConstraint(
                fields=('kurum', 'sube', 'egitim_yili', 'term', 'ad'),
                name='unique_sinif_per_term',
            ),
        ),
    ]
