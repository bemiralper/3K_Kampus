from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import apps.coaching.olcme_degerlendirme.models.optik_okuma as okuma_models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('olcme_degerlendirme', '0046_merge_optik_form_and_omr'),
    ]

    operations = [
        migrations.CreateModel(
            name='OptikOkumaOturumu',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('PENDING', 'Bekliyor'), ('PROCESSING', 'İşleniyor'), ('REVIEW', 'İnceleme'), ('ERROR', 'Hata')], default='PENDING', max_length=15)),
                ('original_filename', models.CharField(blank=True, max_length=255)),
                ('total_pages', models.PositiveIntegerField(default=0)),
                ('processed_pages', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('sablon', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='okuma_oturumlari', to='olcme_degerlendirme.optikdairesablon', verbose_name='Daire şablonu')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='optik_okuma_oturumlari', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
        migrations.CreateModel(
            name='OptikOkumaKaynak',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('original_filename', models.CharField(max_length=255)),
                ('kind', models.CharField(max_length=8)),
                ('page_count', models.PositiveIntegerField(default=1)),
                ('file', models.FileField(upload_to=okuma_models._okuma_kaynak_path)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('oturum', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='kaynaklar', to='olcme_degerlendirme.optikokumaoturumu')),
            ],
            options={'ordering': ['id']},
        ),
        migrations.CreateModel(
            name='OptikOkumaSayfa',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sequence', models.PositiveIntegerField()),
                ('source_page', models.PositiveIntegerField(default=1)),
                ('image', models.ImageField(blank=True, upload_to=okuma_models._okuma_sayfa_path)),
                ('status', models.CharField(choices=[('PENDING', 'Bekliyor'), ('REVIEW', 'İnceleme'), ('ERROR', 'Hata')], default='PENDING', max_length=15)),
                ('registration', models.JSONField(blank=True, default=dict)),
                ('decoded', models.JSONField(blank=True, default=dict)),
                ('overlay', models.JSONField(blank=True, default=list)),
                ('review', models.JSONField(blank=True, default=dict)),
                ('confidence', models.FloatField(default=0)),
                ('warnings', models.JSONField(blank=True, default=list)),
                ('critical_warnings', models.JSONField(blank=True, default=list)),
                ('error_message', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('kaynak', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='sayfalar', to='olcme_degerlendirme.optikokumakaynak')),
                ('oturum', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sayfalar', to='olcme_degerlendirme.optikokumaoturumu')),
            ],
            options={'ordering': ['sequence', 'id']},
        ),
        migrations.AddConstraint(
            model_name='optikokumasayfa',
            constraint=models.UniqueConstraint(fields=('oturum', 'sequence'), name='unique_optik_okuma_sayfa'),
        ),
    ]
