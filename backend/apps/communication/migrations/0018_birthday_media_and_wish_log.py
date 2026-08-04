import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('communication', '0017_messagetemplate_header_footer'),
        ('kurum', '0003_alter_kurum_app_logo_alter_kurum_favicon_and_more'),
        ('ogrenci', '0015_veli_telefonlar'),
        ('sube', '0003_sube_branding'),
    ]

    operations = [
        migrations.CreateModel(
            name='BirthdayMediaAsset',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('file', models.FileField(upload_to='communication/birthday/%Y/%m/')),
                ('mime_type', models.CharField(blank=True, default='', max_length=128)),
                ('original_name', models.CharField(blank=True, default='', max_length=255)),
                ('file_size', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktif')),
                ('sort_order', models.PositiveIntegerField(default=0, verbose_name='Sıra')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='birthday_media_uploads', to=settings.AUTH_USER_MODEL)),
                ('kurum', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='birthday_media_assets', to='kurum.kurum', verbose_name='Kurum')),
                ('sube', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='birthday_media_assets', to='sube.sube', verbose_name='Şube')),
            ],
            options={
                'verbose_name': 'Doğum Günü Görseli',
                'verbose_name_plural': 'Doğum Günü Görselleri',
                'db_table': 'comm_birthday_media',
                'ordering': ['sort_order', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='BirthdayWishLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('year', models.PositiveIntegerField(verbose_name='Yıl')),
                ('status', models.CharField(default='queued', max_length=32, verbose_name='Durum')),
                ('detail', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('kurum', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='birthday_wish_logs', to='kurum.kurum')),
                ('media_asset', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='wish_logs', to='communication.birthdaymediaasset')),
                ('message', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='birthday_wish_logs', to='communication.message')),
                ('ogrenci', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='birthday_wish_logs', to='ogrenci.ogrenci')),
            ],
            options={
                'verbose_name': 'Doğum Günü Gönderim Logu',
                'verbose_name_plural': 'Doğum Günü Gönderim Logları',
                'db_table': 'comm_birthday_wish_log',
            },
        ),
        migrations.AddIndex(
            model_name='birthdaymediaasset',
            index=models.Index(fields=['kurum', 'sube', 'is_active'], name='comm_bday_media_scope_idx'),
        ),
        migrations.AddIndex(
            model_name='birthdaywishlog',
            index=models.Index(fields=['kurum', 'year'], name='comm_bday_wish_kurum_year_idx'),
        ),
        migrations.AddConstraint(
            model_name='birthdaywishlog',
            constraint=models.UniqueConstraint(fields=('kurum', 'ogrenci', 'year'), name='comm_bday_wish_unique_year'),
        ),
    ]
