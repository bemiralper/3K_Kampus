from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gorev', '0008_deactivate_deneme_analiz'),
    ]

    operations = [
        migrations.AddField(
            model_name='gorevatama',
            name='kisisel_hatirlatma_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Kişisel Hatırlatma'),
        ),
        migrations.AddField(
            model_name='gorevatama',
            name='kisisel_hatirlatma_gonderildi_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Kişisel Hatırlatma Gönderildi'),
        ),
        migrations.AddIndex(
            model_name='gorevatama',
            index=models.Index(fields=['kisisel_hatirlatma_at'], name='idx_gorev_atama_hatirlat'),
        ),
    ]
