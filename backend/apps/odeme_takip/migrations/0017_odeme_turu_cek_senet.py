from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('odeme_takip', '0016_cek_senet_gider_taksit'),
    ]

    operations = [
        migrations.AlterField(
            model_name='sozlesme',
            name='odeme_turu',
            field=models.CharField(
                choices=[
                    ('pesin', 'Peşin'),
                    ('taksitli', 'Taksitli'),
                    ('cek_senet', 'Çek / Senet'),
                    ('karma', 'Karma'),
                ],
                default='taksitli',
                max_length=20,
                verbose_name='Ödeme Türü',
            ),
        ),
    ]
