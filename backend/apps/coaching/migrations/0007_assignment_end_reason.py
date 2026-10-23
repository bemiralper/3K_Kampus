from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('coaching', '0006_attendance_followup'),
    ]

    operations = [
        migrations.AddField(
            model_name='coachstudentassignment',
            name='end_reason',
            field=models.CharField(
                blank=True,
                choices=[
                    ('ogrenci_pasif', 'Öğrenci pasif'),
                    ('kayit_kapali', 'Kayıt kapalı'),
                    ('gecerli_sozlesme_yok', 'Geçerli sözleşme yok'),
                ],
                default='',
                help_text='Sistem atamayı kapattıysa neden. Elle kapatmada boş kalır.',
                max_length=32,
                verbose_name='Kapanma nedeni',
            ),
        ),
    ]
