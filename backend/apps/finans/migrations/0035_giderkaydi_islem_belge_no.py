from django.db import migrations, models


def ensure_islem_belge_no(apps, schema_editor):
    """Kolon feature dalında uygulanmış olabilir; yoksa ekle, varsa NULL bırakma."""
    table = 'finans_gider_kaydi'
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_name = %s AND column_name = 'islem_belge_no'
            """,
            [table],
        )
        exists = cursor.fetchone() is not None
        if not exists:
            cursor.execute(
                """
                ALTER TABLE finans_gider_kaydi
                ADD COLUMN islem_belge_no varchar(30) NOT NULL DEFAULT ''
                """
            )
            return
        cursor.execute(
            "UPDATE finans_gider_kaydi SET islem_belge_no = '' WHERE islem_belge_no IS NULL"
        )
        cursor.execute(
            "ALTER TABLE finans_gider_kaydi ALTER COLUMN islem_belge_no SET DEFAULT ''"
        )
        cursor.execute(
            "ALTER TABLE finans_gider_kaydi ALTER COLUMN islem_belge_no SET NOT NULL"
        )


def noop_reverse(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0034_mali_hesap_yetkilisi_kurum'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(ensure_islem_belge_no, noop_reverse),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='giderkaydi',
                    name='islem_belge_no',
                    field=models.CharField(
                        blank=True,
                        db_index=True,
                        default='',
                        help_text='Sistem belgesi: GDR-YYYY-000001. Tedarikçi faturası değildir.',
                        max_length=30,
                        verbose_name='Gider İşlem Belge No',
                    ),
                ),
            ],
        ),
    ]
