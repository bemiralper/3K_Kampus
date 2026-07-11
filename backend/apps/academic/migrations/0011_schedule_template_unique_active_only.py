from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0010_work_calendar_enhancements'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='scheduletemplate',
            name='unique_template_name_per_branch',
        ),
        migrations.AddConstraint(
            model_name='scheduletemplate',
            constraint=models.UniqueConstraint(
                condition=models.Q(('is_active', True)),
                fields=('kurum', 'sube', 'name'),
                name='unique_active_template_name_per_branch',
            ),
        ),
    ]
