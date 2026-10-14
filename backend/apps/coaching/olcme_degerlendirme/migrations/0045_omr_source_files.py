from django.db import migrations, models
import django.db.models.deletion

import apps.coaching.olcme_degerlendirme.models.omr as omr_models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0044_omr_and_printer_profiles'),
    ]

    operations = [
        migrations.AlterField(
            model_name='omrtaramasayfasi',
            name='image',
            field=models.ImageField(blank=True, upload_to=omr_models._omr_page_upload_path, verbose_name='Raster sayfa'),
        ),
        migrations.CreateModel(
            name='OmrTaramaDosyasi',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sequence', models.PositiveIntegerField(verbose_name='Sıra')),
                ('original_filename', models.CharField(max_length=255, verbose_name='Dosya adı')),
                ('kind', models.CharField(max_length=8, verbose_name='Tür')),
                ('page_count', models.PositiveIntegerField(default=1, verbose_name='Sayfa sayısı')),
                ('file', models.FileField(upload_to=omr_models._omr_source_upload_path, verbose_name='Kaynak dosya')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('job', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='kaynaklar', to='olcme_degerlendirme.omrtaramaoturumu', verbose_name='Tarama oturumu')),
            ],
            options={'ordering': ['sequence', 'id']},
        ),
        migrations.AddConstraint(
            model_name='omrtaramadosyasi',
            constraint=models.UniqueConstraint(fields=('job', 'sequence'), name='unique_omr_job_source_sequence'),
        ),
        migrations.AddField(
            model_name='omrtaramasayfasi',
            name='source_file',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='sayfalar', to='olcme_degerlendirme.omrtaramadosyasi', verbose_name='Kaynak dosya'),
        ),
    ]
