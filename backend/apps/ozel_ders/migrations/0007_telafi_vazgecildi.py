from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ozel_ders', '0006_sync_model_state'),
    ]

    operations = [
        migrations.AlterField(
            model_name='birebirdersoturumu',
            name='telafi_durumu',
            field=models.CharField(
                choices=[
                    ('GEREKMIYOR', 'Telafi Gerekmiyor'),
                    ('BEKLENIYOR', 'Telafi Bekleniyor'),
                    ('PLANLANDI', 'Telafi Planlandı'),
                    ('EDILDI', 'Telafi Edildi'),
                    ('VAZGECILDI', 'Telafiden Vazgeçildi'),
                ],
                db_index=True,
                default='GEREKMIYOR',
                max_length=16,
            ),
        ),
    ]
