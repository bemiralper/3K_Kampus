# Generated manually

import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

from apps.communication.domain.enums import TemplateAudienceScope, TemplateCategory


SCOPE_BY_SLUG = {
    TemplateCategory.DENEME_SONUCU: TemplateAudienceScope.COACH,
    TemplateCategory.HAFTALIK_ODEV: TemplateAudienceScope.COACH,
    TemplateCategory.DEVAMSIZLIK: TemplateAudienceScope.ADMIN,
    TemplateCategory.TEBRIK: TemplateAudienceScope.GENEL,
    TemplateCategory.ODEME: TemplateAudienceScope.MUHASEBE,
    TemplateCategory.KARNE: TemplateAudienceScope.GENEL,
    TemplateCategory.DUYURU: TemplateAudienceScope.ADMIN,
    TemplateCategory.OZEL: TemplateAudienceScope.GENEL,
}


def set_category_audience_scopes(apps, schema_editor):
    MessageTemplateCategory = apps.get_model('communication', 'MessageTemplateCategory')
    for slug, scope in SCOPE_BY_SLUG.items():
        MessageTemplateCategory.objects.filter(slug=slug).update(audience_scope=scope)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('communication', '0005_messagetemplatecategory'),
    ]

    operations = [
        migrations.AddField(
            model_name='messagetemplatecategory',
            name='audience_scope',
            field=models.CharField(
                choices=[
                    ('genel', 'Genel (tüm roller)'),
                    ('admin', 'Admin / İletişim'),
                    ('coach', 'Koç'),
                    ('muhasebe', 'Muhasebe'),
                ],
                db_index=True,
                default='genel',
                max_length=32,
                verbose_name='Hedef kitle',
            ),
        ),
        migrations.RunPython(set_category_audience_scopes, migrations.RunPython.noop),
        migrations.AddField(
            model_name='message',
            name='reply_to',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='replies',
                to='communication.message',
                verbose_name='Yanıtlanan mesaj',
            ),
        ),
        migrations.CreateModel(
            name='MessageReaction',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('emoji', models.CharField(max_length=16, verbose_name='Emoji')),
                ('provider_message_id', models.CharField(blank=True, default='', max_length=128)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('message', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reactions', to='communication.message')),
                ('reacted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='message_reactions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Mesaj Reaksiyonu',
                'verbose_name_plural': 'Mesaj Reaksiyonları',
                'db_table': 'comm_message_reaction',
            },
        ),
        migrations.AddConstraint(
            model_name='messagereaction',
            constraint=models.UniqueConstraint(fields=('message', 'reacted_by'), name='comm_message_reaction_user_uniq'),
        ),
    ]
