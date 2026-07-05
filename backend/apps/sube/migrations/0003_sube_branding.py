from django.db import migrations, models
import apps.sube.domain.models


class Migration(migrations.Migration):

    dependencies = [
        ('sube', '0002_sube_extended_profile'),
    ]

    operations = [
        migrations.AddField(
            model_name='sube',
            name='gorunen_ad',
            field=models.CharField(blank=True, default='', help_text='Uygulama sidebar ve sekme başlığı (boşsa şube adı, o da yoksa kurum markası)', max_length=200, verbose_name='Görünen Ad'),
        ),
        migrations.AddField(
            model_name='sube',
            name='slogan',
            field=models.CharField(blank=True, default='', max_length=300, verbose_name='Slogan'),
        ),
        migrations.AddField(
            model_name='sube',
            name='login_logo',
            field=models.ImageField(blank=True, null=True, upload_to=apps.sube.domain.models.sube_login_logo_upload_to, verbose_name='Login Logosu'),
        ),
        migrations.AddField(
            model_name='sube',
            name='app_logo',
            field=models.ImageField(blank=True, null=True, upload_to=apps.sube.domain.models.sube_app_logo_upload_to, verbose_name='Uygulama Logosu'),
        ),
        migrations.AddField(
            model_name='sube',
            name='favicon',
            field=models.FileField(blank=True, null=True, upload_to=apps.sube.domain.models.sube_favicon_upload_to, verbose_name='Favicon'),
        ),
        migrations.AddField(
            model_name='sube',
            name='login_arkaplan_rengi',
            field=models.CharField(blank=True, default='', max_length=7, verbose_name='Login Arka Plan Rengi'),
        ),
        migrations.AddField(
            model_name='sube',
            name='login_arkaplan_rengi_2',
            field=models.CharField(blank=True, default='', max_length=7, verbose_name='Login Arka Plan Rengi 2'),
        ),
        migrations.AddField(
            model_name='sube',
            name='tema_rengi',
            field=models.CharField(blank=True, default='', max_length=7, verbose_name='Tema Rengi'),
        ),
    ]
