from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('resources', '0006_resourcebook_sube'),
    ]

    operations = [
        migrations.AddField(
            model_name='resourcebook',
            name='kapak',
            field=models.ImageField(
                blank=True,
                help_text='Önerilen boyut 600x600 px',
                null=True,
                upload_to='resources/kapak/',
                verbose_name='Kapak Görseli',
            ),
        ),
    ]
