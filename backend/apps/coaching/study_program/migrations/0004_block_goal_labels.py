from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('study_program', '0003_flexible_week_dates'),
    ]

    operations = [
        migrations.AlterField(
            model_name='programblock',
            name='block_type',
            field=models.CharField(
                choices=[
                    ('KONU_OGRENME', '📖 Konu Öğrenme'),
                    ('TEKRAR', '🔁 Tekrar'),
                    ('SORU_COZUMU', '📝 Soru Çözümü'),
                    ('MINI_TEST', '🧪 Mini Test'),
                    ('BRANS_DENEMESI', '🎯 Branş Denemesi'),
                    ('DENEME', '📋 Genel Deneme'),
                    ('ANALIZ', '📊 Analiz'),
                    ('ZAYIF_KONU', '💡 Zayıf konu önerisi'),
                ],
                default='SORU_COZUMU',
                max_length=30,
                verbose_name='Blok Tipi',
            ),
        ),
        migrations.AlterField(
            model_name='programblock',
            name='goal_type',
            field=models.CharField(
                blank=True,
                choices=[
                    ('NET_ARTIRMA', '📈 Net Artırma'),
                    ('KONU_TAMAMLAMA', '📚 Konu Tamamlama'),
                    ('EKSIK_KAPATMA', '🔧 Eksik Kapatma'),
                    ('SURE_HIZLANDIRMA', '⏱️ Süre Geliştirme'),
                    ('DENEME_HAZIRLIK', '🎯 Sınava Hazırlık'),
                ],
                max_length=30,
                verbose_name='Hedef Türü',
            ),
        ),
    ]
