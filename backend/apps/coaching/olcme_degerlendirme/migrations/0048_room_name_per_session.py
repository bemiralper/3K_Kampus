from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0047_optik_okuma'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='examroom',
            name='unique_exam_room_name',
        ),
        migrations.AddConstraint(
            model_name='examroom',
            constraint=models.UniqueConstraint(
                condition=models.Q(('exam_session__isnull', True)),
                fields=('exam', 'name'),
                name='unique_exam_room_name_all_sessions',
            ),
        ),
        migrations.AddConstraint(
            model_name='examroom',
            constraint=models.UniqueConstraint(
                condition=models.Q(('exam_session__isnull', False)),
                fields=('exam', 'name', 'exam_session'),
                name='unique_exam_room_name_per_session',
            ),
        ),
    ]
