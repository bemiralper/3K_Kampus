from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0024_sinavtakvim_sinif_turleri'),
    ]

    operations = [
        migrations.AddField(
            model_name='sinavtakvim',
            name='grup_id',
            field=models.UUIDField(
                blank=True,
                db_index=True,
                help_text='Aynı sınavın birden fazla uygulama günü bu kimliği paylaşır.',
                null=True,
                verbose_name='Gün grubu',
            ),
        ),
    ]
