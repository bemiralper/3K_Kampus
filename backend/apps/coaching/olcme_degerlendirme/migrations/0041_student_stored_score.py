from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0038_default_puan_yili_2026'),
    ]

    operations = [
        migrations.CreateModel(
            name='StudentStoredScore',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('by_year', models.JSONField(default=dict, help_text='2024/2025/2026 anahtarlı puan, puan türleri ve kurum sırası.', verbose_name='Yıla göre puan')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('student_answer', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='stored_score', to='olcme_degerlendirme.studentanswer', verbose_name='Öğrenci Cevabı')),
            ],
            options={
                'verbose_name': 'Kayıtlı Puan',
                'verbose_name_plural': 'Kayıtlı Puanlar',
            },
        ),
    ]
