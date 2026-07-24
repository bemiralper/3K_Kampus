from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('egitim_tanimlari', '0010_sube_scoped_catalog'),
    ]

    operations = [
        migrations.AddField(
            model_name='ders',
            name='kisa_ad',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Program tablosunda gösterilecek ad. Boşsa ders adı kullanılır. Örn: Fizik-1 → Fizik',
                max_length=100,
                verbose_name='Kısa / görünen ad',
            ),
        ),
    ]
