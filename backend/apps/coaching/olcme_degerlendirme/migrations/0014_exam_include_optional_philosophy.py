from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0013_olcme_puan_ayar_and_exam_puan_yili'),
    ]

    operations = [
        migrations.AddField(
            model_name='exam',
            name='include_optional_philosophy',
            field=models.BooleanField(
                default=True,
                help_text='TYT’de Din Kültürü yerine / yanında gelen 5 soruluk seçmeli felsefe. Varsayılan: dahil. Sözel puan hesaplamasında kullanılır.',
                verbose_name='Felsefe (Seçmeli)',
            ),
        ),
    ]
