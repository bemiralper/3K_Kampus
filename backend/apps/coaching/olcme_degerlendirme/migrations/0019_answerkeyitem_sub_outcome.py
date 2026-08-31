from django.db import migrations, models
import django.db.models.deletion


def backfill_sub_outcomes(apps, schema_editor):
    AnswerKeyItem = apps.get_model('olcme_degerlendirme', 'AnswerKeyItem')
    SubOutcome = apps.get_model('olcme_degerlendirme', 'SubOutcome')

    items = AnswerKeyItem.objects.exclude(imported_outcome_text='').filter(
        sub_outcome_id__isnull=True,
        outcome_id__isnull=False,
    )
    for item in items.iterator():
        code = (item.imported_outcome_text or '').strip()
        if not code:
            continue
        sub = SubOutcome.objects.filter(
            outcome_id=item.outcome_id, code__iexact=code,
        ).first()
        if sub:
            item.sub_outcome_id = sub.id
            item.save(update_fields=['sub_outcome_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0018_dispatch_enabled_campaign'),
    ]

    operations = [
        migrations.AddField(
            model_name='answerkeyitem',
            name='sub_outcome',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='answer_key_items',
                to='olcme_degerlendirme.suboutcome',
                verbose_name='Alt Kazanım',
            ),
        ),
        migrations.RunPython(backfill_sub_outcomes, migrations.RunPython.noop),
    ]
