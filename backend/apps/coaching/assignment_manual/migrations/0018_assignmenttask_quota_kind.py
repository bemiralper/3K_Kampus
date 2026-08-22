from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assignment_manual', '0017_manualassignment_restored_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='assignmenttask',
            name='quota_kind',
            field=models.CharField(
                blank=True,
                choices=[('PARAGRAF', 'Paragraf'), ('PROBLEM', 'Problem')],
                default='',
                help_text='İçeriksiz paragraf/problem kota görevi. Boşsa normal içerik görevi.',
                max_length=20,
                verbose_name='Kota Türü',
            ),
        ),
    ]
