from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('takvim', '0005_appnotification_ekran_mesaji'),
    ]

    operations = [
        migrations.AddField(
            model_name='appnotification',
            name='ekran_gosterildi',
            field=models.BooleanField(
                default=False,
                help_text='Tam ekran banner kullanıcıya gösterildi mi?',
                verbose_name='Ekran Gösterildi',
            ),
        ),
    ]
