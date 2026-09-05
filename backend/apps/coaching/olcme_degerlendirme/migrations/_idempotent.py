"""Eski feature migration adlarıyla oluşmuş tabloları yeniden yaratma."""
from django.db import migrations
from django.db.utils import IntegrityError, ProgrammingError


def _tables(schema_editor):
    return set(schema_editor.connection.introspection.table_names())


def _columns(schema_editor, table):
    connection = schema_editor.connection
    if table not in _tables(schema_editor):
        return set()
    with connection.cursor() as cursor:
        desc = connection.introspection.get_table_description(cursor, table)
    return {col.name for col in desc}


def _constraint_names(schema_editor, table):
    connection = schema_editor.connection
    if table not in _tables(schema_editor):
        return set()
    with connection.cursor() as cursor:
        return set(connection.introspection.get_constraints(cursor, table))


class CreateModelIfMissing(migrations.CreateModel):
    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.name)
        if model._meta.db_table in _tables(schema_editor):
            return
        super().database_forwards(app_label, schema_editor, from_state, to_state)


def _run_or_rollback(schema_editor, fn):
    connection = schema_editor.connection
    sid = connection.savepoint()
    try:
        fn()
    except (IntegrityError, ProgrammingError):
        connection.savepoint_rollback(sid)
    else:
        connection.savepoint_commit(sid)


class AddFieldIfMissing(migrations.AddField):
    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.model_name)
        field = model._meta.get_field(self.name)
        if field.column in _columns(schema_editor, model._meta.db_table):
            return
        _run_or_rollback(
            schema_editor,
            lambda: super(AddFieldIfMissing, self).database_forwards(
                app_label, schema_editor, from_state, to_state,
            ),
        )


class AddConstraintIfMissing(migrations.AddConstraint):
    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.model_name)
        if self.constraint.name in _constraint_names(schema_editor, model._meta.db_table):
            return
        # Eski 0014 kısıtı (exam+öğrenci) oturum sonrası tekrarlı satırlarda kurulamaz.
        if (
            self.constraint.name == 'unique_exam_participant'
            and 'unique_exam_participant_session' in _constraint_names(
                schema_editor, model._meta.db_table,
            )
        ):
            return
        _run_or_rollback(
            schema_editor,
            lambda: super(AddConstraintIfMissing, self).database_forwards(
                app_label, schema_editor, from_state, to_state,
            ),
        )


class RemoveConstraintIfExists(migrations.RemoveConstraint):
    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.model_name)
        if self.name not in _constraint_names(schema_editor, model._meta.db_table):
            return
        _run_or_rollback(
            schema_editor,
            lambda: super(RemoveConstraintIfExists, self).database_forwards(
                app_label, schema_editor, from_state, to_state,
            ),
        )
