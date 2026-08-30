from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ozel_ders', '0004_yoklama_telafi_bildirim'),
    ]

    operations = [
        migrations.AddField(
            model_name='birebirhaftalikslot',
            name='hedef_dakika',
            field=models.PositiveIntegerField(
                blank=True,
                help_text='Ders bazlı saat kotası (dakika). Aynı dersin slotları kotayı paylaşır.',
                null=True,
            ),
        ),
    ]
