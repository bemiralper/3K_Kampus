from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assignment_manual', '0019_manualassignment_control_opened_for_coach'),
    ]

    operations = [
        migrations.AddField(
            model_name='assignmentlesson',
            name='k3_mode',
            field=models.CharField(
                blank=True,
                choices=[
                    ('OGREN', 'ÖĞREN'),
                    ('PEKISTIR', 'PEKİŞTİR'),
                    ('TEKRARLA', 'TEKRARLA'),
                    ('HIZLAN', 'HIZLAN'),
                    ('TAMAMLA', 'TAMAMLA'),
                ],
                default='',
                help_text='Konu bloğundaki tüm testlerin çalışma amacı. Test türü değildir.',
                max_length=20,
                verbose_name='3K Modu',
            ),
        ),
        migrations.AddField(
            model_name='assignmentlesson',
            name='k3_target_minutes',
            field=models.PositiveIntegerField(
                blank=True,
                help_text='HIZLAN modu için isteğe bağlı hedef süre. Zorlama yok.',
                null=True,
                verbose_name='Hedef Süre (dk)',
            ),
        ),
        migrations.AddField(
            model_name='assignmentpackageitem',
            name='k3_mode',
            field=models.CharField(
                blank=True,
                choices=[
                    ('OGREN', 'ÖĞREN'),
                    ('PEKISTIR', 'PEKİŞTİR'),
                    ('TEKRARLA', 'TEKRARLA'),
                    ('HIZLAN', 'HIZLAN'),
                    ('TAMAMLA', 'TAMAMLA'),
                ],
                default='',
                max_length=20,
                verbose_name='3K Modu',
            ),
        ),
        migrations.AddField(
            model_name='assignmentpackageitem',
            name='k3_target_minutes',
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                verbose_name='Hedef Süre (dk)',
            ),
        ),
    ]
