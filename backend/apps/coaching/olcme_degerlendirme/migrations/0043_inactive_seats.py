from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0041_student_stored_score'),
    ]

    operations = [
        migrations.AddField(
            model_name='examroom',
            name='inactive_seats',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Bu sıra numaralarına öğrenci yerleştirilmez. Örn. [5, 12, 18].',
                verbose_name='Pasif sıralar',
            ),
        ),
        migrations.AddField(
            model_name='denemesalon',
            name='inactive_seats',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Bu salon seçilince sınava kopyalanan pasif sıra numaraları.',
                verbose_name='Pasif sıralar',
            ),
        ),
    ]
