import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('ogrenci', '0016_ogrenci_not_and_audit'),
        ('resources', '0010_seed_paragraf_problem_book_types'),
        ('student_resources', '0006_purchase_list_item_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='studentresourceassignment',
            name='started_on',
            field=models.DateField(blank=True, null=True, verbose_name='Başlama Tarihi'),
        ),
        migrations.CreateModel(
            name='StudentRoutineQuota',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('PARAGRAF', 'Paragraf'), ('PROBLEM', 'Problem')], max_length=20, verbose_name='Tür')),
                ('daily_question_count', models.PositiveIntegerField(verbose_name='Günlük Soru Sayısı')),
                ('status', models.CharField(choices=[('ACTIVE', 'Aktif'), ('BOOK_FINISHED', 'Kitap Bitti'), ('PAUSED', 'Duraklatıldı')], default='ACTIVE', max_length=20, verbose_name='Durum')),
                ('started_on', models.DateField(verbose_name='Başlama Tarihi')),
                ('finished_on', models.DateField(blank=True, null=True, verbose_name='Bitiş Tarihi')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('coach', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='student_routine_quotas', to=settings.AUTH_USER_MODEL, verbose_name='Koç')),
                ('resource_book', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='routine_quotas', to='resources.resourcebook', verbose_name='Kaynak Kitap')),
                ('source_assignment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='routine_quotas', to='student_resources.studentresourceassignment', verbose_name='Kaynak Havuzu Ataması')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='routine_quotas', to='ogrenci.ogrenci', verbose_name='Öğrenci')),
            ],
            options={
                'verbose_name': 'Paragraf/Problem Kota Planı',
                'verbose_name_plural': 'Paragraf/Problem Kota Planları',
                'db_table': 'student_routine_quota',
                'ordering': ['-started_on', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='studentroutinequota',
            index=models.Index(fields=['student', 'kind', 'status'], name='student_rou_student_6c4b1a_idx'),
        ),
        migrations.AddIndex(
            model_name='studentroutinequota',
            index=models.Index(fields=['student', 'status'], name='student_rou_student_8a12c0_idx'),
        ),
        migrations.AddConstraint(
            model_name='studentroutinequota',
            constraint=models.UniqueConstraint(condition=models.Q(('status', 'ACTIVE')), fields=('student', 'kind'), name='unique_active_routine_quota_per_kind'),
        ),
    ]
