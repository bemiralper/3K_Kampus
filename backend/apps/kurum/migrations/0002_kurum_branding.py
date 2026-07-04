from django.db import migrations, models

import apps.kurum.domain.models as kurum_models


class Migration(migrations.Migration):

    dependencies = [
        ('kurum', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='kurum',
            name='gorunen_ad',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Görünen Ad'),
        ),
        migrations.AddField(
            model_name='kurum',
            name='slogan',
            field=models.CharField(blank=True, default='', max_length=300, verbose_name='Slogan'),
        ),
        migrations.AddField(
            model_name='kurum',
            name='login_logo',
            field=models.ImageField(blank=True, null=True, upload_to=kurum_models.login_logo_upload_to, verbose_name='Login Logosu'),
        ),
        migrations.AddField(
            model_name='kurum',
            name='app_logo',
            field=models.ImageField(blank=True, null=True, upload_to=kurum_models.app_logo_upload_to, verbose_name='Uygulama Logosu'),
        ),
        migrations.AddField(
            model_name='kurum',
            name='favicon',
            field=models.FileField(blank=True, null=True, upload_to=kurum_models.favicon_upload_to, verbose_name='Favicon'),
        ),
        migrations.AddField(
            model_name='kurum',
            name='login_arkaplan_rengi',
            field=models.CharField(blank=True, default='', max_length=7, verbose_name='Login Arka Plan Rengi'),
        ),
        migrations.AddField(
            model_name='kurum',
            name='login_arkaplan_rengi_2',
            field=models.CharField(blank=True, default='', max_length=7, verbose_name='Login Arka Plan Rengi 2'),
        ),
        migrations.AddField(
            model_name='kurum',
            name='tema_rengi',
            field=models.CharField(blank=True, default='', max_length=7, verbose_name='Tema Rengi'),
        ),
    ]
