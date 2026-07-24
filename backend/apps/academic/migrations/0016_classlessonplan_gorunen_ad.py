from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0015_lesson_operations'),
    ]

    operations = [
        migrations.AddField(
            model_name='classlessonplan',
            name='gorunen_ad',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Bu plan satırı için program tablosunda gösterilecek ad. Boşsa dersin kısa adı (yoksa tam adı) kullanılır.',
                max_length=100,
                verbose_name='Görünen ad',
            ),
        ),
    ]
