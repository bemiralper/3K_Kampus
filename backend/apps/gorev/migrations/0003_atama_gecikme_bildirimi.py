from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gorev', '0002_gorevtekrarsablonu'),
    ]

    operations = [
        migrations.AddField(
            model_name='gorevatama',
            name='gecikme_bildirildi_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Gecikme Bildirimi Gönderildi'),
        ),
    ]
