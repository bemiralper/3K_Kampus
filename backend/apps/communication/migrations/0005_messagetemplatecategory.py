# Generated manually for MessageTemplateCategory

import uuid

from django.db import migrations, models
import django.db.models.deletion


DEFAULT_CATEGORIES = [
    ('deneme_sonucu', 'Deneme Sonucu', 10),
    ('haftalik_odev', 'Haftalık Ödev', 20),
    ('devamsizlik', 'Devamsızlık', 30),
    ('tebrik', 'Tebrik', 40),
    ('odeme', 'Ödeme', 50),
    ('karne', 'Karne', 60),
    ('duyuru', 'Duyuru', 70),
    ('ozel', 'Özel', 80),
]


def seed_categories(apps, schema_editor):
    Kurum = apps.get_model('kurum', 'Kurum')
    MessageTemplateCategory = apps.get_model('communication', 'MessageTemplateCategory')
    MessageTemplate = apps.get_model('communication', 'MessageTemplate')

    kurum_ids = set(Kurum.objects.values_list('id', flat=True))
    kurum_ids.update(MessageTemplate.objects.values_list('kurum_id', flat=True).distinct())

    rows = []
    for kurum_id in kurum_ids:
        for slug, label, order in DEFAULT_CATEGORIES:
            rows.append(
                MessageTemplateCategory(
                    id=uuid.uuid4(),
                    kurum_id=kurum_id,
                    slug=slug,
                    label=label,
                    sort_order=order,
                    is_active=True,
                ),
            )
    if rows:
        MessageTemplateCategory.objects.bulk_create(rows, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ('kurum', '0001_initial'),
        ('communication', '0004_messagetemplate_audience_scope'),
    ]

    operations = [
        migrations.CreateModel(
            name='MessageTemplateCategory',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('slug', models.CharField(max_length=32, verbose_name='Slug')),
                ('label', models.CharField(max_length=64, verbose_name='Etiket')),
                ('sort_order', models.PositiveSmallIntegerField(default=0, verbose_name='Sıra')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktif')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('kurum', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='message_template_categories', to='kurum.kurum', verbose_name='Kurum')),
            ],
            options={
                'verbose_name': 'Şablon Kategorisi',
                'verbose_name_plural': 'Şablon Kategorileri',
                'db_table': 'comm_message_template_category',
                'ordering': ['sort_order', 'label'],
            },
        ),
        migrations.AddConstraint(
            model_name='messagetemplatecategory',
            constraint=models.UniqueConstraint(fields=('kurum', 'slug'), name='comm_template_category_kurum_slug_uniq'),
        ),
        migrations.AlterField(
            model_name='messagetemplate',
            name='category',
            field=models.CharField(db_index=True, default='ozel', max_length=32, verbose_name='Kategori'),
        ),
        migrations.RunPython(seed_categories, migrations.RunPython.noop),
    ]
