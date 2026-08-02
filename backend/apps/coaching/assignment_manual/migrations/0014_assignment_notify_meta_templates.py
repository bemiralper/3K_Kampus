import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assignment_manual', '0013_assignment_notification_config'),
        ('communication', '0011_whatsapp_meta_template'),
    ]

    operations = [
        migrations.AddField(
            model_name='assignmentnotificationconfig',
            name='plan_veli_meta_template',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='communication.whatsappmetatemplate',
                verbose_name='Ödev planı — veli Meta şablonu',
            ),
        ),
        migrations.AddField(
            model_name='assignmentnotificationconfig',
            name='plan_ogrenci_meta_template',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='communication.whatsappmetatemplate',
                verbose_name='Ödev planı — öğrenci Meta şablonu',
            ),
        ),
        migrations.AddField(
            model_name='assignmentnotificationconfig',
            name='report_veli_meta_template',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='communication.whatsappmetatemplate',
                verbose_name='Ödev raporu — veli Meta şablonu',
            ),
        ),
        migrations.AddField(
            model_name='assignmentnotificationconfig',
            name='report_ogrenci_meta_template',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='communication.whatsappmetatemplate',
                verbose_name='Ödev raporu — öğrenci Meta şablonu',
            ),
        ),
    ]
