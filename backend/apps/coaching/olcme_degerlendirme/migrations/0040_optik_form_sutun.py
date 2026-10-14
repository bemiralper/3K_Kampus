from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0039_optik_form'),
    ]

    operations = [
        migrations.AddField(
            model_name='optikformalani',
            name='sutun_sayisi',
            field=models.PositiveSmallIntegerField(
                default=1,
                help_text='Balon ızgarasında yan yana karakter sayısı. Metin alanında kullanılmaz.',
                verbose_name='Sütun sayısı',
            ),
        ),
        migrations.AlterField(
            model_name='optikformalani',
            name='karakter_kumesi',
            field=models.CharField(
                blank=True,
                help_text='Balonda satır sırası. Rakam 0123456789, harf ABCÇ…, seçenek 9,10,11,12,M.',
                max_length=120,
                verbose_name='Karakter kümesi',
            ),
        ),
    ]
