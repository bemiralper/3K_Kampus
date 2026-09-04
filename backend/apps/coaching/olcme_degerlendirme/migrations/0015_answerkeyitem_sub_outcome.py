import re

from django.db import migrations, models
import django.db.models.deletion


_DOTTED_CODE_RE = re.compile(r'^\d+(?:\.\d+)+$')


def add_sub_outcome_column_if_missing(apps, schema_editor):
    table = 'olcme_degerlendirme_answerkeyitem'
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = %s
              AND column_name = 'sub_outcome_id'
            """,
            [table],
        )
        if cursor.fetchone():
            return
        cursor.execute(
            """
            ALTER TABLE olcme_degerlendirme_answerkeyitem
            ADD COLUMN sub_outcome_id bigint NULL
            REFERENCES olcme_degerlendirme_suboutcome(id)
            ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED
            """
        )
        cursor.execute(
            """
            CREATE INDEX olcme_degerlendirme_answerkeyitem_sub_outcome_id_idx
            ON olcme_degerlendirme_answerkeyitem (sub_outcome_id)
            """
        )


def backfill_sub_outcomes(apps, schema_editor):
    AnswerKeyItem = apps.get_model('olcme_degerlendirme', 'AnswerKeyItem')
    SubOutcome = apps.get_model('olcme_degerlendirme', 'SubOutcome')
    ExamSection = apps.get_model('olcme_degerlendirme', 'ExamSection')

    items = AnswerKeyItem.objects.exclude(imported_outcome_text='').filter(
        sub_outcome_id__isnull=True,
    )
    for item in items.iterator():
        code = (item.imported_outcome_text or '').strip().rstrip('.')
        if not code or not _DOTTED_CODE_RE.match(code):
            continue

        sub = None
        if item.outcome_id:
            sub = SubOutcome.objects.filter(
                outcome_id=item.outcome_id, code__iexact=code,
            ).first()

        if not sub and item.section_id:
            section = ExamSection.objects.filter(pk=item.section_id).first()
            subject_id = getattr(section, 'subject_id', None) if section else None
            if subject_id:
                sub = SubOutcome.objects.filter(
                    outcome__topic__subject_id=subject_id,
                    code__iexact=code,
                ).first()

        if not sub:
            qs = SubOutcome.objects.filter(code__iexact=code)
            if qs.count() == 1:
                sub = qs.first()

        if not sub:
            continue

        item.sub_outcome_id = sub.id
        if not item.outcome_id:
            item.outcome_id = sub.outcome_id
        item.save(update_fields=['sub_outcome_id', 'outcome_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0014_exam_include_optional_philosophy'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
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
            ],
            database_operations=[
                migrations.RunPython(
                    add_sub_outcome_column_if_missing,
                    migrations.RunPython.noop,
                ),
            ],
        ),
        migrations.RunPython(backfill_sub_outcomes, migrations.RunPython.noop),
    ]
