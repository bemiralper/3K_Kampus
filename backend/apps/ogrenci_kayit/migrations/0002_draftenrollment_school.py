import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('okul', '0001_initial'),
        ('ogrenci_kayit', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='draftenrollment',
            name='school',
            field=models.ForeignKey(
                blank=True,
                db_column='school_id',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='draft_enrollments',
                to='okul.okul',
            ),
        ),
    ]
