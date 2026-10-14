from django.db import migrations, models
import django.db.models.deletion

import apps.coaching.olcme_degerlendirme.models.optik_daire_sablon as daire_model


class Migration(migrations.Migration):

    dependencies = [
        ('kurum', '0003_alter_kurum_app_logo_alter_kurum_favicon_and_more'),
        ('olcme_degerlendirme', '0041_student_stored_score'),
    ]

    operations = [
        migrations.CreateModel(
            name='OptikDaireSablon',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ad', models.CharField(max_length=120, verbose_name='Şablon adı')),
                ('kaynak', models.FileField(upload_to='olcme/optik-daire-sablonlar/', verbose_name='Kaynak form')),
                ('kaynak_tur', models.CharField(max_length=8, verbose_name='Kaynak türü')),
                ('sayfa_no', models.PositiveSmallIntegerField(default=1, verbose_name='Sayfa')),
                ('sayfa_sayisi', models.PositiveSmallIntegerField(default=1, verbose_name='Sayfa sayısı')),
                ('sayfa_genislik_mm', models.DecimalField(decimal_places=2, default=210, max_digits=7, verbose_name='Genişlik (mm)')),
                ('sayfa_yukseklik_mm', models.DecimalField(decimal_places=2, default=297, max_digits=7, verbose_name='Yükseklik (mm)')),
                ('belge', models.JSONField(default=daire_model.bos_daire_belge, verbose_name='Belge')),
                ('aktif', models.BooleanField(default=True, verbose_name='Aktif')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('kurum', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='optik_daire_sablonlar', to='kurum.kurum', verbose_name='Kurum')),
            ],
            options={
                'verbose_name': 'Optik daire şablonu',
                'verbose_name_plural': 'Optik daire şablonları',
                'ordering': ['ad', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='optikdairesablon',
            constraint=models.UniqueConstraint(fields=('kurum', 'ad'), name='unique_optik_daire_sablon_ad'),
        ),
    ]
